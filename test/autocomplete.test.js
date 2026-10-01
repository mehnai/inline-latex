const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { CompletionContext } = require('@codemirror/autocomplete');
const { inLatex, latexCompletions } = require('../src/autocomplete');
const complete = (doc, pos = doc.length) => latexCompletions(new CompletionContext(EditorState.create({ doc }), pos, false));

test('autocomplete is scoped to LaTeX and math', () => {
  for (const source of ['```latex-cell\n\\fr', '`latex:\\fr', '$\\fr', '$$\n\\fr', '~~~latex\n\\fr']) assert.equal(inLatex(source), true);
  for (const source of ['plain \\fr', '```js\n\\fr', '```latex\ntext\n```\n\\fr', 'Cost \\$5 \\fr']) assert.equal(inLatex(source), false);
});
test('commands offer fractions and environment snippets', () => {
  const result = complete('```latex-cell\n\\fr');
  assert.ok(result.options.some(option => option.label === '\\frac'));
  assert.ok(result.options.some(option => option.label === '\\begin{align}'));
});
test('package completion respects comma separated lists', () => {
  const source = '```latex-cell\n\\usepackage{amsmath, ti';
  const result = complete(source);
  assert.equal(source.slice(result.from), 'ti');
  assert.ok(result.options.some(option => option.label === 'tikz'));
});
test('environment completion avoids duplicate closing brace', () => {
  const source = '```latex-cell\n\\begin{ali}';
  const result = complete(source, source.length - 1);
  assert.equal(result.options.find(option => option.label === 'align').apply, 'align');
});
test('comments and ordinary prose do not trigger suggestions', () => {
  assert.equal(complete('```latex-cell\n% \\fr'), null);
  assert.equal(complete('normal text \\fr'), null);
});
