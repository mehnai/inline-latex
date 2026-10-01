# LaTeX Document Embed for Obsidian

The notebook block syntax is `latex-cell` (or `latex-cell-file` for linked files). The old `latex-pdf` and `latex-pdf-file` names remain supported aliases, so existing notes need no migration. Shared setup continues to use `latex-preamble`.

Write LaTeX directly in notes as selectable HTML, embed `.tex` documents, or opt into a locally compiled PDF for native LaTeX packages. Desktop only.

## Install

Copy `main.js`, `manifest.json`, `styles.css`, and the entire `assets/` folder into `<vault>/.obsidian/plugins/latex-document-embed/`, restart Obsidian, then enable **LaTeX Document Embed** under **Settings → Community plugins**. To build from source: `npm install && npm run build`.

## Inline LaTeX without a PDF

Use a backtick-delimited snippet prefixed with `latex:`:

```markdown
The result is `latex:\textbf{energy} $E=mc^2$` in this sentence.
```

Inline snippets render in Reading view and have a Live Preview editor extension. Move the cursor into the snippet to edit its source. Source mode keeps the literal code. For ordinary math alone, Obsidian's existing `$E=mc^2$` and `$$...$$` syntax continues to work.

## HTML documents without a PDF

Use a `latex` or `latex-document` block:

````markdown
```latex-document
\section{Results}
This is \textbf{bold} and \textit{italic} text.
\[ E = \frac{1}{2}mv^2 \]
\begin{itemize}
  \item First observation
  \item Second observation
\end{itemize}
```
````

Full documents with `\documentclass{article}` and `\begin{document}...\end{document}` also work within the HTML renderer's supported subset. Text reflows with the note, remains selectable, and uses isolated styles. Fonts and rendering libraries are bundled locally.

To embed a `.tex` file from the vault:

````markdown
```latex-file
Research/paper.tex
```
````

Paths resolve like Obsidian links, with a vault-relative fallback. Linked file edits refresh the embed. HTML does not resolve external `\input`, bibliography files, or arbitrary `.sty` packages.

## Faster first compile with Tectonic

Tectonic downloads TeX packages the first time they are used, which can take over a minute and can exceed the compile timeout. With the compiler set to Tectonic, run the command **Warm up Tectonic package cache** (or press **Warm up now** in settings) once. It compiles a throwaway document that loads common packages (AMS, TikZ, pgfplots, siunitx, mhchem, hyperref, and others), then deletes its temporary files. Turn on **Warm up on startup** to repeat it silently in the background; it is near-instant once the cache is full. Packages outside that list still download on first use.

## Optional PDF mode for native packages

Use `latex-cell` for inline source or `latex-cell-file` for a vault file path. This mode supports packages installed in your local TeX distribution, including TikZ and AMS packages.

````markdown
```latex-cell
\documentclass{article}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}
\draw[blue,thick] (0,0) circle (1cm);
\end{tikzpicture}
\end{document}
```
````

Choose pdfLaTeX, XeLaTeX, LuaLaTeX, or Tectonic in settings. The compiler is auto-detected in common locations, or you can enter its full path.

Fragments without a document class receive the configurable PDF preamble. Complete documents use their own preamble. Standard TeX engines run twice for cross-references; BibTeX/Biber and external build tools are not invoked. Tectonic manages its own passes and may download packages on first use. Paths for figures and `\input` are relative to the containing note or linked `.tex` file. Click **Compile** after changing dependent files.

PDF previews crop blank page margins and display the actual content at a natural text size instead of shrinking an entire paper page. Small formulas stay small; wide content fits the note. Use **− / 100% / +** to change or reset the size. Previews grow vertically with their content, without a nested scrolling PDF box. Page navigation remains available for multi-page documents.

Dark mode automatically inverts the preview and adjusts hues; the paper background blends into the note. This affects only the preview, including any photographs or figures. **Save PDF** still saves the compiled PDF with its original colors and page layout.

Fragments omit page numbers automatically. For a full document that should appear like a compact note fragment, add `\pagestyle{empty}` to its preamble; a printed page number is real content and otherwise remains visible below the text.

Errors show compiler output and preserve the last successful preview. Temporary build files are removed after compilation. Shell escape is disabled; compile only documents you trust because a native TeX engine can still read local files.

## LaTeX autocomplete

In a `latex-cell`, `latex-document`, `latex`, or `tex` code block, an inline `latex:` snippet, or normal `$...$` / `$$...$$` math, type a backslash to get command suggestions. Examples: `\fr` for a fraction, `\al` for alpha, and `\begin` for environment templates. Select with the arrow keys and Enter; snippet placeholders can be traversed with Tab. Ctrl+Space requests completion explicitly.

Typing inside `\usepackage{...}` suggests common package names, including comma-separated lists. Typing inside `\begin{...}` or `\end{...}` suggests environments. Suggestions do not install packages or extend the HTML renderer's capabilities; native packages still require PDF mode and a local TeX installation. The suggestions are a curated list, not a TeX language server or a syntax-repair engine.

## Notebook-style LaTeX cells

Use the command **LaTeX Document Embed: Insert LaTeX cell**, or write a `latex-cell` block. Each block is an independent cell in the note:

1. In Reading view or Live Preview, double-click its rendered output to edit source in place. Keyboard users can focus the cell and press Enter or F2.
2. Type LaTeX with autocomplete. No modal opens.
3. Click outside the cell, Tab out of the editor, or press Shift+Enter / Cmd+Enter to save and render it.
4. Press Escape to cancel the current edits.

Paper pixels are converted to transparency, so there is no solid white or black rectangle. Dark mode inverts only the remaining artwork. This also removes white from images inside the preview; saved PDFs are unchanged. Controls such as page navigation and sizing appear on hover/focus rather than occupying a permanent toolbar.

The same double-click behavior works on `latex`, `latex-document`, `latex-preamble`, and linked-file blocks. Source remains stored in Markdown fences (or the linked `.tex` file), but the normal note view presents rendered cells. Each PDF cell compiles separately and can inherit packages and macros from setup cells above it.

## Shared packages and macros within a note

Put setup at the top of the note, then use its definitions in subsequent PDF cells:

````markdown
```latex-preamble
\usepackage{amsmath}
\usepackage{tikz}
\newcommand{\vect}[1]{\mathbf{#1}}
```

```latex-cell
\[ \vect{F} = m\vect{a} \]
```

```latex-cell
\begin{tikzpicture}
\draw[blue,thick] (0,0) circle (1cm);
\end{tikzpicture}
```
````

Use **Insert shared LaTeX setup** from the command palette, or type a `latex-preamble` fence. Double-click the setup cell to edit it in place, then click outside to save.

Setup is cumulative, scoped to the containing note, and evaluated from top to bottom. A setup cell affects only PDF cells below it. Multiple setup cells are concatenated in note order. Use `\renewcommand` when deliberately changing a macro already defined above. Preamble declarations must contain packages and definitions, not document wrappers or body text.

For fragments, the global plugin preamble comes first, then the preceding note setup. For full documents, note setup is inserted immediately after `\documentclass`, before the cell's own preamble; global fragment defaults are not injected. Linked `latex-cell-file` cells inherit the setup from the note embedding them. Loading the same package with different options can produce normal LaTeX option-clash errors; put its declaration in only one place.

When automatic compilation is enabled, changes to note setup recompile affected visible cells after a short debounce. Otherwise use **Compile** or **Recompile visible documents**. Setup does not extend HTML rendering or normal Obsidian `$...$` math. Execution order, counters, labels, bibliography state, and macros defined in the body of an earlier PDF cell are not carried between separate compilations.

Failed compilation displays diagnostics with the saved source still available for editing. A save conflict keeps the in-place editor open. Unsaved source from a removed view is retained in memory until plugin reload and can be recovered by reopening the same cell; stale drafts require copying and cancelling before editing the newer source.

## Optional structural block editor

The **Edit blocks** hover control still opens the optional structural editor with a card for each paragraph, heading, equation, or environment. Click a card or **Edit** to change it. Previews update as you type. For everyday notebook editing, double-click the output instead.

- Plain paragraphs and simple headings have ordinary text fields; special LaTeX characters are escaped for you.
- Equations and complex blocks have a LaTeX source field with autocomplete. The equation delimiters stay outside the field.
- Add paragraphs, headings, equations, and lists; move blocks with the arrows or remove them. **Undo block change** restores structural changes or the state before opening a block for editing.
- **Document setup and packages** exposes a full document's preamble. For a fragment, click **Wrap as full document** first if you want a per-document preamble.
- **Save to note** updates the Markdown fence or linked `.tex` file. In an open Markdown editor, the replacement is an editor operation so ordinary note undo remains available.
- **Close — keep draft** retains the draft in memory until plugin reload. **Discard draft** leaves the source unchanged. **Copy LaTeX** copies the whole draft.

Saving is blocked if the note/file changes while the editor is open. Copy the draft and reopen the current source instead of overwriting concurrent changes. Repeated identical blocks require an exact note location. Top-level backtick and tilde fences are supported; fences nested in lists or blockquotes are not supported by this editor.

This is a structured block editor, not a complete Overleaf-style rich-text editor. Formatting macros, custom commands, and nested environments remain editable LaTeX. Blocks that need the document preamble, cross-references, or unsupported native packages show a source preview; the full PDF still compiles after saving. The parser preserves original source exactly until you edit it and groups common structures, but does not implement the full TeX language.

## Compatibility and limits

- HTML uses [LaTeX.js](https://latex.js.org/usage.html), which implements a subset of LaTeX. Arbitrary native packages cannot run in it; see its [limitations](https://latex.js.org/limitations.html). Unsupported commands produce errors; some package declarations may only produce renderer warnings.
- Native packages, arbitrary custom TeX macros, complex bibliographies, and exact print layouts should use explicit PDF mode. There is no automatic PDF fallback.
- HTML math uses the KaTeX implementation bundled by LaTeX.js; this plugin does not modify Obsidian's global MathJax extensions.
- Inline snippets should contain a short text/math fragment, not block environments or multiple paragraphs.
- Tests cover HTML output, real AMS/TikZ compilation, errors, cancellation, timeout, content cropping, sizing, and autocomplete contexts.
- Actual Obsidian Live Preview behavior and PDF canvas presentation still need an in-app smoke test; the browser visual check was blocked by denied local-preview access.

## Development

Development files live in the hidden `.obsidian-latex-embed/` folder at the vault root so they do not clutter Obsidian's file explorer. The installed plugin remains in `.obsidian/plugins/latex-document-embed/`.

```sh
cd .obsidian-latex-embed
npm ci
npm test
npm run build
```

Source lives in `src/`. The build bundles JavaScript and copies the required styles/fonts into `assets/`; CodeMirror and Obsidian remain host-provided dependencies. Tests use a DOM fixture and run the real compiler when available. Override `LATEX_TEST_COMPILER` to specify another pdfLaTeX binary.

Relevant APIs: [Obsidian Markdown processing](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Markdown%20post%20processing.md), [Tectonic compilation](https://tectonic-typesetting.github.io/book/latest/v2cli/compile.html).
