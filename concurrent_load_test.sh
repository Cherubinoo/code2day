#!/bin/bash

echo "=========================================="
echo "Judge0 CE Concurrent Load Test"
echo "=========================================="

# Function to run a single test
run_test() {
    local test_id=$1
    local start_time=$(date +%s.%N)
    
    # Different complexity levels for each test
    case $((test_id % 4)) in
        0)
            # Simple calculation
            code='result = sum(range(1000))
print(f"Test {test_id}: {result}")'
            ;;
        1)
            # Nested loop
            code='total = 0
for i in range(50):
    for j in range(50):
        total += i + j
print(f"Test {test_id}: {total}")'
            ;;
        2)
            # List comprehension
            code='squares = [x*x for x in range(100)]
result = sum(squares)
print(f"Test {test_id}: {result}")'
            ;;
        3)
            # String operations
            code='text = "Hello" * 100
result = len(text.replace("l", "X"))
print(f"Test {test_id}: {result}")'
            ;;
    esac
    
    local response=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
        -H "Content-Type: application/json" \
        -d "{\"source_code\": $(echo "$code" | jq -R -s .), \"language_id\": 71, \"base64_encoded\": false}")
    
    local end_time=$(date +%s.%N)
    local total_time=$(echo "$end_time - $start_time" | bc -l)
    
    local status=$(echo "$response" | jq -r '.status.description // "Unknown"')
    local exec_time=$(echo "$response" | jq -r '.time // "null"')
    local memory=$(echo "$response" | jq -r '.memory // "null"')
    local output=$(echo "$response" | jq -r '.stdout // ""' | tr -d '\n')
    
    printf "Test %2d | %-15s | %6ss | %8s KB | %8ss | %s\n" \
        "$test_id" "$status" "$exec_time" "$memory" "${total_time:0:8}" "$output"
}

# Header
echo "Starting concurrent execution of 10 tests..."
echo ""
printf "%-7s | %-15s | %-8s | %-10s | %-10s | %s\n" \
    "Test ID" "Status" "Exec Time" "Memory" "API Time" "Output"
echo "--------------------------------------------------------------------------------"

# Run 10 concurrent tests
for i in {1..10}; do
    run_test $i &
done

# Wait for all tests to complete
wait

echo ""
echo "=========================================="
echo "Load Test Complete!"
echo "=========================================="

# Now test system performance under load
echo ""
echo "=== System Performance Check ==="
echo "Docker containers status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "Memory usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"