"""graph — line n, line m, then m "u v" edge lines (spec's own wire
format). Presented to user code as an undirected adjacency list (size n,
`adj[u]` holding every neighbor of u) — the representation most solutions
actually want to operate on, rather than forcing every problem to rebuild
one from a raw edge list. Serializing reverses that: walk the adjacency
list once, emitting each undirected edge exactly once (only when v > u,
so it's never double-counted), matching the `{"n", "edges"}` shape
`comparator.py`'s edge-set comparison already expects.
"""

from .base import Adapter, read_count, declare_var
from ..languages.base import if_header


class GraphAdapter(Adapter):
    def generate_parser(self, cb, lang, ctx):
        n = read_count(cb, lang, ctx)
        m = read_count(cb, lang, ctx, var_base="m")
        adj = ctx.fresh("adj")

        if lang.name == "python":
            cb.line(f"{adj} = [[] for _ in range({n})]")
        elif lang.name == "javascript":
            cb.line(f"let {adj} = Array.from({{length: {n}}}, () => []);")
        elif lang.name == "java":
            cb.line(f"List<List<Integer>> {adj} = new ArrayList<>();")
            with cb.block(f"for (int _i = 0; _i < {n}; _i++)"):
                cb.line(f"{adj}.add(new ArrayList<>());")
        elif lang.name == "cpp":
            cb.line(f"vector<vector<int>> {adj}({n});")

        header, _idx = lang.for_header(ctx, m)
        with cb.block(header):
            u = ctx.fresh("u")
            v = ctx.fresh("v")
            # One edge is one wire-format LINE ("u v"), not two separate
            # lines — split it into its two int tokens.
            if lang.name == "python":
                cb.line(f"{u}, {v} = [int(_t) for _t in {lang.read_line_expr(ctx)}.split()]")
            elif lang.name == "javascript":
                edge_parts = ctx.fresh("edgeParts")
                cb.line(f"const {edge_parts} = {lang.read_line_expr(ctx)}.trim().split(/\\s+/);")
                cb.line(f"const {u} = parseInt({edge_parts}[0], 10);")
                cb.line(f"const {v} = parseInt({edge_parts}[1], 10);")
            elif lang.name == "java":
                edge_parts = ctx.fresh("edgeParts")
                cb.line(f"String[] {edge_parts} = {lang.read_line_expr(ctx)}.trim().split(\"\\\\s+\");")
                cb.line(f"int {u} = Integer.parseInt({edge_parts}[0]);")
                cb.line(f"int {v} = Integer.parseInt({edge_parts}[1]);")
            elif lang.name == "cpp":
                cb.line(f"int {u}, {v};")
                cb.line(f"{{ istringstream _iss({lang.read_line_expr(ctx)}); _iss >> {u} >> {v}; }}")
            if lang.name == "python":
                cb.line(f"{adj}[{u}].append({v})")
                cb.line(f"{adj}[{v}].append({u})")
            elif lang.name == "javascript":
                cb.line(f"{adj}[{u}].push({v});")
                cb.line(f"{adj}[{v}].push({u});")
            elif lang.name == "java":
                cb.line(f"{adj}.get({u}).add({v});")
                cb.line(f"{adj}.get({v}).add({u});")
            elif lang.name == "cpp":
                cb.line(f"{adj}[{u}].push_back({v});")
                cb.line(f"{adj}[{v}].push_back({u});")
        return adj

    def generate_serializer(self, cb, lang, ctx, value_expr):
        edges_var = ctx.fresh("edgesOut")
        if lang.name == "python":
            cb.line(f"{edges_var} = []")
        elif lang.name == "javascript":
            cb.line(f"let {edges_var} = [];")
        elif lang.name == "java":
            cb.line(f"List<String> {edges_var} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {edges_var};")

        n_var = ctx.fresh("gn")
        declare_var(cb, lang, n_var, lang.length_expr(value_expr), java_type="int", cpp_type="int")

        header, u = lang.for_header(ctx, n_var)
        with cb.block(header):
            neighbors = lang.index_expr(value_expr, u)
            elem_type = "Integer" if lang.name == "java" else ("int" if lang.name == "cpp" else None)
            header2, v = lang.foreach_header(ctx, neighbors, elem_type=elem_type) if lang.name == "java" \
                else lang.foreach_header(ctx, neighbors)
            with cb.block(header2):
                with cb.block(if_header(lang, f"{v} > {u}")):
                    if lang.name in ("python", "javascript"):
                        lang.append_stmt(cb, edges_var, f"[{u}, {v}]")
                    elif lang.name == "java":
                        lang.append_stmt(cb, edges_var, f'("[" + String.valueOf({u}) + "," + String.valueOf({v}) + "]")')
                    elif lang.name == "cpp":
                        lang.append_stmt(cb, edges_var, f'("[" + to_string({u}) + "," + to_string({v}) + "]")')

        if lang.name == "python":
            return f'{{"n": {n_var}, "edges": {edges_var}}}'
        if lang.name == "javascript":
            return f'{{n: {n_var}, edges: {edges_var}}}'
        if lang.name == "java":
            return (f'("{{\\"n\\":" + String.valueOf({n_var}) + ",\\"edges\\":[" '
                     f'+ String.join(",", {edges_var}) + "]}}")')
        if lang.name == "cpp":
            return (f'("{{\\"n\\":" + to_string({n_var}) + ",\\"edges\\":[" '
                     f'+ _joinArr({edges_var}) + "]}}")')
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        if lang.name == "java":
            return "List<List<Integer>>"
        if lang.name == "cpp":
            return "vector<vector<int>>"
        return None
