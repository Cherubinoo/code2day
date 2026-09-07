"""Views extracted from the original monolithic apps/learning/views.py
(module: admin/problem_bank). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class AdminProblemBankView(APIView):
    """System Admin: list every Problem with its test case count, so admins
    can see at a glance which problems are missing test cases."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        # Flags a problem whose stored test cases include at least one
        # raw_text row (see models.py's TestCase.input_format and
        # services/judging/integration.py's _effective_stdin()) — only
        # actually broken when the problem also uses the generic judge
        # (the legacy path already adapts raw text on its own), but
        # surfaced regardless so staff can see it before flipping
        # uses_generic_judge on.
        raw_text_exists = TestCase.objects.filter(
            problem=OuterRef("pk"), input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        problems = Problem.objects.annotate(
            test_case_count=Count("test_cases", distinct=True),
            has_raw_text_test_cases=Exists(raw_text_exists),
        ).order_by("title")

        data = [{
            "id": p.id,
            "title": p.title,
            "slug": p.slug,
            "difficulty": p.difficulty,
            "tags": p.tags,
            "execution_type": p.execution_type,
            "test_case_count": p.test_case_count,
            "explanation": p.explanation,
            "has_param_schema": bool(p.param_schema),
            "has_generic_schema": bool(p.generic_schema),
            "description_is_scenario": p.description_is_scenario,
            "has_generic_starter_code": bool(p.generic_starter_code),
            "uses_generic_judge": p.uses_generic_judge,
            "has_raw_text_test_cases": p.has_raw_text_test_cases,
            "needs_test_case_regeneration": (
                p.has_raw_text_test_cases and p.uses_generic_judge and p.execution_type != "stdin"
            ),
        } for p in problems]

        needs_regen_count = sum(1 for p in data if p["needs_test_case_regeneration"])

        return Response({"problems": data, "total": len(data), "needs_test_case_regeneration_count": needs_regen_count})

class AdminProblemTestCasesView(APIView):
    """System Admin: view every test case for one Problem, and manually add
    one (for staff who want to hand-author instead of / alongside
    generating)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        test_cases = [{
            "id": tc.id,
            "stdin": tc.stdin,
            "expected_output": tc.expected_output,
            "is_sample": tc.is_sample,
            "order": tc.order,
            "input_data": tc.input_data,
        } for tc in problem.test_cases.all().order_by("order", "id")]

        return Response({
            "problem": {
                "id": problem.id, "title": problem.title, "slug": problem.slug, "examples": problem.examples,
                "param_schema": problem.param_schema,
            },
            "test_cases": test_cases,
        })

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        expected_output = (request.data.get("expected_output") or "").strip()
        if not expected_output:
            return Response({"error": "expected_output is required"}, status=400)

        input_data = request.data.get("input_data")
        if input_data is not None and not isinstance(input_data, dict):
            return Response({"error": "input_data must be a JSON object"}, status=400)

        next_order = (problem.test_cases.aggregate(Max("order"))["order__max"] or 0) + 1
        tc = TestCase.objects.create(
            problem=problem,
            stdin=request.data.get("stdin") or "",
            expected_output=expected_output,
            is_sample=bool(request.data.get("is_sample")),
            order=next_order,
            input_data=input_data,
        )
        return Response({
            "id": tc.id, "stdin": tc.stdin, "expected_output": tc.expected_output,
            "is_sample": tc.is_sample, "order": tc.order, "input_data": tc.input_data,
        }, status=201)

class AdminProblemTestCaseDetailView(APIView):
    """System Admin: delete one manually- or LLM-added test case."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, problem_id, test_case_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        tc = TestCase.objects.filter(id=test_case_id, problem_id=problem_id).first()
        if not tc:
            return Response({"error": "Not found"}, status=404)
        tc.delete()
        return Response(status=204)

class AdminProblemParamSchemaView(APIView):
    """System Admin: view/set/clear a Problem's structured parameter/return-type
    schema (Problem.param_schema). Strictly opt-in — a problem with no schema
    keeps executing through the existing regex/heuristic path unchanged; see
    services/param_types.py for the type vocabulary and services/execution_adapter.py
    for how a schema changes execution once set."""
    permission_classes = [IsAuthenticated]

    def get(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        return Response({
            "param_schema": problem.param_schema,
            "valid_types": param_types.VALID_TYPES,
        })

    def put(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        schema = request.data.get("param_schema")
        errors = param_types.validate_schema(schema)
        if errors:
            return Response({"error": "Invalid schema", "details": errors}, status=400)

        problem.param_schema = schema
        problem.save(update_fields=["param_schema"])
        return Response({"param_schema": problem.param_schema})

    def delete(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        problem.param_schema = None
        problem.save(update_fields=["param_schema"])
        return Response(status=204)

class AdminProblemGenerateTestCasesView(APIView):
    """System Admin: on-demand (re)generate test cases for one Problem via
    the LLM fallback chain."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        from ...services.testcase_generator import generate_test_cases, derive_examples, TestCaseGenError
        try:
            generated = generate_test_cases(
                title=problem.title,
                description=problem.description,
                examples=problem.examples,
                difficulty=problem.difficulty,
            )
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        with transaction.atomic():
            problem.test_cases.all().delete()
            TestCase.objects.bulk_create([
                TestCase(
                    problem=problem,
                    stdin=case["stdin"],
                    expected_output=case["expected_output"],
                    is_sample=case["is_sample"],
                    order=order,
                    # generate_test_cases() (the legacy AI generator) produces
                    # human/LLM-style raw stdin text (e.g. plain judge-style
                    # rows), not services/judging/serializer.py's wire format
                    # — the legacy execution path already adapts this via
                    # prepare_execution_payload()'s parse_argument_list(),
                    # same as raw example text; tagging it honestly here so
                    # the generic judge (if this problem later opts in) also
                    # knows to adapt it via integration.py's _effective_stdin().
                    input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
                )
                for order, case in enumerate(generated, start=1)
            ])

        generated_examples = 0
        if not problem.examples:
            problem.examples = derive_examples(generated)
            problem.save(update_fields=["examples"])
            generated_examples = len(problem.examples)

        return Response({
            "generated_count": len(generated),
            "generated_examples_count": generated_examples,
            "test_case_count": problem.test_cases.count(),
            "examples_count": len(problem.examples),
        })

class AdminProblemGenerateSchemaAndDescriptionView(APIView):
    """System Admin: single button that fills in whatever "necessary data"
    a problem is missing — the typed param_schema, the explanation, and/or
    the hint ladder — via the LLM fallback chain, WITHOUT touching test
    cases (that stays a separate, explicit action). Every piece is
    skip-if-exists: this never overwrites hand-authored content, it only
    fills in what's actually missing."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        return Response(_fill_missing_problem_metadata(problem))

class AdminProblemGenerateExplanationView(APIView):
    """System Admin: on-demand (re)generate a brief explanation for one
    Problem via the LLM fallback chain. Separate endpoint from test-case
    generation so the admin bank can fire both concurrently instead of
    waiting on one before starting the other."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        force = bool(request.data.get("force"))
        if problem.explanation and not force:
            return Response(
                {"error": "This problem already has an explanation. Pass force=true to replace it."},
                status=400,
            )

        from ...services.testcase_generator import generate_explanation, TestCaseGenError
        try:
            explanation = generate_explanation(
                title=problem.title, description=problem.description,
                examples=problem.examples, difficulty=problem.difficulty,
            )
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        problem.explanation = explanation
        problem.save(update_fields=["explanation"])
        return Response({"explanation": problem.explanation})

class AdminProblemGenerateScenarioDescriptionView(APIView):
    """System Admin: on-demand (re)generate the scenario description for
    ONE Problem via the LLM — same generate_scenario_description() call
    the bank-wide and per-topic sweeps use, just scoped to a single
    problem_id. The individual-question-level entry point alongside those
    two, so an admin isn't forced to sweep an entire topic just to fix one
    problem's rewrite."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        force = bool(request.data.get("force"))
        if problem.description_is_scenario and not force:
            return Response(
                {"error": "This problem already has a scenario description. Pass force=true to replace it."},
                status=400,
            )

        from ...services.testcase_generator import generate_scenario_description, TestCaseGenError
        try:
            rewritten = generate_scenario_description(
                title=problem.title, description=problem.description, examples=problem.examples,
            )
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        update_fields = ["description", "description_is_scenario"]
        if not problem.description_original:
            problem.description_original = problem.description
            update_fields.append("description_original")
        problem.description = rewritten
        problem.description_is_scenario = True
        problem.save(update_fields=update_fields)
        return Response({"description": problem.description})

class AdminProblemGenerateGenericSchemaView(APIView):
    """System Admin: single-problem "one hit run" for the new type-driven
    judging framework (services/judging/) — generates
    Problem.generic_schema via the LLM fallback chain and saves it
    immediately, with only a shallow shape check, not full type-parsing
    validation. That's a deliberately separate step
    (AdminProblemBankValidateGenericSchemasView below), matching how this
    bank already treats "generate" and "validate" as distinct actions
    elsewhere (e.g. the aptitude bank's validate endpoint). Never touches
    Problem.uses_generic_judge — that flag only flips on once a schema has
    actually passed validation."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        force = bool(request.data.get("force"))
        if problem.generic_schema and not force:
            return Response(
                {"error": "This problem already has a generic_schema. Pass force=true to replace it."},
                status=400,
            )

        from ...services.judging.schema_generator import generate_generic_schema, validate_generic_schema
        from ...services.testcase_generator import TestCaseGenError
        try:
            schema = generate_generic_schema(title=problem.title, description=problem.description, examples=problem.examples)
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        problem.generic_schema = schema
        problem.save(update_fields=["generic_schema"])
        return Response({
            "generic_schema": schema,
            # Informational only — this endpoint never blocks on validation.
            "validation_errors": validate_generic_schema(schema),
        })

class AdminProblemGenerateGenericTestCasesView(APIView):
    """System Admin: single-problem "one hit run" — generates fresh test
    cases for the new judging framework via the LLM, using
    Problem.generic_schema's own types (services/judging/
    generic_testcase_generator.py: the LLM proposes plain structured
    values, this module deterministically converts them to wire format
    and structurally validates every one before saving). REPLACES this
    problem's existing TestCase rows entirely — new-format and legacy-
    format test cases can never coexist for one problem, since
    execute_problem_test_case_batch() picks exactly one wire format based
    on uses_generic_judge. Requires generic_schema to already exist."""
    permission_classes = [IsAuthenticated]

    def post(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)

        if not problem.generic_schema:
            return Response({"error": "This problem has no generic_schema yet — generate one first."}, status=400)

        if problem.generic_schema.get("kind") == "stdin":
            return Response(
                {"error": "This is a stdin-mode problem — the student's program handles its own I/O, "
                          "so there's nothing to generate test cases for. Add/edit its test cases directly instead."},
                status=400,
            )

        from ...services.judging.generic_testcase_generator import generate_generic_test_cases
        from ...services.testcase_generator import TestCaseGenError
        try:
            cases = generate_generic_test_cases(
                title=problem.title, description=problem.description, schema=problem.generic_schema,
            )
        except TestCaseGenError as exc:
            return Response({"error": f"Generation failed: {exc}"}, status=502)

        if not cases:
            return Response(
                {"error": "The LLM's proposed test cases all failed structural validation — nothing saved."},
                status=502,
            )

        with transaction.atomic():
            problem.test_cases.all().delete()
            TestCase.objects.bulk_create([
                # generate_generic_test_cases() already serializes via
                # services/judging/serializer.py — real wire format, not
                # raw text, hence the explicit (if redundant with the
                # model default) input_format=wire here.
                TestCase(problem=problem, stdin=c["stdin"], expected_output=c["expected_output"],
                         is_sample=(i == 0), order=i + 1, input_format=TestCase.INPUT_FORMAT_WIRE)
                for i, c in enumerate(cases)
            ])

        return Response({"generated_count": len(cases), "test_case_count": problem.test_cases.count()})

class AdminProblemBankRegenerateRawTextTestCasesView(APIView):
    """System Admin: bulk fix for the "raw example text persisted where
    the generic judge expected wire format" class of bug (see
    models.py's TestCase.input_format and services/judging/integration.py's
    _effective_stdin() for the full story) — targets exactly the
    problems AdminProblemBankView's `needs_test_case_regeneration` flag
    surfaces: uses_generic_judge=True AND at least one stored TestCase
    still tagged input_format=raw_text. Same one-hit-per-problem
    regeneration as AdminProblemGenerateGenericTestCasesView (replaces
    ALL of that problem's test cases with fresh AI-generated, properly
    wire-formatted ones), just run across the whole backlog instead of
    one problem at a time — same run_across_providers_in_parallel /
    time-budgeted-per-click pattern as the schema bulk sweeps above."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 200
    ROUND_SIZE_PER_PROVIDER = 6

    @staticmethod
    def _needs_regen_q():
        # Excludes stdin-mode problems (generic_schema__kind="stdin") even
        # if one of their test cases somehow got tagged raw_text — there's
        # no wire format for this AI generator to regenerate them into
        # (a stdin schema has no "params" to build one from), and none is
        # needed: a stdin-mode problem's test cases are already exactly
        # the raw plain-input text its own program reads.
        #
        # NOT expressed as ~Q(generic_schema__kind="stdin") — every schema
        # saved before this session's "kind" field existed has no "kind"
        # key at all, and SQL's three-valued logic makes NOT(NULL = 'x')
        # evaluate to NULL (excluded), not TRUE, silently dropping every
        # pre-existing schema from this query. The isnull=True clause
        # ahead of the OR is what makes "kind is missing" count as "not
        # stdin" the way plain Python `!=` would.
        not_stdin_kind = Q(generic_schema__kind__isnull=True) | ~Q(generic_schema__kind="stdin")
        return (
            Q(uses_generic_judge=True)
            & not_stdin_kind
            & Exists(TestCase.objects.filter(problem=OuterRef("pk"), input_format=TestCase.INPUT_FORMAT_RAW_TEXT))
        )

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.judging.generic_testcase_generator import generate_generic_test_cases
        from ...services.testcase_generator import (
            NoProvidersAvailableError, run_across_providers_in_parallel, _providers_in_rotation_order,
        )

        try:
            provider_count = len(_providers_in_rotation_order())
        except NoProvidersAvailableError as exc:
            return Response({"error": str(exc)}, status=502)

        start = time.monotonic()
        batch_size = min(self.MAX_ACTIONS, provider_count * self.ROUND_SIZE_PER_PROVIDER)
        problems = list(Problem.objects.filter(self._needs_regen_q()).order_by("title")[:batch_size])

        def call_one(problem, provider):
            return generate_generic_test_cases(
                title=problem.title, description=problem.description, schema=problem.generic_schema,
                providers=[provider],
            )

        results = run_across_providers_in_parallel(problems, call_one, timeout_seconds=self.TIME_BUDGET_SECONDS)

        processed = []
        for problem, cases, error in results:
            entry = {"id": problem.id, "title": problem.title}
            if error is not None:
                entry["error"] = str(error)
            elif not cases:
                entry["error"] = "The LLM's proposed test cases all failed structural validation — nothing saved."
            else:
                with transaction.atomic():
                    problem.test_cases.all().delete()
                    TestCase.objects.bulk_create([
                        TestCase(problem=problem, stdin=c["stdin"], expected_output=c["expected_output"],
                                 is_sample=(i == 0), order=i + 1, input_format=TestCase.INPUT_FORMAT_WIRE)
                        for i, c in enumerate(cases)
                    ])
                entry["regenerated"] = True
                entry["test_case_count"] = len(cases)
            processed.append(entry)

        remaining = Problem.objects.filter(self._needs_regen_q()).count()
        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
        })

class AdminProblemDetailView(APIView):
    """System Admin: delete a single Problem (and its test cases, via
    on_delete cascade) from the Problem Bank."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, problem_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        problem = Problem.objects.filter(id=problem_id).first()
        if not problem:
            return Response({"error": "Not found"}, status=404)
        problem.delete()
        return Response(status=204)

class AdminProblemBulkDeleteView(APIView):
    """System Admin: delete many Problems at once, selected in the Problem
    Bank UI."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        ids = request.data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return Response({"error": "ids (non-empty list) is required"}, status=400)

        qs = Problem.objects.filter(id__in=ids)
        deleted_count = qs.count()
        qs.delete()
        return Response({"deleted_count": deleted_count})

class AdminProblemBankFillMissingView(APIView):
    """System Admin: single bulk button — sweeps every Problem in the bank
    and generates whatever it's missing (test cases, param_schema,
    explanation) via the LLM fallback chain. Every piece is skip-if-exists,
    same as the per-problem actions this mirrors — it never overwrites
    hand-authored content, it only fills gaps.

    Bounded per click by a wall-clock TIME budget, not a fixed action count.
    param_schema is a brand-new field, so on a bank this size (checked live:
    1828 problems, all 1828 missing a schema) a small fixed count would need
    ~180 clicks to ever finish. A time budget instead processes as many
    problems as safely fit in one request — adapting to however fast the
    LLM rotation happens to be responding right now — while still stopping
    well short of gunicorn's worker timeout. Call again to keep sweeping;
    the response reports how many problems still need something."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90  # gunicorn's worker timeout is 120s; leaves headroom for request overhead
    MAX_ACTIONS = 200          # hard backstop in case calls return implausibly fast

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.testcase_generator import (
            generate_test_cases, generate_param_schema, generate_explanation, generate_hints,
            derive_examples, TestCaseGenError,
        )

        problems = (
            Problem.objects
            .annotate(tc_count=Count("test_cases", distinct=True))
            .filter(Q(tc_count=0) | _missing_metadata_q())
            .order_by("title")
        )

        processed = []
        actions_done = 0
        start = time.monotonic()

        def budget_left():
            return actions_done < self.MAX_ACTIONS and (time.monotonic() - start) < self.TIME_BUDGET_SECONDS

        for problem in problems:
            if not budget_left():
                break

            entry = {"id": problem.id, "title": problem.title}
            did_anything = False

            if problem.tc_count == 0 and budget_left():
                actions_done += 1
                did_anything = True
                try:
                    generated = generate_test_cases(
                        title=problem.title, description=problem.description,
                        examples=problem.examples, difficulty=problem.difficulty,
                    )
                    with transaction.atomic():
                        TestCase.objects.bulk_create([
                            TestCase(
                                problem=problem, stdin=case["stdin"], expected_output=case["expected_output"],
                                is_sample=case["is_sample"], order=order,
                                # Same legacy AI generator as AdminProblemGenerateTestCasesView —
                                # raw judge-style stdin text, not wire format.
                                input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
                            )
                            for order, case in enumerate(generated, start=1)
                        ])
                    if not problem.examples:
                        problem.examples = derive_examples(generated)
                        problem.save(update_fields=["examples"])
                    entry["test_cases_generated"] = len(generated)
                except TestCaseGenError as exc:
                    entry["test_cases_error"] = str(exc)

            if not problem.param_schema and budget_left():
                actions_done += 1
                did_anything = True
                try:
                    schema = generate_param_schema(title=problem.title, description=problem.description, examples=problem.examples)
                    problem.param_schema = schema
                    problem.save(update_fields=["param_schema"])
                    entry["schema_generated"] = True
                except TestCaseGenError as exc:
                    entry["schema_error"] = str(exc)

            if not problem.explanation and budget_left():
                actions_done += 1
                did_anything = True
                try:
                    explanation = generate_explanation(
                        title=problem.title, description=problem.description,
                        examples=problem.examples, difficulty=problem.difficulty,
                    )
                    problem.explanation = explanation
                    problem.save(update_fields=["explanation"])
                    entry["explanation_generated"] = True
                except TestCaseGenError as exc:
                    entry["explanation_error"] = str(exc)

            if not problem.hints and budget_left():
                actions_done += 1
                did_anything = True
                try:
                    hints = generate_hints(title=problem.title, description=problem.description)
                    problem.hints = hints
                    problem.save(update_fields=["hints"])
                    entry["hints_generated"] = True
                except TestCaseGenError as exc:
                    entry["hints_error"] = str(exc)

            if did_anything:
                processed.append(entry)

        remaining = (
            Problem.objects
            .annotate(tc_count=Count("test_cases", distinct=True))
            .filter(Q(tc_count=0) | _missing_metadata_q())
            .count()
        )

        return Response({
            "processed": processed,
            "actions_done": actions_done,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
        })

class AdminProblemBankGenerateGenericSchemasView(APIView):
    """System Admin: bulk "one hit run" for the new type-driven judging
    framework — sweeps every Problem missing a generic_schema and
    generates one via the LLM, with no deep validation (fast; see
    AdminProblemBankValidateGenericSchemasView for the follow-up pass that
    checks correctness and enables the ones that pass). Same
    time-budgeted-per-click pattern as AdminProblemBankFillMissingView —
    call again to keep sweeping the rest of the bank.

    Runs the batch through run_across_providers_in_parallel(): every
    active LLMProvider handles its own slice concurrently instead of the
    whole batch funneling through one provider at a time — this is the
    difference between the single-problem "Generate Judge Schema" button
    feeling instant (it always had one provider to itself) and this bulk
    sweep feeling slow (it used to serialize everything onto whichever
    provider was next in rotation)."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 200
    ROUND_SIZE_PER_PROVIDER = 6  # keeps one round's wall-clock bounded regardless of provider count

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.judging.schema_generator import generate_generic_schema
        from ...services.testcase_generator import (
            NoProvidersAvailableError, run_across_providers_in_parallel, _providers_in_rotation_order,
        )

        try:
            provider_count = len(_providers_in_rotation_order())
        except NoProvidersAvailableError as exc:
            return Response({"error": str(exc)}, status=502)

        start = time.monotonic()
        batch_size = min(self.MAX_ACTIONS, provider_count * self.ROUND_SIZE_PER_PROVIDER)
        problems = list(Problem.objects.filter(_missing_generic_schema_q()).order_by("title")[:batch_size])

        def call_one(problem, provider):
            return generate_generic_schema(
                title=problem.title, description=problem.description, examples=problem.examples,
                providers=[provider], known_kind=_known_generic_schema_kind(problem),
            )

        results = run_across_providers_in_parallel(problems, call_one, timeout_seconds=self.TIME_BUDGET_SECONDS)

        processed = []
        for problem, schema, error in results:
            entry = {"id": problem.id, "title": problem.title}
            if error is not None:
                entry["error"] = str(error)
            else:
                problem.generic_schema = schema
                problem.save(update_fields=["generic_schema"])
                entry["generated"] = True
            processed.append(entry)

        remaining = Problem.objects.filter(_missing_generic_schema_q()).count()
        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
        })

class AdminProblemBankValidateGenericSchemasView(APIView):
    """System Admin: the "if missed or wrong" follow-up pass for the new
    judging framework. Sweeps every Problem that either has no
    generic_schema yet or hasn't been enabled yet: one still missing a
    schema gets one generated (same as the bulk-generate action above);
    one that already has a schema gets it structurally validated — every
    declared type string must actually parse (services/judging/type_system.py).
    A schema that fails validation is regenerated once and re-checked.

    Only a schema that ends up valid flips Problem.uses_generic_judge on —
    the one place that flag is ever set automatically, which is exactly the
    gate the additive-judging design calls for: a problem only starts
    running through the new pipeline once its schema is confirmed
    parseable, never the moment it's merely generated. Same
    time-budgeted-per-click pattern as the other bulk sweeps here.

    A problem still invalid after its one regeneration attempt gets
    Problem.generic_schema_needs_review flipped on and is EXCLUDED from
    this sweep's normal query from then on — without that, a handful of
    problems the LLM simply can't produce a valid schema for (a genuinely
    ambiguous statement, an unsupported shape) would get reselected and
    re-attempted every single round forever, burning tokens while never
    letting `remaining_problems` reach 0 and blocking the sweep from ever
    finishing for the rest of the bank. Pass {"retry_flagged": true} to
    instead target exactly those flagged problems — a deliberate, explicit
    "try the stubborn ones again" pass a staff member triggers separately,
    not something the automatic sweep does on its own. Enabling clears the
    flag either way.

    Each problem's LLM work (generate-if-missing, then validate, then
    regenerate-once-if-invalid) runs as one self-contained unit handed to
    run_across_providers_in_parallel(), so every active provider handles
    its own slice of the batch concurrently — see
    AdminProblemBankGenerateGenericSchemasView's docstring for why this
    replaces the old one-problem-at-a-time loop."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 200
    ROUND_SIZE_PER_PROVIDER = 6

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.judging.schema_generator import generate_generic_schema, validate_generic_schema
        from ...services.testcase_generator import (
            TestCaseGenError, NoProvidersAvailableError,
            run_across_providers_in_parallel, _providers_in_rotation_order,
        )

        retry_flagged = bool(request.data.get("retry_flagged"))

        def needs_pass_q():
            if retry_flagged:
                return Q(generic_schema_needs_review=True)
            return Q(generic_schema__isnull=True) | Q(uses_generic_judge=False, generic_schema_needs_review=False)

        try:
            provider_count = len(_providers_in_rotation_order())
        except NoProvidersAvailableError as exc:
            return Response({"error": str(exc)}, status=502)

        start = time.monotonic()
        batch_size = min(self.MAX_ACTIONS, provider_count * self.ROUND_SIZE_PER_PROVIDER)
        problems = list(Problem.objects.filter(needs_pass_q()).order_by("title")[:batch_size])

        def call_one(problem, provider):
            """Pure LLM work for one problem — no DB writes (this runs in a
            worker thread). Only raises when the schema was missing AND
            generation fails, matching the original loop's `continue`
            (nothing to save yet). A regeneration failure after an invalid
            existing schema is captured in the return value instead, since
            the original loop still saved the (still-invalid) schema and
            disabled the judge in that case."""
            known_kind = _known_generic_schema_kind(problem)

            schema = problem.generic_schema
            out = {"schema": schema, "generated": False, "initial_errors": None, "regenerated": False, "regen_error": None}
            if not schema:
                schema = generate_generic_schema(
                    title=problem.title, description=problem.description, examples=problem.examples,
                    providers=[provider], known_kind=known_kind,
                )
                out["generated"] = True
                out["schema"] = schema

            errors = validate_generic_schema(schema)
            if errors:
                out["initial_errors"] = errors
                try:
                    schema = generate_generic_schema(
                        title=problem.title, description=problem.description, examples=problem.examples,
                        providers=[provider], known_kind=known_kind,
                    )
                    errors = validate_generic_schema(schema)
                    out["regenerated"] = True
                    out["schema"] = schema
                except TestCaseGenError as exc:
                    out["regen_error"] = str(exc)
            out["errors"] = errors
            return out

        results = run_across_providers_in_parallel(problems, call_one, timeout_seconds=self.TIME_BUDGET_SECONDS)

        processed = []
        for problem, result, error in results:
            entry = {"id": problem.id, "title": problem.title}
            if error is not None:
                entry["error"] = f"Generation failed: {error}"
                processed.append(entry)
                continue

            if result["generated"]:
                entry["generated"] = True
            if result["initial_errors"] is not None:
                entry["initial_errors"] = result["initial_errors"]
            if result["regenerated"]:
                entry["regenerated"] = True
            if result["regen_error"]:
                entry["error"] = f"Regeneration failed: {result['regen_error']}"

            problem.generic_schema = result["schema"]
            errors = result["errors"]
            if errors:
                entry["errors"] = errors
                problem.uses_generic_judge = False
                # Only flag as needing manual review once it's failed BOTH
                # the initial validation AND the one regeneration attempt —
                # i.e. exactly the case this entry is already reporting.
                problem.generic_schema_needs_review = True
                entry["needs_review"] = True
            else:
                problem.uses_generic_judge = True
                problem.generic_schema_needs_review = False
                entry["enabled"] = True

            problem.save(update_fields=["generic_schema", "uses_generic_judge", "generic_schema_needs_review"])
            processed.append(entry)

        remaining = Problem.objects.filter(needs_pass_q()).count()
        flagged_total = Problem.objects.filter(generic_schema_needs_review=True).count()
        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
            "flagged_total": flagged_total,
        })

class AdminProblemBankRegenerateAllExplanationsView(APIView):
    """System Admin: force-regenerates Problem.explanation for every
    problem that hasn't been migrated to the story-driven prompt in
    EXPLANATION_PROMPT_TEMPLATE yet (old explanations were plain
    pedagogical text, not story-hooked) — a one-time bank-wide style
    migration, not an ordinary "fill what's missing" sweep, but still
    tracked with a real DB flag (Problem.explanation_is_story) rather than
    a client-held cursor: a problem is only ever regenerated once, and a
    later click (even after a page refresh, even from a different admin
    session) picks up exactly the problems still on the old style — never
    redoing ones already migrated. Set only after a successful generation,
    so a failed one is retried on the next click rather than silently
    left on the old style forever.

    Runs the batch through run_across_providers_in_parallel() — see
    AdminProblemBankGenerateGenericSchemasView's docstring for why."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 200
    ROUND_SIZE_PER_PROVIDER = 6

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.testcase_generator import (
            generate_explanation, NoProvidersAvailableError,
            run_across_providers_in_parallel, _providers_in_rotation_order,
        )

        def needs_story_q():
            return Q(explanation_is_story=False)

        try:
            provider_count = len(_providers_in_rotation_order())
        except NoProvidersAvailableError as exc:
            return Response({"error": str(exc)}, status=502)

        start = time.monotonic()
        batch_size = min(self.MAX_ACTIONS, provider_count * self.ROUND_SIZE_PER_PROVIDER)
        problems = list(Problem.objects.filter(needs_story_q()).order_by("id")[:batch_size])

        def call_one(problem, provider):
            return generate_explanation(
                title=problem.title, description=problem.description,
                examples=problem.examples, difficulty=problem.difficulty,
                providers=[provider],
            )

        results = run_across_providers_in_parallel(problems, call_one, timeout_seconds=self.TIME_BUDGET_SECONDS)

        processed = []
        for problem, explanation, error in results:
            entry = {"id": problem.id, "title": problem.title}
            if error is not None:
                entry["error"] = str(error)
            else:
                problem.explanation = explanation
                problem.explanation_is_story = True
                problem.save(update_fields=["explanation", "explanation_is_story"])
                entry["generated"] = True
            processed.append(entry)

        remaining = Problem.objects.filter(needs_story_q()).count()
        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
        })

class AdminProblemBankRegenerateScenarioDescriptionsView(APIView):
    """System Admin: bank-wide "Generate Scenario Descriptions" sweep —
    see _run_scenario_description_sweep for the actual behavior. Use
    AdminProblemTopicRegenerateScenarioDescriptionsView instead to work
    through the bank in topic-sized chunks (Array, Trees, ...)."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 200
    ROUND_SIZE_PER_PROVIDER = 6

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        result = _run_scenario_description_sweep(
            Problem.objects.all(),
            time_budget_seconds=self.TIME_BUDGET_SECONDS,
            max_actions=self.MAX_ACTIONS,
            round_size_per_provider=self.ROUND_SIZE_PER_PROVIDER,
        )
        if "error" in result:
            return Response(result, status=502)
        return Response(result)

class AdminProblemTopicRegenerateScenarioDescriptionsView(APIView):
    """System Admin: the per-topic entry point for "Generate Scenario
    Descriptions" — same sweep as AdminProblemBankRegenerateScenarioDescriptionsView,
    scoped to one topic's tag (or the "Untagged" tile) via _problems_in_topic,
    same as AdminProblemTopicGenerateGenericJudgeView does for the judge
    migration. Only touches problems in the given topic; only ones not
    already converted unless force=true (redo this topic even for problems
    already on a scenario description — e.g. after tweaking the prompt)."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 50

    def post(self, request, topic):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        force = bool(request.data.get("force"))
        result = _run_scenario_description_sweep(
            _problems_in_topic(topic),
            time_budget_seconds=self.TIME_BUDGET_SECONDS,
            max_actions=self.MAX_ACTIONS,
            round_size_per_provider=6,
            force=force,
        )
        if "error" in result:
            return Response(result, status=502)
        return Response(result)

class AdminProblemBankGenerateStarterCodeView(APIView):
    """System Admin: "Generate Starter Code" — pre-computes and persists
    Problem.generic_starter_code for every generic-judge problem that
    doesn't have a snapshot yet, so the student editor's `class
    Solution: ...` boilerplate (services/judging/starter_code.py, read by
    ProblemDetailSerializer.get_starter_code) is a stable, admin-reviewable
    value instead of silently recomputed on every request.

    Unlike every other bulk sweep in this file, this one calls no LLM at
    all — starter_code.generate_generic_starter_code is pure deterministic
    codegen off the already-stored generic_schema, so there's no
    provider-rotation machinery and no per-round token cost. That's also
    why the whole eligible set is swept in one request ("generate it at a
    go") rather than a small per-click batch: MAX_ACTIONS is a safety cap
    for an unexpectedly huge bank, not the normal stopping point.

    Pass {"force": true} to regenerate every eligible problem's snapshot
    even if one already exists (e.g. after a fix to starter_code.py) —
    otherwise a problem is only ever computed once, same DB-persisted-
    progress convention as every other sweep here."""
    permission_classes = [IsAuthenticated]

    MAX_ACTIONS = 5000

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        from ...services.judging.starter_code import generate_generic_starter_code

        force = bool(request.data.get("force"))

        def scoped_qs():
            return Problem.objects.filter(_missing_generic_starter_code_q(force=force))

        start = time.monotonic()
        problems = list(scoped_qs().order_by("id")[: self.MAX_ACTIONS])

        processed = []
        for problem in problems:
            entry = {"id": problem.id, "title": problem.title}
            try:
                result = {}
                for language in DEFAULT_PRACTICE_LANGUAGES:
                    code = generate_generic_starter_code(problem, language)
                    if code:
                        result[language] = code
            except Exception as exc:
                entry["error"] = str(exc)
                processed.append(entry)
                continue

            problem.generic_starter_code = result
            problem.save(update_fields=["generic_starter_code"])
            entry["languages"] = list(result.keys())
            processed.append(entry)

        remaining = Problem.objects.filter(_missing_generic_starter_code_q(force=False)).count()
        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": remaining,
        })

class AdminProblemTopicGenerateGenericJudgeView(APIView):
    """System Admin: the per-topic entry point for migrating a chunk of
    the Problem Bank onto the new type-driven judging framework in one
    action — schema (generate if missing) + fresh AI test cases (always
    regenerated, replacing whatever was there) + structural validation,
    only enabling uses_generic_judge for a problem once both check out.
    Same time-budgeted-per-click pattern as the other bulk sweeps here —
    call again to keep sweeping the rest of this topic. Only touches
    problems in the given topic; only ones not already enabled unless
    force=true (which also re-migrates already-enabled problems in this
    topic — mainly useful to refresh their test cases)."""
    permission_classes = [IsAuthenticated]

    TIME_BUDGET_SECONDS = 90
    MAX_ACTIONS = 50  # each action here is 1-2 LLM calls (schema + test cases), costlier than a schema-only sweep

    def post(self, request, topic):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        import time
        force = bool(request.data.get("force"))

        def scoped_qs():
            qs = _problems_in_topic(topic)
            if not force:
                qs = qs.filter(uses_generic_judge=False)
            return qs

        problems = scoped_qs().order_by("title")
        processed = []
        start = time.monotonic()

        for problem in problems:
            if len(processed) >= self.MAX_ACTIONS or (time.monotonic() - start) >= self.TIME_BUDGET_SECONDS:
                break
            processed.append(_migrate_problem_to_generic_judge(problem))

        return Response({
            "processed": processed,
            "elapsed_seconds": round(time.monotonic() - start, 1),
            "remaining_problems": scoped_qs().count(),
        })

class AdminProblemTopicsView(APIView):
    """System Admin: every Problem tag as a topic tile (Array, Dynamic
    Programming, ...) plus an "Untagged" tile, each with how many of its
    problems are still missing param_schema/explanation — the entry point
    for the per-topic "Generate Missing Metadata" background job below,
    so admins can work through the bank in manageable, topic-sized chunks
    instead of one all-1800-problems sweep."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        tag_counts = {}
        for tags in Problem.objects.values_list("tags", flat=True):
            if not tags:
                tag_counts[UNTAGGED_PROBLEM_TOPIC] = tag_counts.get(UNTAGGED_PROBLEM_TOPIC, 0) + 1
                continue
            for t in tags:
                tag_counts[t] = tag_counts.get(t, 0) + 1

        missing_qs = Problem.objects.filter(_missing_metadata_q())
        missing_counts = {UNTAGGED_PROBLEM_TOPIC: 0}
        for tags in missing_qs.values_list("tags", flat=True):
            if not tags:
                missing_counts[UNTAGGED_PROBLEM_TOPIC] += 1
                continue
            for t in tags:
                missing_counts[t] = missing_counts.get(t, 0) + 1

        topics = [
            {
                "topic": topic,
                "label": "Untagged" if topic == UNTAGGED_PROBLEM_TOPIC else topic,
                "total": count,
                "missing_metadata": missing_counts.get(topic, 0),
            }
            for topic, count in tag_counts.items()
        ]
        topics.sort(key=lambda t: (-t["total"], t["label"]))
        return Response({"topics": topics})

class AdminProblemTopicMetadataRunView(APIView):
    """System Admin: "Generate Missing Metadata" for one topic tile — same
    stale-detection/Resume design as AdminAptitudeExplanationAuditView, see
    that class's docstring for why (a deploy/crash kills the background
    thread with no chance to update its own row, so a stale "running" row
    needs to be treated as recoverable, not just refused)."""
    permission_classes = [IsAuthenticated]
    STALE_SECONDS = 90

    def _is_stale(self, run):
        return run.status == 'running' and (timezone.now() - run.updated_at).total_seconds() > self.STALE_SECONDS

    def get(self, request, topic):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        run, _ = ProblemMetadataGenerationRun.objects.get_or_create(topic=topic)
        from ...services.testcase_generator import _providers_in_rotation_order
        try:
            active_provider_count = len(_providers_in_rotation_order())
        except Exception:
            active_provider_count = 0
        return Response({
            "topic": topic,
            "status": run.status,
            "total": _problems_in_topic(topic).count(),
            "missing_metadata": _problems_in_topic(topic).filter(_missing_metadata_q()).count(),
            "processed": run.processed_count,
            "schema_generated": run.schema_generated_count,
            "explanation_generated": run.explanation_generated_count,
            "hints_generated": run.hints_generated_count,
            "failed": run.failed_count,
            "last_error": run.last_error,
            "started_at": run.started_at,
            "updated_at": run.updated_at,
            "stalled": self._is_stale(run),
            "worker_count": min(active_provider_count, MAX_EXPLANATION_AUDIT_WORKERS),
            "active_provider_count": active_provider_count,
        })

    def post(self, request, topic):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        action = request.data.get('action')
        run, _ = ProblemMetadataGenerationRun.objects.get_or_create(topic=topic)
        stale = self._is_stale(run)

        if action == 'start':
            if run.status == 'running' and not stale:
                return Response({"error": "Already running."}, status=400)
            run.status = 'running'
            run.stop_requested = False
            run.last_error = ''
            if not run.started_at:
                run.started_at = timezone.now()
            run.save()
            threading.Thread(target=_run_topic_metadata_generation, args=(run.id, topic), daemon=True).start()
            return Response({"status": "running"})

        elif action == 'stop':
            if run.status != 'running':
                return Response({"error": "Not running."}, status=400)
            if stale:
                run.status = 'stopped'
                run.stop_requested = False
                run.save(update_fields=['status', 'stop_requested', 'updated_at'])
                return Response({"status": "stopped"})
            run.stop_requested = True
            run.save(update_fields=['stop_requested'])
            return Response({"status": "stopping"})

        elif action == 'reset':
            if run.status == 'running' and not stale:
                return Response({"error": "Stop the run before resetting."}, status=400)
            run.status = 'idle'
            run.last_problem_id = 0
            run.processed_count = 0
            run.schema_generated_count = 0
            run.explanation_generated_count = 0
            run.hints_generated_count = 0
            run.failed_count = 0
            run.started_at = None
            run.last_error = ''
            run.save()
            return Response({"status": "idle"})

        return Response({"error": "Unknown action."}, status=400)

