"""Permanent regression coverage for the special linked-list structures
added on top of the base singly-linked list: RandomListNode ("Copy List
with Random Pointer") and DoublyLinkedListNode. CircularListNode is parsed
by type_system.py but deliberately has no registered adapter yet — a
documented, known gap (see README), not a silent omission."""

import os
import subprocess
import tempfile

from django.test import SimpleTestCase

from ..type_system import parse_type
from ..serializer import serialize_value, deserialize_value, serialize_output, parse_output
from ..comparator import compare_output
from ..wrapper_generator import generate_source


def _run_python(src, stdin_text):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(src)
        path = f.name
    try:
        return subprocess.run(["python", path], input=stdin_text, capture_output=True, text=True, timeout=15)
    finally:
        os.unlink(path)


class RandomListNodeSerializerTests(SimpleTestCase):
    def test_round_trips_with_and_without_random_pointers(self):
        node = parse_type("RandomListNode<int>")
        value = [(7, None), (13, 0), (11, 4), (10, 2), (1, 0)]
        wire = serialize_value(node, value)
        self.assertEqual(deserialize_value(node, wire), value)
        text = serialize_output(node, value)
        self.assertEqual(parse_output(node, text), value)

    def test_empty_list(self):
        node = parse_type("RandomListNode<int>")
        self.assertEqual(deserialize_value(node, serialize_value(node, [])), [])

    def test_comparator_checks_both_value_and_random_index(self):
        node = parse_type("RandomListNode<int>")
        expected = [(7, None), (13, 0)]
        self.assertTrue(compare_output(node, '[[7,null],[13,0]]', expected).passed)
        self.assertFalse(compare_output(node, '[[7,null],[13,null]]', expected).passed)
        self.assertFalse(compare_output(node, '[[9,null],[13,0]]', expected).passed)


class RandomListNodeWrapperTests(SimpleTestCase):
    def test_copy_random_list_python(self):
        schema = {"function_name": "copyRandomList", "params": [("head", "RandomListNode<int>")], "return_type": "RandomListNode<int>"}
        sol = (
            "class Solution:\n"
            "    def copyRandomList(self, head):\n"
            "        if not head:\n"
            "            return None\n"
            "        old_to_new = {}\n"
            "        cur = head\n"
            "        while cur:\n"
            "            old_to_new[cur] = RandomListNode(cur.val)\n"
            "            cur = cur.next\n"
            "        cur = head\n"
            "        while cur:\n"
            "            old_to_new[cur].next = old_to_new.get(cur.next)\n"
            "            old_to_new[cur].random = old_to_new.get(cur.random)\n"
            "            cur = cur.next\n"
            "        return old_to_new[head]\n"
        )
        value = [(7, None), (13, 0), (11, 4), (10, 2), (1, 0)]
        stdin_text = serialize_value(parse_type("RandomListNode<int>"), value)
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("RandomListNode<int>"), r.stdout, value)
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")

    def test_empty_random_list(self):
        schema = {"function_name": "identity", "params": [("head", "RandomListNode<int>")], "return_type": "RandomListNode<int>"}
        sol = "class Solution:\n    def identity(self, head):\n        return head\n"
        stdin_text = serialize_value(parse_type("RandomListNode<int>"), [])
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("RandomListNode<int>"), r.stdout, [])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")


class DoublyLinkedListNodeTests(SimpleTestCase):
    def test_wire_format_matches_plain_linked_list(self):
        # Deliberately the same wire format as linked_list<T> — construction
        # differs (also wires .prev), not the serialized shape.
        plain = parse_type("linked_list<int>")
        doubly = parse_type("DoublyLinkedListNode<int>")
        self.assertEqual(serialize_value(plain, [1, 2, 3]), serialize_value(doubly, [1, 2, 3]))

    def test_identity_round_trip_python(self):
        schema = {"function_name": "identity", "params": [("head", "DoublyLinkedListNode<int>")], "return_type": "DoublyLinkedListNode<int>"}
        sol = "class Solution:\n    def identity(self, head):\n        return head\n"
        stdin_text = serialize_value(parse_type("DoublyLinkedListNode<int>"), [1, 2, 3])
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("DoublyLinkedListNode<int>"), r.stdout, [1, 2, 3])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")

    def test_prev_pointers_are_actually_wired_not_just_next(self):
        # A solution that only works if .prev is real: walk to the tail via
        # .next, then walk all the way back via .prev and expect the
        # reversed sequence.
        schema = {"function_name": "reverseViaPrev", "params": [("head", "DoublyLinkedListNode<int>")], "return_type": "DoublyLinkedListNode<int>"}
        sol = (
            "class Solution:\n"
            "    def reverseViaPrev(self, head):\n"
            "        if not head:\n"
            "            return None\n"
            "        tail = head\n"
            "        while tail.next:\n"
            "            tail = tail.next\n"
            "        # walk backwards from tail, rebuilding as a forward list\n"
            "        cur = tail\n"
            "        new_head = DoublyLinkedListNode(cur.val)\n"
            "        new_tail = new_head\n"
            "        cur = cur.prev\n"
            "        while cur:\n"
            "            node = DoublyLinkedListNode(cur.val)\n"
            "            new_tail.next = node\n"
            "            node.prev = new_tail\n"
            "            new_tail = node\n"
            "            cur = cur.prev\n"
            "        return new_head\n"
        )
        stdin_text = serialize_value(parse_type("DoublyLinkedListNode<int>"), [1, 2, 3])
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("DoublyLinkedListNode<int>"), r.stdout, [3, 2, 1])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")
