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

export function renderInline(text) {
  if (!text || typeof text !== "string") return "";
  return fixMojibake(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
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
