"""Regression coverage for the `fix_mislabeled_wire_test_cases` management
command and the serializer.looks_like_wire_format() detector it's built
on — see the reported bug: a generic-judge problem's TestCase rows left at
the default input_format="wire" while still holding raw, un-adapted
example text (e.g. "root = [4,1,6,...]") never get adapted by
integration.py's _effective_stdin(), which only adapts rows explicitly
tagged input_format="raw_text"."""

from django.core.management import call_command
from django.test import TestCase as DjangoTestCase
from io import StringIO

from ....models import Problem, TestCase
from ..serializer import looks_like_wire_format
from ..type_system import parse_type


class LooksLikeWireFormatTests(DjangoTestCase):
    def test_genuine_wire_format_is_recognized(self):
        node = parse_type("TreeNode")
        wire_text = "15\n4\n1\n6\n0\n2\n5\n7\nnull\nnull\nnull\n3\nnull\nnull\nnull\n8\n"
        self.assertTrue(looks_like_wire_format(wire_text, [node]))

    def test_raw_example_text_is_not_wire_format(self):
        node = parse_type("TreeNode")
        raw_text = "root = [4,1,6,0,2,5,7,null,null,null,3,null,null,null,8]"
        self.assertFalse(looks_like_wire_format(raw_text, [node]))

    def test_two_param_wire_format_is_recognized(self):
        nodes = [parse_type("string"), parse_type("string")]
        self.assertTrue(looks_like_wire_format("rabbbit\nrabbit\n", nodes))

    def test_two_param_raw_text_is_not_wire_format(self):
        nodes = [parse_type("string"), parse_type("string")]
        self.assertFalse(looks_like_wire_format('s = "rabbbit", t = "rabbit"', nodes))

    def test_leftover_lines_are_not_wire_format(self):
        # One extra unconsumed line means the schema doesn't actually match
        # this text — not a clean wire-format row for these params.
        node = parse_type("int")
        self.assertFalse(looks_like_wire_format("5\nextra\n", [node]))


class FixMislabeledWireTestCasesCommandTests(DjangoTestCase):
    def setUp(self):
        self.problem = Problem.objects.create(
            title="Convert BST to Greater Tree", slug="convert-bst-to-greater-tree-cmd-test",
            description="desc", difficulty="Medium", tags=["Tree"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "function", "function_name": "convertBST",
                "params": [["root", "TreeNode"]], "return_type": "TreeNode",
                "custom_structs": {},
            },
        )
        self.mislabeled = TestCase.objects.create(
            problem=self.problem, stdin="root = [4,1,6,0,2,5,7,null,null,null,3,null,null,null,8]",
            expected_output="[30,36,21,36,35,26,15,null,null,null,33,null,null,null,8]",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_WIRE,
        )
        self.genuine_wire = TestCase.objects.create(
            problem=self.problem, stdin="3\n0\nnull\n1\n", expected_output="[1,null,1]",
            is_sample=True, order=2, input_format=TestCase.INPUT_FORMAT_WIRE,
        )

    def test_dry_run_detects_but_does_not_write(self):
        out = StringIO()
        call_command("fix_mislabeled_wire_test_cases", stdout=out)
        self.assertIn("Would fix: 1 mislabeled", out.getvalue())

        self.mislabeled.refresh_from_db()
        self.genuine_wire.refresh_from_db()
        self.assertEqual(self.mislabeled.input_format, TestCase.INPUT_FORMAT_WIRE)
        self.assertEqual(self.genuine_wire.input_format, TestCase.INPUT_FORMAT_WIRE)

    def test_apply_retags_only_the_mislabeled_row(self):
        out = StringIO()
        call_command("fix_mislabeled_wire_test_cases", "--apply", stdout=out)
        self.assertIn("Fixed: 1 mislabeled", out.getvalue())

        self.mislabeled.refresh_from_db()
        self.genuine_wire.refresh_from_db()
        self.assertEqual(self.mislabeled.input_format, TestCase.INPUT_FORMAT_RAW_TEXT)
        self.assertEqual(self.genuine_wire.input_format, TestCase.INPUT_FORMAT_WIRE)

    def test_problem_id_scoping(self):
        other = Problem.objects.create(
            title="Other Problem", slug="other-problem-cmd-test",
            description="desc", difficulty="Easy", tags=["Array"],
            uses_generic_judge=True,
            generic_schema={
                "kind": "function", "function_name": "solve",
                "params": [["nums", "vector<int>"]], "return_type": "int",
                "custom_structs": {},
            },
        )
        other_mislabeled = TestCase.objects.create(
            problem=other, stdin="nums = [1,2,3]", expected_output="6",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_WIRE,
        )

        call_command("fix_mislabeled_wire_test_cases", "--apply", "--problem-id", str(self.problem.id))

        self.mislabeled.refresh_from_db()
        other_mislabeled.refresh_from_db()
        self.assertEqual(self.mislabeled.input_format, TestCase.INPUT_FORMAT_RAW_TEXT)
        self.assertEqual(other_mislabeled.input_format, TestCase.INPUT_FORMAT_WIRE)  # untouched, out of scope

    def test_design_and_stdin_kind_schemas_are_skipped(self):
        stdin_problem = Problem.objects.create(
            title="Stdin Problem", slug="stdin-problem-cmd-test",
            description="desc", difficulty="Easy", tags=["Basics"],
            execution_type="stdin", uses_generic_judge=True, generic_schema={"kind": "stdin"},
        )
        TestCase.objects.create(
            problem=stdin_problem, stdin="anything at all", expected_output="anything",
            is_sample=True, order=1, input_format=TestCase.INPUT_FORMAT_WIRE,
        )

        out = StringIO()
        call_command("fix_mislabeled_wire_test_cases", "--problem-id", str(stdin_problem.id), stdout=out)
        self.assertIn("Would fix: 0 mislabeled test case(s) out of 0 checked", out.getvalue())
