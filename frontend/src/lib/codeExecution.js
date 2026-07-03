import { buildJsonPostOptions, extractApiError } from "./appUtils";

// Clean language names (no versions) mapped to Judge0 IDs
export const executionLanguageMap = {
  "C": 50,
  "C++": 54,
  "Java": 62,
  "Python": 71,
  "SQL": 82,
};

// Map clean names to Monaco editor language modes
export const editorLanguageMap = {
  "C": "c",
  "C++": "cpp",
  "Java": "java",
  "Python": "python",
  "SQL": "sql",
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

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Server/proxy returned an HTML error page (502/504/etc.) instead of JSON.
    if (response.status >= 500) {
      throw new Error("The execution server is temporarily unavailable. Please try again in a moment.");
    }
    throw new Error(`Execution failed (HTTP ${response.status}). Please try again.`);
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(extractApiError(payload, "Execution failed."));
  }

  return payload;
}
