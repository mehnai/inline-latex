const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { sharedPreamble, validatePreamble } = require('../src/preamble');
const { wrapDocument, compile } = require('../src/compiler');

const note = '```latex-cell\nBefore\n```\n\n```latex-preamble\n\\usepackage{tikz}\n```\n\n```latex-cell\nMiddle\n```\n\n```latex-preamble\n\\newcommand{\\energy}{E=mc^2}\n```\n\n```latex-cell\nAfter\n```';
test('setup applies only to cells below it, accumulating in note order', () => {
  assert.equal(sharedPreamble(note, 'Before', 0), '');
  assert.equal(sharedPreamble(note, 'Middle'), '\\usepackage{tikz}\n');
  assert.equal(sharedPreamble(note, 'After'), '\\usepackage{tikz}\n\n\\newcommand{\\energy}{E=mc^2}\n');
});
test('setup inside a Markdown example is ignored', () => {
  const example = '````markdown\n```latex-preamble\nBAD\n```\n````\n```latex-cell\nCell\n```';
  assert.equal(sharedPreamble(example, 'Cell'), '');
});
test('linked PDF cells inherit setup from the containing note', () => {
  const markdown = '~~~latex-preamble\n\\usepackage{tikz}\n~~~\n~~~latex-cell-file\npaper.tex\n~~~';
  assert.equal(sharedPreamble(markdown, 'paper.tex'), '\\usepackage{tikz}\n');
});
test('full document receives shared definitions before its own preamble', () => {
  const source = '\\documentclass{article}\n\\renewcommand{\\energy}{K}\n\\begin{document}$\\energy$\\end{document}';
  const result = wrapDocument(source, 'UNUSED DEFAULT', '\\newcommand{\\energy}{E}');
  assert.ok(result.indexOf('newcommand') < result.indexOf('renewcommand'));
  assert.ok(!result.includes('UNUSED DEFAULT'));
});
test('fragments receive global settings followed by note setup before the body', () => {
  const result = wrapDocument('BODY', 'GLOBAL', 'SHARED');
  assert.ok(result.indexOf('GLOBAL') < result.indexOf('SHARED'));
  assert.ok(result.indexOf('SHARED') < result.indexOf('\\begin{document}'));
});
test('setup rejects document wrappers but allows commented examples', () => {
  assert.throws(() => validatePreamble('\\documentclass{article}'), /packages and definitions/);
  assert.throws(() => validatePreamble('\\begin{document}'), /packages and definitions/);
  assert.doesNotThrow(() => validatePreamble('% \\documentclass{article}\n\\usepackage{tikz}'));
});
const executable = process.env.LATEX_TEST_COMPILER || '/Library/TeX/texbin/pdflatex';
test('legacy names still inherit shared setup and retain autocomplete', () => {
  const { inLatex } = require('../src/autocomplete');
  const { locateFence } = require('../src/blocks');
  for (const language of ['latex-pdf', 'latex-pdf-file']) {
    const markdown = '```latex-preamble\n\\usepackage{tikz}\n```\n```' + language + '\nOld cell\n```';
    assert.equal(sharedPreamble(markdown, 'Old cell'), '\\usepackage{tikz}\n');
    assert.equal(locateFence(markdown, 'Old cell').language, language);
  }
  assert.equal(inLatex('```latex-pdf\n\\fr'), true);
});
test('real compiler uses a package and macro from a preceding setup cell', { skip: !fs.existsSync(executable) }, async () => {
  const source = String.raw`\begin{tikzpicture}\draw (0,0) -- (1,1);\end{tikzpicture} $\energy$`;
  const markdown = '```latex-preamble\n\\usepackage{tikz}\n\\newcommand{\\energy}{E=mc^2}\n```\n```latex-cell\n' + source + '\n```';
  const shared = sharedPreamble(markdown, source);
  const pdf = await compile({ source, preamble: '', shared, executable, engine: 'pdflatex', cwd: os.tmpdir() });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
