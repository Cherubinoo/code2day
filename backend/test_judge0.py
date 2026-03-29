#!/usr/bin/env python3
"""
Test script to check Judge0 EC2 instance response.
Run: python test_judge0.py
"""
import json
import os
from pathlib import Path
import urllib.request
import urllib.error
import sys

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# Judge0 EC2 instance
JUDGE0_BASE_URL = os.getenv("JUDGE0_BASE_URL", "http://43.205.198.74:2358")

# Simple Python code that prints a message
test_code = """
print("Hello from Judge0!")
"""

def test_judge0():
    """Test basic connectivity and execution on Judge0."""
    print(f"Testing Judge0 at {JUDGE0_BASE_URL}")
    print("=" * 50)
    
    # Test 1: Check if Judge0 is reachable
    print("\n1. Testing connectivity...")
    try:
        req = urllib.request.Request(
            f"{JUDGE0_BASE_URL}/languages",
            headers={"Content-Type": "application/json"},
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print("   [OK] Judge0 is reachable!")
                data = json.loads(response.read().decode("utf-8"))
                print(f"   [OK] Available languages: {len(data)} languages")
            else:
                print(f"   [FAIL] Unexpected status: {response.status}")
                return False
    except Exception as e:
        print(f"   [FAIL] Connection failed: {e}")
        return False
    
    # Test 2: Submit a simple program
    print("\n2. Testing code execution...")
    print("   Submitting simple Python program...")
    
    payload = {
        "source_code": test_code,
        "language_id": 71,  # Python
        "stdin": "",
        "wait_timeout": 30000,  # 30 seconds in ms
    }
    
    try:
        req = urllib.request.Request(
            f"{JUDGE0_BASE_URL}/submissions?wait=true",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        with urllib.request.urlopen(req, timeout=35) as response:
            result = json.loads(response.read().decode("utf-8"))
            
            print(f"   Status: {result.get('status', 'unknown')}")
            print(f"   Output: {result.get('stdout', 'No output')}")
            
            if result.get('stderr'):
                print(f"   Stderr: {result.get('stderr')}")
            
            if result.get('compile_output'):
                print(f"   Compile output: {result.get('compile_output')}")
            
            if result.get('status', {}).get('id') == 3:  # 3 = Accepted
                print("   [OK] Code executed successfully!")
                return True
            else:
                print(f"   [FAIL] Execution failed: {result.get('status', {}).get('description', 'Unknown error')}")
                return False
                
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        print(f"   [FAIL] HTTP Error {e.code}: {error_body}")
        return False
    except Exception as e:
        print(f"   [FAIL] Execution failed: {e}")
        return False

if __name__ == "__main__":
    success = test_judge0()
    print("\n" + "=" * 50)
    if success:
        print("[OK] All tests passed! Judge0 is working correctly.")
        sys.exit(0)
    else:
        print("[FAIL] Tests failed. Check Judge0 EC2 instance.")
        sys.exit(1)
