const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.MutationObserver = dom.window.MutationObserver;
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
const proto = dom.window.HTMLElement.prototype;
proto.createEl = function(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.text) el.textContent = options.text;
  if (options.cls) el.className = options.cls;
  for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
  this.append(el); return el;
};
proto.createDiv = function(options) { return this.createEl('div', options); };
proto.createSpan = function(options) { return this.createEl('span', options); };
proto.addClass = function(name) { this.classList.add(name); };
proto.empty = function() { this.replaceChildren(); };
proto.setText = function(text) { this.textContent = text; };
let lastModal;
class Modal {
  constructor(app) { this.app = app; this.modalEl = document.createElement('div'); this.contentEl = this.modalEl.createDiv(); lastModal = this; }
  setTitle() {}
  open() { document.body.append(this.modalEl); this.onOpen(); }
  close() { this.onClose(); this.modalEl.remove(); }
}
class TFile { constructor() { this.path = 'Note.md'; } }
const filename = path.resolve(__dirname, '../src/visual-editor.js');
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths;
const originalRequire = loaded.require.bind(loaded);
loaded.require = name => name === 'obsidian' ? { Modal, TFile, Notice: class {}, normalizePath: p => p } : originalRequire(name);
loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
const { openVisualEditor } = loaded.exports;
const cellFilename = path.resolve(__dirname, '../src/cell-editor.js');
const cellModule = new Module(cellFilename, module); cellModule.filename = cellFilename; cellModule.paths = module.paths;
const cellRequire = cellModule.require.bind(cellModule);
cellModule.require = name => name === 'obsidian' ? { Notice: class {} } : name === './visual-editor' ? loaded.exports : cellRequire(name);
cellModule._compile(fs.readFileSync(cellFilename, 'utf8'), cellFilename);
const { mountCellEditor, cellCompletion } = cellModule.exports;
const tick = () => new Promise(resolve => setImmediate(resolve));
const button = (root, name) => [...root.querySelectorAll('button')].find(el => el.textContent === name);

function fixture() {
  const file = new TFile(); let content = 'Before\n```latex-cell\nHello world.\n```\nAfter';
  const editor = { getValue: () => content, offsetToPos: x => x,
    replaceRange: (text, from, to) => { content = content.slice(0, from) + text + content.slice(to); } };
  const app = { workspace: { getLeavesOfType: () => [{ view: { file, editor } }] },
    vault: { getAbstractFileByPath: () => file }, metadataCache: {} };
  const plugin = { app, visualDrafts: new Map(), settings: { preamble: '' }, renderHtml: (source, host) => { host.textContent = source; } };
  const preview = { plugin, source: 'Hello world.', context: { sourcePath: file.path, getSectionInfo: () => ({ lineStart: 1 }) }, containerEl: document.createElement('div'), refresh() {} };
  return { preview, plugin, editor, get content() { return content; }, set content(value) { content = value; } };
}

test('click, edit paragraph, and save changes only the LaTeX block', async () => {
  const f = fixture(); await openVisualEditor(f.preview);
  const modal = lastModal;
  button(modal.contentEl, 'Edit').click();
  const input = modal.contentEl.querySelector('.latex-block-text');
  input.value = 'New & improved.'; input.dispatchEvent(new window.Event('input'));
  button(modal.contentEl, 'Save to note').click(); await tick();
  assert.equal(f.content, 'Before\n```latex-cell\nNew \\& improved.\n```\nAfter');
  assert.equal(f.plugin.visualDrafts.size, 0);
});
test('concurrent note edit blocks save and keeps draft accessible', async () => {
  const f = fixture(); await openVisualEditor(f.preview); const modal = lastModal;
  button(modal.contentEl, 'Edit').click();
  const input = modal.contentEl.querySelector('.latex-block-text'); input.value = 'Draft'; input.dispatchEvent(new window.Event('input'));
  f.content += '\nA concurrent change';
  button(modal.contentEl, 'Save to note').click(); await tick();
  assert.match(modal.message.textContent, /note changed/);
  assert.match(f.content, /Hello world/); assert.equal(f.plugin.visualDrafts.size, 1);
  modal.close();
});
test('add and remove block can be undone without changing original source', async () => {
  const f = fixture(); await openVisualEditor(f.preview); const modal = lastModal;
  button(modal.contentEl, '+ Paragraph').click();
  assert.equal(modal.draft.blocks.length, 2);
  button(modal.contentEl, 'Undo block change').click();
  button(modal.contentEl, 'Save to note').click(); await tick();
  assert.equal(f.content, 'Before\n```latex-cell\nHello world.\n```\nAfter');
});
test('equation source field edits content while preserving math delimiters', async () => {
  const f = fixture(); await openVisualEditor(f.preview); const modal = lastModal;
  button(modal.contentEl, '+ Equation').click();
  assert.equal(modal.views.length, 1);
  const view = modal.views[0];
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '\\frac{1}{2}' } });
  button(modal.contentEl, 'Save to note').click(); await tick();
  assert.match(f.content, /\\\[\\frac\{1\}\{2\}\\\]/);
});

function cellFixture(save = async () => {}) {
  const host = document.createElement('div'); document.body.append(host);
  const output = host.createDiv({ text: 'Rendered output' });
  const plugin = { cellDrafts: new Map() };
  const cell = mountCellEditor(host, { source: 'Original', key: 'cell', save }, plugin);
  return { host, output, plugin, cell, type(value) { cell.view.dispatch({ changes: { from: 0, to: cell.view.state.doc.length, insert: value } }); } };
}
test('clicking outside a cell saves once and restores its output', async () => {
  const writes = [];
  const f = cellFixture(async value => { writes.push(value); });
  assert.equal(f.output.hidden, true); f.type('Edited');
  document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true, composed: true }));
  await tick();
  assert.deepEqual(writes, ['Edited']); assert.equal(f.output.hidden, false);
  assert.equal(f.host.querySelector('.latex-cell-editor'), null); assert.equal(f.plugin.cellDrafts.size, 0);
  f.host.remove();
});
test('cancel discards changes without saving', () => {
  let count = 0; const f = cellFixture(async () => count++); f.type('Draft'); f.cell.cancel();
  assert.equal(count, 0); assert.equal(f.output.hidden, false); assert.equal(f.plugin.cellDrafts.size, 0); f.host.remove();
});
test('a save conflict keeps the cell editor and draft', async () => {
  const f = cellFixture(async () => { throw new Error('Concurrent edit'); }); f.type('Draft'); await f.cell.commit();
  assert.match(f.host.textContent, /Concurrent edit/); assert.ok(f.host.querySelector('.latex-cell-editor'));
  assert.equal(f.plugin.cellDrafts.get('cell').source, 'Draft'); f.cell.dispose(); f.host.remove();
});
test('view teardown retains unsaved source', () => {
  const f = cellFixture(); f.type('Retained draft'); f.cell.dispose();
  assert.equal(f.plugin.cellDrafts.get('cell').source, 'Retained draft'); f.host.remove();
});
test('standalone cell completion uses correct replacement offsets', () => {
  const { EditorState } = require('@codemirror/state');
  const { CompletionContext } = require('@codemirror/autocomplete');
  const state = EditorState.create({ doc: '\\fr' });
  const result = cellCompletion(new CompletionContext(state, 3, false));
  assert.equal(result.from, 0); assert.ok(result.options.some(option => option.label === '\\frac'));
});
