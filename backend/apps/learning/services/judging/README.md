# Generic type-driven judging framework

A new, **additive** layer for running LeetCode-style problems through Judge0
with a genuinely generic type system — instead of the ~15 bespoke, hand-rolled
per-language wrapper builders in `services/execution_adapter.py`. It never
touches the 1,828 existing problems: a problem only reaches this code if its
`Problem.uses_generic_judge` flag is `True` (default `False`), checked once at
the top of `views.execute_problem_test_case_batch()`.

## Why this exists

The legacy path hand-writes a wrapper string per problem per language, has no
real type system (an ad-hoc `GraphNode` is the only structural type), never
sends Judge0 a time/memory limit, and calls Judge0 once per test case with no
batching. This package fixes all four, and does it by making **nesting free**:
`vector<pair<int,int>>`, `vector<vector<vector<int>>>`, a `linked_list<Point>`
— none of these are special cases anywhere. Every layer is recursive over the
same `TypeNode` tree.

## Architecture — the pipeline for one problem+language+test-case

```
type string ("vector<pair<int,int>>")
        │  type_system.parse_type()
        ▼
    TypeNode tree            ── one node per nesting level
        │
        ├─► serializer.py        structured value <-> stdin wire text (Python-side)
        │                        and <-> stdout output text (spec §12 bracket notation)
        │
        ├─► comparator.py        typed structural comparison of actual vs expected
        │                        (float tolerance, unordered arrays, tree/graph equality)
        │
        └─► adapters/<kind>.py   TypeNode -> generated-program CODE (not runtime data)
                │                 via the 5-ish method contract in adapters/base.py:
                │                 serialize/deserialize (reuse serializer.py),
                │                 generate_parser/generate_serializer (emit real
                │                 target-language statements), generate_language_type
                ▼
        languages/<lang>_lang.py   low-level per-language primitives adapters compose:
                                   CodeBuilder blocks, for/foreach loop headers, int/bool/
                                   string conversions, field access operator (. vs ->), etc.
                │
                ▼
        wrapper_generator.py    assembles: reader prelude + ListNode/TreeNode/struct
                                 snippets (deduplicated) + the author's Solution class
                                 + generated main() that parses every param, calls
                                 Solution().<function_name>(...), serializes + prints
                                 the result
                │
                ▼
        judge0_service.py       Judge0Service.execute() / .batch_execute() — the
                                 actual HTTP layer, with real cpu_time_limit /
                                 memory_limit support and true Judge0 batch submission
```

`integration.py` is the one seam into the rest of the app — read it before
touching `views.execute_problem_test_case_batch()`.

## The type vocabulary

`int long float double bool char string`,
`vector array list matrix stack queue deque` (one generic `sequence` adapter —
`matrix<T>` is sugar for `vector<vector<T>>`, and `stack`/`queue`/`deque` share
the exact same wire format; only `node.sequence_kind` distinguishes them, for
any future language-specific idiom),
`linked_list<T>`, `binary_tree<T>` (alias `bst<T>`), `graph`, `pair<A,B>`,
`map<K,V>`, `set<T>`, and `custom_struct` (declared via a separate
`custom_structs` dict since a flat type string can't carry field names).
Arbitrary nesting of any of the above works everywhere it's semantically
sensible (`vector<pair<int,int>>`, `map<string, vector<int>>`, ...).

## Wire formats (why there are two)

- **Input** (`serializer.serialize_value` / `deserialize_value`): count-prefixed,
  line-based, recursive. Trivial for a strongly-typed language's generated
  parser to read line-by-line without any lookahead (except binary_tree's
  `null` tokens, which need exactly one line of peek-and-rollback — see
  `adapters/binary_tree.py`).
- **Output** (`serializer.serialize_output` / `parse_output`): JSON-like bracket
  notation (`json.dumps`/`json.loads` under the hood on the Python side), with
  one deliberate exception — a bare top-level `string` return prints **raw and
  unquoted**. This is what the Python-side comparator parses back, so
  dynamically-typed generated programs (Python/JS) build the real native value
  and call `json.dumps`/`JSON.stringify` **once** at the top; statically-typed
  ones (Java/C++) build the JSON text by hand via string concatenation the
  whole way down (see the "two representations" note below).

## Adapter codegen convention: two representations of `generate_serializer`

Every adapter's `generate_serializer(cb, lang, ctx, value_expr)` returns an
expression, but its **shape** differs by language on purpose:

- **Python / JavaScript**: returns a *native* value (list/dict/tuple/etc.) —
  composable directly into a parent's native container, `json.dumps`/
  `JSON.stringify` only ever called once, at the very top.
- **Java / C++**: returns a *string* — the exact JSON text fragment for that
  value, so a parent just concatenates strings (`"[" + a + "," + b + "]"`).
  There's no `json.dumps` equivalent shipped by default in either language, so
  building the text incrementally, bottom-up, is the generic option.

This asymmetry is consistent within each language and every adapter respects
it — see `adapters/primitive.py` for the clearest example of both branches.

## Adding a new language

1. Create `languages/<name>_lang.py` implementing the primitives every adapter
   calls: `new_builder`, `reader_prelude`, `read_line_expr`, `to_int/to_long/
   to_float/to_double/to_bool/to_char/as_string`, `for_header`,
   `foreach_header`, `new_object`, `append_stmt`, `null_literal`, `is_null`,
   `index_expr`, `length_expr`, `string_eq`, `reader_rollback`,
   `print_final`, plus `FIELD_OP` (`.` or `->`) and `brace_style` (bool).
2. Register it in `languages/registry.py`.
3. Run the existing `tests/test_wrapper_generation.py` cases against it —
   every demo problem should pass with zero changes to any adapter.

## Adding a new data-structure family

1. Add a new `kind` branch to `type_system.py`'s parser (and to
   `adapters/base.py`'s `to_spec` if you use it).
2. Create `adapters/<name>.py` implementing the `Adapter` interface
   (`generate_parser`, `generate_serializer`, `generate_language_type`,
   optionally `runtime_snippets`).
3. Register it in `adapters/registry.py`.
4. Add the matching case to `comparator.py`'s `_values_equal` and to
   `serializer.py`'s `_write`/`_read`/`_to_jsonable`/`_from_jsonable`.

## Known caveat: C++ is not locally compiled

No `g++` is available in this dev sandbox (or typically in CI here), so C++
generation is verified structurally (`tests/test_wrapper_generation.py`
asserts the generated source is well-formed and contains the right class/
function names) but never actually compiled before this lands. **Treat any
C++ problem authored against this framework as needing a live smoke test
against the real Judge0 instance after deploy**, the same way the SQL Frog
feature's Judge0-output-parsing needed a post-deploy check earlier this
project.

## Authoring a problem on this framework

Set on the `Problem` row:
- `uses_generic_judge = True`
- `generic_schema = {"function_name": "...", "params": [["name", "type"], ...],
  "return_type": "...", "custom_structs": {...}}` (custom_structs optional)
- optionally `time_limit_seconds` / `memory_limit_kb`

Each `TestCase` row (same model as the legacy path) then stores:
- `stdin`: the wire-format input text — build it with
  `serializer.serialize_value(parse_type(...), value)` per param, concatenated
  in declared param order.
- `expected_output`: `json.dumps(...)` of the structured expected return value
  (a plain Python object — tuples for `pair`, dicts for `map`/`custom_struct`,
  lists everywhere else) — **not** the generated program's own output text,
  so it stays generator- and language-agnostic.

`testcase_generator.generate_cases(type_node, constraints)` produces the
standard edge-case families (empty/single/duplicate/negative/large/etc.) for
a given param type programmatically, if you don't want to hand-author every
case.
