const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { compile, run, wrapDocument } = require('../src/compiler');

test('fragments are wrapped, complete documents are preserved', () => {
  assert.match(wrapDocument('Hello', '\\usepackage{xcolor}'), /\\begin\{document\}\nHello/);
  assert.match(wrapDocument('Hello', ''), /\\pagestyle\{empty\}/);
  const full = '\\documentclass{article}\n\\begin{document}Hello\\end{document}';
  assert.equal(wrapDocument(full, 'unused'), full);
});
test('missing executable gives actionable error', async () => {
  await assert.rejects(run('/missing/latex-compiler', [], os.tmpdir(), undefined, 1000), /Compiler|compiler not found/);
});
test('timeout terminates a stuck compiler', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], os.tmpdir(), undefined, 100), /timed out/);
});
test('cancellation stops a running compiler', async () => {
  const controller = new AbortController();
  const pending = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], os.tmpdir(), controller.signal, 5000);
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(pending, /cancelled/);
});
const executable = process.env.LATEX_TEST_COMPILER || '/Library/TeX/texbin/pdflatex';
test('real compiler renders AMS math and TikZ into a PDF', { skip: !fs.existsSync(executable) }, async () => {
  const pdf = await compile({ source: String.raw`\section*{Test} $E=mc^2$
\begin{tikzpicture}\draw[blue,thick] (0,0) circle (1cm);\end{tikzpicture}`,
    preamble: String.raw`\usepackage{amsmath}\usepackage{tikz}`, executable, engine: 'pdflatex', cwd: os.tmpdir() });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
test('compiler syntax errors are returned to the note', { skip: !fs.existsSync(executable) }, async () => {
  await assert.rejects(compile({ source: '\\notARealCommand', preamble: '', executable, engine: 'pdflatex', cwd: os.tmpdir() }), /Undefined control sequence/);
});
test('warm-up document loads common packages and uses Tectonic', async () => {
  const { WARMUP_SOURCE, warmCache } = require('../src/compiler');
  assert.match(WARMUP_SOURCE, /\\usepackage\{tikz\}/);
  const before = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('obsidian-latex-'));
  await assert.rejects(warmCache({ executable: '/missing/tectonic', cwd: os.tmpdir() }), /not found/);
  const after = fs.readdirSync(os.tmpdir()).filter(name => name.startsWith('obsidian-latex-'));
  assert.deepEqual(after, before, 'temp directory is removed even on failure');
});
