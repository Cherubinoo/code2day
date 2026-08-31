FROM debian:bookworm-slim

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    sqlite3 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 65534 nobody 2>/dev/null || true
WORKDIR /code
