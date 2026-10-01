const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test' });
global.window = dom.window; global.document = dom.window.document;
const { renderHtml } = require('../src/html');

test('inline text and mathematics produce selectable DOM without PDF', () => {
  const host = document.createElement('span');
  const root = renderHtml(String.raw`\textbf{Energy} is $E=mc^2$.`, host, { inline: true });
  assert.match(root.textContent, /Energy/);
  assert.ok(root.querySelector('.katex'));
  assert.equal(root.querySelectorAll('canvas,iframe,object,embed').length, 0);
});

test('full document renders headings and lists', () => {
  const host = document.createElement('div');
  const root = renderHtml(String.raw`\documentclass{article}
\begin{document}
\section{Results}
\begin{itemize}\item First result\item Second result\end{itemize}
\end{document}`, host);
  assert.match(root.querySelector('h2').textContent, /Results/);
  assert.equal(root.querySelectorAll('li').length, 2);
});

test('unsupported native package fails explicitly', () => {
  assert.throws(() => renderHtml(String.raw`\documentclass{article}\usepackage{tikz}\begin{document}\begin{tikzpicture}\draw (0,0) -- (1,1);\end{tikzpicture}\end{document}`, document.createElement('div')));
});

test('bundled stylesheets are injected as style elements, not links', () => {
  const host = document.createElement('div');
  const root = renderHtml(String.raw`\textbf{Hi} $x$`, host, { css: { 'css/katex.css': '.katex{color:red}', 'css/article.css': '.body{margin:0}' } });
  assert.equal(root.querySelectorAll('link').length, 0);
  assert.ok([...root.querySelectorAll('style')].some(style => style.textContent.includes('.katex{color:red}')));
});
