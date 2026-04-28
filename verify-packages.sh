#!/bin/bash

# Verify Packages are Installed in Judge0
# Tests that all required packages are available

set -e

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              Verifying Packages in Judge0 Environment                        ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

JUDGE0_URL="http://127.0.0.1:2358"

# Test Python packages
echo "🐍 Testing Python Packages..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PYTHON_TEST='
import sys
packages = ["numpy", "pandas", "scipy", "matplotlib", "sympy", "networkx", "sklearn", "requests", "bs4"]
for pkg in packages:
    try:
        __import__(pkg)
        print(f"✅ {pkg}")
    except ImportError:
        print(f"❌ {pkg} - NOT FOUND")
        sys.exit(1)
print("All Python packages installed!")
'

PYTHON_CODE_B64=$(echo "$PYTHON_TEST" | base64 -w 0)

RESPONSE=$(curl -s -X POST "${JUDGE0_URL}/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"${PYTHON_CODE_B64}\",
    \"language_id\": 71,
    \"base64_encoded\": true
  }")

STDOUT=$(echo "$RESPONSE" | jq -r '.stdout' | base64 -d 2>/dev/null || echo "$RESPONSE" | jq -r '.stdout')
STATUS=$(echo "$RESPONSE" | jq -r '.status.description')

if [ "$STATUS" = "Accepted" ]; then
    echo "$STDOUT"
    echo ""
else
    echo "❌ Python test failed!"
    echo "Status: $STATUS"
    echo "$RESPONSE" | jq .
    exit 1
fi

# Test C++ Boost library
echo "⚙️  Testing C++ Libraries..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CPP_TEST='
#include <iostream>
#include <boost/version.hpp>
int main() {
    std::cout << "✅ Boost version: " << BOOST_VERSION / 100000 << "." 
              << BOOST_VERSION / 100 % 1000 << "." 
              << BOOST_VERSION % 100 << std::endl;
    return 0;
}
'

CPP_CODE_B64=$(echo "$CPP_TEST" | base64 -w 0)

RESPONSE=$(curl -s -X POST "${JUDGE0_URL}/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"${CPP_CODE_B64}\",
    \"language_id\": 54,
    \"base64_encoded\": true
  }")

STDOUT=$(echo "$RESPONSE" | jq -r '.stdout' | base64 -d 2>/dev/null || echo "$RESPONSE" | jq -r '.stdout')
STATUS=$(echo "$RESPONSE" | jq -r '.status.description')

if [ "$STATUS" = "Accepted" ]; then
    echo "$STDOUT"
    echo ""
else
    echo "❌ C++ test failed!"
    echo "Status: $STATUS"
    echo "$RESPONSE" | jq .
    exit 1
fi

# Test Node.js packages
echo "📦 Testing Node.js Packages..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

NODE_TEST='
const packages = ["lodash", "axios", "moment"];
packages.forEach(pkg => {
    try {
        require(pkg);
        console.log(`✅ ${pkg}`);
    } catch (e) {
        console.log(`❌ ${pkg} - NOT FOUND`);
        process.exit(1);
    }
});
console.log("All Node.js packages installed!");
'

NODE_CODE_B64=$(echo "$NODE_TEST" | base64 -w 0)

RESPONSE=$(curl -s -X POST "${JUDGE0_URL}/submissions?wait=true" \
  -H "Content-Type: application/json" \
  -d "{
    \"source_code\": \"${NODE_CODE_B64}\",
    \"language_id\": 63,
    \"base64_encoded\": true
  }")

STDOUT=$(echo "$RESPONSE" | jq -r '.stdout' | base64 -d 2>/dev/null || echo "$RESPONSE" | jq -r '.stdout')
STATUS=$(echo "$RESPONSE" | jq -r '.status.description')

if [ "$STATUS" = "Accepted" ]; then
    echo "$STDOUT"
    echo ""
else
    echo "❌ Node.js test failed!"
    echo "Status: $STATUS"
    echo "$RESPONSE" | jq .
    exit 1
fi

echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║                    All Package Tests Passed! ✅                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Your Judge0 environment is ready for competitive programming!"
echo ""
