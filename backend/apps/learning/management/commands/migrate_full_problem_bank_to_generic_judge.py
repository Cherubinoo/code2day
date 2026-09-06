"""
One-shot, resumable migration of the ENTIRE Problem Bank onto the generic
judge (services/judging/), so the student editor can show a real,
problem-specific `class Solution: ...` stub (services/judging/starter_code.py)
for every language instead of falling back to one generic static template.

Reuses the exact same per-problem pipeline the "Generate Generic Judge"
per-topic admin button already calls in production
(views._migrate_problem_to_generic_judge): generate a schema via the LLM if
missing, structurally validate it, generate fresh wire-format test cases via
the LLM, and only flip Problem.uses_generic_judge on once both check out.
Nothing here is a new code path — this command just drives that same
pipeline across the whole bank instead of one topic-sized click at a time,
since with ~1825 problems still missing any schema at all, clicking through
topic by topic would take a very long time.

Every step is skip-if-already-done (Problem.uses_generic_judge=False is the
whole query), so this is SAFE TO RE-RUN: an interrupted or partially-failed
run just needs to be run again — it picks up exactly the problems still
needing work, never re-touches ones that already succeeded.

KNOWN RISK (see revert_misenabled_design_problems.py for the historical
incident this caused before): generate_generic_schema falls back to a text
heuristic (detect_schema_kind) to guess "design" vs "function" whenever
there's no cheaper explicit signal (Problem.execution_type="stdin", or an
already-design-shaped legacy param_schema) — and almost none of these 1825
problems have a legacy param_schema at all, so the heuristic is the only
signal available for nearly all of them. A class/design-shaped problem
misdetected as "function" still passes structural validation (it's a
syntactically fine function schema, just semantically the wrong shape) and
would get uses_generic_judge wrongly enabled, breaking submissions for that
problem. This command runs revert_misenabled_design_problems --apply as a
final safety pass, but that only catches cases where a design-shaped LEGACY
param_schema exists to compare against — it is not a complete guarantee.
Spot-check a handful of known design/class-style problems (LRUCache,
MinStack, iterators, ...) after a run.

Usage:
    python manage.py migrate_full_problem_bank_to_generic_judge                  # full bank
    python manage.py migrate_full_problem_bank_to_generic_judge --limit 20        # bounded test run first (recommended)
    python manage.py migrate_full_problem_bank_to_generic_judge --topic Array     # one topic only
"""

import time

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.learning.models import Problem
from apps.learning.serializers import DEFAULT_PRACTICE_LANGUAGES
from apps.learning.services.judging.starter_code import generate_generic_starter_code
from apps.learning.services.param_types import is_design_schema
from apps.learning.views import _migrate_problem_to_generic_judge, _problems_in_topic


class Command(BaseCommand):
    help = (
        "Migrates every Problem not yet on the generic judge (schema + wire-format "
        "test cases + starter code), so the editor can show a real class Solution "
        "stub for it in every language. Safe to re-run — skips anything already done."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=None, help="Stop after this many problems (bounded test run).")
        parser.add_argument("--topic", type=str, default=None, help="Only migrate problems in this topic tag (e.g. 'Array').")
        parser.add_argument(
            "--skip-starter-code", action="store_true",
            help="Skip the final starter-code generation pass (schema/test-case migration only).",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        topic = options["topic"]
        skip_starter_code = options["skip_starter_code"]

        base_qs = _problems_in_topic(topic) if topic else Problem.objects.all()
        problems = base_qs.filter(uses_generic_judge=False).order_by("id")
        if limit:
            problems = problems[:limit]
        problem_ids = list(problems.values_list("id", flat=True))
        total = len(problem_ids)

        if total == 0:
            self.stdout.write(self.style.WARNING("Nothing to migrate — every matching problem is already on the generic judge."))
        else:
            self.stdout.write(f"Migrating {total} problem(s) onto the generic judge (schema + test cases)...")
            start = time.monotonic()
            enabled, failed = 0, 0
            for i, problem_id in enumerate(problem_ids, start=1):
                problem = Problem.objects.get(id=problem_id)
                entry = _migrate_problem_to_generic_judge(problem)
                if entry.get("enabled"):
                    enabled += 1
                else:
                    failed += 1
                    reason = entry.get("error") or entry.get("schema_errors") or entry.get("warning") or "unknown"
                    self.stdout.write(self.style.WARNING(f"  [{i}/{total}] FAILED #{problem_id} {entry.get('title')!r}: {reason}"))
                if i % 25 == 0 or i == total:
                    elapsed = time.monotonic() - start
                    self.stdout.write(f"  [{i}/{total}] enabled={enabled} failed={failed} elapsed={elapsed:.0f}s")

            self.stdout.write(self.style.SUCCESS(
                f"Schema/test-case migration done: {enabled} enabled, {failed} failed (out of {total} attempted)."
            ))
            if failed:
                self.stdout.write("Re-run this same command to retry the failed ones — every step here is skip-if-already-done.")

        if not skip_starter_code:
            self._generate_starter_code(topic)

        self._revert_misenabled_design_problems()

    def _generate_starter_code(self, topic):
        base_qs = _problems_in_topic(topic) if topic else Problem.objects.all()
        starter_qs = base_qs.filter(
            Q(uses_generic_judge=True) & Q(generic_schema__isnull=False) & Q(generic_starter_code={})
        )
        starter_total = starter_qs.count()
        if starter_total == 0:
            self.stdout.write(self.style.WARNING("Starter code: nothing to generate — every generic-judge problem already has a snapshot."))
            return

        self.stdout.write(f"Generating starter code for {starter_total} problem(s)...")
        generated = 0
        for problem in starter_qs.iterator():
            result = {}
            for language in DEFAULT_PRACTICE_LANGUAGES:
                code = generate_generic_starter_code(problem, language)
                if code:
                    result[language] = code
            problem.generic_starter_code = result
            problem.save(update_fields=["generic_starter_code"])
            generated += 1
        self.stdout.write(self.style.SUCCESS(f"Starter code generated for {generated}/{starter_total} problem(s)."))

    def _revert_misenabled_design_problems(self):
        """Safety net for the known misdetection risk described in this
        command's own docstring — same check as
        revert_misenabled_design_problems --apply, folded in here so it
        always runs right after a migration pass rather than depending on
        someone remembering to run it separately."""
        candidates = Problem.objects.filter(uses_generic_judge=True)
        reverted = 0
        for problem in candidates.iterator():
            if not is_design_schema(problem.param_schema):
                continue
            reverted += 1
            self.stdout.write(self.style.WARNING(
                f"  Reverting #{problem.id} {problem.title!r} — design-shaped legacy param_schema, "
                f"generic judge can't run it, routing back to the legacy execution path."
            ))
            problem.uses_generic_judge = False
            problem.save(update_fields=["uses_generic_judge"])

        if reverted:
            self.stdout.write(self.style.WARNING(f"Reverted {reverted} misenabled design-shaped problem(s) back to the legacy path."))
        else:
            self.stdout.write("Design-problem safety check: nothing to revert.")
