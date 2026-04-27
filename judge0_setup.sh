#!/usr/bin/env python3
"""
Simple Judge0 Test Script
Tests basic functionality of Judge0 installation
"""

import requests
import json
import time
import sys

# Configuration
JUDGE0_URL = "http://localhost:2358"  # Change this to your Judge0 URL
TIMEOUT = 30  # seconds

def test_system_info():
    """Test if Judge0 API is responding"""
    print("🔍 Testing Judge0 system info...")
    try:
        response = requests.get(f"{JUDGE0_URL}/system_info", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Judge0 is running!")
            print(f"   Version: {data.get('version', 'Unknown')}")
            print(f"   Languages available: {len(data.get('languages', []))}")
            return True
        else:
            print(f"❌ System info failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ System info error: {e}")
        return False

def test_languages():
    """Test available languages"""
    print("\n🌐 Testing available languages...")
    try:
        response = requests.get(f"{JUDGE0_URL}/languages", timeout=10)
        if response.status_code == 200:
            languages = response.json()
            print(f"✅ Found {len(languages)} languages:")
            
            # Show some popular languages
            popular = ['C++', 'Python', 'Java', 'JavaScript', 'C#', 'Go', 'Rust']
            for lang in languages:
                if lang['name'] in popular:
                    print(f"   • {lang['name']} (ID: {lang['id']})")
            return True
        else:
            print(f"❌ Languages test failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Languages error: {e}")
        return False

def submit_and_wait(source_code, language_id, language_name, expected_output=None):
    """Submit code and wait for result"""
    print(f"\n🧪 Testing {language_name}...")
    
    # Submit code
    submission_data = {
        "source_code": source_code,
        "language_id": language_id,
        "stdin": ""
    }
    
    if expected_output:
        submission_data["expected_output"] = expected_output
    
    try:
        # Submit
        response = requests.post(
            f"{JUDGE0_URL}/submissions",
            json=submission_data,
            params={"wait": "true"},
            timeout=TIMEOUT
        )
        
        if response.status_code == 201:
            result = response.json()
            
            if result.get('status', {}).get('description') == 'Accepted':
                print(f"✅ {language_name} test passed!")
                print(f"   Output: {result.get('stdout', '').strip()}")
                return True
            else:
                print(f"❌ {language_name} test failed!")
                print(f"   Status: {result.get('status', {}).get('description', 'Unknown')}")
                if result.get('stderr'):
                    print(f"   Error: {result.get('stderr').strip()}")
                return False
        else:
            print(f"❌ {language_name} submission failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ {language_name} error: {e}")
        return False

def run_tests():
    """Run all tests"""
    print("🚀 Starting Judge0 Tests")
    print("=" * 50)
    
    # Test system info
    if not test_system_info():
        print("\n❌ Judge0 is not responding. Please check your installation.")
        return False
    
    # Test languages
    if not test_languages():
        print("\n❌ Could not fetch languages. Please check your installation.")
        return False
    
    # Test code execution
    tests = [
        {
            "name": "C++",
            "language_id": 54,
            "source_code": '#include <iostream>\nint main() {\n    std::cout << "Hello Judge0!" << std::endl;\n    return 0;\n}',
            "expected": "Hello Judge0!"
        },
        {
            "name": "Python 3",
            "language_id": 71,
            "source_code": 'print("Hello from Python!")',
            "expected": "Hello from Python!"
        },
        {
            "name": "JavaScript",
            "language_id": 63,
            "source_code": 'console.log("Hello from JavaScript!");',
            "expected": "Hello from JavaScript!"
        },
        {
            "name": "Java",
            "language_id": 62,
            "source_code": 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}',
            "expected": "Hello from Java!"
        }
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if submit_and_wait(
            test["source_code"], 
            test["language_id"], 
            test["name"], 
            test["expected"]
        ):
            passed += 1
    
    print("\n" + "=" * 50)
    print(f"🎯 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Judge0 is working perfectly!")
        return True
    else:
        print("⚠️  Some tests failed. Please check your Judge0 configuration.")
        return False

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)