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

    if kind in ("sequence", "linked_list"):
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
        ta = _trim_trailing_nulls(a or [])
        tb = _trim_trailing_nulls(b or [])
        if len(ta) != len(tb):
            return False
        return all(
            (x is None and y is None) or (x is not None and y is not None and _values_equal(node.element, x, y))
            for x, y in zip(ta, tb)
        )

    if kind == "graph":
        if a.get("n") != b.get("n"):
            return False
        edges_a = {tuple(sorted(e)) for e in a.get("edges", [])}
        edges_b = {tuple(sorted(e)) for e in b.get("edges", [])}
        return edges_a == edges_b

    if kind == "pair":
        na, nb = node.elements
        return _values_equal(na, a[0], b[0]) and _values_equal(nb, a[1], b[1])

    if kind == "map":
        if set(a.keys()) != set(b.keys()):
            return False
        return all(_values_equal(node.value, a[k], b[k]) for k in a)

    if kind == "custom_struct":
        return all(_values_equal(ftype, a[fname], b[fname]) for fname, ftype in node.fields.items())

    raise ValueError(f"No comparator for type kind {kind!r} ({node.raw!r})")


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
