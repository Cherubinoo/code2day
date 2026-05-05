FROM eclipse-temurin:17-jdk-alpine

RUN apk add --no-cache maven curl

# ── Download all jars into /usr/local/lib/java ────────────────────────────────
# These are added to the classpath at compile+run time via the executor command.
RUN mkdir -p /usr/local/lib/java

# Apache Commons Lang (StringUtils, ArrayUtils, etc.)
RUN mvn dependency:copy \
    -Dartifact=org.apache.commons:commons-lang3:3.14.0:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Apache Commons Math (statistics, linear algebra, combinatorics)
RUN mvn dependency:copy \
    -Dartifact=org.apache.commons:commons-math3:3.6.1:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Apache Commons Collections (Bag, BidiMap, MultiMap, Trie, etc.)
RUN mvn dependency:copy \
    -Dartifact=org.apache.commons:commons-collections4:4.4:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Google Guava (ImmutableList, Multimap, Graph, BloomFilter, etc.)
RUN mvn dependency:copy \
    -Dartifact=com.google.guava:guava:33.2.1-jre:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Guava's dependency (failureaccess)
RUN mvn dependency:copy \
    -Dartifact=com.google.guava:failureaccess:1.0.2:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Eclipse Collections (faster List/Map/Set implementations)
RUN mvn dependency:copy \
    -Dartifact=org.eclipse.collections:eclipse-collections:11.1.0:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true
RUN mvn dependency:copy \
    -Dartifact=org.eclipse.collections:eclipse-collections-api:11.1.0:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# JGraphT (graph algorithms: BFS, DFS, Dijkstra, MST, etc.)
RUN mvn dependency:copy \
    -Dartifact=org.jgrapht:jgrapht-core:1.5.2:jar \
    -DoutputDirectory=/usr/local/lib/java -q 2>/dev/null || true

# Write a classpath helper script
RUN echo '#!/bin/sh' > /usr/local/bin/jcp && \
    echo 'echo $(find /usr/local/lib/java -name "*.jar" | tr "\n" ":")' >> /usr/local/bin/jcp && \
    chmod +x /usr/local/bin/jcp

# Update the Java executor command to include the classpath
# The executor runs: javac Solution.java && java Solution
# We override with a wrapper script that adds -cp
RUN echo '#!/bin/sh' > /usr/local/bin/run-java && \
    echo 'CP=$(find /usr/local/lib/java -name "*.jar" | tr "\n" ":")' >> /usr/local/bin/run-java && \
    echo 'cd /code && javac -cp ".:$CP" Solution.java 2>&1 && java -cp ".:$CP" Solution' >> /usr/local/bin/run-java && \
    chmod +x /usr/local/bin/run-java

WORKDIR /code
