#!/bin/bash

# Test Package Installation in Judge0
# This script tests if all packages are properly installed

set -e

echo "=========================================="
echo "Judge0 Package Installation Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test Python with numpy
echo "Test 1: Python with numpy"
echo "------------------------"

PYTHON_CODE='import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print(f"Array: {arr}")
print(f"Mean: {np.mean(arr)}")
print(f"Sum: {np.sum(arr)}")'

RESPONSE=$(curl -s -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"$(echo "$PYTHON_CODE" | base64 -w 0)\",
    \"language_id\": 71,
    \"base64_encoded\": true
  }")

STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status']['description'])")
OUTPUT=$(echo "$RESPONSE" | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['stdout']).decode())")

if [ "$STATUS" == "Accepted" ]; then
    echo -e "${GREEN}✓ Test passed${NC}"
    echo "Output:"
    echo "$OUTPUT"
else
    echo -e "${RED}✗ Test failed: $STATUS${NC}"
fi
echo ""

# Test Python with pandas
echo "Test 2: Python with pandas"
echo "------------------------"

PYTHON_CODE='import pandas as pd
df = pd.DataFrame({"A": [1, 2, 3], "B": [4, 5, 6]})
print(df)
print(f"Sum of column A: {df[\"A\"].sum()}")'

RESPONSE=$(curl -s -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"$(echo "$PYTHON_CODE" | base64 -w 0)\",
    \"language_id\": 71,
    \"base64_encoded\": true
  }")

STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status']['description'])")
OUTPUT=$(echo "$RESPONSE" | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['stdout']).decode())")

if [ "$STATUS" == "Accepted" ]; then
    echo -e "${GREEN}✓ Test passed${NC}"
    echo "Output:"
    echo "$OUTPUT"
else
    echo -e "${RED}✗ Test failed: $STATUS${NC}"
fi
echo ""

# Test JavaScript with lodash
echo "Test 3: JavaScript with lodash"
echo "------------------------"

JS_CODE='const _ = require("lodash");
const arr = [1, 2, 3, 4, 5];
console.log("Array:", arr);
console.log("Sum:", _.sum(arr));
console.log("Mean:", _.mean(arr));'

RESPONSE=$(curl -s -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"$(echo "$JS_CODE" | base64 -w 0)\",
    \"language_id\": 63,
    \"base64_encoded\": true
  }")

STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status']['description'])")
OUTPUT=$(echo "$RESPONSE" | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['stdout']).decode())")

if [ "$STATUS" == "Accepted" ]; then
    echo -e "${GREEN}✓ Test passed${NC}"
    echo "Output:"
    echo "$OUTPUT"
else
    echo -e "${RED}✗ Test failed: $STATUS${NC}"
fi
echo ""

# Test Python with requests
echo "Test 4: Python with requests"
echo "------------------------"

PYTHON_CODE='import requests
print("requests library version:", requests.__version__)
print("requests library is available!")'

RESPONSE=$(curl -s -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"$(echo "$PYTHON_CODE" | base64 -w 0)\",
    \"language_id\": 71,
    \"base64_encoded\": true
  }")

STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status']['description'])")
OUTPUT=$(echo "$RESPONSE" | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['stdout']).decode())")

if [ "$STATUS" == "Accepted" ]; then
    echo -e "${GREEN}✓ Test passed${NC}"
    echo "Output:"
    echo "$OUTPUT"
else
    echo -e "${RED}✗ Test failed: $STATUS${NC}"
fi
echo ""

# Test Python with matplotlib
echo "Test 5: Python with matplotlib"
echo "------------------------"

PYTHON_CODE='import matplotlib
print("matplotlib version:", matplotlib.__version__)
print("matplotlib is available!")'

RESPONSE=$(curl -s -X POST http://localhost:2358/submissions?wait=true \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"$(echo "$PYTHON_CODE" | base64 -w 0)\",
    \"language_id\": 71,
    \"base64_encoded\": true
  }")

STATUS=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['status']['description'])")
OUTPUT=$(echo "$RESPONSE" | python3 -c "import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)['stdout']).decode())")

if [ "$STATUS" == "Accepted" ]; then
    echo -e "${GREEN}✓ Test passed${NC}"
    echo "Output:"
    echo "$OUTPUT"
else
    echo -e "${RED}✗ Test failed: $STATUS${NC}"
fi
echo ""

echo "=========================================="
echo "All tests completed!"
echo "=========================================="
