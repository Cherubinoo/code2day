// Shared Markdown-ish renderer for problem descriptions/explanations —
// used anywhere a problem's `description` text is shown to a student, not
// just the main Problems page. Previously ProblemsPage.jsx had its own
// private copy and everywhere else (e.g. the dashboard's "Today's featured
// problem" card) just dumped the raw string into a <p>, so the same
// backtick/bold/heading/code-fence markdown that renders correctly on the
// Problems page showed up as literal ** and ``` characters everywhere else.
// Undo "UTF-8 bytes decoded as Latin-1/CP1252" corruption (a curly quote
// shows up as â€™, x² as xÂ², √ as â^€ ...). Some older stored explanations
// were saved before the generator's decode was pinned to UTF-8. Only kicks
// in when the tell-tale markers are present and a re-decode actually removes
// them without introducing replacement chars, so clean/accented text is
// never touched.
const MOJIBAKE_RE = /Ã.|Â.|â€|â|â|â|�/;
export function fixMojibake(s) {
  if (!s || typeof s !== "string" || !MOJIBAKE_RE.test(s)) return s;
  try {
    const bytes = Uint8Array.from(Array.from(s, (c) => c.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const before = (s.match(/Ã|Â|â€/g) || []).length;
    const after = (decoded.match(/Ã|Â|â€/g) || []).length;
    if (after < before && !decoded.includes("�")) return fixMojibake(decoded);
  } catch {
    // string isn't cleanly a mis-decoded UTF-8 byte stream — leave it alone
  }
  return s;
}

// LLM-written math/algorithm explanations occasionally slip into LaTeX
// commands (\times, \leq, \sqrt{n}, $O(n)$, \(n \times m\) ...) even though
// nothing here renders LaTeX — left alone those show up as literal backslash
// gibberish. Convert the common ones to plain Unicode symbols and unwrap the
// math-mode delimiters so the underlying text still reads normally.
const LATEX_REPLACEMENTS = [
  [/\\times/g, '×'], [/\\div/g, '÷'], [/\\cdot/g, '·'],
  [/\\leq?/g, '≤'], [/\\geq?/g, '≥'], [/\\neq/g, '≠'], [/\\approx/g, '≈'],
  [/\\sqrt\{([^{}]+)\}/g, '√($1)'], [/\\sqrt/g, '√'],
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1/$2)'],
  [/\\rightarrow|\\to\b/g, '→'], [/\\infty/g, '∞'], [/\\pi\b/g, 'π'],
  [/\^\{?(\d+)\}?/g, (_, d) => ({ 2: '²', 3: '³' }[d] || `^${d}`)],
  [/\\text\{([^{}]*)\}/g, '$1'],
];
function stripLatexArtifacts(text) {
  if (!text.includes('\\') && !text.includes('$') && !text.includes('^')) return text;
  let out = text;
  for (const [pattern, replacement] of LATEX_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Unwrap $...$ / \(...\) / \[...\] math-mode delimiters — nothing here
  // renders LaTeX, so keep the content and just drop the wrapper.
  out = out.replace(/\$([^$]+)\$/g, '$1').replace(/\\[()[\]]/g, '');
  return out;
}

export function renderInline(text) {
  if (!text || typeof text !== "string") return "";
  return stripLatexArtifacts(fixMojibake(text))
    // Trim padding inside markers ("**  text  **" -> "**text**") before
    // matching, so bold segments don't carry extra leading/trailing spaces
    // into the rendered <strong>.
    .replace(/\*\*\s*(.+?)\s*\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  // Deliberately no single-`*` italic rule: these explanations are
  // math/algorithm-heavy and use a bare `*` for multiplication constantly
  // (e.g. "n * log(n)", "3 * 4 * 5") — a single-star italic regex can't
  // reliably tell that apart from real emphasis and ends up pairing
  // unrelated asterisks across a sentence, mangling both the math and the
  // surrounding spacing. Bold (**) and backtick code spans cover real
  // formatting needs without that ambiguity.
}

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderDescription(raw) {
  if (!raw) return null;
  const strRaw0 = typeof raw === "string" ? raw : (typeof raw === "object" ? (raw.description || raw.body || JSON.stringify(raw)) : String(raw));
  const strRaw = fixMojibake(strRaw0);
  const lines = strRaw.replace(/\\n/g, '\n').split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} style={{ height: 10 }} />);
      i++;
      continue;
    }

    // Fenced code block (```lang ... ```): kept verbatim (no inline
    // markdown/bold processing, whitespace preserved) since LLM-generated
    // walkthroughs use these for ASCII-art trace diagrams where alignment
    // matters — running them through the paragraph branch below used to
    // print the ``` fences and every diagram line literally.
    if (/^```/.test(trimmed)) {
      i++;
      const codeLines = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      elements.push(
        <pre key={`code-${i}`} className="desc-code-block">
          <code dangerouslySetInnerHTML={{ __html: escapeHtml(codeLines.join('\n')) }} />
        </pre>
      );
      continue;
    }

    // Markdown heading (#, ##, ### ...) — LLM walkthroughs use these to
    // break a long explanation into named sections; previously these were
    // shown as literal "### Section Name" paragraph text.
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const HeadingTag = level <= 2 ? 'h3' : 'h4';
      elements.push(
        <HeadingTag key={`h-${i}`} className="desc-heading" dangerouslySetInnerHTML={{ __html: renderInline(headingMatch[2]) }} />
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('>') || /^(constraints?|note:|follow up)/i.test(trimmed)) {
      elements.push(
        <div key={i} className="desc-constraint">
          <span className="desc-constraint-icon">{trimmed.startsWith('>') ? '📌' : '⚠️'}</span>
          <span dangerouslySetInnerHTML={{ __html: renderInline(trimmed.replace(/^>\s*/, '')) }} />
        </div>
      );
      i++;
      continue;
    }

    if (/^[-•*]\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="desc-bullets">
          {items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="desc-numbered">
          {items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed === trimmed.toUpperCase() && trimmed.length < 60 && !/[.?!,;]/.test(trimmed) && trimmed.length > 3) {
      elements.push(<p key={i} className="desc-section-label">{trimmed}</p>);
      i++;
      continue;
    }

    elements.push(
      <p key={i} className="desc-paragraph" dangerouslySetInnerHTML={{ __html: renderInline(trimmed) }} />
    );
    i++;
  }
  return elements;
}
