"""
One-time data fix: services/judging/integration.py's _effective_stdin() only
adapts raw, human-authored example text (e.g. "root = [4,1,6,...]") into
this package's wire format for TestCase rows explicitly tagged
input_format="raw_text" — by design, since blindly re-adapting anything
that merely *looks* unparseable would risk mangling a genuinely wire-format
value that just happens to look unusual.

But TestCase.input_format defaults to "wire", and a row created without
ever being explicitly tagged (e.g. hand-entered by an admin, or imported
some other way than sync_problem_test_cases()/the AI test-case generator)
keeps that default even when its stdin is still raw, un-adapted example
text. _effective_stdin's own guard then skips adaptation entirely, and the
student's submission gets the raw text as stdin verbatim — e.g. the
reported "NumberFormatException ... For input string: 'root =
[4,1,...]'" for a single-TreeNode-argument problem ("Convert BST to
Greater Tree"), confirmed to be exactly this: its stored test cases hold
raw text like "root = [4,1,6,...]" while tagged input_format="wire".

This command finds every uses_generic_judge=True, non-design, non-stdin
Problem's TestCase rows tagged input_format="wire" whose stdin does NOT
actually deserialize as this package's wire format for the problem's own
generic_schema (see serializer.looks_like_wire_format) — i.e. genuinely
mislabeled — and retags them input_format="raw_text" so
_effective_stdin() adapts them correctly from now on. Never touches a row
that already deserializes cleanly as real wire format. Defaults to a dry
run.

Usage:
    python manage.py fix_mislabeled_wire_test_cases               # dry run (default)
    python manage.py fix_mislabeled_wire_test_cases --apply        # actually writes
    python manage.py fix_mislabeled_wire_test_cases --problem-id 538  # limit to one problem
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.learning.models import Problem, TestCase
from apps.learning.services.judging.serializer import looks_like_wire_format
from apps.learning.services.judging.type_system import TypeError_, parse_type


class Command(BaseCommand):
    help = "Retag TestCase rows wrongly left at input_format='wire' that actually hold raw, un-adapted example text."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write the changes. Without this flag, only a preview is printed.",
        )
        parser.add_argument(
            "--problem-id", type=int, default=None,
            help="Limit the scan to one Problem id.",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        problem_id = options["problem_id"]

        problems = Problem.objects.filter(uses_generic_judge=True).exclude(generic_schema__isnull=True)
        if problem_id is not None:
            problems = problems.filter(id=problem_id)

        total_checked = 0
        total_fixed = 0

        with transaction.atomic():
            for problem in problems.order_by("title").iterator():
                schema = problem.generic_schema or {}
                if schema.get("kind", "function") in ("design", "stdin"):
                    continue  # no per-param wire format to check against

                params = schema.get("params") or []
                if not params:
                    continue
                custom_structs = schema.get("custom_structs")
                try:
                    param_nodes = [parse_type(ptype, custom_structs) for _pname, ptype in params]
                except TypeError_:
                    continue  # malformed schema — a different problem, not this command's job

                wire_cases = TestCase.objects.filter(problem=problem, input_format=TestCase.INPUT_FORMAT_WIRE)
                for case in wire_cases:
                    total_checked += 1
                    if looks_like_wire_format(case.stdin, param_nodes):
                        continue
                    total_fixed += 1
                    self.stdout.write(
                        f"  problem={problem.id} ({problem.title!r}) testcase={case.id}: "
                        f"stdin={case.stdin[:80]!r} -- mislabeled 'wire', retagging 'raw_text'"
                    )
                    if apply_changes:
                        case.input_format = TestCase.INPUT_FORMAT_RAW_TEXT
                        case.save(update_fields=["input_format"])

            if not apply_changes:
                transaction.set_rollback(True)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"{'Fixed' if apply_changes else 'Would fix'}: {total_fixed} mislabeled test case(s) out of {total_checked} checked."
        ))
        if not apply_changes:
            self.stdout.write(self.style.WARNING("This was a dry run -- re-run with --apply to write these changes."))
