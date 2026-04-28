#!/bin/bash

echo "=========================================="
echo "Judge0 CE Complexity Performance Analysis"
echo "=========================================="

# Function to test different complexity levels
test_complexity() {
    local complexity=$1
    local description=$2
    local code=$3
    local lang_id=$4
    
    echo "Testing: $description (Complexity: $complexity)"
    
    local start_time=$(date +%s.%N)
    
    local result=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
        -H "Content-Type: application/json" \
        -d "{\"source_code\": \"$code\", \"language_id\": $lang_id, \"base64_encoded\": false}")
    
    local end_time=$(date +%s.%N)
    local api_time=$(echo "$end_time - $start_time" | bc -l)
    
    local status=$(echo "$result" | jq -r '.status.description')
    local exec_time=$(echo "$result" | jq -r '.time')
    local memory=$(echo "$result" | jq -r '.memory')
    local output=$(echo "$result" | jq -r '.stdout' | head -c 30)
    
    printf "%-20s | %-10s | %8ss | %8s KB | %8ss | %s\n" \
        "$description" "$status" "$exec_time" "$memory" "${api_time:0:8}" "$output"
}

# Header
printf "%-20s | %-10s | %-10s | %-10s | %-10s | %s\n" \
    "Test Description" "Status" "Exec Time" "Memory" "API Time" "Output"
echo "-------------------------------------------------------------------------------------"

# Test 1: O(1) - Constant Time
test_complexity "O(1)" "Constant-Time" \
"result = 42 * 37\nprint(f'Constant: {result}')" 71

# Test 2: O(n) - Linear Time
test_complexity "O(n)" "Linear-Time" \
"total = sum(range(1000))\nprint(f'Linear: {total}')" 71

# Test 3: O(n²) - Quadratic Time
test_complexity "O(n²)" "Quadratic-Time" \
"total = 0\nfor i in range(100):\n    for j in range(100):\n        total += i * j\nprint(f'Quadratic: {total}')" 71

# Test 4: O(n³) - Cubic Time
test_complexity "O(n³)" "Cubic-Time" \
"total = 0\nfor i in range(30):\n    for j in range(30):\n        for k in range(30):\n            total += i + j + k\nprint(f'Cubic: {total}')" 71

# Test 5: Fibonacci (Exponential-like)
test_complexity "O(2^n)" "Fibonacci-Recursive" \
"def fib(n):\n    if n <= 1: return n\n    return fib(n-1) + fib(n-2)\nresult = fib(15)\nprint(f'Fibonacci: {result}')" 71

# Test 6: Memory Intensive
test_complexity "Memory" "Memory-Intensive" \
"data = list(range(10000))\nsquared = [x*x for x in data]\nresult = sum(squared)\nprint(f'Memory: {result}')" 71

# Test 7: String Operations
test_complexity "String" "String-Operations" \
"text = 'Hello World ' * 1000\nresult = len(text.replace('o', 'X'))\nprint(f'String: {result}')" 71

echo ""
echo "=========================================="

# Now test different languages with same algorithm
echo "Multi-Language Performance Comparison"
echo "Algorithm: Nested loop (100x100)"
echo "=========================================="

printf "%-15s | %-10s | %-10s | %-10s | %-10s | %s\n" \
    "Language" "Status" "Exec Time" "Memory" "API Time" "Output"
echo "-------------------------------------------------------------------------------"

# Python
test_complexity "Python" "Python-3.8" \
"total = 0\nfor i in range(100):\n    for j in range(100):\n        total += i * j\nprint(f'Python: {total}')" 71

# JavaScript
test_complexity "JavaScript" "JavaScript-Node" \
"let total = 0;\nfor(let i = 0; i < 100; i++) {\n    for(let j = 0; j < 100; j++) {\n        total += i * j;\n    }\n}\nconsole.log(\`JS: \${total}\`);" 63

# C
test_complexity "C" "C-GCC" \
"#include <stdio.h>\nint main() {\n    long total = 0;\n    for(int i = 0; i < 100; i++) {\n        for(int j = 0; j < 100; j++) {\n            total += i * j;\n        }\n    }\n    printf(\"C: %ld\", total);\n    return 0;\n}" 50

# Java
test_complexity "Java" "Java-OpenJDK" \
"public class Main {\n    public static void main(String[] args) {\n        long total = 0;\n        for(int i = 0; i < 100; i++) {\n            for(int j = 0; j < 100; j++) {\n                total += i * j;\n            }\n        }\n        System.out.println(\"Java: \" + total);\n    }\n}" 62

echo ""
echo "=========================================="
echo "Performance Analysis Complete!"
echo "=========================================="