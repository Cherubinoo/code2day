#!/bin/bash

echo "=========================================="
echo "Judge0 CE Detailed Performance Test"
echo "=========================================="

# Function to execute and analyze code
test_execution() {
    local code="$1"
    local lang_id="$2"
    local test_name="$3"
    
    echo "Testing: $test_name"
    echo "Code: $(echo "$code" | head -c 50)..."
    
    local start_time=$(date +%s.%N)
    
    local result=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
        -H "Content-Type: application/json" \
        -d "{\"source_code\": $(echo "$code" | jq -R -s .), \"language_id\": $lang_id, \"base64_encoded\": false}")
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc -l)
    
    echo "Raw Response: $result"
    echo "Total API Time: ${total_time}s"
    echo "----------------------------------------"
}

# Test 1: Simple Loop
echo "=== Test 1: Simple Loop ==="
SIMPLE_CODE='count = 0
for i in range(1000):
    count += i
print(f"Result: {count}")'

test_execution "$SIMPLE_CODE" 71 "Simple Loop"

# Test 2: Nested Loop
echo "=== Test 2: Nested Loop ==="
NESTED_CODE='total = 0
for i in range(100):
    for j in range(100):
        total += i * j
print(f"Nested Result: {total}")'

test_execution "$NESTED_CODE" 71 "Nested Loop"

# Test 3: Fibonacci (Recursive)
echo "=== Test 3: Fibonacci Recursive ==="
FIB_CODE='def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)

result = fib(20)
print(f"Fibonacci: {result}")'

test_execution "$FIB_CODE" 71 "Fibonacci"

# Test 4: JavaScript Performance
echo "=== Test 4: JavaScript Loop ==="
JS_CODE='let sum = 0;
for(let i = 0; i < 1000; i++) {
    sum += i * i;
}
console.log("JS Sum:", sum);'

test_execution "$JS_CODE" 63 "JavaScript"

# Test 5: C Performance
echo "=== Test 5: C Performance ==="
C_CODE='#include <stdio.h>
int main() {
    long sum = 0;
    for(int i = 0; i < 1000; i++) {
        sum += i * i;
    }
    printf("C Sum: %ld\\n", sum);
    return 0;
}'

test_execution "$C_CODE" 50 "C Language"

echo "=========================================="
echo "Performance Test Complete!"
echo "=========================================="