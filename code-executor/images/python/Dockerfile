FROM python:3.11-slim

RUN pip install --no-cache-dir \
    # Data science & math
    numpy \
    scipy \
    pandas \
    sympy \
    matplotlib \
    # Data structures & algorithms
    sortedcontainers \
    more-itertools \
    networkx \
    bitarray \
    pyparsing \
    heapq_max \
    # String & text
    regex \
    # Utilities
    itertools-recipes \
    tqdm

RUN useradd -m -u 65534 nobody 2>/dev/null || true
WORKDIR /code
