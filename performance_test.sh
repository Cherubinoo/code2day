#!/bin/bash

echo "=========================================="
echo "Judge0 CE Performance Test - Concurrent Execution"
echo "=========================================="

# Function to execute code and measure time
execute_code() {
    local code="$1"
    local lang_id="$2"
    local test_name="$3"
    local start_time=$(date +%s.%N)
    
    local result=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
        -H "Content-Type: application/json" \
        -d "{\"source_code\": \"$code\", \"language_id\": $lang_id, \"base64_encoded\": false}")
    
    local end_time=$(date +%s.%N)
    local api_time=$(echo "$end_time - $start_time" | bc -l)
    
    local execution_time=$(echo "$result" | jq -r '.time // "null"')
    local memory=$(echo "$result" | jq -r '.memory // "null"')
    local status=$(echo "$result" | jq -r '.status.description // "Unknown"')
    local stdout=$(echo "$result" | jq -r '.stdout // ""' | head -c 50)
    
    printf "%-20s | %-15s | %-10s | %-10s | %-8s | %s\n" \
        "$test_name" "$status" "${execution_time}s" "${memory}KB" "${api_time:0:6}s" "$stdout"
}

# Header
printf "%-20s | %-15s | %-10s | %-10s | %-8s | %s\n" \
    "Test Name" "Status" "Exec Time" "Memory" "API Time" "Output"
echo "--------------------------------------------------------------------------------"

# Test 1: Simple Loop (Low Complexity)
SIMPLE_LOOP='
count = 0
for i in range(1000):
    count += i
print(f"Simple: {count}")
'

# Test 2: Nested Loop (Medium Complexity)
NESTED_LOOP='
total = 0
for i in range(100):
    for j in range(100):
        total += i * j
print(f"Nested: {total}")
'

# Test 3: Complex Algorithm (High Complexity)
COMPLEX_ALGO='
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

result = fibonacci(25)
print(f"Fibonacci: {result}")
'

# Test 4: Memory Intensive (Array Operations)
MEMORY_TEST='
import sys
data = list(range(10000))
squared = [x*x for x in data]
total = sum(squared)
print(f"Memory: {total}")
'

# Test 5: CPU Intensive (Prime Numbers)
CPU_TEST='
def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

primes = [i for i in range(2, 1000) if is_prime(i)]
print(f"Primes: {len(primes)}")
'

# JavaScript Test
JS_LOOP='
let total = 0;
for(let i = 0; i < 1000; i++) {
    for(let j = 0; j < 100; j++) {
        total += i * j;
    }
}
console.log(`JS Total: ${total}`);
'

# C Test
C_LOOP='
#include <stdio.h>
int main() {
    long total = 0;
    for(int i = 0; i < 1000; i++) {
        for(int j = 0; j < 100; j++) {
            total += i * j;
        }
    }
    printf("C Total: %ld", total);
    return 0;
}
'

echo "Starting concurrent execution tests..."
echo ""

# Execute all tests concurrently using background processes
{
    execute_code "$SIMPLE_LOOP" 71 "Python-Simple"
} &

{
    execute_code "$NESTED_LOOP" 71 "Python-Nested"
} &

{
    execute_code "$COMPLEX_ALGO" 71 "Python-Fibonacci"
} &

{
    execute_code "$MEMORY_TEST" 71 "Python-Memory"
} &

{
    execute_code "$CPU_TEST" 71 "Python-CPU"
} &

{
    execute_code "$JS_LOOP" 63 "JavaScript-Loop"
} &

{
    execute_code "$C_LOOP" 50 "C-Loop"
} &

# Wait for all background processes to complete
wait

echo ""
echo "=========================================="
echo "Performance Test Complete!"
echo "=========================================="