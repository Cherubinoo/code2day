FROM judge0/judge0:1.13.1

LABEL maintainer="Code2Day Platform"
LABEL description="Custom Judge0 image - pre-installed Python/JS/C++ packages"

# Switch to root for package installation
USER root

# ─── Python packages (language_id: 71) ───────────────────────────────────────
# Judge0 1.13.1 ships Python 3.8.1 at /usr/local/python-3.8.1 with pip included.
# We use that pip directly — no apt-get needed for Python packages.
RUN /usr/local/python-3.8.1/bin/pip3 install --upgrade pip --quiet \
    && /usr/local/python-3.8.1/bin/pip3 install --no-cache-dir \
        --root-user-action=ignore \
        numpy \
        scipy \
        pandas \
        sympy \
        sortedcontainers \
        more-itertools \
        networkx \
        bitarray \
        heapq_max \
        pyparsing

# ─── Node.js / JavaScript packages (language_id: 63) ─────────────────────────
# Install lodash and underscore globally for the Node.js runtime
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends nodejs npm \
    && npm install -g --save lodash underscore \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    || true

# ─── C / C++ extra libs (language_id: 50 / 54) ───────────────────────────────
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends libboost-all-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    || true

# Switch back to the judge0 user
USER judge0

ENTRYPOINT ["/api/docker-entrypoint.sh"]
CMD ["/api/scripts/server"]
