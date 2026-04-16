#!/usr/bin/env python
"""Test Judge0 endpoints"""
import json
import urllib.request
import urllib.error

def test_system_info():
    """Test Judge0 system info endpoint"""
    print("=" * 50)
    print("TEST 1: Judge0 System Info")
    print("=" * 50)
    
    try:
        req = urllib.request.Request(
            "http://localhost:8000/api/judge0/system_info/",
            headers={"Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(f"Status: {data.get('status')}")
            if data.get('judge0_info'):
                print(f"Judge0 Version: {data['judge0_info'].get('version', 'N/A')}")
                print(f"Judge0 Status: Online ✓")
            return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        try:
            error_body = json.loads(e.read().decode('utf-8'))
            print(f"Error: {error_body}")
        except:
            pass
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_submit_python():
    """Test Python code submission"""
    print("\n" + "=" * 50)
    print("TEST 2: Submit Python Code")
    print("=" * 50)
    
    payload = {
        "language_id": 71,
        "source_code": "s = 0\nfor i in range(100):\n    s += i\nprint(f'Sum: {s}')",
        "stdin": ""
    }
    
    try:
        req = urllib.request.Request(
            "http://localhost:8000/api/judge0/submit/",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json", "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(f"Status: {data.get('status')}")
            if data.get('execution'):
                exec_result = data['execution']
                print(f"Output: {exec_result.get('output', 'N/A')}")
                print(f"Time: {exec_result.get('time', 'N/A')}")
                print(f"Memory: {exec_result.get('memory', 'N/A')}")
                return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        try:
            error_body = json.loads(e.read().decode('utf-8'))
            print(f"Error: {error_body}")
        except:
            pass
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_submit_c():
    """Test C code submission"""
    print("\n" + "=" * 50)
    print("TEST 3: Submit C Code")
    print("=" * 50)
    
    payload = {
        "language_id": 50,
        "source_code": '#include <stdio.h>\nint main() {\n    int s = 0;\n    for(int i = 0; i < 100; i++) s += i;\n    printf("Sum: %d", s);\n    return 0;\n}'
    }
    
    try:
        req = urllib.request.Request(
            "http://localhost:8000/api/judge0/submit/",
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json", "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            print(f"Status: {data.get('status')}")
            if data.get('execution'):
                exec_result = data['execution']
                print(f"Output: {exec_result.get('output', 'N/A')}")
                print(f"Time: {exec_result.get('time', 'N/A')}")
                print(f"Memory: {exec_result.get('memory', 'N/A')}")
                return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        try:
            error_body = json.loads(e.read().decode('utf-8'))
            print(f"Error: {error_body}")
        except:
            pass
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    print("Testing Judge0 Endpoints...\n")
    
    results = []
    results.append(("System Info", test_system_info()))
    results.append(("Python Submit", test_submit_python()))
    results.append(("C Submit", test_submit_c()))
    
    print("\n" + "=" * 50)
    print("SUMMARY")
    print("=" * 50)
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {name}: {status}")
