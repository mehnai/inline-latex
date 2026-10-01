const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
const { syntaxTree } = require('@codemirror/language');
const { editorLivePreviewField } = require('obsidian');

function inlineExtension(plugin) {
  class LatexWidget extends WidgetType {
    constructor(source) { super(); this.source = source; }
    eq(other) { return this.source === other.source; }
    toDOM() {
      const host = document.createElement('span');
      host.className = 'latex-inline-embed';
      try { plugin.renderHtml(this.source, host, true); }
      catch (error) { host.textContent = `LaTeX: ${error.message}`; host.classList.add('latex-inline-error'); }
      return host;
    }
    ignoreEvent() { return false; }
  }
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view); }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.startState.field(editorLivePreviewField, false) !== update.state.field(editorLivePreviewField, false)) this.decorations = this.build(update.view);
    }
    build(view) {
      if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
      const ranges = [], seen = new Set();
      for (const visible of view.visibleRanges) {
        let line = view.state.doc.lineAt(visible.from);
        while (line.from <= visible.to) {
          if (!seen.has(line.number)) {
            seen.add(line.number);
            for (const match of line.text.matchAll(/`latex:([^`\n]+)`/g)) {
              const from = line.from + match.index, to = from + match[0].length;
              let node = syntaxTree(view.state).resolveInner(from + 1, 1);
              let inFence = false, inInline = false;
              while (node) {
                if (/codeblock|fencedcode|code-block/i.test(node.name)) inFence = true;
                if (/inline.?code/i.test(node.name)) inInline = true;
                node = node.parent;
              }
              if (inFence || !inInline) continue;
              if (view.state.selection.ranges.some(range => range.from <= to && range.to >= from)) continue;
              ranges.push(Decoration.replace({ widget: new LatexWidget(match[1].trim()) }).range(from, to));
            }
          }
          if (line.number === view.state.doc.lines) break;
          line = view.state.doc.line(line.number + 1);
        }
      }
      return Decoration.set(ranges, true);
    }
  }, { decorations: value => value.decorations });
}

module.exports = { inlineExtension };
