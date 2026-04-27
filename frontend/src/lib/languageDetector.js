// Language detection and validation utilities

/**
 * Validates if the detected language matches the selected language
 * @param {string} detectedLanguage - The language detected from code analysis
 * @param {string} selectedLanguage - The language selected by the user
 * @returns {boolean} - True if languages match or are compatible
 */
export function validateLanguageMatch(detectedLanguage, selectedLanguage) {
  if (!detectedLanguage || !selectedLanguage) {
    return true; // Allow if either is not specified
  }

  // Normalize language names for comparison
  const normalize = (lang) => lang.toLowerCase().trim();
  const detected = normalize(detectedLanguage);
  const selected = normalize(selectedLanguage);

  // Direct match
  if (detected === selected) {
    return true;
  }

  // Handle common language aliases and variations
  const languageAliases = {
    'javascript': ['js', 'node', 'nodejs'],
    'typescript': ['ts'],
    'python': ['py', 'python3'],
    'c++': ['cpp', 'cxx', 'cc'],
    'c#': ['csharp', 'cs'],
    'java': ['jvm'],
    'php': ['php7', 'php8'],
    'ruby': ['rb'],
    'go': ['golang'],
    'rust': ['rs'],
    'kotlin': ['kt'],
    'swift': ['ios'],
    'objective-c': ['objc'],
    'scala': ['sc'],
    'perl': ['pl'],
    'r': ['rlang'],
    'matlab': ['m'],
    'shell': ['bash', 'sh', 'zsh'],
    'powershell': ['ps1'],
    'sql': ['mysql', 'postgresql', 'sqlite'],
    'html': ['htm'],
    'css': ['scss', 'sass', 'less'],
    'xml': ['xhtml'],
    'json': ['jsonc'],
    'yaml': ['yml'],
    'markdown': ['md'],
  };

  // Check if selected language has aliases that match detected
  for (const [mainLang, aliases] of Object.entries(languageAliases)) {
    if (selected === mainLang && aliases.includes(detected)) {
      return true;
    }
    if (detected === mainLang && aliases.includes(selected)) {
      return true;
    }
  }

  // Check if both are in the same alias group
  for (const [mainLang, aliases] of Object.entries(languageAliases)) {
    const allVariants = [mainLang, ...aliases];
    if (allVariants.includes(detected) && allVariants.includes(selected)) {
      return true;
    }
  }

  return false;
}

/**
 * Gets a user-friendly error message for language mismatch
 * @param {string} detectedLanguage - The language detected from code analysis
 * @param {string} selectedLanguage - The language selected by the user
 * @returns {string} - Error message explaining the mismatch
 */
export function getLanguageMismatchError(detectedLanguage, selectedLanguage) {
  if (!detectedLanguage || !selectedLanguage) {
    return "Unable to validate language compatibility.";
  }

  return `Language mismatch detected. Your code appears to be written in ${detectedLanguage}, but you've selected ${selectedLanguage}. Please either change your code or select the correct language.`;
}

/**
 * Attempts to detect the programming language from code content
 * @param {string} code - The code to analyze
 * @returns {string|null} - Detected language or null if unable to detect
 */
export function detectLanguageFromCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const codeLines = code.trim().split('\n');
  const firstLine = codeLines[0]?.trim() || '';
  const codeContent = code.toLowerCase();

  // Check for specific language patterns
  
  // Python
  if (codeContent.includes('def ') || codeContent.includes('import ') || 
      codeContent.includes('from ') || codeContent.includes('print(') ||
      firstLine.startsWith('#!') && firstLine.includes('python')) {
    return 'Python';
  }

  // JavaScript/Node.js
  if (codeContent.includes('function ') || codeContent.includes('const ') ||
      codeContent.includes('let ') || codeContent.includes('var ') ||
      codeContent.includes('console.log') || codeContent.includes('require(') ||
      codeContent.includes('import ') && codeContent.includes('from ')) {
    return 'JavaScript';
  }

  // Java
  if (codeContent.includes('public class ') || codeContent.includes('public static void main') ||
      codeContent.includes('system.out.print') || codeContent.includes('package ')) {
    return 'Java';
  }

  // C++
  if (codeContent.includes('#include') || codeContent.includes('std::') ||
      codeContent.includes('cout') || codeContent.includes('cin') ||
      codeContent.includes('using namespace std')) {
    return 'C++';
  }

  // C
  if (codeContent.includes('#include') && (codeContent.includes('printf') ||
      codeContent.includes('scanf') || codeContent.includes('main('))) {
    return 'C';
  }

  // C#
  if (codeContent.includes('using system') || codeContent.includes('console.write') ||
      codeContent.includes('namespace ') || codeContent.includes('public static void main')) {
    return 'C#';
  }

  // PHP
  if (codeContent.includes('<?php') || codeContent.includes('echo ') ||
      codeContent.includes('$') && (codeContent.includes('function ') || codeContent.includes('class '))) {
    return 'PHP';
  }

  // Ruby
  if (codeContent.includes('puts ') || codeContent.includes('def ') ||
      codeContent.includes('end') || firstLine.startsWith('#!') && firstLine.includes('ruby')) {
    return 'Ruby';
  }

  // Go
  if (codeContent.includes('package main') || codeContent.includes('func main') ||
      codeContent.includes('fmt.print') || codeContent.includes('import (')) {
    return 'Go';
  }

  // Rust
  if (codeContent.includes('fn main') || codeContent.includes('println!') ||
      codeContent.includes('use std::') || codeContent.includes('let mut')) {
    return 'Rust';
  }

  return null;
}