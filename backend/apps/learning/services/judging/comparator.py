"""Typed, structural result comparison — spec §13.

Never a raw string diff. Judge0's stdout for the actual run gets parsed via
`serializer.parse_output` into the same structured shape the expected value
already has, then compared type-aware: floats within a tolerance, arrays
recursively (element-by-element, order-sensitive unless the caller marks
this comparison unordered), linked lists/trees compared as their canonical
flattened form (which already IS the equality that matters for those
structures), graphs compared by node count + edge set (unordered — edge
order is never semantically meaningful).
"""

from .serializer import parse_output, SerializationError

FLOAT_TOLERANCE = 1e-6


class ComparisonResult:
    def __init__(self, passed, reason="", actual=None, expected=None):
        self.passed = passed
        self.reason = reason
        self.actual = actual
        self.expected = expected

    def __bool__(self):
        return self.passed


def compare_output(type_node, actual_text, expected_value, *, unordered=False, max_output_len=200_000):
    """actual_text: raw stdout from the sandboxed run (still a string).
    expected_value: the already-structured expected result (Python native).
    Returns a ComparisonResult."""
    if actual_text is not None and len(actual_text) > max_output_len:
        return ComparisonResult(False, f"Output exceeded {max_output_len} characters — likely a runaway loop or accidental extra prints.")

    try:
        actual_value = parse_output(type_node, actual_text or "")
    except (SerializationError, ValueError, TypeError, IndexError) as exc:
        return ComparisonResult(False, f"Could not parse program output as {type_node.raw}: {exc}", actual=actual_text)

    ok = _values_equal(type_node, actual_value, expected_value, unordered=unordered)
    if ok:
        return ComparisonResult(True, actual=actual_value, expected=expected_value)
    return ComparisonResult(False, "Output does not match the expected result.", actual=actual_value, expected=expected_value)


def _values_equal(node, a, b, *, unordered=False):
    kind = node.kind

    if kind == "primitive":
        if node.name in ("float", "double"):
            try:
                return abs(float(a) - float(b)) <= FLOAT_TOLERANCE
            except (TypeError, ValueError):
                return False
        return a == b

    if kind in ("sequence", "linked_list", "doubly_linked_list_node"):
        if a is None or b is None:
            return a == b
        if len(a) != len(b):
            return False
        if unordered:
            return _multiset_equal(node.element, a, b)
        return all(_values_equal(node.element, x, y) for x, y in zip(a, b))

    if kind == "set":
        # A set's own order is never meaningful, regardless of the caller's
        # `unordered` flag — that flag is for sequence types where order
        # normally *does* matter but a specific problem says otherwise.
        if a is None or b is None:
            return a == b
        return len(a) == len(b) and _multiset_equal(node.element, a, b)

    if kind == "binary_tree":
        # Level-order arrays (with null gaps) ARE the canonical form for a
        # tree, so this is exactly the equality that matters — but trailing
        # nulls beyond the last real node are cosmetic (an implementation
        # might stop one level order earlier), so trim them before comparing.
        return _binary_tree_equal(node.element, a, b)

    if kind == "bst":
        # Same level-order shape as binary_tree, but a BST's *value* may
        # legitimately be satisfied by any structurally-valid BST holding
        # the same node values, not one exact shape — e.g. "Convert Sorted
        # Array to BST" has multiple correct answers. `unordered=True` opts
        # into that looser check; the default stays exact-shape (right for
        # problems like "Recover BST" that mutate one specific tree).
        if unordered:
            return _is_valid_bst(a) and _bst_values_multiset(a) == _bst_values_multiset(b)
        return _binary_tree_equal(node.element, a, b)

    if kind == "optional":
        if a is None or b is None:
            return a is None and b is None
        return _values_equal(node.element, a, b, unordered=unordered)

    if kind == "random_list_node":
        if len(a) != len(b):
            return False
        return all(
            _values_equal(node.element, va, vb) and ra == rb
            for (va, ra), (vb, rb) in zip(a, b)
        )

    if kind == "graph":
        if a.get("n") != b.get("n"):
            return False
        edges_a = {tuple(sorted(e)) for e in a.get("edges", [])}
        edges_b = {tuple(sorted(e)) for e in b.get("edges", [])}
        return edges_a == edges_b

    if kind == "pair":
        return all(_values_equal(elem_node, a[i], b[i]) for i, elem_node in enumerate(node.elements))

    if kind == "map":
        if set(a.keys()) != set(b.keys()):
            return False
        return all(_values_equal(node.value, a[k], b[k]) for k in a)

    if kind == "custom_struct":
        return all(_values_equal(ftype, a[fname], b[fname]) for fname, ftype in node.fields.items())

    raise ValueError(f"No comparator for type kind {kind!r} ({node.raw!r})")


def _binary_tree_equal(element_node, a, b):
    ta = _trim_trailing_nulls(a or [])
    tb = _trim_trailing_nulls(b or [])
    if len(ta) != len(tb):
        return False
    return all(
        (x is None and y is None) or (x is not None and y is not None and _values_equal(element_node, x, y))
        for x, y in zip(ta, tb)
    )


def _build_tree_from_level_order(level_order):
    """level-order array (with None gaps) -> {"val","left","right"} dict
    tree, via the same queue-based reconstruction the generated language
    wrappers use — needed here to actually walk the tree and check the
    BST invariant, not just compare arrays."""
    values = list(level_order or [])
    if not values or values[0] is None:
        return None
    root = {"val": values[0], "left": None, "right": None}
    queue = [root]
    i, qi, n = 1, 0, len(values)
    while qi < len(queue) and i < n:
        cur = queue[qi]
        qi += 1
        if i < n:
            if values[i] is not None:
                cur["left"] = {"val": values[i], "left": None, "right": None}
                queue.append(cur["left"])
            i += 1
        if i < n:
            if values[i] is not None:
                cur["right"] = {"val": values[i], "left": None, "right": None}
                queue.append(cur["right"])
            i += 1
    return root


def _is_valid_bst(level_order):
    root = _build_tree_from_level_order(level_order)

    def check(tree_node, lo, hi):
        if tree_node is None:
            return True
        val = tree_node["val"]
        if not (lo < val < hi):
            return False
        return check(tree_node["left"], lo, val) and check(tree_node["right"], val, hi)

    return check(root, float("-inf"), float("inf"))


def _bst_values_multiset(level_order):
    return sorted(v for v in (level_order or []) if v is not None)


def _trim_trailing_nulls(seq):
    seq = list(seq)
    while seq and seq[-1] is None:
        seq.pop()
    return seq


def _multiset_equal(element_node, a, b):
    """Order-independent equality for a list of values whose element type
    might not be hashable (e.g. nested arrays) — bucket by a sortable
    canonical key instead of relying on set()/Counter()."""
    remaining = list(b)
    for item in a:
        for i, cand in enumerate(remaining):
            if _values_equal(element_node, item, cand):
                remaining.pop(i)
                break
        else:
            return False
    return not remaining
