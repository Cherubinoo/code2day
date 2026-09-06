"""views.execute_problem_test_case_batch() dispatch: a problem with
uses_generic_judge=True must route through run_generic_batch() (mocked
Judge0Service here); every existing problem (the flag defaults to False)
must keep hitting the untouched legacy path — apps.learning.tests already
proves that end-to-end, this just proves the dispatch check itself."""

import json
import os
import shutil
import subprocess
import tempfile
from unittest.mock import patch

from django.test import TestCase

from ....models import Problem
from ...problem_testcases import RuntimeTestCase, build_runtime_test_cases
from ....views import execute_problem_test_case_batch
from ..comparator import compare_output
from ..integration import _effective_stdin
from ..type_system import parse_type
from ..wrapper_generator import generate_source


class GenericJudgeDispatchTests(TestCase):
    def setUp(self):
        self.problem = Problem.objects.create(
            title="Two Sum (Generic)",
            slug="two-sum-generic",
            description="desc",
            difficulty="Easy",
            tags=["Array"],
            uses_generic_judge=True,
            generic_schema={
                "function_name": "twoSum",
                "params": [["nums", "vector<int>"], ["target", "int"]],
                "return_type": "vector<int>",
            },
        )
        # execute_problem_test_case_batch always receives RuntimeTestCase
        # instances (see services/problem_testcases.py), never raw TestCase
        # model rows directly — RuntimeTestCase has a `source` field the
        # model itself doesn't.
        self.case = RuntimeTestCase(
            stdin="4\n2\n7\n11\n15\n9\n",
            expected_output="[0, 1]",
            is_sample=True,
            order=1,
            source="stored",
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_generic_problem_routes_through_run_generic_batch(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[0,1]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        solution = (
            "class Solution:\n"
            "    def twoSum(self, nums, target):\n"
            "        seen = {}\n"
            "        for i, x in enumerate(nums):\n"
            "            if target - x in seen:\n"
            "                return [seen[target - x], i]\n"
            "            seen[x] = i\n"
            "        return []\n"
        )
        result = execute_problem_test_case_batch(
            problem=self.problem,
            source_code=solution,
            language="python",
            language_id=71,
            test_cases=[self.case],
            batch_kind="submit",
        )
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["passed_cases"], 1)
        self.assertEqual(result["total_cases"], 1)
        mocked_batch.assert_called_once()

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_wrong_answer_from_generic_path(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[1,0]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        result = execute_problem_test_case_batch(
            problem=self.problem,
            source_code="class Solution:\n    def twoSum(self, nums, target):\n        return [1, 0]\n",
            language="python",
            language_id=71,
            test_cases=[self.case],
            batch_kind="submit",
        )
        # [1,0] vs expected [0,1]: order-sensitive vector comparison fails,
        # even though both are the same *set* of indices.
        self.assertEqual(result["status"], "Wrong Answer")
        self.assertEqual(result["passed_cases"], 0)

    def test_legacy_problem_never_touches_generic_path(self):
        legacy_problem = Problem.objects.create(
            title="Legacy Problem", slug="legacy-problem", description="d",
            difficulty="Easy", tags=[],
        )
        self.assertFalse(legacy_problem.uses_generic_judge)
        with patch("apps.learning.services.judging.integration.run_generic_batch") as mocked_run:
            legacy_case = RuntimeTestCase(
                stdin="1\n", expected_output="1", is_sample=True, order=1, source="stored",
            )
            with patch(
                "apps.learning.services.judging.judge0_service.Judge0Service.batch_execute",
                return_value=[{
                    "stdout": "1\n", "stderr": "", "compile_output": "", "status": "Accepted",
                    "time": "0.01", "memory": "1000", "token": "", "output": "1\n",
                }],
            ):
                execute_problem_test_case_batch(
                    problem=legacy_problem,
                    source_code="print(1)",
                    language="python",
                    language_id=71,
                    test_cases=[legacy_case],
                    batch_kind="submit",
                )
            mocked_run.assert_not_called()


class GenericJudgeDesignDispatchTests(TestCase):
    """run_generic_batch()'s kind=="design" branch: generate_design_source
    instead of generate_source, and compare_design_output (per-operation
    return type, read from schema["methods"]) instead of compare_output
    (one uniform return_type) — Judge0Service itself mocked, same as
    GenericJudgeDispatchTests above, since this is about the dispatch and
    comparison logic, not real execution (see test_design_wrapper_generation.py
    for real-interpreter coverage of generate_design_source itself)."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="Zigzag Iterator (Generic)",
            slug="zigzag-iterator-generic",
            description="desc",
            difficulty="Medium",
            tags=["Design"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "design",
                "class_name": "ZigzagIterator",
                "methods": {
                    "ZigzagIterator": {"params": [["v1", "vector<int>"], ["v2", "vector<int>"]], "return_type": "void"},
                    "next": {"params": [], "return_type": "int"},
                    "hasNext": {"params": [], "return_type": "bool"},
                },
                "custom_structs": {},
            },
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_design_problem_routes_through_generate_design_source(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[null,1,3,2]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(
            stdin="4\nZigzagIterator\n2\n1\n2\n4\n3\n4\n5\n6\nnext\nnext\nnext\n",
            expected_output="[null, 1, 3, 2]",
            is_sample=True, order=1, source="stored",
            input_data={"operations": ["ZigzagIterator", "next", "next", "next"]},
        )
        solution = (
            "class ZigzagIterator:\n"
            "    def __init__(self, v1, v2):\n"
            "        self.queue = []\n"
            "        if v1: self.queue.append((v1, 0))\n"
            "        if v2: self.queue.append((v2, 0))\n"
            "    def next(self):\n"
            "        vals, i = self.queue.pop(0)\n"
            "        if i + 1 < len(vals):\n"
            "            self.queue.append((vals, i + 1))\n"
            "        return vals[i]\n"
            "    def hasNext(self):\n"
            "        return len(self.queue) > 0\n"
        )
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code=solution, language="python", language_id=71,
            test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["passed_cases"], 1)
        self.assertEqual(result["total_cases"], 1)
        mocked_batch.assert_called_once()
        # The generated source actually sent to Judge0 must be the design
        # wrapper (dispatch loop over operations), not the function-style
        # single-call wrapper — sanity-check a design-only fragment.
        submissions = mocked_batch.call_args.args[0]
        self.assertIn("__op", submissions[0]["source_code"])

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_design_problem_wrong_answer_when_output_mismatches(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "[null,2,3,1]\n", "stderr": "", "compile_output": "",
            "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(
            stdin="4\nZigzagIterator\n2\n1\n2\n4\n3\n4\n5\n6\nnext\nnext\nnext\n",
            expected_output="[null, 1, 3, 2]",
            is_sample=True, order=1, source="stored",
            input_data={"operations": ["ZigzagIterator", "next", "next", "next"]},
        )
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code="class ZigzagIterator: pass",
            language="python", language_id=71, test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Wrong Answer")
        self.assertEqual(result["passed_cases"], 0)


class GenericJudgeStdinDispatchTests(TestCase):
    """run_generic_batch()'s kind=="stdin" branch: no wrapper generation at
    all (the student's source IS the complete program), and a plain
    normalize_comparable_output() text comparison instead of
    compare_output/compare_design_output — for problems whose whole point
    is "no LeetCode-style function signature, just read stdin and print"
    (see services/judging/schema_generator.py's known_kind="stdin")."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="A+B Problem", slug="a-plus-b-generic", description="Read two integers, print their sum.",
            difficulty="Easy", tags=["Basics"], execution_type="stdin",
            uses_generic_judge=True, generic_schema={"kind": "stdin"},
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_stdin_problem_sends_source_unchanged_and_compares_raw_text(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "5\n", "stderr": "", "compile_output": "", "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(stdin="2 3\n", expected_output="5", is_sample=True, order=1, source="stored")
        solution = "a, b = map(int, input().split())\nprint(a + b)\n"
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code=solution, language="python", language_id=71,
            test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Accepted")
        self.assertEqual(result["passed_cases"], 1)

        # No wrapper injected — Judge0 gets the student's exact source and
        # exact stdin, verbatim.
        submissions = mocked_batch.call_args.args[0]
        self.assertEqual(submissions[0]["source_code"], solution)
        self.assertEqual(submissions[0]["stdin"], "2 3\n")

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_stdin_problem_wrong_answer_on_text_mismatch(self, mocked_batch):
        mocked_batch.return_value = [{
            "stdout": "6\n", "stderr": "", "compile_output": "", "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(stdin="2 3\n", expected_output="5", is_sample=True, order=1, source="stored")
        result = execute_problem_test_case_batch(
            problem=self.problem, source_code="print(6)", language="python", language_id=71,
            test_cases=[case], batch_kind="submit",
        )
        self.assertEqual(result["status"], "Wrong Answer")
        self.assertEqual(result["passed_cases"], 0)

    @patch("apps.learning.services.judging.judge0_service.Judge0Service.batch_execute")
    def test_raw_text_input_format_is_never_adapted_for_stdin_kind(self, mocked_batch):
        # Even if a case were (incorrectly) tagged raw_text, stdin-kind
        # schemas must never route through parse_argument_list/serialize_value
        # — there's no "params" to line values up against.
        mocked_batch.return_value = [{
            "stdout": "5\n", "stderr": "", "compile_output": "", "status": "Accepted", "time": "0.01", "memory": "1000",
        }]
        case = RuntimeTestCase(
            stdin="2 3\n", expected_output="5", is_sample=True, order=1, source="stored", input_format="raw_text",
        )
        execute_problem_test_case_batch(
            problem=self.problem, source_code="a, b = map(int, input().split())\nprint(a + b)\n",
            language="python", language_id=71, test_cases=[case], batch_kind="submit",
        )
        submissions = mocked_batch.call_args.args[0]
        self.assertEqual(submissions[0]["stdin"], "2 3\n")


class ExampleDerivedStdinAdaptationTests(TestCase):
    """Regression test for a real reported bug: a generic-judge problem
    with no stored TestCase rows yet falls back to deriving "sample" cases
    straight from Problem.examples (problem_testcases.py's
    _build_example_test_cases) — raw text like `s = "rabbbit", t =
    "rabbit"`, never adapted into this package's own wire format the way
    the legacy execution path already adapts it via
    execution_adapter.parse_argument_list(). Without _effective_stdin()
    doing the same adaptation, the generated wrapper's second _reader.next()
    call found nothing (both values were still on one un-split line) and
    crashed with IndexError — exactly the "Sample test cases passed: 0/2"
    /"IndexError: list index out of range" the user reported for Distinct
    Subsequences (a two-string-parameter function)."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="Distinct Subsequences", slug="distinct-subsequences-generic",
            description="desc", difficulty="Hard", tags=["DP"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "function", "function_name": "numDistinct",
                "params": [["s", "string"], ["t", "string"]], "return_type": "int",
                "custom_structs": {},
            },
            examples=[
                {"input": 's = "rabbbit", t = "rabbit"', "output": "3"},
                {"input": 's = "babgbag", t = "bag"', "output": "5"},
            ],
        )

    def test_example_derived_case_gets_adapted_to_wire_format(self):
        # No stored TestCase rows -> build_runtime_test_cases() falls back
        # to raw-text examples, tagged source="examples".
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 2)
        self.assertEqual(cases[0].source, "examples")
        self.assertEqual(cases[0].stdin, 's = "rabbbit", t = "rabbit"')  # raw, un-adapted, as stored

        adapted = _effective_stdin(cases[0], self.problem.generic_schema, skip_adaptation=False)
        self.assertEqual(adapted, "rabbbit\nrabbit\n")

    def test_stored_wire_case_is_left_untouched(self):
        stored = RuntimeTestCase(
            stdin="rabbbit\nrabbit\n", expected_output="3", is_sample=True, order=1, source="stored",
            input_format="wire",
        )
        self.assertEqual(_effective_stdin(stored, self.problem.generic_schema, skip_adaptation=False), stored.stdin)

    def test_persisted_raw_text_row_still_gets_adapted(self):
        # The actual motivating fix, not just the ephemeral no-stored-rows
        # fallback: services/problem_testcases.py's sync_problem_test_cases()
        # persists raw example text into REAL TestCase rows (source="stored"
        # once read back) — dispatching on input_format instead of source
        # means these get adapted too, not just cases that never touched
        # the DB.
        from ....models import TestCase
        TestCase.objects.create(
            problem=self.problem, stdin='s = "rabbbit", t = "rabbit"', expected_output="3",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0].source, "stored")
        self.assertEqual(cases[0].input_format, "raw_text")
        adapted = _effective_stdin(cases[0], self.problem.generic_schema, skip_adaptation=False)
        self.assertEqual(adapted, "rabbbit\nrabbit\n")

    def test_generated_wrapper_actually_runs_correctly_with_adapted_stdin(self):
        # End-to-end proof, not just a unit check on the adaptation
        # function: the exact reported solution, run for real against the
        # exact reported example, through the exact wire format
        # _effective_stdin() now produces.
        if not (shutil.which("python") or shutil.which("python3")):
            self.skipTest("no local python interpreter available")

        cases = build_runtime_test_cases(self.problem, sample_only=True)
        solution = (
            "class Solution:\n"
            "    def numDistinct(self, s: str, t: str) -> int:\n"
            "        dp = [0] * (len(t) + 1)\n"
            "        dp[0] = 1\n"
            "        for i in range(len(s)):\n"
            "            for j in range(len(t), 0, -1):\n"
            "                if s[i] == t[j - 1]:\n"
            "                    dp[j] += dp[j - 1]\n"
            "        return dp[len(t)]\n"
        )
        full_source = generate_source(self.problem.generic_schema, "python", solution)
        runner = shutil.which("python") or shutil.which("python3")
        for case, expected in zip(cases, ["3", "5"]):
            adapted_stdin = _effective_stdin(case, self.problem.generic_schema, skip_adaptation=False)
            with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
                f.write(full_source)
                path = f.name
            try:
                r = subprocess.run([runner, path], input=adapted_stdin, capture_output=True, text=True, timeout=15)
            finally:
                os.unlink(path)
            self.assertEqual(r.returncode, 0, msg=r.stderr)
            self.assertEqual(r.stdout.strip(), expected)


class SingleListArgumentStdinAdaptationTests(TestCase):
    """Regression test for a real reported bug: a generic-judge problem
    whose ONE declared param is itself a list-shaped type (TreeNode/array/
    matrix/...) — e.g. "Convert BST to Greater Tree" — sent Judge0 the raw,
    un-adapted example text ("root = [4,1,6,...]") instead of the wire
    format, because parse_argument_list()'s "a lone list argument is
    returned bare" convention made its parsed result indistinguishable
    from N separate arguments (a 15-element tree array parsed as 15
    "arguments"), failing _effective_stdin()'s own param-count check and
    silently falling back to the unadapted text. Symptom: every language's
    generated reader tried to parse the whole raw line as a token and
    crashed (Java: "NumberFormatException ... For input string: 'root =
    [4,1,...]'")."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title="Convert BST to Greater Tree", slug="convert-bst-to-greater-tree-generic",
            description="desc", difficulty="Medium", tags=["Tree"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "function", "function_name": "convertBST",
                "params": [["root", "TreeNode"]], "return_type": "TreeNode",
                "custom_structs": {},
            },
            examples=[
                {"input": "root = [4,1,6,0,2,5,7,null,null,null,3,null,null,null,8]",
                 "output": "[30,36,21,36,35,26,15,null,null,null,33,null,null,null,8]"},
            ],
        )

    def test_single_tree_argument_gets_adapted_to_wire_format(self):
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 1)
        self.assertEqual(cases[0].stdin, "root = [4,1,6,0,2,5,7,null,null,null,3,null,null,null,8]")

        adapted = _effective_stdin(cases[0], self.problem.generic_schema, skip_adaptation=False)
        self.assertEqual(adapted, "15\n4\n1\n6\n0\n2\n5\n7\nnull\nnull\nnull\n3\nnull\nnull\nnull\n8\n")

    def test_persisted_raw_text_row_still_gets_adapted(self):
        from ....models import TestCase
        TestCase.objects.create(
            problem=self.problem, stdin="root = [0,null,1]", expected_output="[1,null,1]",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        self.assertEqual(len(cases), 1)
        adapted = _effective_stdin(cases[0], self.problem.generic_schema, skip_adaptation=False)
        self.assertEqual(adapted, "3\n0\nnull\n1\n")

    def test_generated_java_wrapper_actually_runs_correctly_with_adapted_stdin(self):
        # End-to-end proof against the exact reported solution/language.
        javac = shutil.which("javac")
        java = shutil.which("java")
        if not (javac and java):
            self.skipTest("no local JDK available")

        solution = (
            "class Solution {\n"
            "    int sum = 0;\n"
            "    public TreeNode convertBST(TreeNode root) {\n"
            "        if (root != null) {\n"
            "            convertBST(root.right);\n"
            "            sum += root.val;\n"
            "            root.val = sum;\n"
            "            convertBST(root.left);\n"
            "        }\n"
            "        return root;\n"
            "    }\n"
            "}\n"
        )
        full_source = generate_source(self.problem.generic_schema, "java", solution)
        cases = build_runtime_test_cases(self.problem, sample_only=True)
        adapted_stdin = _effective_stdin(cases[0], self.problem.generic_schema, skip_adaptation=False)

        tmpdir = tempfile.mkdtemp()
        try:
            src_path = os.path.join(tmpdir, "Main.java")
            with open(src_path, "w") as f:
                f.write(full_source)
            compile_result = subprocess.run([javac, src_path], cwd=tmpdir, capture_output=True, text=True, timeout=30)
            self.assertEqual(compile_result.returncode, 0, msg=compile_result.stderr)
            run_result = subprocess.run(
                [java, "-cp", tmpdir, "Main"], input=adapted_stdin, capture_output=True, text=True, timeout=15,
            )
            self.assertEqual(run_result.returncode, 0, msg=run_result.stderr)
            # Compared the same way run_generic_batch() actually judges a
            # submission — trailing nulls beyond the last real node are
            # cosmetic (see comparator._binary_tree_equal), so the
            # generated wrapper is free to emit them for every leaf's
            # missing children without that counting as Wrong Answer.
            return_node = parse_type(self.problem.generic_schema["return_type"])
            expected_value = json.loads("[30,36,21,36,35,26,15,null,null,null,33,null,null,null,8]")
            self.assertTrue(compare_output(return_node, run_result.stdout, expected_value))
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
