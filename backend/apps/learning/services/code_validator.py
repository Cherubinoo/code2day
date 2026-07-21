"""
Code Validator - Pre-execution validation to prevent crashes and security issues.

Validates:
1. Code size limits
2. Dangerous patterns (infinite loops, file I/O, network access)
3. Syntax validity for each language
4. Resource consumption patterns
"""

import re
import json
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class ValidationError(Exception):
    """Raised when code fails validation."""
    pass


class CodeValidator:
    """Validates code submissions before sending to Judge0."""
    
    # Maximum file sizes (in KB)
    MAX_CODE_SIZE = {
        "Python": 500,
        "Java": 1000,
        "C": 300,
        "C++": 300,
        "JavaScript": 300,
        "C#": 500,
        "Go": 300,
        "Rust": 300,
    }
    
    # Patterns to avoid (security & stability)
    DANGEROUS_PATTERNS = {
        "Python": [
            (r'\bopen\s*\(', "File I/O not allowed"),
            (r'\b(?:exec|eval)\s*\(', "Dynamic code execution not allowed"),
            (r'\b__import__\s*\(', "Module import not allowed"),
            (r'\bos\.\w+\(', "System calls not allowed"),
            (r'\bsubprocess\.\w+\(', "Subprocess execution not allowed"),
            (r'\bsocket\.\w+\(', "Network access not allowed"),
            (r'\b(?:requests|urllib)\.\w+\(', "HTTP requests not allowed"),
        ],
        "Java": [
            (r'\bnew\s+File\s*\(', "File I/O not allowed"),
            (r'\bFileInputStream|FileOutputStream|FileReader|FileWriter', "File I/O not allowed"),
            (r'\bRuntime\.getRuntime\(\)\.exec\(', "System commands not allowed"),
            (r'\bSystem\.exit\s*\(', "System.exit not allowed"),
            (r'\bSocket|ServerSocket|DatagramSocket', "Network access not allowed"),
            (r'\bURL\s*\(', "Network access not allowed"),
        ],
        "C": [
            (r'\b(?:open|fopen|fread|fwrite)\s*\(', "File I/O not allowed"),
            (r'\b(?:system|exec[lv]\w*)\s*\(', "System calls not allowed"),
            (r'\b(?:socket|connect)\s*\(', "Network access not allowed"),
        ],
        "C++": [
            (r'\bstd::(?:ifstream|ofstream|fstream)', "File I/O not allowed"),
            (r'\b(?:system|exec[lv]\w*)\s*\(', "System calls not allowed"),
            (r'\b(?:socket|connect)\s*\(', "Network access not allowed"),
        ],
        "JavaScript": [
            (r'\brequire\s*\(\s*[\'"]fs[\'"]\)', "File I/O not allowed"),
            (r'\brequire\s*\(\s*[\'"]child_process[\'"]\)', "System calls not allowed"),
            (r'\bfs\.(?:read|write|open)', "File I/O not allowed"),
            (r'\bchild_process\.exec\s*\(|\bspawn\s*\(', "System calls not allowed"),
        ],
    }
    
    # Infinite loop patterns
    INFINITE_LOOP_PATTERNS = {
        "Python": [
            r'while\s*\(\s*(?:True|1)\s*\)',
            r'for\s+\w+\s+in\s+iter\s*\(\s*int\s*,\s*1\s*\)',
        ],
        "Java": [
            r'while\s*\(\s*(?:true|1)\s*\)',
            r'for\s*\(\s*;\s*true\s*;',
        ],
        "C": [
            r'while\s*\(\s*(?:1|true)\s*\)',
            r'for\s*\(\s*;\s*1\s*;',
        ],
        "C++": [
            r'while\s*\(\s*(?:1|true)\s*\)',
            r'for\s*\(\s*;\s*1\s*;',
        ],
        "JavaScript": [
            r'while\s*\(\s*(?:true|1)\s*\)',
            r'for\s*\(\s*;\s*true\s*;',
        ],
    }
    
    @staticmethod
    def validate(language: str, source_code: str) -> Tuple[bool, Optional[str]]:
        """
        Validate code submission.
        
        Returns:
            (is_valid, error_message)
            - (True, None) if valid
            - (False, error_message) if invalid
        """
        try:
            # Check code size
            size_kb = len(source_code) / 1024
            max_size = CodeValidator.MAX_CODE_SIZE.get(language, 500)
            if size_kb > max_size:
                return False, f"Code exceeds maximum size ({size_kb:.1f}KB > {max_size}KB)"
            
            # Check for dangerous patterns
            if language in CodeValidator.DANGEROUS_PATTERNS:
                for pattern, message in CodeValidator.DANGEROUS_PATTERNS[language]:
                    if re.search(pattern, source_code, re.IGNORECASE | re.MULTILINE):
                        logger.warning("Dangerous pattern detected in %s: %s", language, message)
                        return False, f"Not allowed: {message}"
            
            # Check for infinite loops (heuristic warning, not blocking)
            if language in CodeValidator.INFINITE_LOOP_PATTERNS:
                for pattern in CodeValidator.INFINITE_LOOP_PATTERNS[language]:
                    if re.search(pattern, source_code, re.MULTILINE):
                        logger.warning("Suspicious infinite loop pattern in %s", language)
                        # Note: We warn but don't block - user may intentionally have infinite loop
            
            # Language-specific validation
            if language == "Python":
                return CodeValidator._validate_python(source_code)
            elif language == "Java":
                return CodeValidator._validate_java(source_code)
            elif language in ("C", "C++"):
                return CodeValidator._validate_c_cpp(language, source_code)
            elif language == "JavaScript":
                return CodeValidator._validate_javascript(source_code)
            
            return True, None
            
        except Exception as e:
            logger.exception("Validation error: %s", e)
            return False, f"Validation error: {str(e)}"
    
    @staticmethod
    def _validate_python(source_code: str) -> Tuple[bool, Optional[str]]:
        """Validate Python code."""
        try:
            compile(source_code, '<string>', 'exec')
            return True, None
        except SyntaxError as e:
            return False, f"Python syntax error: {e.msg}"
        except Exception as e:
            return False, f"Python validation error: {str(e)}"
    
    @staticmethod
    def _validate_java(source_code: str) -> Tuple[bool, Optional[str]]:
        """Validate Java code."""
        # Check for basic Java structure
        if not re.search(r'\bclass\s+\w+', source_code):
            return False, "Java code must define at least one class"
        
        # Check for balanced braces
        if source_code.count('{') != source_code.count('}'):
            return False, "Java code has unbalanced braces"
        
        return True, None
    
    @staticmethod
    def _validate_c_cpp(language: str, source_code: str) -> Tuple[bool, Optional[str]]:
        """Validate C/C++ code."""
        # Check for balanced braces
        if source_code.count('{') != source_code.count('}'):
            return False, f"{language} code has unbalanced braces"
        
        # Check for balanced parentheses
        if source_code.count('(') != source_code.count(')'):
            return False, f"{language} code has unbalanced parentheses"
        
        # Basic check for function definition
        if language == "C++":
            # C++ doesn't require main if it's a function solution
            pass
        else:
            # C should have main
            if not re.search(r'\bmain\s*\(', source_code):
                # Might be a function solution, allow it
                pass
        
        return True, None
    
    @staticmethod
    def _validate_javascript(source_code: str) -> Tuple[bool, Optional[str]]:
        """Validate JavaScript code."""
        # Check for balanced braces
        if source_code.count('{') != source_code.count('}'):
            return False, "JavaScript code has unbalanced braces"
        
        # Check for balanced parentheses
        if source_code.count('(') != source_code.count(')'):
            return False, "JavaScript code has unbalanced parentheses"
        
        return True, None


def validate_submission(language: str, source_code: str, stdin: str = "") -> Tuple[bool, Optional[str]]:
    """
    Main validation function for code submissions.
    
    Returns:
        (is_valid, error_message)
    """
    if not source_code or not source_code.strip():
        return False, "Source code cannot be empty"
    
    if not language or not language.strip():
        return False, "Language must be specified"
    
    # Check source code
    is_valid, error = CodeValidator.validate(language, source_code)
    if not is_valid:
        return False, error
    
    # Check stdin if provided
    if stdin and stdin.strip():
        try:
            # Try to parse as JSON if it looks like JSON
            if stdin.strip().startswith('[') or stdin.strip().startswith('{'):
                json.loads(stdin)
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON in stdin: {e}"
    
    return True, None
