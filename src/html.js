const { parse, HtmlGenerator } = require('latex.js');

function renderHtml(source, host, { inline = false, css = {} } = {}) {
  const generator = parse(source, { generator: new HtmlGenerator({ hyphenate: false }) });
  const fragment = generator.domFragment();
  // Never insert executable HTML from a document into the host application.
  for (const node of fragment.querySelectorAll('script,iframe,object,embed')) node.remove();
  for (const node of fragment.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || (['href', 'src', 'xlink:href'].includes(attribute.name) && /^\s*(javascript|vbscript):/i.test(attribute.value))) node.removeAttribute(attribute.name);
    }
  }
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const styles = generator.stylesAndScripts();
  for (const generated of styles.querySelectorAll('link[rel="stylesheet"]')) {
    const name = generated.getAttribute('href');
    if (!/^css\/(article|book|katex)\.css$/.test(name)) continue;
    if (!css[name]) continue;
    const sheet = document.createElement('style');
    sheet.textContent = css[name]; shadow.append(sheet);
  }
  // The generator supplies document-specific length variables as inline CSS.
  for (const style of styles.querySelectorAll('style')) shadow.append(style);
  const style = document.createElement('style');
  style.textContent = `:host { display: ${inline ? 'inline' : 'block'}; color: inherit; font-size: inherit; --size: 1em; --textwidth: 100%; --marginleftwidth: 0px; --marginrightwidth: 0px; }
    .body { margin: 0; padding: 0; width: 100%; color: inherit; }
    .page { display: block; width: 100%; margin: 0; }
    ${inline ? '.body, .page, p { display: inline; margin: 0; padding: 0; text-indent: 0; }' : '.body { padding: 1em; box-sizing: border-box; }'}
    a { color: var(--link-color, #6750a4); }`;
  shadow.append(style, fragment);
  return shadow;
}

module.exports = { renderHtml };
