"""Structured value <-> canonical stdin text, driven entirely by TypeNode.

This is the one place the wire format is defined — every language wrapper's
generated parser/serializer must agree with exactly this scheme, which is
why `wrapper_generator.py` always goes through the *same* TypeNode tree to
generate both the Python-side serializer (used to build stdin for Judge0)
and the language-side parser (embedded in the generated wrapper).

Wire format (recursive, one token/line group per node):
  primitive           -> one line: the value (`10`, `hello`, `true`/`false`, `3.14`)
  sequence (any kind, -> one line: count N, then N recursive blocks for the
    any nesting)         element type back-to-back. A binary_tree's element
                         slots use `null` for missing nodes instead of a
                         recursive block for that slot.
  linked_list<T>      -> one line: count N, then N recursive T blocks (no nulls)
  binary_tree<T>      -> one line: count N (level-order array length,
                         LeetCode's own convention), then N tokens: `null`
                         or a recursive T block
  graph               -> line: n, line: m, then m lines "u v" (unweighted;
                         see README for extending to weighted)
  pair<A,B>           -> recursive A block immediately followed by B block
  map<K,V>            -> line: count N, then N (K block, V block) pairs
  set<T>              -> identical to sequence<T> (order not meaningful)
  custom_struct       -> each declared field's recursive block, in order
"""

import json

from .type_system import is_null_aware


class SerializationError(Exception):
    pass


def serialize_value(type_node, value):
    """Structured Python value -> canonical stdin text (str)."""
    lines = []
    _write(type_node, value, lines)
    return "\n".join(lines) + ("\n" if lines else "")


def _write(node, value, lines):
    kind = node.kind

    if kind == "primitive":
        lines.append(_format_primitive(node.name, value))
        return

    if kind in ("sequence", "set"):
        element = node.element
        seq = list(value or [])
        lines.append(str(len(seq)))
        for item in seq:
            _write(element, item, lines)
        return

    if kind == "linked_list":
        element = node.element
        seq = list(value or [])
        lines.append(str(len(seq)))
        for item in seq:
            _write(element, item, lines)
        return

    if kind == "binary_tree":
        element = node.element
        seq = list(value or [])
        lines.append(str(len(seq)))
        for item in seq:
            if item is None:
                lines.append("null")
            else:
                _write(element, item, lines)
        return

    if kind == "graph":
        n = value.get("n", 0)
        edges = value.get("edges", [])
        lines.append(str(n))
        lines.append(str(len(edges)))
        for edge in edges:
            lines.append(f"{edge[0]} {edge[1]}")
        return

    if kind == "pair":
        a, b = node.elements
        va, vb = value
        _write(a, va, lines)
        _write(b, vb, lines)
        return

    if kind == "map":
        items = list((value or {}).items())
        lines.append(str(len(items)))
        for k, v in items:
            _write(node.key, k, lines)
            _write(node.value, v, lines)
        return

    if kind == "custom_struct":
        for fname, ftype in node.fields.items():
            _write(ftype, value[fname], lines)
        return

    raise SerializationError(f"No serializer for type kind {kind!r} ({node.raw!r})")


def _format_primitive(name, value):
    if name == "bool":
        return "true" if value else "false"
    if name in ("float", "double"):
        return repr(float(value))
    return str(value)


class _LineReader:
    def __init__(self, text):
        self.lines = [ln for ln in text.split("\n")]
        # Drop a single trailing empty line from the final "\n", but keep
        # interior blank lines (a primitive string value could itself be "").
        if self.lines and self.lines[-1] == "":
            self.lines.pop()
        self.pos = 0

    def next(self):
        if self.pos >= len(self.lines):
            raise SerializationError("Unexpected end of input while deserializing")
        line = self.lines[self.pos]
        self.pos += 1
        return line


def deserialize_value(type_node, text):
    """Canonical stdin text -> structured Python value. Exact inverse of
    serialize_value for every supported type — used by the round-trip tests
    and by anything that needs to read a stored TestCase.stdin back into a
    structured object."""
    reader = _LineReader(text)
    return _read(type_node, reader)


def _read(node, reader):
    kind = node.kind

    if kind == "primitive":
        return _parse_primitive(node.name, reader.next())

    if kind in ("sequence", "set"):
        n = int(reader.next())
        return [_read(node.element, reader) for _ in range(n)]

    if kind == "linked_list":
        n = int(reader.next())
        return [_read(node.element, reader) for _ in range(n)]

    if kind == "binary_tree":
        n = int(reader.next())
        result = []
        for _ in range(n):
            # Peek isn't needed: a null token is a whole line on its own,
            # exactly like serialize_value emits, so just read one line and
            # check it before falling back to a recursive primitive read.
            saved_pos = reader.pos
            token = reader.next()
            if token == "null":
                result.append(None)
            else:
                reader.pos = saved_pos
                result.append(_read(node.element, reader))
        return result

    if kind == "graph":
        n = int(reader.next())
        m = int(reader.next())
        edges = []
        for _ in range(m):
            u, v = reader.next().split()
            edges.append([int(u), int(v)])
        return {"n": n, "edges": edges}

    if kind == "pair":
        a, b = node.elements
        return (_read(a, reader), _read(b, reader))

    if kind == "map":
        n = int(reader.next())
        result = {}
        for _ in range(n):
            k = _read(node.key, reader)
            v = _read(node.value, reader)
            result[k] = v
        return result

    if kind == "custom_struct":
        return {fname: _read(ftype, reader) for fname, ftype in node.fields.items()}

    raise SerializationError(f"No deserializer for type kind {kind!r} ({node.raw!r})")


def _parse_primitive(name, token):
    if name == "bool":
        return token.strip().lower() == "true"
    if name in ("int", "long"):
        return int(token)
    if name in ("float", "double"):
        return float(token)
    return token


# ── Output format (spec §12) — a JSON-like bracket notation for a
# solution's RETURN value, deliberately different from the count-prefixed
# input wire format above: input needs to be trivial for a strongly-typed
# language to *read* line-by-line; output needs to be trivial for the
# Python-side comparator to *parse back* into structured data. A bare
# top-level string prints unquoted ("hello", not "\"hello\""); every other
# shape is plain JSON, with pair/map represented as JSON arrays (not JSON
# objects) so map keys aren't limited to strings. ──────────────────────────

def serialize_output(type_node, value):
    """Structured Python value -> the output text a generated wrapper
    should print for this type. Top-level bare strings are unquoted;
    everything else is JSON (numbers/bools/null/nested arrays)."""
    if type_node.kind == "primitive" and type_node.name == "string":
        return str(value)
    return json.dumps(_to_jsonable(type_node, value))


def _to_jsonable(node, value):
    kind = node.kind
    if kind == "primitive":
        return value
    if kind in ("sequence", "set", "linked_list"):
        return [_to_jsonable(node.element, v) for v in (value or [])]
    if kind == "binary_tree":
        return [None if v is None else _to_jsonable(node.element, v) for v in (value or [])]
    if kind == "graph":
        return {"n": value.get("n", 0), "edges": [list(e) for e in value.get("edges", [])]}
    if kind == "pair":
        a, b = node.elements
        va, vb = value
        return [_to_jsonable(a, va), _to_jsonable(b, vb)]
    if kind == "map":
        return [[_to_jsonable(node.key, k), _to_jsonable(node.value, v)] for k, v in (value or {}).items()]
    if kind == "custom_struct":
        return {fname: _to_jsonable(ftype, value[fname]) for fname, ftype in node.fields.items()}
    raise SerializationError(f"No output serializer for type kind {kind!r} ({node.raw!r})")


def parse_output(type_node, text):
    """The inverse of serialize_output — used by the comparator to turn
    Judge0's actual stdout back into structured data before comparing."""
    text = text.strip()
    if type_node.kind == "primitive" and type_node.name == "string":
        return text
    if text == "":
        raise SerializationError("Empty output where a value was expected")
    parsed = json.loads(text)
    return _from_jsonable(type_node, parsed)


def _from_jsonable(node, value):
    kind = node.kind
    if kind == "primitive":
        if node.name in ("int", "long") and isinstance(value, float) and value.is_integer():
            return int(value)
        return value
    if kind in ("sequence", "set", "linked_list"):
        return [_from_jsonable(node.element, v) for v in value]
    if kind == "binary_tree":
        return [None if v is None else _from_jsonable(node.element, v) for v in value]
    if kind == "graph":
        return {"n": value.get("n", 0), "edges": [list(e) for e in value.get("edges", [])]}
    if kind == "pair":
        a, b = node.elements
        va, vb = value
        return (_from_jsonable(a, va), _from_jsonable(b, vb))
    if kind == "map":
        return {_from_jsonable(node.key, k): _from_jsonable(node.value, v) for k, v in value}
    if kind == "custom_struct":
        return {fname: _from_jsonable(ftype, value[fname]) for fname, ftype in node.fields.items()}
    raise SerializationError(f"No output parser for type kind {kind!r} ({node.raw!r})")
