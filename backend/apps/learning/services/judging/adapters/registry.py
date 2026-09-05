"""Dispatch a TypeNode to its Adapter — the one place kind-name strings get
translated into an actual adapter instance. Every adapter that needs an
element/key/value/field's adapter goes through this, which is what makes
nesting free: a brand-new combination is just recursion through here."""


def get_adapter(node):
    kind = node.kind
    if kind == "primitive":
        from .primitive import PrimitiveAdapter
        return PrimitiveAdapter(node)
    if kind in ("sequence", "set"):
        from .sequence import SequenceAdapter
        return SequenceAdapter(node)
    if kind == "linked_list":
        from .linked_list import LinkedListAdapter
        return LinkedListAdapter(node)
    if kind in ("binary_tree", "bst"):
        # Same canonical TreeNode shape and codegen either way — only
        # comparator.py tells a BST's looser value-equality apart from a
        # plain tree's exact-shape one.
        from .binary_tree import BinaryTreeAdapter
        return BinaryTreeAdapter(node)
    if kind == "optional":
        from .optional import OptionalAdapter
        return OptionalAdapter(node)
    if kind == "random_list_node":
        from .random_list_node import RandomListNodeAdapter
        return RandomListNodeAdapter(node)
    if kind == "doubly_linked_list_node":
        from .doubly_linked_list_node import DoublyLinkedListNodeAdapter
        return DoublyLinkedListNodeAdapter(node)
    if kind == "graph":
        from .graph import GraphAdapter
        return GraphAdapter(node)
    if kind == "pair":
        from .pair import PairAdapter
        return PairAdapter(node)
    if kind == "map":
        from .map_set import MapAdapter
        return MapAdapter(node)
    if kind == "custom_struct":
        from .custom_struct import CustomStructAdapter
        return CustomStructAdapter(node)
    raise ValueError(f"No adapter for type kind {kind!r} ({node.raw!r})")
