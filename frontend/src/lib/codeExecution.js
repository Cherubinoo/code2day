import { buildJsonPostOptions, extractApiError } from "./appUtils";

// Clean language names (no versions) mapped to Judge0 IDs
export const executionLanguageMap = {
  "C": 50,
  "C++": 54,
  "Java": 62,
  "JavaScript": 63,
  "Python": 71,
};

// Map clean names to Monaco editor language modes
export const editorLanguageMap = {
  "C": "c",
  "C++": "cpp",
  "Java": "java",
  "JavaScript": "javascript",
  "Python": "python",
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
