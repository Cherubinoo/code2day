"""
Complexity Analysis Service

This module provides functionality to analyze source code and estimate
time and space complexity using heuristics and AST parsing.
"""

import ast
import re
from typing import Optional, Tuple


class ComplexityAnalyzer:
    """Analyzes source code to estimate time and space complexity."""
    
    # Patterns for different complexity classes
    LOG_PATTERNS = [
        r'\bwhile\s+.*\s*<\s*.*\s*:\s*.*\*\s*=\s*\d+',  # i *= 2 type loops
        r'\bwhile\s+.*:\s*.*//=\s*2',  # i //= 2 type loops
        r'\bbisect\.',  # Binary search
        r'\bheapq\.',  # Heap operations
        r'\.sort\(\)|sorted\(',  # O(n log n) sorts
    ]
    
    N_LOG_N_PATTERNS = [
        r'\bfor\b.*:\s*\bfor\b.*:\s*.*sort',  # Nested loop with sort
        r'divide.*conquer',  # Divide and conquer
        r'\bmerge_sort\b|\bquick_sort\b|\bheap_sort\b',  # N log N algorithms
    ]
    
    EXPONENTIAL_PATTERNS = [
        r'\bdef\s+\w+\(.*\):\s*.*\b\w+\(.*\-?\s*1?\)',  # Recursive with n-1
        r'\bdef\s+\w+\(.*\):\s*.*\b\w+\(.*\-?\s*2?\)',  # Recursive with n-2
        r'fibonacci|fib\(',  # Fibonacci
        r'\bdef\s+\w+\(.*\):\s*.*\b\w+\(.*\)\s*\+\s*\b\w+\(',  # Multiple recursive calls
    ]
    
    def __init__(self, source_code: str, language: str = "python"):
        self.source_code = source_code
        self.language = language.lower()
        self.time_complexity = "O(?)"
        self.space_complexity = "O(?)"
    
    def analyze(self) -> Tuple[str, str]:
        """Analyze the source code and return time and space complexity."""
        if self.language in ["python", "py"]:
            return self._analyze_python()
        elif self.language in ["javascript", "typescript", "js", "ts"]:
            return self._analyze_javascript()
        elif self.language in ["java", "kotlin", "c#", "csharp", "scala"]:
            return self._analyze_c_family()
        elif self.language in ["c++", "cpp", "c"]:
            return self._analyze_c_family()
        else:
            return self._analyze_generic()
    
    def _analyze_python(self) -> Tuple[str, str]:
        """Analyze Python code using AST parsing."""
        try:
            tree = ast.parse(self.source_code)
        except SyntaxError:
            return self._analyze_generic()
        
        # Initialize counters
        max_loop_depth = 0
        current_depth = 0
        has_recursion = False
        has_sort = False
        has_binary_search = False
        has_hash_map = False
        
        function_names = set()
        
        # First pass: collect function names
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                function_names.add(node.name)
        
        # Second pass: analyze complexity
        def analyze_node(node, depth=0):
            nonlocal max_loop_depth, has_recursion, has_sort, has_binary_search, has_hash_map
            
            if isinstance(node, (ast.For, ast.While)):
                depth += 1
                max_loop_depth = max(max_loop_depth, depth)
                
                # Check for binary search pattern (while lo < hi: mid = (lo+hi)//2)
                if isinstance(node, ast.While):
                    body_str = ast.unparse(node) if hasattr(ast, 'unparse') else ""
                    if any(x in body_str for x in ['//= 2', '/= 2', '*= 2', 'mid']):
                        has_binary_search = True
            
            elif isinstance(node, ast.Call):
                # Check for sort calls
                if isinstance(node.func, ast.Attribute):
                    if node.func.attr in ['sort', 'sorted']:
                        has_sort = True
                elif isinstance(node.func, ast.Name):
                    if node.func.id in ['sorted', 'sort']:
                        has_sort = True
                    # Check for recursion
                    if node.func.id in function_names:
                        has_recursion = True
                    # Check for binary search related
                    if node.func.id in ['bisect_left', 'bisect_right', 'bisect']:
                        has_binary_search = True
            
            elif isinstance(node, ast.Dict):
                has_hash_map = True
            
            elif isinstance(node, ast.Subscript):
                # Could be hash map access
                pass
            
            # Recursively analyze children
            for child in ast.iter_child_nodes(node):
                analyze_node(child, depth)
        
        analyze_node(tree)
        
        # Determine time complexity
        if has_recursion:
            # Check for memoization
            if 'cache' in self.source_code or 'lru_cache' in self.source_code or 'memo' in self.source_code:
                self.time_complexity = "O(n)"
            else:
                self.time_complexity = "O(2^n)"  # Default for simple recursion
        elif has_binary_search or (max_loop_depth == 1 and any(x in self.source_code for x in ['//= 2', '*= 2'])):
            self.time_complexity = "O(log n)"
        elif max_loop_depth == 0:
            if has_sort:
                self.time_complexity = "O(n log n)"
            else:
                self.time_complexity = "O(1)"
        elif max_loop_depth == 1:
            if has_sort:
                self.time_complexity = "O(n log n)"
            else:
                self.time_complexity = "O(n)"
        elif max_loop_depth == 2:
            if has_sort:
                self.time_complexity = "O(n² log n)"
            else:
                self.time_complexity = "O(n²)"
        elif max_loop_depth == 3:
            self.time_complexity = "O(n³)"
        else:
            self.time_complexity = f"O(n^{max_loop_depth})"
        
        # Determine space complexity
        if has_recursion and 'memo' not in self.source_code:
            self.space_complexity = "O(n)"  # Recursion stack
        elif max_loop_depth >= 2 and has_sort:
            self.space_complexity = "O(n)"  # Sorting requires extra space
        elif has_hash_map:
            self.space_complexity = "O(n)"  # Hash map storage
        elif max_loop_depth >= 1:
            self.space_complexity = "O(1)"  # Constant extra space
        else:
            self.space_complexity = "O(1)"
        
        return self.time_complexity, self.space_complexity
    
    def _analyze_javascript(self) -> Tuple[str, str]:
        """Analyze JavaScript/TypeScript code using regex patterns."""
        code = self.source_code
        
        # Count nested loops
        max_depth = 0
        current_depth = 0
        
        # Simple loop depth analysis
        lines = code.split('\n')
        for line in lines:
            stripped = line.strip()
            
            # Check for loop starts
            if re.search(r'\b(for|while)\s*\(', stripped):
                if '{' in stripped or stripped.endswith(')'):
                    current_depth += 1
                    max_depth = max(max_depth, current_depth)
            
            # Check for block ends (simplified)
            if '}' in stripped and not stripped.startswith('//'):
                if current_depth > 0:
                    current_depth -= 1
        
        # Check for sort
        has_sort = any(x in code for x in ['.sort(', 'sorted(', 'mergeSort', 'quickSort', 'heapSort'])
        
        # Check for recursion
        has_recursion = False
        function_matches = re.findall(r'function\s+(\w+)', code)
        for func_name in function_matches:
            if re.search(rf'\b{func_name}\s*\(', code.split(f'function {func_name}')[1] if f'function {func_name}' in code else ""):
                has_recursion = True
                break
        
        # Check for binary search patterns
        has_binary_search = any(x in code for x in ['mid', 'Math.floor', '>> 1', '/ 2'])
        
        # Determine complexity
        if has_recursion:
            self.time_complexity = "O(2^n)"
        elif has_binary_search:
            self.time_complexity = "O(log n)"
        elif max_depth == 0:
            self.time_complexity = "O(n log n)" if has_sort else "O(1)"
        elif max_depth == 1:
            self.time_complexity = "O(n log n)" if has_sort else "O(n)"
        elif max_depth == 2:
            self.time_complexity = "O(n²)"
        elif max_depth == 3:
            self.time_complexity = "O(n³)"
        else:
            self.time_complexity = f"O(n^{max_depth})"
        
        # Space complexity
        if has_recursion:
            self.space_complexity = "O(n)"
        elif has_sort:
            self.space_complexity = "O(n)"
        elif 'Map(' in code or 'Set(' in code or '{}' in code:
            self.space_complexity = "O(n)"
        else:
            self.space_complexity = "O(1)"
        
        return self.time_complexity, self.space_complexity
    
    def _analyze_c_family(self) -> Tuple[str, str]:
        """Analyze C/C++/Java/C# code using regex patterns."""
        code = self.source_code
        
        # Count nested loops
        max_depth = 0
        current_depth = 0
        
        lines = code.split('\n')
        for line in lines:
            stripped = line.strip()
            
            # Check for loop starts
            if re.search(r'\b(for|while)\s*\(', stripped):
                current_depth += 1
                max_depth = max(max_depth, current_depth)
            
            # Check for block ends
            if '}' in stripped:
                if current_depth > 0:
                    current_depth -= 1
        
        # Check for sort
        has_sort = any(x in code for x in ['sort(', 'qsort(', 'Collections.sort', 'Arrays.sort'])
        
        # Check for recursion
        has_recursion = False
        # Look for function calls inside function definitions
        function_pattern = r'(?:int|void|bool|char|float|double|string)\s+(\w+)\s*\([^)]*\)\s*\{'
        functions = re.findall(function_pattern, code)
        for func in functions:
            func_body = code.split(func, 1)[-1] if func in code else ""
            if re.search(rf'\b{func}\s*\(', func_body):
                has_recursion = True
                break
        
        # Check for binary search
        has_binary_search = any(x in code for x in ['mid', 'left + (right - left)', '/ 2', '>> 1'])
        
        # Check for hash map
        has_hash = any(x in code for x in ['HashMap', 'unordered_map', 'map<', 'dict'])
        
        # Determine complexity
        if has_recursion:
            self.time_complexity = "O(2^n)"
        elif has_binary_search:
            self.time_complexity = "O(log n)"
        elif max_depth == 0:
            self.time_complexity = "O(n log n)" if has_sort else "O(1)"
        elif max_depth == 1:
            self.time_complexity = "O(n log n)" if has_sort else "O(n)"
        elif max_depth == 2:
            self.time_complexity = "O(n²)"
        elif max_depth == 3:
            self.time_complexity = "O(n³)"
        else:
            self.time_complexity = f"O(n^{max_depth})"
        
        # Space complexity
        if has_recursion:
            self.space_complexity = "O(n)"
        elif has_sort:
            self.space_complexity = "O(n)"
        elif has_hash:
            self.space_complexity = "O(n)"
        else:
            self.space_complexity = "O(1)"
        
        return self.time_complexity, self.space_complexity
    
    def _analyze_generic(self) -> Tuple[str, str]:
        """Generic analysis based on simple heuristics."""
        code = self.source_code
        
        # Count loop keywords
        for_count = len(re.findall(r'\bfor\b', code))
        while_count = len(re.findall(r'\bwhile\b', code))
        total_loops = for_count + while_count
        
        # Check for recursion
        has_recursion = 'recursion' in code.lower() or 'recursive' in code.lower()
        
        # Check for sort
        has_sort = 'sort' in code.lower()
        
        if has_recursion:
            self.time_complexity = "O(2^n)"
            self.space_complexity = "O(n)"
        elif total_loops == 0:
            self.time_complexity = "O(n log n)" if has_sort else "O(1)"
            self.space_complexity = "O(1)"
        elif total_loops == 1:
            self.time_complexity = "O(n)"
            self.space_complexity = "O(1)"
        elif total_loops == 2:
            self.time_complexity = "O(n²)"
            self.space_complexity = "O(1)"
        elif total_loops == 3:
            self.time_complexity = "O(n³)"
            self.space_complexity = "O(1)"
        else:
            self.time_complexity = f"O(n^{total_loops})"
            self.space_complexity = "O(1)"
        
        return self.time_complexity, self.space_complexity


def calculate_complexity(source_code: str, language: str = "python") -> Tuple[str, str]:
    """
    Calculate time and space complexity for given source code.
    
    Args:
        source_code: The source code to analyze
        language: The programming language
        
    Returns:
        Tuple of (time_complexity, space_complexity)
    """
    analyzer = ComplexityAnalyzer(source_code, language)
    return analyzer.analyze()
