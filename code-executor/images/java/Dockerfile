FROM eclipse-temurin:17-jdk-alpine

# Install Maven to fetch dependencies
RUN apk add --no-cache maven

# Pre-download commonly used libraries into local Maven repo
# so they're available at compile time without network access
RUN mkdir -p /root/.m2 && mvn dependency:get \
    -Dartifact=org.apache.commons:commons-lang3:3.14.0 \
    -Dartifact=org.apache.commons:commons-math3:3.6.1 \
    -Dartifact=com.google.guava:guava:33.0.0-jre \
    2>/dev/null || true

# Add jars to a shared lib directory for easy classpath inclusion
RUN mkdir -p /usr/local/lib/java
RUN mvn dependency:copy \
    -Dartifact=org.apache.commons:commons-lang3:3.14.0:jar \
    -DoutputDirectory=/usr/local/lib/java 2>/dev/null || true
RUN mvn dependency:copy \
    -Dartifact=org.apache.commons:commons-math3:3.6.1:jar \
    -DoutputDirectory=/usr/local/lib/java 2>/dev/null || true
RUN mvn dependency:copy \
    -Dartifact=com.google.guava:guava:33.0.0-jre:jar \
    -DoutputDirectory=/usr/local/lib/java 2>/dev/null || true

WORKDIR /code
