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
  pair<A,B,...>       -> each element's recursive block, back to back, in
                         declared order (N>=2 — "pair" is just N=2)
  map<K,V>            -> line: count N, then N (K block, V block) pairs
  set<T>              -> identical to sequence<T> (order not meaningful)
  custom_struct       -> each declared field's recursive block, in order
  optional<T>         -> one line: `null`, OR (if present) T's own
                         recursive block unchanged — the exact same
                         null-vs-block convention binary_tree already uses
                         per element slot, just applied to a whole value
  bst<T>              -> identical wire format to binary_tree<T> (same
                         canonical level-order TreeNode shape); the two
                         are only ever distinguished by comparator.py,
                         which allows a BST's *value* to be satisfied by
                         any structurally-valid BST holding the same
                         values, not one exact shape
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

    if kind in ("linked_list", "doubly_linked_list_node"):
        element = node.element
        seq = list(value or [])
        lines.append(str(len(seq)))
        for item in seq:
            _write(element, item, lines)
        return

    if kind in ("binary_tree", "bst"):
        element = node.element
        seq = list(value or [])
        lines.append(str(len(seq)))
        for item in seq:
            if item is None:
                lines.append("null")
            else:
                _write(element, item, lines)
        return

    if kind == "optional":
        if value is None:
            lines.append("null")
        else:
            _write(node.element, value, lines)
        return

    if kind == "random_list_node":
        # Structured value: [(val, random_index_or_None), ...] — matching
        # LeetCode's own [[val,random_index],...] convention, just as
        # Python tuples with None instead of -1/null.
        seq = list(value or [])
        lines.append(str(len(seq)))
        for val, _ridx in seq:
            _write(node.element, val, lines)
        for _val, ridx in seq:
            lines.append(str(-1 if ridx is None else ridx))
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
        for elem_node, elem_value in zip(node.elements, value):
            _write(elem_node, elem_value, lines)
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

    def peek(self):
        """Look at the next line without consuming it — used wherever a
        `null` token vs. a real recursive block must be told apart before
        committing to either read path (binary_tree elements, optional<T>)."""
        if self.pos >= len(self.lines):
            raise SerializationError("Unexpected end of input while deserializing")
        return self.lines[self.pos]


def looks_like_wire_format(text, type_nodes):
    """True if `text` deserializes cleanly as this package's own wire
    format for `type_nodes` in sequence — one shared reader, exactly the
    same "read each param's block back-to-back" pass integration.py's
    _effective_stdin() produces via serialize_value(), with every line
    consumed and none left over.

    Used to tell a genuinely wire-format TestCase.stdin apart from one
    that's mislabeled input_format="wire" while actually still holding
    raw, un-adapted example text (e.g. `root = [4,1,6,...]`) — a real,
    observed bug: TestCase.input_format defaults to "wire", so a row
    created without ever being explicitly tagged "raw_text" skips
    _effective_stdin's adaptation entirely, sending Judge0 the raw text
    verbatim. Deliberately biased toward false negatives (calling a
    single bare-string param's raw text "wire-format" even when it isn't,
    since any text is technically a valid — if wrong — string value)
    rather than false positives: incorrectly flagging an already-correct
    wire-format row would send a working problem's actual runtime value
    through adaptation instead, which is only guaranteed safe for genuine
    raw text."""
    reader = _LineReader(text or "")
    try:
        for node in type_nodes:
            _read(node, reader)
    except (SerializationError, ValueError, IndexError, TypeError):
        return False
    return reader.pos == len(reader.lines)


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

    if kind in ("linked_list", "doubly_linked_list_node"):
        n = int(reader.next())
        return [_read(node.element, reader) for _ in range(n)]

    if kind in ("binary_tree", "bst"):
        n = int(reader.next())
        result = []
        for _ in range(n):
            if reader.peek() == "null":
                reader.next()
                result.append(None)
            else:
                result.append(_read(node.element, reader))
        return result

    if kind == "optional":
        if reader.peek() == "null":
            reader.next()
            return None
        return _read(node.element, reader)

    if kind == "random_list_node":
        n = int(reader.next())
        vals = [_read(node.element, reader) for _ in range(n)]
        ridxs = [int(reader.next()) for _ in range(n)]
        return [(v, (r if r >= 0 else None)) for v, r in zip(vals, ridxs)]

    if kind == "graph":
        n = int(reader.next())
        m = int(reader.next())
        edges = []
        for _ in range(m):
            u, v = reader.next().split()
            edges.append([int(u), int(v)])
        return {"n": n, "edges": edges}

    if kind == "pair":
        return tuple(_read(elem_node, reader) for elem_node in node.elements)

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

def _is_bare_string(node):
    return node.kind == "primitive" and node.name == "string"


def serialize_output(type_node, value):
    """Structured Python value -> the output text a generated wrapper
    should print for this type. Top-level bare strings are unquoted;
    everything else is JSON (numbers/bools/null/nested arrays)."""
    if _is_bare_string(type_node):
        return str(value)
    if type_node.kind == "optional" and _is_bare_string(type_node.element):
        return "null" if value is None else str(value)
    return json.dumps(_to_jsonable(type_node, value))


def _to_jsonable(node, value):
    kind = node.kind
    if kind == "primitive":
        return value
    if kind in ("sequence", "set", "linked_list", "doubly_linked_list_node"):
        return [_to_jsonable(node.element, v) for v in (value or [])]
    if kind in ("binary_tree", "bst"):
        return [None if v is None else _to_jsonable(node.element, v) for v in (value or [])]
    if kind == "optional":
        return None if value is None else _to_jsonable(node.element, value)
    if kind == "random_list_node":
        return [[_to_jsonable(node.element, v), r] for v, r in (value or [])]
    if kind == "graph":
        return {"n": value.get("n", 0), "edges": [list(e) for e in value.get("edges", [])]}
    if kind == "pair":
        return [_to_jsonable(elem_node, elem_value) for elem_node, elem_value in zip(node.elements, value)]
    if kind == "map":
        return [[_to_jsonable(node.key, k), _to_jsonable(node.value, v)] for k, v in (value or {}).items()]
    if kind == "custom_struct":
        return {fname: _to_jsonable(ftype, value[fname]) for fname, ftype in node.fields.items()}
    raise SerializationError(f"No output serializer for type kind {kind!r} ({node.raw!r})")


def parse_output(type_node, text):
    """The inverse of serialize_output — used by the comparator to turn
    Judge0's actual stdout back into structured data before comparing."""
    text = text.strip()
    if _is_bare_string(type_node):
        return text
    if type_node.kind == "optional" and _is_bare_string(type_node.element):
        return None if text == "null" else text
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
    if kind in ("sequence", "set", "linked_list", "doubly_linked_list_node"):
        return [_from_jsonable(node.element, v) for v in value]
    if kind in ("binary_tree", "bst"):
        return [None if v is None else _from_jsonable(node.element, v) for v in value]
    if kind == "optional":
        return None if value is None else _from_jsonable(node.element, value)
    if kind == "random_list_node":
        return [(_from_jsonable(node.element, v), (r if r != -1 else None)) for v, r in value]
    if kind == "graph":
        return {"n": value.get("n", 0), "edges": [list(e) for e in value.get("edges", [])]}
    if kind == "pair":
        return tuple(_from_jsonable(elem_node, elem_value) for elem_node, elem_value in zip(node.elements, value))
    if kind == "map":
        return {_from_jsonable(node.key, k): _from_jsonable(node.value, v) for k, v in value}
    if kind == "custom_struct":
        return {fname: _from_jsonable(ftype, value[fname]) for fname, ftype in node.fields.items()}
    raise SerializationError(f"No output parser for type kind {kind!r} ({node.raw!r})")
