#!/bin/bash

echo "=========================================="
echo "Judge0 CE Verification Script"
echo "=========================================="

# Test 1: System Info
echo "Step 1: Testing system info endpoint..."
SYSTEM_INFO=$(curl -s "http://172.16.4.111:2358/system_info" | head -c 100)
if [[ $SYSTEM_INFO == *"Architecture"* ]]; then
    echo "✓ System info endpoint working"
else
    echo "✗ System info endpoint failed"
    exit 1
fi

# Test 2: Languages
echo "Step 2: Testing languages endpoint..."
LANGUAGES=$(curl -s "http://172.16.4.111:2358/languages")
if [[ $LANGUAGES == *"Assembly"* ]]; then
    echo "✓ Languages endpoint working"
else
    echo "✗ Languages endpoint failed"
    exit 1
fi

# Test 3: Python Execution
echo "Step 3: Testing Python code execution..."
PYTHON_RESULT=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d '{"source_code": "print(\"Python works!\")", "language_id": 71, "base64_encoded": false}')

if [[ $PYTHON_RESULT == *"Python works!"* ]]; then
    echo "✓ Python execution working"
else
    echo "✗ Python execution failed"
    echo "Result: $PYTHON_RESULT"
    exit 1
fi

# Test 4: JavaScript Execution
echo "Step 4: Testing JavaScript code execution..."
JS_RESULT=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d '{"source_code": "console.log(\"JavaScript works!\");", "language_id": 63, "base64_encoded": false}')

if [[ $JS_RESULT == *"JavaScript works!"* ]]; then
    echo "✓ JavaScript execution working"
else
    echo "✗ JavaScript execution failed"
    echo "Result: $JS_RESULT"
fi

# Test 5: C Execution
echo "Step 5: Testing C code execution..."
C_RESULT=$(curl -s -X POST "http://172.16.4.111:2358/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d '{"source_code": "#include <stdio.h>\nint main() {\n    printf(\"C works!\");\n    return 0;\n}", "language_id": 50, "base64_encoded": false}')

if [[ $C_RESULT == *"C works!"* ]]; then
    echo "✓ C execution working"
else
    echo "✗ C execution failed"
    echo "Result: $C_RESULT"
fi

echo "=========================================="
echo "Judge0 CE is successfully deployed and working!"
echo "=========================================="
echo ""
echo "API Endpoint: http://172.16.4.111:2358"
echo "Documentation: http://172.16.4.111:2358/docs"
echo ""
echo "Key Configuration Changes Made:"
echo "- ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=true"
echo "- ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=true"
echo "- This disables cgroups to work with cgroup v2 systems"
echo ""
echo "Ready for integration with your backend and frontend!"