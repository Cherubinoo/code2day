// Browser-extension guard for student contest sessions.
//
// Extensions cannot be fully enumerated from a web page, but any extension that
// actually touches the page (content scripts that inject scripts/styles/images,
// iframes, or DOM nodes referencing an `*-extension://` URL) leaves traces we
// can find. This module detects those traces and drives a blocking overlay so a
// student can't sit the exam with such an extension active.

import { useCallback, useEffect, useRef, useState } from 'react';

const EXT_PROTOCOLS = [
  'chrome-extension://',
  'moz-extension://',
  'safari-web-extension://',
  'ms-browser-extension://',
  'extension://',
];

const hasExtUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  return EXT_PROTOCOLS.some((p) => value.includes(p));
};

// Highly specific DOM signatures left by well-known "answer / solver / AI
// helper / remote-control" extensions used to cheat. Kept deliberately narrow
// (unique ids / attributes, not generic class names) to avoid false positives
// from password managers, spell checkers, etc.
const KNOWN_MARKERS = [
  '[id^="crx-"]',
  '[class*="__cheat"]',
  'div[data-extension-id]',
  '#gpt-answer-helper',
  '#quiz-solver-root',
  '.chatgpt-sidebar-container',
  '#chatgpt-quiz-helper',
  'iframe[src*="-extension://"]',
];

function scanResourceTiming() {
  const hits = [];
  try {
    const entries = performance.getEntriesByType('resource') || [];
    for (const e of entries) {
      if (hasExtUrl(e.name)) hits.push(e.name.split('/').slice(0, 3).join('/') + '/…');
    }
  } catch { /* performance API unavailable */ }
  return hits;
}

function scanDom() {
  const hits = [];
  try {
    const nodes = document.querySelectorAll(
      'script[src], link[href], iframe[src], img[src], embed[src], object[data], [style*="extension://"]'
    );
    for (const el of nodes) {
      const ref = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data') || el.getAttribute('style') || '';
      if (hasExtUrl(ref)) hits.push(`<${el.tagName.toLowerCase()}> ${ref.split('/').slice(0, 3).join('/')}/…`);
    }
    // Inline <style> blocks that pull extension assets
    for (const st of document.querySelectorAll('style')) {
      if (hasExtUrl(st.textContent)) hits.push('<style> extension asset');
    }
    // Known helper-extension DOM signatures
    for (const sel of KNOWN_MARKERS) {
      try {
        if (document.querySelector(sel)) hits.push(`marker ${sel}`);
      } catch { /* bad selector on this engine */ }
    }
  } catch { /* DOM not ready */ }
  return hits;
}

// Returns a de-duplicated list of human-readable detection strings. Empty = clean.
export function detectExtensions() {
  const found = new Set([...scanResourceTiming(), ...scanDom()]);
  return [...found];
}

/**
 * React hook: runs the guard while `active` is true.
 * Returns { blocked, details, recheck }.
 *  - blocked: true once any extension trace is seen (latches on so a student
 *    can't briefly disable → act → re-enable; clears only via `recheck`)
 *  - details: the detection strings behind the current block
 *  - recheck: re-scan now; clears the block only if nothing is detected
 */
export function useExtensionGuard({ active = true } = {}) {
  const [blocked, setBlocked] = useState(false);
  const [details, setDetails] = useState([]);
  const observerRef = useRef(null);
  const intervalRef = useRef(null);

  const runScan = useCallback(() => {
    const found = detectExtensions();
    if (found.length) {
      setDetails(found);
      setBlocked(true);
    }
    return found;
  }, []);

  const recheck = useCallback(() => {
    const found = detectExtensions();
    setDetails(found);
    setBlocked(found.length > 0);
    return found;
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    // Initial + a slightly delayed pass (content scripts often inject after load)
    runScan();
    const t1 = setTimeout(runScan, 800);
    const t2 = setTimeout(runScan, 2500);

    // Catch late / dynamic injections
    try {
      observerRef.current = new MutationObserver(() => runScan());
      observerRef.current.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href', 'style', 'data'],
      });
    } catch { /* MutationObserver unavailable */ }

    // Resource-timing entries accumulate over the session — keep polling
    intervalRef.current = setInterval(runScan, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(intervalRef.current);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [active, runScan]);

  return { blocked, details, recheck };
}
