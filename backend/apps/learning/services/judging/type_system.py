"""Generic recursive type system for the judging framework.

A type STRING (e.g. "vector<pair<int,int>>", "int[][]", "linked_list<int>",
"binary_tree<int>", "map<string,int>") parses into a `TypeNode` tree. Every
other module in this package (adapters, language wrappers, serializer,
comparator) works against `TypeNode`, never against the raw string — this
is what makes adding a new nested combination ("give me a vector of pairs
of linked lists") free: the parser is recursive-descent, so nesting is
just recursion, not a new special case.

Custom structs are declared separately (a dict of name -> {field: type})
because a flat type string can't carry named fields; `parse_type` takes an
optional `custom_structs` dict so a bare name like "Point" resolves to a
`custom_struct` TypeNode instead of erroring.
"""

import re

# Canonical scalar kinds and a few common aliases so `int32`/`Integer`/etc.
# resolve without every problem author needing to know the one true spelling.
_PRIMITIVE_ALIASES = {
    "int": "int", "integer": "int", "int32": "int", "long": "long", "int64": "long",
    "float": "float", "double": "double", "bool": "bool", "boolean": "bool",
    "char": "char", "string": "string", "str": "string",
}

_SEQUENCE_KEYWORDS = {
    "vector": "vector", "array": "array", "list": "list", "matrix": "matrix",
    "stack": "stack", "queue": "queue", "deque": "deque",
}

_TOKEN_RE = re.compile(r"\s*(<|>|,|\[\]|[A-Za-z_][A-Za-z0-9_]*)\s*")


class TypeError_(Exception):
    """Raised for an unparseable/unknown type string — kept distinct from
    the builtin TypeError so callers can catch it specifically."""


class TypeNode:
    """One node in a parsed type tree.

    kind: 'primitive' | 'sequence' | 'linked_list' | 'binary_tree' | 'graph'
        | 'pair' | 'map' | 'set' | 'custom_struct'
    element: TypeNode — the element type, for sequence/linked_list/binary_tree/set
    key, value: TypeNode — for map
    elements: list[TypeNode] — for pair (always length 2)
    sequence_kind: 'vector'|'array'|'list'|'matrix'|'stack'|'queue'|'deque' (sequence only)
    name: str — primitive name ('int', 'string', ...) or custom_struct name
    fields: dict[str, TypeNode] — ordered, for custom_struct
    raw: str — the original type string, kept for error messages/debugging
    """

    __slots__ = ("kind", "element", "key", "value", "elements", "sequence_kind", "name", "fields", "raw")

    def __init__(self, kind, *, element=None, key=None, value=None, elements=None,
                 sequence_kind=None, name=None, fields=None, raw=""):
        self.kind = kind
        self.element = element
        self.key = key
        self.value = value
        self.elements = elements
        self.sequence_kind = sequence_kind
        self.name = name
        self.fields = fields
        self.raw = raw

    def __repr__(self):
        return f"TypeNode({self.raw!r})"

    def __eq__(self, other):
        if not isinstance(other, TypeNode):
            return NotImplemented
        return (
            self.kind == other.kind and self.element == other.element and self.key == other.key
            and self.value == other.value and self.elements == other.elements
            and self.sequence_kind == other.sequence_kind and self.name == other.name
            and self.fields == other.fields
        )


def _tokenize(type_str):
    tokens = []
    pos = 0
    while pos < len(type_str):
        m = _TOKEN_RE.match(type_str, pos)
        if not m or m.end() == pos:
            raise TypeError_(f"Could not tokenize type string at position {pos}: {type_str!r}")
        tokens.append(m.group(1))
        pos = m.end()
    return tokens


class _Parser:
    def __init__(self, tokens, raw, custom_structs):
        self.tokens = tokens
        self.pos = 0
        self.raw = raw
        self.custom_structs = custom_structs or {}

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def advance(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def expect(self, tok):
        actual = self.advance()
        if actual != tok:
            raise TypeError_(f"Expected {tok!r} but got {actual!r} in type {self.raw!r}")

    def parse(self):
        node = self._parse_base()
        # Trailing []'s stack onto whatever base type came before (e.g. int[][], Point[]).
        while self.peek() == "[]":
            self.advance()
            node = TypeNode("sequence", element=node, sequence_kind="array", raw=self.raw)
        if self.pos != len(self.tokens):
            raise TypeError_(f"Unexpected trailing tokens parsing type {self.raw!r}")
        return node

    def _parse_base(self):
        name = self.advance()
        if name is None:
            raise TypeError_(f"Empty type string: {self.raw!r}")
        lname = name.lower()

        if lname in _PRIMITIVE_ALIASES:
            return TypeNode("primitive", name=_PRIMITIVE_ALIASES[lname], raw=self.raw)

        if lname in _SEQUENCE_KEYWORDS:
            self.expect("<")
            inner = self._parse_full()
            self.expect(">")
            kind = _SEQUENCE_KEYWORDS[lname]
            if kind == "matrix":
                # matrix<T> is sugar for a 2D sequence of T — same wire format
                # and codegen as vector<vector<T>>, just friendlier to write.
                return TypeNode(
                    "sequence", sequence_kind="matrix",
                    element=TypeNode("sequence", sequence_kind="vector", element=inner, raw=self.raw),
                    raw=self.raw,
                )
            return TypeNode("sequence", sequence_kind=kind, element=inner, raw=self.raw)

        if lname in ("linked_list", "linkedlist"):
            self.expect("<")
            inner = self._parse_full()
            self.expect(">")
            return TypeNode("linked_list", element=inner, raw=self.raw)

        if lname in ("binary_tree", "bst", "binarytree"):
            self.expect("<")
            inner = self._parse_full()
            self.expect(">")
            return TypeNode("binary_tree", element=inner, name=lname, raw=self.raw)

        if lname == "graph":
            return TypeNode("graph", raw=self.raw)

        if lname == "pair":
            self.expect("<")
            first = self._parse_full()
            self.expect(",")
            second = self._parse_full()
            self.expect(">")
            return TypeNode("pair", elements=[first, second], raw=self.raw)

        if lname == "map":
            self.expect("<")
            key = self._parse_full()
            self.expect(",")
            value = self._parse_full()
            self.expect(">")
            return TypeNode("map", key=key, value=value, raw=self.raw)

        if lname == "set":
            self.expect("<")
            inner = self._parse_full()
            self.expect(">")
            return TypeNode("set", element=inner, raw=self.raw)

        if name in self.custom_structs:
            fields = {
                fname: parse_type(ftype, self.custom_structs)
                for fname, ftype in self.custom_structs[name].items()
            }
            return TypeNode("custom_struct", name=name, fields=fields, raw=self.raw)

        raise TypeError_(f"Unknown type {name!r} in {self.raw!r}")

    def _parse_full(self):
        """Like parse() but doesn't require consuming every token — used for
        recursive sub-parses inside <...> where a trailing ',' or '>' follows."""
        node = self._parse_base()
        while self.peek() == "[]":
            self.advance()
            node = TypeNode("sequence", element=node, sequence_kind="array", raw=self.raw)
        return node


def parse_type(type_str, custom_structs=None):
    """Parse a type string into a TypeNode tree. Raises TypeError_ if the
    string doesn't match any recognized shape."""
    if not isinstance(type_str, str) or not type_str.strip():
        raise TypeError_(f"Type string must be a non-empty string, got {type_str!r}")
    tokens = _tokenize(type_str.strip())
    return _Parser(tokens, type_str.strip(), custom_structs).parse()


def is_null_aware(type_node):
    """Binary trees serialize with explicit `null` gaps (LeetCode's own
    level-order convention); every other sequence-shaped type doesn't."""
    return type_node.kind == "binary_tree"
