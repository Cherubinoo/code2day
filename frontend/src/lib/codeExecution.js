import { buildJsonPostOptions, extractApiError } from "./appUtils";

// Clean language names (no versions) mapped to Judge0 IDs
export const executionLanguageMap = {
  "Assembly": 45,
  "Bash": 46,
  "Basic": 47,
  "C": 50,
  "C#": 51,
  "C++": 54,
  "Clojure": 86,
  "COBOL": 77,
  "Common Lisp": 55,
  "D": 56,
  "Elixir": 57,
  "Erlang": 58,
  "F#": 87,
  "Fortran": 59,
  "Go": 60,
  "Groovy": 88,
  "Haskell": 61,
  "Java": 62,
  "JavaScript": 63,
  "Kotlin": 78,
  "Lua": 64,
  "Objective-C": 79,
  "OCaml": 65,
  "Octave": 66,
  "Pascal": 67,
  "Perl": 85,
  "PHP": 68,
  "Prolog": 69,
  "Python": 71,
  "R": 80,
  "Ruby": 72,
  "Rust": 73,
  "Scala": 81,
  "Swift": 83,
  "TypeScript": 74,
};

// Map clean names to Monaco editor language modes
export const editorLanguageMap = {
  "Assembly": "assembly",
  "Bash": "shell",
  "Basic": "basic",
  "C": "c",
  "C#": "csharp",
  "C++": "cpp",
  "Clojure": "clojure",
  "COBOL": "cobol",
  "Common Lisp": "lisp",
  "D": "d",
  "Elixir": "elixir",
  "Erlang": "erlang",
  "F#": "fsharp",
  "Fortran": "fortran",
  "Go": "go",
  "Groovy": "groovy",
  "Haskell": "haskell",
  "Java": "java",
  "JavaScript": "javascript",
  "Kotlin": "kotlin",
  "Lua": "lua",
  "Objective-C": "objective-c",
  "OCaml": "ocaml",
  "Octave": "octave",
  "Pascal": "pascal",
  "Perl": "perl",
  "PHP": "php",
  "Prolog": "prolog",
  "Python": "python",
  "R": "r",
  "Ruby": "ruby",
  "Rust": "rust",
  "Scala": "scala",
  "Swift": "swift",
  "TypeScript": "typescript",
};

export function getLanguageIdForChoice(language) {
  return executionLanguageMap[language] ?? null;
}

export async function runCodeExecution({
  sourceCode,
  language,
  stdin = "",
  problemSlug = "",
  isSubmit = false,
}) {
  const languageId = getLanguageIdForChoice(language);

  if (!languageId) {
    return {
      status: "Unsupported Language",
      stdout: "",
      stderr: "",
      compile_output: "",
      output: `Execution is not available for ${language} yet.`,
      time: "",
      memory: "",
    };
  }

  const response = await fetch(
    "/api/run/",
    buildJsonPostOptions({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
      language,
      problem_slug: problemSlug,
      is_submit: isSubmit,
    }),
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractApiError(payload, "Execution failed."));
  }

  return payload;
}
