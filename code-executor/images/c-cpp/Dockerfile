FROM gcc:12-bookworm

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    # Boost — data structures, algorithms, math
    libboost-all-dev \
    # GNU Multiple Precision arithmetic
    libgmp-dev \
    # BLAS/LAPACK for numerical computing
    libblas-dev \
    liblapack-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code
