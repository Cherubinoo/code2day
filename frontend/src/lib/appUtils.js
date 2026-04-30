import { fallbackProblems, languageOptions } from "./appData";

export function extractApiError(payload, fallbackMessage) {
  if (!payload || typeof payload !== "object") {
    return fallbackMessage;
  }

  if (payload.detail) {
    return payload.detail;
  }

  const firstEntry = Object.values(payload)[0];
  if (Array.isArray(firstEntry) && firstEntry.length > 0) {
    return firstEntry[0];
  }

  return fallbackMessage;
}

export function getCsrfToken() {
  // Try to get CSRF token from meta tag first (set by Django in HTML)
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag && metaTag.content) {
    return metaTag.content;
  }

  // Fallback: Try to get from X-CSRFToken response header (if available)
  // This would need to be stored after first API call
  const storedToken = sessionStorage.getItem('csrftoken');
  if (storedToken) {
    return storedToken;
  }

  // Last resort: Try old method (for backward compatibility, though cookie is HttpOnly now)
  try {
    const csrfCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("csrftoken="));
    if (csrfCookie) {
      const token = decodeURIComponent(csrfCookie.split("=").slice(1).join("="));
      return token;
    }
  } catch (e) {
    // Cookie is HttpOnly, can't read
  }

  return "";
}

export function buildJsonPostOptions(payload) {
  const csrfToken = getCsrfToken();
  const headers = {
    "Content-Type": "application/json",
  };

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  return {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  };
}

export function normalizeProblems(problems) {
  return problems.map((problem) => {
    const fallback = fallbackProblems.find((item) => item.slug === problem.slug);
    return {
      ...problem,
      progress_state: problem.progress_state ?? fallback?.progress_state ?? "not_completed",
      available_languages:
        problem.available_languages ?? fallback?.available_languages ?? languageOptions,
      examples: problem.examples ?? fallback?.examples ?? [],
      hints: problem.hints ?? fallback?.hints ?? [],
      editorial: problem.editorial ?? fallback?.editorial ?? "",
    };
  });
}

export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function estimateComplexity(code, language) {
  const normalized = code.toLowerCase();
  const nestedLoops =
    /(for|while).*(for|while)/s.test(normalized) ||
    (normalized.match(/\bfor\b/g) ?? []).length > 1;
  const hasSort = normalized.includes("sort(") || normalized.includes("order by");
  const hasBinarySearch =
    normalized.includes("binary") ||
    normalized.includes("mid") ||
    normalized.includes("left <=");
  const usesHashing =
    normalized.includes("map(") ||
    normalized.includes("new map") ||
    normalized.includes("hash") ||
    normalized.includes("dictionary");

  let time = "O(n)";
  let space = usesHashing ? "O(n)" : "O(1)";
  let note = "Linear scan style solution with a single main pass.";

  if (language === "SQL") {
    time = normalized.includes("join") && normalized.includes("group by") ? "O(n log n)" : "O(n)";
    space = "Depends on query planner";
    note = "Query estimate is heuristic until the SQL executor is connected.";
  } else if (nestedLoops) {
    time = "O(n^2)";
    space = usesHashing ? "O(n)" : "O(1)";
    note = "Nested iteration detected, so this likely grows quadratically.";
  } else if (hasSort) {
    time = "O(n log n)";
    space = usesHashing ? "O(n)" : "O(log n)";
    note = "Sorting is present, so runtime is likely driven by ordering work.";
  } else if (hasBinarySearch) {
    time = "O(log n)";
    space = "O(1)";
    note = "Binary-search style pointer updates were detected.";
  } else if (usesHashing) {
    time = "O(n)";
    space = "O(n)";
    note = "Hash-based lookup suggests linear time with extra memory.";
  }

  return {
    time,
    space,
    note,
    confidence: "Frontend estimate only. Backend compiler analysis will replace this later.",
  };
}
