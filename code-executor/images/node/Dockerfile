FROM node:20-alpine

# Create a package.json so npm install works globally
RUN npm install -g npm@latest 2>/dev/null || true

# Install all packages into a shared global location
RUN npm install -g \
    # ── Utility / functional ──────────────────────────────────────────────────
    lodash@4.17.21 \
    underscore@1.13.6 \
    # ── Data structures ───────────────────────────────────────────────────────
    # Priority Queue / Min-Max Heap
    heap@0.2.7 \
    # Sorted array with binary search
    sorted-array@0.0.6 \
    # Doubly linked list
    yallist@4.0.0 \
    # Deque (double-ended queue)
    denque@2.1.0 \
    # Trie
    trie-prefix-tree@1.5.1 \
    # Disjoint set / Union-Find
    disjoint-set@0.0.2 \
    # Segment tree
    segment-tree@0.0.1 \
    # Graph algorithms
    graphlib@2.1.8 \
    # ── Math ──────────────────────────────────────────────────────────────────
    mathjs@13.0.3 \
    decimal.js@10.4.3 \
    big.js@6.2.1 \
    # ── String utilities ──────────────────────────────────────────────────────
    string@3.3.3 \
    # ── Bit manipulation ──────────────────────────────────────────────────────
    bitset@7.4.0 \
    2>/dev/null || true

WORKDIR /code
