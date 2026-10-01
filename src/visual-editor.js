const { Modal, Notice, TFile, normalizePath } = require('obsidian');
const { EditorState } = require('@codemirror/state');
const { EditorView, keymap } = require('@codemirror/view');
const { autocompletion } = require('@codemirror/autocomplete');
const { latexCompletions } = require('./autocomplete');
const { splitDocument, joinDocument, describeBlock, updateBlock, locateFence, replaceFence } = require('./blocks');

function markdownEditor(app, filePath) {
  const views = app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view)
    .filter(view => view.file?.path === filePath && view.editor);
  if (views.length > 1 && views.some(view => view.editor.getValue() !== views[0].editor.getValue())) throw new Error('Open note panes have different contents. Save them before opening the visual editor.');
  return views[0]?.editor;
}

async function prepareEdit(preview) {
  const { plugin, context, fileMode } = preview;
    let file, source, target;
    if (fileMode) {
      const requested = preview.source.trim().replace(/^\[\[|\]\]$/g, '');
      file = plugin.app.metadataCache.getFirstLinkpathDest(requested, context.sourcePath)
        || plugin.app.vault.getAbstractFileByPath(normalizePath(requested));
      if (!(file instanceof TFile) || file.extension !== 'tex') throw new Error('The linked .tex file could not be found.');
    } else file = plugin.app.vault.getAbstractFileByPath(context.sourcePath);
    if (!(file instanceof TFile)) throw new Error('The source file could not be found.');
    const editor = !fileMode && markdownEditor(plugin.app, file.path);
    const original = editor ? editor.getValue() : await plugin.app.vault.read(file);
    if (fileMode) source = original;
    else {
      const section = context.getSectionInfo(preview.containerEl);
      target = locateFence(original, preview.source, section?.lineStart);
      source = target.source;
    }
    const key = `${file.path}:${fileMode ? 'file' : target.from}`;
    const save = async nextSource => {
      if (plugin.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('The source file was removed or replaced. Copy your draft before closing.');
      const currentEditor = !fileMode && markdownEditor(plugin.app, file.path);
      if (currentEditor) {
        const replacement = replaceFence(currentEditor.getValue(), original, target, nextSource);
        currentEditor.replaceRange(replacement.text, currentEditor.offsetToPos(replacement.from), currentEditor.offsetToPos(replacement.to));
      } else {
        await plugin.app.vault.process(file, current => {
          if (fileMode) {
            if (current !== original) throw new Error('The .tex file changed while editing. Copy your draft, then reopen it.');
            return nextSource;
          }
          const replacement = replaceFence(current, original, target, nextSource);
          return current.slice(0, replacement.from) + replacement.text + current.slice(replacement.to);
        });
      }
      if (!fileMode) preview.source = nextSource.replace(/\r?\n$/, '');
      if (!preview.disposed) preview.refresh();
    };
    return { source, key, save };
}

async function openVisualEditor(preview) {
  try {
    const { source, key, save } = await prepareEdit(preview);
    const { plugin } = preview;
    const modal = new BlockEditorModal(plugin, source, key, save);
    plugin.register?.(() => modal.close());
    modal.open();
  } catch (error) { new Notice(error.message, 8000); }
}

class BlockEditorModal extends Modal {
  constructor(plugin, source, key, save) {
    super(plugin.app);
    Object.assign(this, { plugin, original: source, key, save });
    const saved = plugin.visualDrafts.get(key);
    this.base = saved?.base ?? source;
    this.staleDraft = this.base !== source;
    this.draft = splitDocument(saved?.source ?? source);
    this.history = []; this.views = []; this.active = -1;
  }
  onOpen() {
    this.modalEl.addClass('latex-block-modal');
    this.setTitle('LaTeX visual blocks');
    this.contentEl.createEl('p', { text: 'Click a block to edit. Headings and plain paragraphs use text fields; equations and complex blocks keep editable LaTeX.' });
    this.toolbar = this.contentEl.createDiv({ cls: 'latex-block-actions' });
    for (const [label, source] of [ ['+ Paragraph', 'New paragraph.\n\n'], ['+ Heading', '\\section{New heading}\n\n'], ['+ Equation', '\\[ E = mc^2 \\]\n\n'], ['+ List', '\\begin{itemize}\n\\item First item\n\\end{itemize}\n\n'] ]) {
      this.button(this.toolbar, label, () => {
        this.checkpoint();
        const previous = this.draft.blocks.at(-1);
        if (previous && !/\n\s*\n$/.test(previous.source)) previous.source += '\n\n';
        this.draft.blocks.push({ source }); this.active = this.draft.blocks.length - 1; this.render();
      });
    }
    this.button(this.toolbar, 'Undo block change', () => {
      if (this.history.length) { this.draft = this.history.pop(); this.active = -1; this.render(); }
    });
    this.button(this.toolbar, 'Wrap as full document', () => {
      if (this.draft.prefix || this.draft.suffix) return;
      this.checkpoint();
      this.draft.prefix = '\\documentclass{article}\n' + this.plugin.settings.preamble + '\n\\pagestyle{empty}\n\\begin{document}\n';
      this.draft.suffix = '\n\\end{document}\n'; this.render(); this.setup.open = true;
    });
    this.button(this.toolbar, 'Copy LaTeX', async () => {
      try { await navigator.clipboard.writeText(joinDocument(this.draft)); new Notice('LaTeX draft copied.'); }
      catch { new Notice('Clipboard unavailable. Open document setup or individual blocks to copy their source.'); }
    });
    this.setup = this.contentEl.createEl('details', { cls: 'latex-block-setup' });
    this.setup.createEl('summary', { text: 'Document setup and packages' });
    this.setup.createEl('p', { text: 'For a full document, edit its preamble and document boundaries here. Fragments use the plugin’s configured preamble.' });
    this.prefixInput = this.setup.createEl('textarea', { attr: { 'aria-label': 'Document preamble and opening' } });
    this.prefixInput.value = this.draft.prefix;
    this.prefixInput.addEventListener('input', () => { this.draft.prefix = this.prefixInput.value; this.remember(); });
    this.suffixInput = this.setup.createEl('textarea', { attr: { 'aria-label': 'Document closing' } });
    this.suffixInput.value = this.draft.suffix;
    this.suffixInput.addEventListener('input', () => { this.draft.suffix = this.suffixInput.value; this.remember(); });
    this.list = this.contentEl.createDiv({ cls: 'latex-block-list' });
    const footer = this.contentEl.createDiv({ cls: 'latex-block-actions latex-block-footer' });
    this.message = this.contentEl.createDiv({ attr: { role: 'status' } });
    this.saveButton = this.button(footer, 'Save to note', async () => {
      this.saveButton.disabled = true;
      try {
        if (this.staleDraft) throw new Error('This retained draft belongs to an older version of the source. Copy it before discarding, then reopen the current document.');
        await this.save(joinDocument(this.draft));
        this.finished = true; this.plugin.visualDrafts.delete(this.key); this.close(); new Notice('LaTeX changes saved.');
      } catch (error) { this.message.setText(error.message); this.saveButton.disabled = false; }
    });
    this.saveButton.addClass('mod-cta');
    this.button(footer, 'Close — keep draft', () => this.close());
    this.button(footer, 'Discard draft', () => { this.finished = true; this.plugin.visualDrafts.delete(this.key); this.close(); });
    this.render();
  }
  button(parent, label, callback) {
    const button = parent.createEl('button', { text: label }); button.addEventListener('click', callback); return button;
  }
  checkpoint() { this.history.push(structuredClone(this.draft)); if (this.history.length > 30) this.history.shift(); }
  remember() { this.plugin.visualDrafts.set(this.key, { base: this.base, source: joinDocument(this.draft) }); }
  render() {
    clearTimeout(this.previewTimer);
    for (const view of this.views) view.destroy(); this.views = [];
    this.list.empty();
    this.prefixInput.value = this.draft.prefix; this.suffixInput.value = this.draft.suffix;
    this.prefixInput.disabled = this.suffixInput.disabled = !this.draft.prefix && !this.draft.suffix;
    this.draft.blocks.forEach((block, index) => {
      const description = describeBlock(block.source);
      const card = this.list.createDiv({ cls: 'latex-edit-block' });
      const row = card.createDiv({ cls: 'latex-block-actions' });
      row.createSpan({ text: description.kind, cls: 'latex-block-kind' });
      this.button(row, 'Edit', () => { this.checkpoint(); this.active = index; this.render(); });
      const up = this.button(row, '↑', () => this.move(index, -1)); up.disabled = index === 0; up.setAttribute('aria-label', 'Move block up');
      const down = this.button(row, '↓', () => this.move(index, 1)); down.disabled = index === this.draft.blocks.length - 1; down.setAttribute('aria-label', 'Move block down');
      this.button(row, 'Remove', () => { this.checkpoint(); this.draft.blocks.splice(index, 1); this.active = -1; this.render(); });
      const preview = card.createDiv({ cls: 'latex-block-preview', attr: { tabindex: '0', role: 'button', 'aria-label': `Edit ${description.kind} block ${index + 1}` } });
      const draw = () => {
        preview.empty();
        try { this.plugin.renderHtml(block.source, preview.createDiv(), false); }
        catch {
          preview.createDiv({ text: 'Source preview — this block needs the full document or a native package.' });
          preview.createEl('pre', { text: block.source });
        }
      };
      draw();
      const edit = () => { this.checkpoint(); this.active = index; this.render(); };
      preview.addEventListener('click', edit);
      preview.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(); } });
      if (this.active === index) {
        card.addClass('is-editing');
        const update = value => {
          block.source = updateBlock(description, value); this.remember();
          clearTimeout(this.previewTimer); this.previewTimer = setTimeout(draw, 200);
        };
        if (description.plain) {
          const input = card.createEl('textarea', { cls: 'latex-block-text', attr: { 'aria-label': `${description.kind} text`, rows: description.kind === 'Heading' ? '2' : '5' } });
          input.value = description.value; input.addEventListener('input', () => update(input.value)); input.focus();
        } else {
          const parent = card.createDiv({ cls: 'latex-block-code' });
          // Reuse completion with a virtual LaTeX fence for this dedicated source field.
          const completionPrefix = '```latex-cell\n';
          const completion = context => latexCompletions({
            pos: context.pos + completionPrefix.length,
            state: { doc: { sliceString: (from, to) => (completionPrefix + context.state.doc.toString()).slice(from, to) } },
            matchBefore: regex => { const match = context.matchBefore(regex); return match && { ...match, from: match.from + completionPrefix.length }; }
          });
          const view = new EditorView({ parent, state: EditorState.create({ doc: description.value, extensions: [
            EditorView.lineWrapping,
            autocompletion({ override: [context => { const result = completion(context); return result && { ...result, from: result.from - completionPrefix.length }; }] }),
            EditorView.updateListener.of(transaction => { if (transaction.docChanged) update(transaction.state.doc.toString()); }),
            keymap.of([{ key: 'Mod-Enter', run: () => { this.active = -1; this.render(); return true; } }]),
          ] }) });
          this.views.push(view); view.focus();
        }
        this.button(card, 'Done editing block', () => { this.active = -1; this.render(); });
      }
    });
    if (!this.draft.blocks.length) this.list.createEl('p', { text: 'Add a paragraph, heading, equation, or list above.' });
    this.remember();
  }
  move(index, delta) {
    this.checkpoint();
    const [block] = this.draft.blocks.splice(index, 1); this.draft.blocks.splice(index + delta, 0, block);
    for (const item of this.draft.blocks.slice(0, -1)) if (!item.source.endsWith('\n')) item.source += '\n\n';
    this.active = -1; this.render();
  }
  onClose() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.previewTimer);
    for (const view of this.views) view.destroy();
    if (!this.finished && joinDocument(this.draft) !== this.original) new Notice('Draft kept until the plugin reloads. Reopen this block’s visual editor to continue.');
    this.contentEl.empty();
  }
}

module.exports = { openVisualEditor, prepareEdit };
