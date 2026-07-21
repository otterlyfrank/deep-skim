/**
 * Parse deep-skim Markdown into sections + active-recall Q/A pairs.
 * HTML renderer tuned for print/PDF (arrows, flow diagrams).
 */

import { SECTION_HEADINGS } from './prompt.js';

/**
 * Split markdown into title + ordered sections by ## headings.
 */
export function parseDeepSkimMarkdown(markdown) {
  const lines = (markdown || '').split(/\n/);
  let title = 'Untitled deep-skim';
  let sawTitle = false;
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (/^#\s+/.test(line) && !/^##/.test(line)) {
      if (!sawTitle && sections.length === 0 && !current) {
        title = line.replace(/^#\s+/, '').trim() || title;
        sawTitle = true;
        continue;
      }
    }

    if (/^##\s+/.test(line)) {
      if (current) sections.push(current);
      const matched = SECTION_HEADINGS.find((s) => s.pattern.test(line));
      current = {
        id: matched?.id || `sec-${sections.length}`,
        title: matched?.title || line.replace(/^##\s+/, '').trim(),
        heading: line.replace(/^##\s+/, '').trim(),
        body: '',
      };
      continue;
    }

    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) sections.push(current);

  if (!sections.length && markdown.trim()) {
    sections.push({
      id: 'body',
      title: 'Deep-skim',
      heading: 'Deep-skim',
      body: markdown.replace(/^#\s+.*\n?/, '').trim(),
    });
  }

  const questions = extractQuestions(markdown);
  return { title, sections, questions, markdown };
}

export function extractQuestions(markdown) {
  const text = markdown || '';
  const questions = [];

  const sectionMatch = text.match(
    /##\s*5\.\s*Active-Recall[\s\S]*?(?=##\s*6\.|$)/i
  );
  const scope = sectionMatch ? sectionMatch[0] : text;

  const qRe =
    /(?:\*\*)?Q\s*(\d+)(?:\*\*)?[.:)\]\s]+(.+?)(?=\n(?:\*\*)?A\s*\d+|\n(?:\*\*)?Q\s*\d+|$)/gis;
  const aRe =
    /(?:\*\*)?A\s*(\d+)(?:\*\*)?[.:)\]\s]+(.+?)(?=\n(?:\*\*)?Q\s*\d+|\n(?:\*\*)?A\s*\d+|$)/gis;

  const qMap = new Map();
  const aMap = new Map();

  let m;
  while ((m = qRe.exec(scope)) !== null) {
    qMap.set(Number(m[1]), m[2].trim());
  }
  while ((m = aRe.exec(scope)) !== null) {
    aMap.set(Number(m[1]), m[2].trim());
  }

  const keys = [...new Set([...qMap.keys(), ...aMap.keys()])].sort((a, b) => a - b);
  for (const k of keys) {
    if (!qMap.has(k)) continue;
    questions.push({
      index: k,
      question: cleanMd(qMap.get(k)),
      answer: cleanMd(aMap.get(k) || '(No model answer parsed — check source markdown.)'),
    });
  }

  if (!questions.length) {
    const lines = scope.split(/\n/).filter((l) => /^\d+[\].)]\s+/.test(l.trim()));
    lines.forEach((l, i) => {
      questions.push({
        index: i + 1,
        question: cleanMd(l.replace(/^\d+[\].)]\s+/, '')),
        answer: '(Reveal by re-reading the source section; model answer not structured.)',
      });
    });
  }

  return questions;
}

function cleanMd(s) {
  return (s || '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalize arrows / box-drawing so PDF fonts and HTML never eat the logic.
 */
export function normalizeDiagramChars(text) {
  return String(text || '')
    .replace(/[\u2192\u21D2\u2794\u27A1\u21A6\u2B95]/g, '->') // → ⇒ ➔ ➡ ↦ ⮕
    .replace(/[\u2190\u21D0]/g, '<-') // ← ⇐
    .replace(/[\u2194\u21D4]/g, '<->') // ↔ ⇔
    .replace(/[\u2191\u21D1]/g, '^') // ↑ ⇑
    .replace(/[\u2193\u21D3]/g, 'v') // ↓ ⇓
    .replace(/⇒/g, '=>')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/\u00A0/g, ' '); // nbsp
}

/**
 * Detect a run of lines that look like a flow / ASCII diagram.
 */
function isDiagramLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^(flow|diagram|schema|figure|model)\b/i.test(t) && t.length < 40) return true;
  // arrows / pipes / boxes
  if (/(->|<-|<->|=>|<=|\|)|[+\-]=+[+\-]|[┌┐└┘├┤┬┴┼─│╔╗╚╝║═]/.test(t)) return true;
  if (/^\s*[\w."'][\w\s."']{0,24}\s*(->|=>)\s*[\w."']/.test(t)) return true;
  // multi-column with multiple spaces
  if (/\S\s{2,}\S/.test(t) && /[-+|<>]/.test(t)) return true;
  return false;
}

/**
 * Wrap consecutive diagram-ish lines in fenced pre blocks before HTML convert.
 */
export function protectFlowDiagrams(md) {
  const lines = normalizeDiagramChars(md || '').split('\n');
  const out = [];
  let buf = [];

  const flush = () => {
    if (!buf.length) return;
    // only treat as diagram if ≥2 lines or one strong arrow line
    const strong =
      buf.length >= 2 ||
      buf.some((l) => /(->|=>|<->)/.test(l) && l.trim().length > 8);
    if (strong) {
      out.push('```diagram');
      out.push(...buf.map((l) => l.replace(/\s+$/g, '')));
      out.push('```');
    } else {
      out.push(...buf);
    }
    buf = [];
  };

  for (const line of lines) {
    // already fenced
    if (/^```/.test(line)) {
      flush();
      out.push(line);
      continue;
    }
    if (isDiagramLine(line) || (buf.length && line.trim() === '')) {
      // allow blank line inside diagram only if already collecting
      if (line.trim() === '' && buf.length) {
        buf.push(line);
      } else if (isDiagramLine(line)) {
        buf.push(line);
      } else {
        flush();
        out.push(line);
      }
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join('\n');
}

/**
 * Minimal Markdown → safe HTML for summary display + print/PDF.
 */
export function markdownToHtml(md) {
  if (!md) return '';
  let html = protectFlowDiagrams(md);
  html = escapeHtml(html);

  // fenced code / diagrams (after escape, backticks remain)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const cls = lang === 'diagram' ? ' class="diagram-block"' : '';
    // unescape was not applied to code content beyond escapeHtml — fine
    return `<pre${cls}><code>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`;
  });
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic without lookbehind (Safari-safe)
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // blockquotes
  html = html.replace(/^(?:&gt; ?.*(?:\n|$))+?/gm, (block) => {
    const inner = block
      .split('\n')
      .map((l) => l.replace(/^&gt; ?/, ''))
      .join('<br>');
    return `<blockquote>${inner}</blockquote>`;
  });
  // hr
  html = html.replace(/^(-{3,}|\*{3,})$/gm, '<hr>');
  // unordered lists
  html = html.replace(/^(?:[-*] .+(?:\n|$))+?/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l) => `<li>${l.replace(/^[-*] /, '')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  });
  // ordered lists
  html = html.replace(/^(?:\d+[.)] .+(?:\n|$))+?/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((l) => `<li>${l.replace(/^\d+[.)] /, '')}</li>`)
      .join('');
    return `<ol>${items}</ol>`;
  });
  // paragraphs
  html = html
    .split(/\n{2,}/)
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^<(h[1-4]|ul|ol|pre|blockquote|hr)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
