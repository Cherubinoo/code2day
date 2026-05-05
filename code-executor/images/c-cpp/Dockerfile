FROM gcc:12-bookworm

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    # ── Boost — the full DS/algo toolkit ──────────────────────────────────────
    # Covers: heap, graph, bimap, multi_index, interval, circular_buffer,
    #         dynamic_bitset, intrusive containers, geometry, math, etc.
    libboost-all-dev \
    # ── GNU Multiple Precision (big integers, rationals) ──────────────────────
    libgmp-dev \
    libgmpxx4ldbl \
    # ── BLAS / LAPACK (linear algebra) ────────────────────────────────────────
    libblas-dev \
    liblapack-dev \
    # ── Eigen (header-only linear algebra, matrices, vectors) ─────────────────
    libeigen3-dev \
    # ── LEMON graph library (BFS, DFS, Dijkstra, flow, matching) ──────────────
    liblemon-dev \
    # ── CGAL (computational geometry) ─────────────────────────────────────────
    libcgal-dev \
    # ── Intel TBB (parallel data structures) ──────────────────────────────────
    libtbb-dev \
    # ── Build tools ───────────────────────────────────────────────────────────
    cmake \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code
