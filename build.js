const fs = require('node:fs/promises');
const esbuild = require('esbuild');
async function build() {
  await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, platform: 'node', format: 'cjs',
    loader: { '.keep': 'empty' },
    external: ['obsidian', '@codemirror/view', '@codemirror/state', '@codemirror/language'], outfile: 'main.js' });
  await fs.writeFile('main.js', (await fs.readFile('main.js', 'utf8')).replace(/[\t ]+$/gm, ''));
  for (const dir of ['css', 'fonts']) await fs.cp(`node_modules/latex.js/dist/${dir}`, `assets/${dir}`, { recursive: true });
  await fs.copyFile('node_modules/latex.js/LICENSE', 'assets/LATEX-JS-LICENSE');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
