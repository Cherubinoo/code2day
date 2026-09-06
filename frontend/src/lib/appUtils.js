import { fallbackProblems, languageOptions } from "./appData";

export async function safeParseJson(response, fallbackMessage = "Server communication error.") {
  try {
    const contentType = response.headers ? (response.headers.get("content-type") || "") : "";
    const text = await response.text();
    if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      return JSON.parse(text);
    }
    let msg = fallbackMessage;
    if (response.status === 404) {
      msg = "Service or endpoint not found (HTTP 404).";
    } else if (response.status === 500) {
      msg = "Internal server error (HTTP 500). Please check backend logs.";
    } else if (response.status === 502 || response.status === 503 || response.status === 504) {
      msg = "Server is temporarily unavailable or restarting (HTTP " + response.status + ").";
    } else if (response.status) {
      msg = `${fallbackMessage} (HTTP ${response.status})`;
    }
    return { detail: msg, error: msg };
  } catch (err) {
    return { detail: fallbackMessage, error: fallbackMessage };
  }
}

export function extractApiError(payload, fallbackMessage) {
  if (!payload || typeof payload !== "object") {
    return fallbackMessage;
  }

  if (payload.detail) {
    return payload.detail;
  }

  if (payload.error) {
    return payload.error;
  }

  const firstEntry = Object.values(payload)[0];
  if (Array.isArray(firstEntry) && firstEntry.length > 0) {
    return firstEntry[0];
  }

  return fallbackMessage;
}

export function getCsrfToken() {
  // Try to get CSRF token from sessionStorage first (cached from initialization)
  const storedToken = sessionStorage.getItem('csrftoken');
  if (storedToken) {
    return storedToken;
  }

  // Try to get CSRF token from meta tag (set by Django in HTML)
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag && metaTag.content) {
    sessionStorage.setItem('csrftoken', metaTag.content);
    return metaTag.content;
  }

  // If no token available, fetch it from the API endpoint synchronously
  // This is a fallback - not ideal but necessary for immediate use
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/csrf-token/', false); // synchronous request
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.withCredentials = true; // Include credentials for CSRF cookie
    xhr.send();
    
    if (xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const token = response.csrfToken;
      if (token) {
        sessionStorage.setItem('csrftoken', token);
        return token;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch CSRF token synchronously:', e);
  }

  return "";
}

// Async version for better performance
export async function getCsrfTokenAsync() {
  // Try sessionStorage first
  const storedToken = sessionStorage.getItem('csrftoken');
  if (storedToken) {
    return storedToken;
  }

  try {
    const response = await fetch('/api/csrf-token/', {
      method: 'GET',
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      const token = data.csrfToken;
      if (token) {
        sessionStorage.setItem('csrftoken', token);
        return token;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch CSRF token asynchronously:', e);
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

export function buildGetOptions() {
  const csrfToken = getCsrfToken();
  const headers = {};

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  return {
    method: "GET",
    credentials: "include",
    headers,
  };
}

// Clear CSRF token (useful when switching users)
export function clearCsrfToken() {
  sessionStorage.removeItem('csrftoken');
}

// Refresh CSRF token (useful after login/logout)
export async function refreshCsrfToken() {
  clearCsrfToken();
  return await getCsrfTokenAsync();
}

export function normalizeProblems(problems) {
  return problems.map((problem) => {
    const fallback = fallbackProblems.find((item) => item.slug === problem.slug);
    return {
      ...problem,
      progress_state: problem.progress_state ?? "not_completed",
      available_languages:
        problem.available_languages ?? fallback?.available_languages ?? languageOptions,
      examples: problem.examples ?? fallback?.examples ?? [],
      explanation: problem.explanation ?? fallback?.explanation ?? "",
      editorial: problem.editorial ?? fallback?.editorial ?? "",
    };
  });
}

export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Show MM:SS when under 1 hour, HH:MM:SS otherwise
  if (hours === 0) {
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

// `allowCopyPaste` may be a plain boolean (legacy — evaluated once, at
// mount), a ref object (`{ current: bool }`), or a zero-arg function —
// the latter two are read LIVE on every copy/cut/paste attempt rather
// than captured once when the editor mounts. That distinction matters:
// Monaco's onMount callback only ever fires once per editor instance, so
// a plain boolean captured there goes stale the moment the real
// permission changes afterward (e.g. a staff/HOD toggle takes effect, or
// the dashboard fetch that supplies it simply hadn't resolved yet at the
// exact moment the editor mounted) — and previously had no way to
// recover, since it also permanently rebound Ctrl+C/V/X to a no-op for
// the lifetime of that editor instance. Pass a ref/getter that reads
// from your latest React state so a permission change actually takes
// effect without requiring the editor to remount.
function resolveAllowCopyPaste(allowCopyPaste) {
  if (typeof allowCopyPaste === "function") return Boolean(allowCopyPaste());
  if (allowCopyPaste && typeof allowCopyPaste === "object" && "current" in allowCopyPaste) {
    return Boolean(allowCopyPaste.current);
  }
  return Boolean(allowCopyPaste);
}

export function configureEditorProtection(editor, monaco, allowCopyPaste = false) {
  if (!editor) return;

  try {
    const domNode = editor.getDomNode();
    if (domNode) {
      const preventAction = (e) => {
        if (resolveAllowCopyPaste(allowCopyPaste)) return;
        e.preventDefault();
        e.stopPropagation();
        return false;
      };

      domNode.addEventListener("copy", preventAction, true);
      domNode.addEventListener("cut", preventAction, true);
      domNode.addEventListener("paste", preventAction, true);
      domNode.addEventListener("dragstart", preventAction, true);
      domNode.addEventListener("dragover", preventAction, true);
      domNode.addEventListener("drop", preventAction, true);
      domNode.addEventListener("contextmenu", preventAction, true);
    }
  } catch (err) {
    console.warn("Could not attach DOM protection listeners:", err);
  }

  // Deliberately no Monaco addCommand overrides for Ctrl+C/V/X here — those
  // rebind the keybinding for the editor instance's entire lifetime with no
  // way to un-bind it later, which is exactly what used to permanently latch
  // copy/paste blocked for a session. The DOM-level listeners above already
  // cover the keyboard-shortcut path (a native copy/cut/paste ClipboardEvent
  // still fires and bubbles to domNode first) as well as the right-click-menu
  // path, and they re-check the live permission on every attempt instead of
  // baking in whatever it was at mount time.
}

// Returns a youtube.com/embed/<id> iframe src if the URL is a recognizable
// YouTube link (watch?v=, youtu.be/, already an /embed/ link, or /shorts/),
// otherwise null — used to auto-embed video resources instead of just
// linking out to them.
export function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.pathname.startsWith('/embed/')) return url;
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)$/i;

// Classifies a subtopic multimedia URL for smart rendering, since those
// are stored as plain {label, url} with no explicit type: 'youtube'
// (embed as video), 'image' (render as <img>), 'video' (render as
// <video>), or 'link' (plain external link card) as the fallback.
export function getMediaKind(url) {
  if (!url) return 'link';
  if (getYoutubeEmbedUrl(url)) return 'youtube';
  const path = url.split('?')[0].split('#')[0];
  if (IMAGE_EXTENSIONS.test(path)) return 'image';
  if (VIDEO_EXTENSIONS.test(path)) return 'video';
  return 'link';
}
