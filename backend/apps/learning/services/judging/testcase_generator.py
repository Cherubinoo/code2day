"""Constraint-driven, programmatic edge-case generation — the spec's own
explicit demand for something that ISN'T an LLM guessing plausible-looking
inputs. Distinct from the existing `services/testcase_generator.py`
(LLM-based), which is untouched and stays available for problems that
still want it; this one is for a `generic_schema` param type + a small
constraint dict, producing the standard edge-case families for that shape
deterministically.

Every generator returns a list of `{"name": str, "value": <python value>}`
— `name` documents which edge case it is (useful in test-case admin UI /
failure messages), `value` is the structured value `serializer.py` can
turn into wire text directly.
"""

import random


def generate_cases(type_node, constraints=None, *, seed=1234):
    constraints = dict(constraints or {})
    rng = random.Random(seed)
    kind = type_node.kind

    if kind == "primitive":
        return _primitive_cases(type_node.name, constraints)
    if kind in ("sequence", "set"):
        return _sequence_cases(type_node, constraints, rng)
    if kind == "linked_list":
        return _linked_list_cases(type_node, constraints, rng)
    if kind == "binary_tree":
        return _binary_tree_cases(type_node, constraints, rng)
    if kind == "graph":
        return _graph_cases(constraints, rng)
    raise ValueError(f"No programmatic generator for type kind {kind!r} ({type_node.raw!r}) yet — "
                      f"pair/map/set/custom_struct still need author-supplied cases.")


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _primitive_cases(name, c):
    lo = c.get("min", -1_000_000_000)
    hi = c.get("max", 1_000_000_000)
    if name in ("int", "long"):
        cases = [("zero", 0), ("min_bound", lo), ("max_bound", hi), ("negative_one", -1), ("small_positive", 1)]
    elif name in ("float", "double"):
        cases = [("zero", 0.0), ("negative", -3.5), ("small_positive", 0.001), ("large", float(hi))]
    elif name == "bool":
        cases = [("true", True), ("false", False)]
    elif name == "char":
        cases = [("letter", "a"), ("digit", "5"), ("space", " ")]
    elif name == "string":
        cases = [("empty", ""), ("single_char", "a"), ("repeated_char", "aaaa"),
                 ("with_spaces", "a b c"), ("long", "x" * c.get("max_length", 100))]
    else:
        raise ValueError(f"No primitive cases for {name!r}")
    return [{"name": n, "value": v} for n, v in cases]


def _sequence_cases(node, c, rng):
    elem = node.element
    min_len = c.get("min_length", 0)
    max_len = c.get("max_length", 20)
    lo = c.get("value_min", -100)
    hi = c.get("value_max", 100)

    def rand_elem():
        if elem.kind == "primitive" and elem.name in ("int", "long"):
            return rng.randint(lo, hi)
        if elem.kind == "primitive" and elem.name in ("float", "double"):
            return round(rng.uniform(lo, hi), 3)
        if elem.kind == "primitive" and elem.name == "string":
            return rng.choice(["a", "bb", "ccc"])
        if elem.kind == "primitive" and elem.name == "bool":
            return rng.choice([True, False])
        return rng.randint(lo, hi)

    cases = [("empty", [])]
    if min_len <= 1 <= max_len:
        cases.append(("single_element", [rand_elem()]))
    cases.append(("duplicates", [rand_elem()] * min(5, max_len) if max_len else []))
    if elem.kind == "primitive" and elem.name in ("int", "long", "float", "double"):
        sorted_vals = sorted(rand_elem() for _ in range(min(8, max_len) or 1))
        cases.append(("sorted_ascending", sorted_vals))
        cases.append(("sorted_descending", list(reversed(sorted_vals))))
        cases.append(("with_negatives", [-abs(rand_elem()) - 1 for _ in range(3)]))
    large_len = min(max_len, c.get("stress_length", max_len))
    cases.append(("large", [rand_elem() for _ in range(large_len)]))
    return [{"name": n, "value": v} for n, v in cases]


def _linked_list_cases(node, c, rng):
    elem = node.element
    max_len = c.get("max_length", 10)

    def rand_val():
        return rng.randint(-100, 100) if elem.kind == "primitive" and elem.name in ("int", "long") else 0

    cases = [
        ("empty", []),
        ("single_node", [rand_val()]),
        ("many_nodes", [rand_val() for _ in range(max_len)]),
        ("duplicate_values", [rand_val()] * min(4, max_len or 1)),
    ]
    return [{"name": n, "value": v} for n, v in cases]


def _binary_tree_cases(node, c, rng):
    max_depth = c.get("max_depth", 4)

    def balanced(depth):
        if depth <= 0:
            return None
        return [rng.randint(-50, 50)] if depth == 1 else _level_order_full(depth, rng)

    def _level_order_full(depth, rng):
        count = 2 ** depth - 1
        return [rng.randint(-50, 50) for _ in range(count)]

    def skewed(depth):
        # LeetCode-style: only ever fill the "left" slot, nulls for right.
        vals = []
        for i in range(depth):
            vals.append(rng.randint(-50, 50))
            if i < depth - 1:
                vals.append(None)
        return vals

    cases = [
        ("empty", []),
        ("single_node", [rng.randint(-50, 50)]),
        ("balanced", _level_order_full(min(3, max_depth), rng)),
        ("left_skewed", skewed(min(4, max_depth))),
        ("with_negatives", [-rng.randint(1, 50), None, -rng.randint(1, 50)]),
        ("duplicate_values", [7, 7, 7, None, None, 7, 7]),
    ]
    return [{"name": n, "value": v} for n, v in cases]


def _graph_cases(c, rng):
    n = c.get("node_count", 6)
    cases = [
        ("empty", {"n": 0, "edges": []}),
        ("single_node", {"n": 1, "edges": []}),
        ("disconnected", {"n": n, "edges": [[0, 1], [2, 3]]}),
        ("cyclic", {"n": n, "edges": [[i, (i + 1) % n] for i in range(n)]}),
        ("dense", {"n": n, "edges": [[i, j] for i in range(n) for j in range(i + 1, n)]}),
        ("sparse", {"n": n, "edges": [[0, i] for i in range(1, n)]}),
    ]
    return [{"name": name, "value": v} for name, v in cases]
