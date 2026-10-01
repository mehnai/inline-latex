const { autocompletion, snippetCompletion } = require('@codemirror/autocomplete');
const { EditorState } = require('@codemirror/state');

function inLatex(text) {
  let fence = null;
  const lines = text.split('\n');
  for (const line of lines.slice(0, -1)) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) continue;
    if (!fence) fence = { char: match[1][0], length: match[1].length, language: match[2].trim() };
    else if (match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = null;
  }
  if (fence) return /^(latex|latex-document|latex-cell|latex-pdf|latex-preamble|tex)$/.test(fence.language);
  const line = lines.at(-1);
  if (/`latex:[^`]*$/.test(line)) return true;
  // Ordinary Obsidian math; ignore escaped dollars and inline code.
  const prose = text.replace(/`[^`\n]*`/g, '').replace(/\\\$/g, '');
  const displays = prose.match(/\$\$/g) || [];
  if (displays.length % 2) return true;
  return ((prose.split('\n').at(-1).replace(/\$\$/g, '').match(/\$/g) || []).length % 2) === 1;
}

const environments = ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'aligned', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'itemize', 'enumerate', 'figure', 'table', 'tabular', 'tikzpicture', 'document'];
const packages = ['amsmath', 'amssymb', 'amsfonts', 'amsthm', 'mathtools', 'physics', 'siunitx', 'mhchem', 'tikz', 'pgfplots', 'graphicx', 'xcolor', 'geometry', 'hyperref', 'booktabs', 'bm', 'cancel'];
const templates = {
  frac: '\\frac{${numerator}}{${denominator}}', sqrt: '\\sqrt{${expression}}',
  text: '\\text{${text}}', textbf: '\\textbf{${text}}', textit: '\\textit{${text}}',
  mathrm: '\\mathrm{${text}}', mathbf: '\\mathbf{${symbol}}', mathbb: '\\mathbb{${R}}',
  vec: '\\vec{${v}}', hat: '\\hat{${x}}', overline: '\\overline{${x}}',
  section: '\\section{${title}}', subsection: '\\subsection{${title}}',
  usepackage: '\\usepackage{${package}}', documentclass: '\\documentclass{${article}}',
  label: '\\label{${key}}', ref: '\\ref{${key}}', cite: '\\cite{${key}}',
  includegraphics: '\\includegraphics[width=\\linewidth]{${file}}',
  sum: '\\sum_{${i=1}}^{${n}}', int: '\\int_{${a}}^{${b}}',
  ce: '\\ce{${H2O}}', qty: '\\qty{${value}}{${unit}}',
  newcommand: '\\newcommand{\\${name}}{${definition}}',
};
const symbols = 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega infty partial nabla times cdot pm mp leq geq neq approx equiv propto to rightarrow leftarrow Rightarrow Leftrightarrow in notin subset subseteq forall exists quad qquad left right'.split(' ');
const commands = [
  ...Object.entries(templates).map(([name, template]) => snippetCompletion(template, { label: '\\' + name, type: 'function', detail: name === 'ce' ? 'requires mhchem' : name === 'qty' ? 'requires siunitx' : 'LaTeX' })),
  ...symbols.map(name => ({ label: '\\' + name, type: 'keyword' })),
  ...environments.map(name => snippetCompletion(`\\begin{${name}}\n\t\${content}\n\\end{${name}}`, { label: `\\begin{${name}}`, type: 'text', detail: 'environment' })),
];

function latexCompletions(context) {
  const before = context.state.doc.sliceString(0, context.pos);
  if (!inLatex(before)) return null;
  const line = before.split('\n').at(-1);
  if (/(^|[^\\])%/.test(line)) return null;
  const environment = context.matchBefore(/\\(?:begin|end)\{[a-zA-Z*]*$/);
  if (environment) {
    const from = environment.from + environment.text.indexOf('{') + 1;
    const closing = context.state.doc.sliceString(context.pos, context.pos + 1) === '}';
    return { from, options: environments.map(label => ({ label, apply: label + (closing ? '' : '}'), type: 'type' })) };
  }
  const pkg = context.matchBefore(/\\usepackage(?:\[[^\]]*\])?\{[^}]*$/);
  if (pkg) {
    const start = Math.max(pkg.text.lastIndexOf('{'), pkg.text.lastIndexOf(',')) + 1;
    const from = pkg.from + start + (pkg.text.slice(start).match(/^\s*/)[0].length);
    return { from, options: packages.map(label => ({ label, type: 'module', detail: 'local TeX package' })), validFor: /^[\w-]*$/ };
  }
  const command = context.matchBefore(/\\[a-zA-Z]*$/);
  if (!command) return null;
  return { from: command.from, options: commands, validFor: /^\\[a-zA-Z]*$/ };
}

function autocompleteExtension() {
  return [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: latexCompletions }])];
}

module.exports = { autocompleteExtension, latexCompletions, inLatex };
