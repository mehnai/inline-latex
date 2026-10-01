const { fences, locateFence } = require('./blocks');

function maskComments(source) {
  return source.replace(/\\[\s\S]|%[^\r\n]*/g, value => value[0] === '%' ? ' '.repeat(value.length) : value);
}

function sharedPreamble(markdown, source, line) {
  const all = fences(markdown);
  if (!all.some(block => block.language === 'latex-preamble')) return '';
  const current = locateFence(markdown, source, line);
  return all.filter(block => block.language === 'latex-preamble' && block.from < current.from)
    .map(block => block.source).join('\n');
}

function validatePreamble(source) {
  if (/\\documentclass\b|\\(?:begin|end)\s*\{document\}/.test(maskComments(source))) {
    throw new Error('latex-preamble accepts packages and definitions only. Put the document class and document body in a latex-cell cell.');
  }
}

async function readSharedPreamble(preview) {
  const { app } = preview.plugin;
  const notePath = preview.context.sourcePath;
  const views = app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
    .filter(view => view.file?.path === notePath && view.editor);
  if (views.length > 1 && views.some(view => view.editor.getValue() !== views[0].editor.getValue())) throw new Error('Open note panes have different contents. Save them before compiling shared packages.');
  const file = app.vault.getAbstractFileByPath(notePath);
  const markdown = views[0] ? views[0].editor.getValue() : file ? await app.vault.read(file) : '';
  const line = preview.context.getSectionInfo(preview.containerEl)?.lineStart;
  const shared = sharedPreamble(markdown, preview.source, line);
  validatePreamble(shared);
  return shared;
}

module.exports = { maskComments, sharedPreamble, validatePreamble, readSharedPreamble };
