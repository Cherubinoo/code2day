#!/bin/bash
# ============================================================
# verify-images.sh
# Verifies all language Docker images have required packages
# Run: bash code-executor/verify-images.sh
# ============================================================

set -e
PASS=0
FAIL=0
DOCKER=${DOCKER:-docker}

check() {
    local lang="$1"
    local image="$2"
    local cmd="$3"
    local expect="$4"

    result=$($DOCKER run --rm --network none "$image" sh -c "$cmd" 2>&1 || true)
    if echo "$result" | grep -q "$expect"; then
        echo "  ✅ $lang: $expect"
        PASS=$((PASS+1))
    else
        echo "  ❌ $lang: expected '$expect' but got: $result"
        FAIL=$((FAIL+1))
    fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Code2Day — Language Image Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Python ────────────────────────────────────────────────────────────────────
echo ""
echo "🐍 Python (code2day-python:latest)"
check "numpy"           code2day-python:latest "python3 -c 'import numpy; print(numpy.__version__)'"          "."
check "scipy"           code2day-python:latest "python3 -c 'import scipy; print(scipy.__version__)'"          "."
check "pandas"          code2day-python:latest "python3 -c 'import pandas; print(pandas.__version__)'"        "."
check "sympy"           code2day-python:latest "python3 -c 'import sympy; print(sympy.__version__)'"          "."
check "sortedcontainers" code2day-python:latest "python3 -c 'from sortedcontainers import SortedList; sl=SortedList([3,1,2]); print(sl[0])'" "1"
check "networkx"        code2day-python:latest "python3 -c 'import networkx as nx; G=nx.Graph(); G.add_edge(1,2); print(len(G.edges))'" "1"
check "heapq_max"       code2day-python:latest "python3 -c 'from heapq_max import *; h=[]; heappush_max(h,3); heappush_max(h,1); print(heappop_max(h))'" "3"
check "intervaltree"    code2day-python:latest "python3 -c 'from intervaltree import IntervalTree; t=IntervalTree(); t[1:5]=\"a\"; print(len(t))'" "1"
check "bitarray"        code2day-python:latest "python3 -c 'from bitarray import bitarray; b=bitarray(8); b.setall(0); print(len(b))'" "8"
check "regex"           code2day-python:latest "python3 -c 'import regex; print(regex.match(r\"\\w+\",\"hello\").group())'" "hello"
check "two-sum exec"    code2day-python:latest "echo '[[2,7,11,15],9]' | python3 -c '
import json,sys
args=json.loads(sys.stdin.read())
nums,target=args
seen={}
for i,n in enumerate(nums):
    if target-n in seen: print(json.dumps([seen[target-n],i])); break
    seen[n]=i
'" "[0,1]"

# ── JavaScript ────────────────────────────────────────────────────────────────
echo ""
echo "🟨 JavaScript (code2day-node:latest)"
check "lodash"          code2day-node:latest "node -e 'const _=require(\"lodash\"); console.log(_.sum([1,2,3]))'"  "6"
check "mathjs"          code2day-node:latest "node -e 'const m=require(\"mathjs\"); console.log(m.sqrt(16))'"      "4"
check "heap"            code2day-node:latest "node -e 'const Heap=require(\"heap\"); const h=new Heap(); h.push(3); h.push(1); h.push(2); console.log(h.pop())'" "1"
check "denque"          code2day-node:latest "node -e 'const Denque=require(\"denque\"); const d=new Denque([1,2,3]); d.push(4); console.log(d.length)'" "4"
check "decimal.js"      code2day-node:latest "node -e 'const D=require(\"decimal.js\"); console.log(new D(0.1).plus(0.2).toString())'" "0.3"
check "two-sum exec"    code2day-node:latest "echo '[[2,7,11,15],9]' | node -e '
const lines=[]; process.stdin.on(\"data\",d=>lines.push(d)); process.stdin.on(\"end\",()=>{
  const [nums,target]=JSON.parse(lines.join(\"\"));
  const map={};
  for(let i=0;i<nums.length;i++){
    if(map[target-nums[i]]!==undefined){console.log(JSON.stringify([map[target-nums[i]],i]));return;}
    map[nums[i]]=i;
  }
});'" "[0,1]"

# ── Java ──────────────────────────────────────────────────────────────────────
echo ""
echo "☕ Java (code2day-java:latest)"
check "javac exists"    code2day-java:latest "javac -version 2>&1"  "javac"
check "jars present"    code2day-java:latest "ls /usr/local/lib/java/*.jar | wc -l" "."
check "guava jar"       code2day-java:latest "ls /usr/local/lib/java/ | grep guava" "guava"
check "commons-lang3"   code2day-java:latest "ls /usr/local/lib/java/ | grep commons-lang3" "commons-lang3"
check "two-sum exec"    code2day-java:latest 'CP=$(find /usr/local/lib/java -name "*.jar" 2>/dev/null | tr "\n" ":"); mkdir -p /tmp/ts && cat > /tmp/ts/Solution.java << '"'"'EOF'"'"'
import java.util.*;
class Solution {
    public static void main(String[] args) throws Exception {
        Scanner sc = new Scanner(System.in);
        String line = sc.nextLine().trim();
        line = line.substring(1, line.length()-1);
        String[] parts = line.split(",");
        int[] nums = {Integer.parseInt(parts[0].trim().replace("[","")), Integer.parseInt(parts[1].trim()), Integer.parseInt(parts[2].trim()), Integer.parseInt(parts[3].trim().replace("]",""))};
        int target = Integer.parseInt(parts[4].trim());
        Map<Integer,Integer> map = new HashMap<>();
        for(int i=0;i<nums.length;i++){
            if(map.containsKey(target-nums[i])){ System.out.println("["+map.get(target-nums[i])+","+i+"]"); return; }
            map.put(nums[i],i);
        }
    }
}
EOF
echo "[[2,7,11,15],9]" | sh -c "cd /tmp/ts && javac -cp \".:$CP\" Solution.java && java -cp \".:$CP\" Solution"' "[0,1]"

# ── C ─────────────────────────────────────────────────────────────────────────
echo ""
echo "🔵 C (code2day-c:latest)"
check "gcc exists"      code2day-c:latest "gcc --version | head -1"  "gcc"
check "boost headers"   code2day-c:latest "ls /usr/include/boost/version.hpp 2>/dev/null && echo found" "found"
check "two-sum exec"    code2day-c:latest 'cat > /tmp/sol.c << '"'"'EOF'"'"'
#include <stdio.h>
#include <stdlib.h>
int main(){
    int nums[]={2,7,11,15}, target=9, n=4;
    for(int i=0;i<n;i++) for(int j=i+1;j<n;j++)
        if(nums[i]+nums[j]==target){ printf("[%d,%d]\n",i,j); return 0; }
    return 0;
}
EOF
gcc /tmp/sol.c -o /tmp/sol && /tmp/sol' "[0,1]"

# ── C++ ───────────────────────────────────────────────────────────────────────
echo ""
echo "🔷 C++ (code2day-cpp:latest)"
check "g++ exists"      code2day-cpp:latest "g++ --version | head -1"  "g++"
check "boost graph"     code2day-cpp:latest "ls /usr/include/boost/graph/adjacency_list.hpp 2>/dev/null && echo found" "found"
check "eigen"           code2day-cpp:latest "ls /usr/include/eigen3/Eigen/Dense 2>/dev/null && echo found" "found"
check "gmp"             code2day-cpp:latest "ls /usr/include/gmpxx.h 2>/dev/null && echo found" "found"
check "two-sum exec"    code2day-cpp:latest 'cat > /tmp/sol.cpp << '"'"'EOF'"'"'
#include <bits/stdc++.h>
using namespace std;
int main(){
    vector<int> nums={2,7,11,15}; int target=9;
    map<int,int> m;
    for(int i=0;i<(int)nums.size();i++){
        if(m.count(target-nums[i])){ cout<<"["<<m[target-nums[i]]<<","<<i<<"]"<<endl; return 0; }
        m[nums[i]]=i;
    }
}
EOF
g++ -std=c++17 /tmp/sol.cpp -o /tmp/sol && /tmp/sol' "[0,1]"

# ── SQL ───────────────────────────────────────────────────────────────────────
echo ""
echo "🗄️  SQL (code2day-sql:latest)"
check "sqlite3 exists"  code2day-sql:latest "sqlite3 --version"  "3."
check "query exec"      code2day-sql:latest 'cat > /tmp/sol.sql << '"'"'EOF'"'"'
CREATE TABLE nums(id INTEGER, val INTEGER);
INSERT INTO nums VALUES (0,2),(1,7),(2,11),(3,15);
SELECT val FROM nums WHERE val = 7;
EOF
sqlite3 :memory: < /tmp/sol.sql' "7"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
    echo "  ✅ All checks passed!"
else
    echo "  ❌ Some checks failed — rebuild images"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
exit $FAIL
