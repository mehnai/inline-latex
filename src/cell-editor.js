const { Notice } = require('obsidian');
const { EditorState, Compartment } = require('@codemirror/state');
const { EditorView, keymap } = require('@codemirror/view');
const { autocompletion } = require('@codemirror/autocomplete');
const { latexCompletions } = require('./autocomplete');
const { prepareEdit } = require('./visual-editor');

function cellCompletion(context) {
  const prefix = '```latex-cell\n';
  const result = latexCompletions({
    pos: context.pos + prefix.length,
    state: { doc: { sliceString: (from, to) => (prefix + context.state.doc.toString()).slice(from, to) } },
    matchBefore: regex => { const match = context.matchBefore(regex); return match && { ...match, from: match.from + prefix.length }; }
  });
  return result && { ...result, from: result.from - prefix.length };
}

function attachCell(preview) {
  const host = preview.containerEl;
  host.classList.add('latex-note-cell');
  host.title = 'Double-click to edit this LaTeX cell';
  host.tabIndex = 0;
  host.closest('.cm-embed-block')?.classList.add('latex-note-wrapper');
  host.closest('pre')?.classList.add('latex-note-wrapper');
  let opening = false, active;
  const open = async event => {
    if (event.target?.closest?.('button, a, .latex-cell-editor')) return;
    event.preventDefault(); event.stopPropagation();
    if (active || opening) return;
    opening = true;
    try {
      const session = await prepareEdit(preview);
      if (preview.disposed) return;
      active = mountCellEditor(host, session, preview.plugin);
      active.onDone = () => { active = null; };
    } catch (error) { new Notice(error.message, 8000); }
    finally { opening = false; }
  };
  // Prevent the outer Markdown editor from revealing the fence before dblclick.
  const down = event => {
    if (!event.target?.closest?.('button, a, .latex-cell-editor')) event.stopPropagation();
  };
  preview.registerDomEvent(host, 'mousedown', down);
  preview.registerDomEvent(host, 'pointerdown', down);
  preview.registerDomEvent(host, 'dblclick', open);
  preview.registerDomEvent(host, 'keydown', event => {
    if (event.target === host && (event.key === 'Enter' || event.key === 'F2')) open(event);
  });
  preview.register(() => active?.dispose());
}

function mountCellEditor(host, session, plugin) {
  const ownerDocument = host.ownerDocument;
  const savedDraft = plugin.cellDrafts.get(session.key);
  const staleDraft = savedDraft && savedDraft.base !== session.source;
  const children = [...host.children].map(child => ({ child, hidden: child.hidden }));
  for (const { child } of children) child.hidden = true;
  host.classList.add('is-cell-editing');
  const panel = ownerDocument.createElement('div'); panel.className = 'latex-cell-editor'; host.append(panel);
  const hint = ownerDocument.createElement('div'); hint.className = 'latex-cell-hint';
  hint.textContent = 'LaTeX · Click outside or press Shift+Enter to render · Esc to cancel'; panel.append(hint);
  const field = ownerDocument.createElement('div'); panel.append(field);
  const error = ownerDocument.createElement('div'); error.className = 'latex-inline-error'; error.setAttribute('role', 'status'); panel.append(error);
  let busy = false, disposed = false, retained = false;
  const locking = new Compartment();
  const api = { onDone: null, dispose };
  const remember = () => {
    if (!retained) plugin.cellDrafts.set(session.key, { base: savedDraft?.base ?? session.source, source: view.state.doc.toString() });
  };
  function dispose() {
    if (disposed) return;
    remember(); disposed = true;
    ownerDocument.removeEventListener('pointerdown', outside, true);
    panel.removeEventListener('focusout', blur);
    view.destroy(); panel.remove();
    for (const { child, hidden } of children) child.hidden = hidden;
    host.classList.remove('is-cell-editing'); api.onDone?.();
  }
  async function commit() {
    if (busy || disposed) return;
    const next = view.state.doc.toString();
    if (next === session.source) { retained = true; plugin.cellDrafts.delete(session.key); dispose(); return; }
    busy = true; error.textContent = ''; remember();
    view.dispatch({ effects: locking.reconfigure(EditorState.readOnly.of(true)) });
    try {
      if (staleDraft) throw new Error('The source changed since this draft. Copy your text, press Esc, and reopen the current cell.');
      await session.save(next);
      retained = true; plugin.cellDrafts.delete(session.key); dispose();
    } catch (failure) {
      error.textContent = failure.message; busy = false;
      if (!disposed) view.dispatch({ effects: locking.reconfigure(EditorState.readOnly.of(false)) });
    }
  }
  function cancel() {
    if (busy) return;
    retained = true; plugin.cellDrafts.delete(session.key); dispose(); host.focus();
  }
  function outside(event) {
    const path = event.composedPath();
    // The completion menu may be portaled outside the editor.
    if (path.includes(panel) || path.some(node => node.classList?.contains('cm-tooltip-autocomplete'))) return;
    void commit();
  }
  function blur() {
    queueMicrotask(() => {
      const focused = ownerDocument.activeElement;
      if (!disposed && !panel.contains(focused) && !focused?.closest?.('.cm-tooltip-autocomplete')) void commit();
    });
  }
  const view = new EditorView({ parent: field, state: EditorState.create({
    doc: savedDraft?.source ?? session.source,
    extensions: [EditorView.lineWrapping, locking.of(EditorState.readOnly.of(false)), autocompletion({ override: [cellCompletion] }),
      EditorView.updateListener.of(update => { if (update.docChanged) remember(); }),
      keymap.of([
        { key: 'Shift-Enter', run: () => { void commit(); return true; } },
        { key: 'Mod-Enter', run: () => { void commit(); return true; } },
        { key: 'Escape', run: () => { cancel(); return true; } }
      ]),
      EditorView.domEventHandlers({ mousedown: event => { event.stopPropagation(); }, keydown: event => { event.stopPropagation(); } })
    ]
  }) });
  panel.addEventListener('focusout', blur);
  ownerDocument.addEventListener('pointerdown', outside, true);
  view.focus();
  api.view = view; api.commit = commit; api.cancel = cancel;
  return api;
}

module.exports = { attachCell, mountCellEditor, cellCompletion };
