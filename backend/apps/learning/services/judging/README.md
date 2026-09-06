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
`linked_list<T>`, `binary_tree<T>`, `bst<T>` (a genuinely **distinct** kind
from `binary_tree` — see below), `graph`, `pair<A,B>` / `tuple<T1,...,TN>`
(N-ary, N>=2 — `pair` is just the N=2 case), `map<K,V>` (aliases: `dict`,
`dictionary`, `unordered_map`, `hashmap`), `set<T>`, `optional<T>` / `nullable<T>`
(a generic nullable wrapper for *any* type — see below), `random_list_node<T>`,
`doubly_linked_list_node<T>`, and `custom_struct` (declared via a separate
`custom_structs` dict since a flat type string can't carry field names).
Arbitrary nesting of any of the above works everywhere it's semantically
sensible (`vector<pair<int,int>>`, `map<string, vector<int>>`,
`Optional<TreeNode>`, `vector<Optional<int>>`, ...).

**Syntax**: `<...>` (C++-style) and `[...]` (Python-style) are pure
alternative spellings of the same generic-argument syntax — the tokenizer
normalizes `[`/`]` to `<`/`>` immediately (see `type_system._tokenize`), so
`List[int]` and `vector<int>` parse identically, as do `Optional[TreeNode]`
and `Optional<TreeNode>`. Bare `TreeNode` and `ListNode` (no generic
argument at all) are also accepted, matching LeetCode's own convention —
they default to an `int`-valued `binary_tree`/`linked_list` respectively,
so `Optional[TreeNode]` needs no extra type declared anywhere.

## `Optional<T>` / `Nullable<T>` — a generic nullable wrapper

`binary_tree`/`bst` and `linked_list` are *already* inherently nullable in
both wire format and generated code — an empty tree/list literally **is** a
null root/head. So `adapters/optional.py` treats those as a pure
pass-through (`Optional[TreeNode]` and `binary_tree<int>` generate and
compare identically); every other type (primitives, sequences, pairs,
maps, custom structs, graphs) gets the real null-vs-value wire prefix
(one line: `null`, or the value's own recursive block — the same
peek-and-rollback convention `binary_tree`'s per-slot nulls already use),
plus, for statically-typed languages, promotion to an actually-nullable
representation: Java's boxed type (`Integer`, not `int`), or a heap
pointer in C++ (`int*`, `new int(value)`) since a bare primitive has no
null value of its own there.

## Mutated-input problems (`void` return)

Some problems (`Recover Binary Search Tree`, `Reverse Linked List` in
place, `Rotate Array`, `Sort Colors`, `Set Matrix Zeroes`, ...) return
nothing — the function mutates its argument, and grading means comparing
that argument's *post-call* state, never a return value.

`wrapper_generator.generate_source` detects this automatically: a schema
with `"return_type": "void"` (or `"None"`/empty), **or** an explicit
`"comparison": {"type": "mutated_input"}`, calls the user's function for
its side effect only and serializes the **mutated parameter** afterward
instead of any return value. Which parameter is mutated defaults to the
first one; name a different one explicitly with
`"comparison": {"type": "mutated_input", "mutated_param": "nums"}`.
See `tests/test_optional_mutated_bst.py::MutatedInputWrapperTests` — the
permanent regression test for exactly the
`recoverTree(root: Optional[TreeNode]) -> None` case this was built for.

## `bst<T>` vs. `binary_tree<T>`

Same canonical level-order `TreeNode` shape and identical codegen either
way (`adapters/registry.py` routes both kinds to `BinaryTreeAdapter`) —
only `comparator.py` tells them apart. By default both compare by exact
shape (right for a problem that mutates one specific tree, like Recover
BST). Passing `unordered=True` to `compare_output` for a `bst` type opts
into a looser, structurally-aware check instead: the actual output must
be a **valid BST** (verified by walking it and checking the ordering
invariant) holding the **same set of values** as expected — not
necessarily the same shape. That's the right comparison for a problem
like "Convert Sorted Array to BST", which has multiple correct answers.
A plain `binary_tree` never gets this treatment; only `bst` does.

## Special linked-list structures

- **`random_list_node<T>`** ("Copy List with Random Pointer"): each node
  has `val`/`next`/`random`. Wire format is a two-pass scheme — count N,
  then N `val` blocks, then N `random`-index lines (0-based index into
  that list, or `-1` for null) — so construction never needs a forward
  reference to a not-yet-built node. The Python-side structured value is
  `[(val, random_index_or_None), ...]`, matching LeetCode's own
  `[[val,random_index],...]` shape with `None` instead of `null`/`-1`.
- **`doubly_linked_list_node<T>`**: same wire format as a plain
  `linked_list<T>` (construction just additionally wires up `.prev`).
- **`circular_list_node<T>`** parses in `type_system.py` but has **no
  registered adapter yet** — a deliberate, documented gap, not a silent
  omission. A real "Linked List Cycle"-style problem needs an extra `pos`
  parameter (where the tail reconnects) that doesn't fit this framework's
  current per-type wire format cleanly; follow the `random_list_node`
  pattern (two-pass construction) when this is actually needed.

## Class name convention

Function-style problems require the submission's class to be named
exactly `Solution` — the same strict convention LeetCode itself uses.
`wrapper_generator.py` always generates `Solution().function_name(*args)`;
there is no detection or guessing involved, and a submission using any
other class name (or none at all) fails to compile/run, the same way it
would on LeetCode itself. (An earlier version of this package tried to
detect and accept any class name — including no class at all, a bare
top-level function — via a `class_detector.py` source-text scan. That
flexibility was deliberately removed: the platform's own generated starter
code (`generate_starter_code`) already always produces `class Solution`
for every problem, so the detection complexity had no real benefit over
just enforcing the one name every submission is already shown.)

Design-style problems (constructor + multiple methods, e.g. `LRUCache`)
likewise always use the exact `class_name` declared in the schema — there's
no single universal name for those the way `Solution` is for function-style
ones, so the schema's own declared name is authoritative.

## Versioning & observability

`versions.py` defines `WRAPPER_VERSION` / `TYPE_SYSTEM_VERSION` /
`SERIALIZER_VERSION`, bumped whenever a change to that piece could affect
how an already-submitted solution would be judged if re-run. Every
`integration.run_generic_batch()` call gets a fresh `execution_id` (a
`uuid4`), logs a structured start/finish line (`problem_id`, `language`,
`test_case_count`, `status`, `elapsed_seconds` — **never** the submitted
source code or any secret/environment value), and returns the
`execution_id` plus all three version tags in its response dict. These
aren't yet persisted as their own DB column per submission — today
they're carried on every response and log line, which is enough to
explain a live discrepancy; wiring them into permanent per-submission
storage is a natural follow-up once "replay this exact submission under
its original wrapper" becomes a real product need.

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

1. Add a new `kind` branch to `type_system.py`'s parser.
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

## Migrating a problem from the legacy path onto this framework

Almost none of the 1,828 existing problems ever had a typed schema at all
(only 2 ever used the legacy `param_schema`) — everything else runs on
regex/heuristic execution, and `TestCase.stdin` is free-text like
`"nums = [2,7,11,15], target = 9"`, not this framework's wire format. A
problem's existing `TestCase` rows are **not reusable** for the new judge
as-is; migrating a problem means generating fresh ones, not converting old
ones (LeetCode's own textual convention already matches several of ours —
arrays, matrices, linked lists, trees — closely enough that a deterministic
converter is *possible* for those, but `graph`'s legacy convention doesn't
structurally match ours, and it doesn't help you spot-check correctness
either way, so this framework generates fresh test cases via the LLM
instead of trying to reuse old ones).

- **`generic_testcase_generator.generate_generic_test_cases(title=, description=, schema=)`**
  asks the LLM for **plain structured values** per the schema's own types
  (e.g. `{"nums": [2,7,11,15], "target": 9}` + an expected value) — never
  wire-format text; this module, not the LLM, deterministically converts
  those to `stdin`/`expected_output` via `serializer.py`. Every case is
  structurally validated first via `_check_shape()` — deliberately
  stricter than `serializer._write`'s own lenient duck-typing (which would
  silently coerce e.g. a dict into a list of its keys instead of
  rejecting it) — a case that doesn't match its declared type's shape is
  dropped, never silently saved. Same caveat as every other LLM-authored
  test data on this platform: correctness isn't guaranteed, this is a
  fast-start draft to spot-check, not ground truth.
- **Admin endpoints** (`views.py`): a single-problem
  `AdminProblemGenerateGenericTestCasesView` (replaces that problem's test
  cases entirely — new- and legacy-format rows can never coexist for one
  problem) and a per-topic `AdminProblemTopicGenerateGenericJudgeView`
  (`_migrate_problem_to_generic_judge()`) that runs schema-generate-if-
  missing + test-case-generate + validate for every problem in one topic
  tag, only flipping `uses_generic_judge` on once both check out — the
  same time-budgeted-per-click sweep pattern as the bulk schema endpoints,
  scoped to a topic instead of the whole bank. Wired into the Problem
  Bank's existing topic tiles (`ProblemBankView.jsx`'s
  `TopicGenericJudgePanel`) as "Migrate This Topic".
