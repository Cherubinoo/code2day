FROM python:3.11-slim

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    gcc g++ && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    # ── Arrays & Math ─────────────────────────────────────────────────────────
    numpy==1.26.4 \
    scipy==1.13.1 \
    # ── Data Analysis ─────────────────────────────────────────────────────────
    pandas==2.2.2 \
    # ── Symbolic Math ─────────────────────────────────────────────────────────
    sympy==1.12 \
    # ── Sorted Containers (SortedList, SortedDict, SortedSet) ─────────────────
    sortedcontainers==2.4.0 \
    # ── Graphs (BFS, DFS, Dijkstra, MST, etc.) ────────────────────────────────
    networkx==3.3 \
    # ── Itertools extras (sliding_window, batched, etc.) ──────────────────────
    more-itertools==10.3.0 \
    # ── Bit arrays ────────────────────────────────────────────────────────────
    bitarray==2.9.2 \
    # ── Regex ─────────────────────────────────────────────────────────────────
    regex==2024.5.15 \
    # ── Priority queue / heap extras ──────────────────────────────────────────
    heapq_max==0.21 \
    # ── Parsing ───────────────────────────────────────────────────────────────
    pyparsing==3.1.2 \
    # ── Interval trees ────────────────────────────────────────────────────────
    intervaltree==3.1.0 \
    # ── Disjoint set / Union-Find ──────────────────────────────────────────────
    unionfind==0.0.13 \
    # ── Trie ──────────────────────────────────────────────────────────────────
    pygtrie==2.5.0 \
    # ── Segment tree / Fenwick tree ────────────────────────────────────────────
    sortedcontainers==2.4.0 \
    # ── String algorithms ─────────────────────────────────────────────────────
    python-Levenshtein==0.25.1 \
    # ── Combinatorics ─────────────────────────────────────────────────────────
    # (itertools is stdlib, sympy covers combinatorics)
    # ── Utilities ─────────────────────────────────────────────────────────────
    tqdm==4.66.4

RUN useradd -m -u 65534 nobody 2>/dev/null || true
WORKDIR /code
