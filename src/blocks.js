function uncomment(source) {
  return source.replace(/\\[\s\S]|%[^\r\n]*/g, value => value[0] === '%' ? ' '.repeat(value.length) : value);
}

function splitDocument(source) {
  const clean = uncomment(source);
  const opening = /\\begin\{document\}/.exec(clean);
  const closing = /\\end\{document\}/.exec(clean);
  const start = opening ? opening.index + opening[0].length : 0;
  const end = opening && closing && closing.index >= start ? closing.index : source.length;
  const body = source.slice(start, end);
  const tokens = body.match(/[^\n]*\n|[^\n]+$/g) || [];
  const blocks = []; let pending = '', depth = 0, braces = 0, display = false;
  const flush = () => { if (pending) { blocks.push({ source: pending }); pending = ''; } };
  for (const line of tokens) {
    const plain = uncomment(line);
    if (depth === 0 && braces === 0 && !display && /^\s*\\(?:part|chapter|section|subsection|subsubsection)\*?\{/.test(plain)) flush();
    pending += line;
    for (const token of plain.matchAll(/\\begin\{([^}]+)\}|\\end\{([^}]+)\}|\\\[|\\\]|\$\$|\\[\s\S]|[{}]/g)) {
      if (token[1]) depth++;
      else if (token[2]) depth = Math.max(0, depth - 1);
      else if (token[0] === '\\[') display = true;
      else if (token[0] === '\\]') display = false;
      else if (token[0] === '$$') display = !display;
      else if (token[0] === '{') braces++;
      else if (token[0] === '}') braces = Math.max(0, braces - 1);
    }
    if (!depth && !braces && !display && (!plain.trim() || /^\s*\\(?:part|chapter|section|subsection|subsubsection)\*?\{/.test(plain))) flush();
  }
  flush();
  // Attach whitespace to neighboring blocks without changing a single byte.
  const merged = [];
  for (const block of blocks) {
    if (!block.source.trim() && merged.length) merged.at(-1).source += block.source;
    else if (block.source.trim() && merged.length && !merged.at(-1).source.trim()) merged.at(-1).source += block.source;
    else merged.push(block);
  }
  return { prefix: source.slice(0, start), blocks: merged, suffix: source.slice(end) };
}

function joinDocument(draft) { return draft.prefix + draft.blocks.map(block => block.source).join('') + draft.suffix; }
function describeBlock(source) {
  const heading = /^(\s*\\(?:part|chapter|section|subsection|subsubsection)\*?\{)([^{}\\]*)(\}\s*)$/.exec(source);
  if (heading) return { kind: 'Heading', value: heading[2], prefix: heading[1], suffix: heading[3], plain: true };
  const equation = /^(\s*\\\[)([\s\S]*)(\\\]\s*)$/.exec(source) || /^(\s*\$\$)([\s\S]*)(\$\$\s*)$/.exec(source);
  if (equation) return { kind: 'Equation', value: equation[2], prefix: equation[1], suffix: equation[3] };
  if (!/[\\{}$%&#_^~]/.test(source)) return { kind: 'Paragraph', value: source.trim(), prefix: source.match(/^\s*/)[0], suffix: source.trim() ? source.match(/\s*$/)[0] : '', plain: true };
  const env = /\\begin\{([^}]+)\}/.exec(source);
  return { kind: env ? env[1] : 'LaTeX', value: source, prefix: '', suffix: '' };
}
function updateBlock(description, value) {
  const escaped = description.plain ? value.replace(/[\\{}$%&#_^~]/g, char => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }[char] || '\\' + char)) : value;
  return description.prefix + escaped + description.suffix;
}

function fences(markdown) {
  const lines = markdown.match(/[^\n]*\n|[^\n]+$/g) || [];
  const result = []; let open = null, offset = 0;
  for (let line = 0; line < lines.length; line++) {
    const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(lines[line]);
    if (match && !open) open = { char: match[1][0], length: match[1].length, language: match[2].trim(), line, from: offset + lines[line].length };
    else if (match && open && match[1][0] === open.char && match[1].length >= open.length && !match[2].trim()) {
      if (/^(latex|latex-document|latex-cell|latex-cell-file|latex-pdf|latex-pdf-file|latex-file|latex-preamble)$/.test(open.language)) result.push({ ...open, to: offset, endLine: line, source: markdown.slice(open.from, offset) });
      open = null;
    }
    offset += lines[line].length;
  }
  return result;
}
const normalized = source => source.replace(/\r\n/g, '\n').replace(/\n$/, '');
function locateFence(markdown, source, line) {
  const matches = fences(markdown).filter(fence => normalized(fence.source) === normalized(source));
  const exact = matches.find(fence => line >= fence.line && line <= fence.endLine);
  if (exact) return exact;
  if (matches.length !== 1) throw new Error('The source block moved, changed, or is ambiguous. Reopen its visual editor from the current note.');
  return matches[0];
}

function replaceFence(current, originalMarkdown, target, newSource) {
  // Fail closed if surrounding content changed while the editor was open.
  // Users can copy their draft or reopen rather than overwrite concurrent edits.
  if (current !== originalMarkdown) throw new Error('The note changed while this editor was open. Copy your draft, then reopen the block to avoid overwriting those changes.');
  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  const body = newSource.replace(/\r\n/g, '\n').replace(/\n/g, newline);
  const end = body.endsWith(newline) ? '' : newline;
  if (new RegExp(`^ {0,3}${target.char === '`' ? '`' : '~'}{${target.length},}\\s*$`, 'm').test(body)) throw new Error('The LaTeX contains a closing Markdown fence. Use a longer fence in the note first.');
  return { from: target.from, to: target.to, text: body + end };
}
module.exports = { splitDocument, joinDocument, describeBlock, updateBlock, fences, locateFence, replaceFence };
