const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitDocument, joinDocument, describeBlock, updateBlock, fences, locateFence, replaceFence } = require('../src/blocks');

test('visual editing preserves full documents and fragments byte for byte until edited', () => {
  for (const source of ['', 'A paragraph.\n\nAnother.', '\n\nHello\n', String.raw`% a comment
\documentclass{article}
\usepackage{tikz}
\begin{document}
\section{Results}
Some text.

\begin{itemize}
\item First

\item Nested \begin{itemize}\item Inner\end{itemize}
\end{itemize}
\[ a+b

=c \]
\end{document}
% trailing text`, '\\section{Title}\r\n\r\nText.\r\n']) {
    assert.equal(joinDocument(splitDocument(source)), source);
  }
});
test('headings and paragraphs split, nested environments stay together', () => {
  const draft = splitDocument('\\section{Results}\nFirst.\n\nSecond.\n\n\\begin{itemize}\n\\item A\n\n\\item B\n\\end{itemize}\n');
  assert.equal(draft.blocks.length, 4);
  assert.match(draft.blocks[3].source, /item A[\s\S]*item B/);
});
test('comments containing document commands are preserved, not treated as wrappers', () => {
  const source = '% \\begin{document}\nActual text\n% \\end{document}';
  const draft = splitDocument(source);
  assert.equal(draft.prefix, ''); assert.equal(joinDocument(draft), source);
});
test('text fields escape special LaTeX characters', () => {
  const heading = describeBlock('\\section{Title}\n\n');
  assert.equal(heading.kind, 'Heading');
  assert.equal(updateBlock(heading, 'A & B: 50%'), '\\section{A \\& B: 50\\%}\n\n');
  const equation = describeBlock('\\[ x \\]\n');
  assert.equal(updateBlock(equation, '\\frac{1}{2}'), '\\[\\frac{1}{2}\\]\n');
});
test('complex commands remain source blocks instead of lossy conversion', () => {
  const source = 'A \\textbf{bold} word and $x$.';
  const block = describeBlock(source);
  assert.equal(block.kind, 'LaTeX'); assert.equal(updateBlock(block, block.value), source);
});
test('saving replaces only the selected fence and preserves surrounding prose', () => {
  const markdown = 'Before\n```latex-cell\nHello\n```\nAfter\n';
  const target = locateFence(markdown, 'Hello', 1);
  const edit = replaceFence(markdown, markdown, target, 'New text');
  assert.equal(markdown.slice(0, edit.from) + edit.text + markdown.slice(edit.to), 'Before\n```latex-cell\nNew text\n```\nAfter\n');
});
test('concurrent changes are rejected instead of overwritten', () => {
  const original = '```latex\nHello\n```';
  const target = locateFence(original, 'Hello', 0);
  assert.throws(() => replaceFence(original + '\nNew paragraph', original, target, 'New'), /note changed/);
});
test('duplicate fences require an unambiguous location', () => {
  const markdown = '```latex\nSame\n```\n```latex\nSame\n```';
  assert.equal(locateFence(markdown, 'Same', 3).line, 3);
  assert.throws(() => locateFence(markdown, 'Same'), /ambiguous/);
});
test('Markdown code examples are not treated as editable LaTeX blocks', () => {
  assert.equal(fences('````markdown\n```latex\nHello\n```\n````').length, 0);
});
test('CRLF and tilde fences work without changing newline conventions', () => {
  const markdown = '~~~latex-cell\r\nHello\r\n~~~\r\n';
  const target = locateFence(markdown, 'Hello', 0);
  assert.equal(replaceFence(markdown, markdown, target, 'A\nB').text, 'A\r\nB\r\n');
});
test('draft cannot inject a closing Markdown fence', () => {
  const markdown = '```latex\nHello\n```';
  assert.throws(() => replaceFence(markdown, markdown, locateFence(markdown, 'Hello', 0), 'Hello\n```\nOther'), /closing Markdown fence/);
});
