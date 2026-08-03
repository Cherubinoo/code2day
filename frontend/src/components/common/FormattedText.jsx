import React from 'react';

/**
 * FormattedText: Safely parses and renders markdown bold (**text** or __text__), 
 * HTML bold tags (<b>text</b> or <strong>text</strong>), and newlines (\n) 
 * for aptitude questions, choices, and explanations.
 */
const FormattedText = ({ text, style = {}, className = "" }) => {
  if (!text) return null;

  const parseFormattedString = (input) => {
    if (typeof input !== 'string') return input;

    // First split by newlines so pre-wrap line breaks are handled cleanly
    const lines = input.split('\n');

    return lines.map((line, lineIdx) => {
      const elements = [];
      let lastIdx = 0;

      // Regex matches **bold**, __bold__, <b>bold</b>, <strong>bold</strong>
      const pattern = /(\*\*|__|<b>|<strong>)(.*?)\1|<b>(.*?)<\/b>|<strong>(.*?)<\/strong>/gi;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        if (match.index > lastIdx) {
          elements.push(line.substring(lastIdx, match.index));
        }

        const content = match[2] || match[3] || match[4];
        elements.push(
          <strong key={`${lineIdx}-${match.index}`} style={{ fontWeight: 800, color: 'inherit' }}>
            {content}
          </strong>
        );

        lastIdx = pattern.lastIndex;
      }

      if (lastIdx < line.length) {
        elements.push(line.substring(lastIdx));
      }

      return (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {elements.length > 0 ? elements : line}
        </React.Fragment>
      );
    });
  };

  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}>
      {parseFormattedString(text)}
    </span>
  );
};

export default FormattedText;
