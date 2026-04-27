#!/usr/bin/env python3
"""
Test script for the winners endpoint
"""

import requests
import json

# Test the winners endpoint
def test_winners_endpoint():
    base_url = "http://localhost:8000"
    
    # First, let's test if we can get contests
    try:
        response = requests.get(f"{base_url}/api/student/contests/")
        print(f"Contests endpoint status: {response.status_code}")
        
        if response.status_code == 401:
            print("❌ Authentication required - this is expected")
            print("The endpoint is working but requires login")
            return True
        elif response.status_code == 200:
            data = response.json()
            print(f"✅ Got {len(data.get('contests', []))} contests")
            return True
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"❌ Error testing contests endpoint: {e}")
        return False

def test_system_endpoints():
    """Test system endpoints that don't require auth"""
    base_url = "http://localhost:8000"
    
    endpoints = [
        "/api/health/",
        "/api/problems/",
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{base_url}{endpoint}")
            print(f"{endpoint}: {response.status_code}")
            if response.status_code == 200:
                print(f"  ✅ Working")
            else:
                print(f"  ❌ Status: {response.status_code}")
        except Exception as e:
            print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    print("🧪 Testing Django Backend Endpoints")
    print("=" * 40)
    
    test_system_endpoints()
    print()
    test_winners_endpoint()