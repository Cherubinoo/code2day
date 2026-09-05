"""pair<A,B> / tuple<T1,...,TN> — a fixed N-tuple (N>=2) of (possibly
different, possibly nested) types. The common N=2 case uses each
language's own existing pair type (Python tuple, JS 2-array, Java's JDK
`AbstractMap.SimpleEntry`, C++'s `std::pair`) since those already have the
right shape and accessors; N>2 generates a small `_TupleN<T1,...,TN>`
class/struct once per arity (deduplicated like ListNode/TreeNode) since
neither Java nor C++ ships a built-in N-ary tuple type."""

from .base import Adapter


class PairAdapter(Adapter):
    def _sub_adapters(self):
        from .registry import get_adapter
        return [get_adapter(e) for e in self.node.elements]

    @property
    def _arity(self):
        return len(self.node.elements)

    def _tuple_class_name(self):
        return f"_Tuple{self._arity}"

    def generate_parser(self, cb, lang, ctx):
        adapters = self._sub_adapters()
        exprs = [a.generate_parser(cb, lang, ctx) for a in adapters]

        if lang.name == "python":
            return f"({', '.join(exprs)})"
        if lang.name == "javascript":
            return f"[{', '.join(exprs)}]"
        if self._arity == 2 and lang.name == "java":
            return f"new AbstractMap.SimpleEntry<>({exprs[0]}, {exprs[1]})"
        if self._arity == 2 and lang.name == "cpp":
            return f"make_pair({exprs[0]}, {exprs[1]})"
        if lang.name in ("java", "cpp"):
            return lang.new_object(self._tuple_class_name(), exprs)
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_serializer(self, cb, lang, ctx, value_expr):
        adapters = self._sub_adapters()

        if lang.name in ("python", "javascript"):
            vals = [f"{value_expr}[{i}]" for i in range(self._arity)]
        elif self._arity == 2 and lang.name == "java":
            vals = [f"{value_expr}.getKey()", f"{value_expr}.getValue()"]
        elif self._arity == 2 and lang.name == "cpp":
            vals = [f"{value_expr}.first", f"{value_expr}.second"]
        elif lang.name in ("java", "cpp"):
            vals = [f"{value_expr}.item{i + 1}" for i in range(self._arity)]
        else:
            raise ValueError(f"Unsupported language {lang.name!r}")

        outs = [a.generate_serializer(cb, lang, ctx, v) for a, v in zip(adapters, vals)]
        if lang.name in ("python", "javascript"):
            return "[" + ", ".join(outs) + "]"
        joined = ' + "," + '.join(outs)
        return f'("[" + {joined} + "]")'

    def generate_language_type(self, lang, boxed=False):
        adapters = self._sub_adapters()
        if lang.name == "java":
            if self._arity == 2:
                a, b = adapters
                return (f"AbstractMap.SimpleEntry<{a.generate_language_type(lang, boxed=True)}, "
                        f"{b.generate_language_type(lang, boxed=True)}>")
            types = ", ".join(a.generate_language_type(lang, boxed=True) for a in adapters)
            return f"{self._tuple_class_name()}<{types}>"
        if lang.name == "cpp":
            if self._arity == 2:
                a, b = adapters
                return f"pair<{a.generate_language_type(lang)}, {b.generate_language_type(lang)}>"
            types = ", ".join(a.generate_language_type(lang) for a in adapters)
            return f"{self._tuple_class_name()}<{types}>"
        return None

    def runtime_snippets(self, lang):
        if self._arity == 2 or lang.name not in ("java", "cpp"):
            return []

        n = self._arity
        name = self._tuple_class_name()
        type_params = [f"T{i + 1}" for i in range(n)]

        if lang.name == "java":
            fields = "\n".join(f"    public T{i + 1} item{i + 1};" for i in range(n))
            params = ", ".join(f"T{i + 1} item{i + 1}" for i in range(n))
            assigns = " ".join(f"this.item{i + 1} = item{i + 1};" for i in range(n))
            src = f"class {name}<{', '.join(type_params)}> {{\n{fields}\n    {name}({params}) {{ {assigns} }}\n}}"
        else:  # cpp
            fields = "\n".join(f"    T{i + 1} item{i + 1};" for i in range(n))
            params = ", ".join(f"T{i + 1} item{i + 1}" for i in range(n))
            init_list = ", ".join(f"item{i + 1}(item{i + 1})" for i in range(n))
            template = ", ".join(f"typename {p}" for p in type_params)
            src = (f"template<{template}>\nstruct {name} {{\n{fields}\n"
                   f"    {name}({params}) : {init_list} {{}}\n}};")

        return [(name, src)]
