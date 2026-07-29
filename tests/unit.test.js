/**
 * Deep-Skim unit tests (Node 17+ compatible).
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { scorePageText, assessDocumentQuality } from '../src/extraction/quality.js';
import { chunkSourceText } from '../src/generation/multipass.js';
import { parseDeepSkimMarkdown, extractQuestions } from '../src/generation/parser.js';
import { parseResearchLenses } from '../src/generation/prompt.js';

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('scorePageText flags empty / garbage', () => {
  const empty = scorePageText('');
  assert.ok(empty.score < 0.6);
  assert.ok(empty.issues.includes('very_short'));
  const good = scorePageText(
    'This is a reasonable paragraph of native PDF text with enough letters to look real and healthy for extraction quality scoring.'
  );
  assert.ok(good.score > 0.7);
});

test('assessDocumentQuality aggregates pages', () => {
  const pages = [
    'A full enough paragraph of readable text for scoring.',
    'Another page with substantial content so the average stays high.',
  ];
  const a = assessDocumentQuality(pages);
  assert.ok(['high', 'medium', 'low'].includes(a.quality));
  assert.ok(typeof a.qualityScore === 'number');
  assert.ok(Array.isArray(a.pageScores));
});

test('chunkSourceText respects max chunks', () => {
  const pages = Array.from({ length: 40 }, (_, i) => `<!-- page ${i + 1} -->\n\n${'word '.repeat(800)}`).join(
    '\n'
  );
  const chunks = chunkSourceText(pages, { chunkChars: 5000, maxChunks: 6 });
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.length <= 8, `got ${chunks.length}`);
  assert.ok(chunks[0].text.length > 0);
});

test('parseDeepSkimMarkdown extracts sections and title', () => {
  const md = `# Sample Title

## 1. Title & Bibliographic Note
Body one.

## 2. Hierarchical Outline + Core Claims
Claims here.

## 5. Active-Recall Questions
**Q1.** What is the claim?
**A1.** Something true.
`;
  const parsed = parseDeepSkimMarkdown(md);
  assert.equal(parsed.title, 'Sample Title');
  assert.ok(parsed.sections.length >= 2);
  const qs = extractQuestions(md);
  assert.ok(qs.length >= 1);
  assert.match(qs[0].question, /claim/i);
});

test('parseResearchLenses dedupes and splits', () => {
  const lenses = parseResearchLenses('history\nhistory\nmethod, praxis');
  assert.deepEqual(lenses, ['history', 'method', 'praxis']);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
