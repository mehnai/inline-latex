const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { maskComments, validatePreamble } = require('./preamble');

function wrapDocument(source, preamble, shared = '') {
  validatePreamble(shared);
  const documentClass = /\\documentclass\s*(?:\[[\s\S]*?\]\s*)?\{[^}]+\}/.exec(maskComments(source));
  if (documentClass) {
    if (!shared.trim()) return source;
    const position = documentClass.index + documentClass[0].length;
    return source.slice(0, position) + '\n' + shared + '\n' + source.slice(position);
  }
  return `\\documentclass{article}\n${preamble}\n${shared}\n\\pagestyle{empty}\n\\begin{document}\n${source}\n\\end{document}\n`;
}

function run(executable, args, cwd, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Compilation cancelled.'));
    let output = '', reason;
    const child = spawn(executable, args, {
      cwd, shell: false, windowsHide: true,
      env: { ...process.env, openout_any: 'p', TECTONIC_UNTRUSTED_MODE: '1' }
    });
    const stop = (message) => { reason = message; child.kill('SIGKILL'); };
    const abort = () => stop('Compilation cancelled.');
    const timer = setTimeout(() => stop(`Compilation timed out after ${timeoutMs / 1000} seconds.`), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const collect = data => { output = (output + data.toString()).slice(-24000); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', error => {
      cleanup();
      reject(new Error(error.code === 'ENOENT'
        ? `LaTeX compiler not found: ${executable}. Set its full path in LaTeX Document Embed settings.` : error.message));
    });
    child.once('close', code => {
      cleanup();
      if (reason || code !== 0) reject(new Error(reason || output || `Compiler exited with code ${code}.`));
      else resolve(output);
    });
  });
}

async function compile({ source, preamble, shared = '', executable, engine, cwd, signal, timeoutMs = 60000 }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-latex-'));
  try {
    const input = path.join(temp, 'document.tex');
    await fs.writeFile(input, wrapDocument(source, preamble, shared), 'utf8');
    const args = engine === 'tectonic'
      ? ['-X', 'compile', '--untrusted', '--keep-logs', '--outdir', temp, input]
      : ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', `-output-directory=${temp}`, input];
    await run(executable, args, cwd, signal, timeoutMs);
    // Resolve cross references and the table of contents for standard TeX engines.
    if (engine !== 'tectonic') await run(executable, args, cwd, signal, timeoutMs);
    return new Uint8Array(await fs.readFile(path.join(temp, 'document.pdf')));
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

const WARMUP_PACKAGES = ['geometry', 'amsmath', 'amssymb', 'amsthm', 'mathtools', 'bm', 'graphicx', 'xcolor', 'booktabs', 'array',
  'multirow', 'longtable', 'siunitx', 'hyperref', 'tikz', 'pgfplots', 'mhchem', 'physics', 'enumitem', 'float', 'caption', 'subcaption', 'listings'];
const WARMUP_SOURCE = `\\documentclass{article}\n${WARMUP_PACKAGES.map(name => `\\usepackage{${name}}`).join('\n')}\n\\begin{document}\nWarm-up $E=mc^2$ \\ce{H2O} \\SI{5}{\\meter}\n\\end{document}\n`;
// Compiles a throwaway document so Tectonic downloads its common packages up front.
// compile() writes into a temp directory and removes it afterwards, so nothing is left behind.
async function warmCache({ executable, cwd, signal, timeoutMs = 6e5 }) {
  await compile({ source: WARMUP_SOURCE, preamble: '', executable, engine: 'tectonic', cwd, signal, timeoutMs });
}
module.exports = { compile, run, wrapDocument, warmCache, WARMUP_SOURCE };
