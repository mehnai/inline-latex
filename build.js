const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

// Inlines every url(...) in a font stylesheet as a base64 data URI so the plugin needs only main.js, manifest.json and styles.css.
async function inlineFonts(cssPath) {
  const css = await fs.readFile(cssPath, 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  const out = [];
  for (const face of faces) {
    let result = face;
    for (const match of face.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      const file = path.resolve(path.dirname(cssPath), match[1]);
      const mime = file.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
      result = result.replace(match[0], `url("data:${mime};base64,${(await fs.readFile(file)).toString('base64')}")`);
    }
    out.push(result);
  }
  return out.join('\n');
}

async function build() {
  for (const dir of ['css', 'fonts']) await fs.cp(`node_modules/latex.js/dist/${dir}`, `assets/${dir}`, { recursive: true });
  await fs.copyFile('node_modules/latex.js/LICENSE', 'assets/LATEX-JS-LICENSE');
  await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, platform: 'node', format: 'cjs',
    loader: { '.keep': 'empty', '.css': 'text' },
    external: ['obsidian', '@codemirror/view', '@codemirror/state', '@codemirror/language'], outfile: 'main.js' });
  await fs.writeFile('main.js', (await fs.readFile('main.js', 'utf8')).replace(/[\t ]+$/gm, ''));
  // Only the Computer Modern families enabled in fonts/cmu.css, plus KaTeX, are shipped.
  const cmu = (await fs.readFile('assets/fonts/cmu.css', 'utf8')).split('\n').filter(line => !line.trim().startsWith('/*'));
  const parts = [await fs.readFile('src/plugin.css', 'utf8')];
  for (const line of cmu) {
    const match = /@import url\("\.\/(.+)"\)/.exec(line);
    if (match) parts.push(await inlineFonts(path.join('assets/fonts', match[1])));
  }
  parts.push(await inlineFonts('assets/css/katex.css'));
  await fs.writeFile('styles.css', parts.join('\n'));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
