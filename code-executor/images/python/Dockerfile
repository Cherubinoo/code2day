FROM python:3.11-slim

RUN pip install --no-cache-dir \
    numpy \
    scipy \
    pandas \
    sympy \
    sortedcontainers \
    more-itertools \
    networkx \
    bitarray \
    pyparsing

RUN useradd -m -u 65534 nobody 2>/dev/null || true
WORKDIR /code
