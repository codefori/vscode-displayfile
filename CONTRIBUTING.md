# Contributing

Thanks for your interest in improving the IBM i Renderer!

## Getting started

```sh
npm install
npm run build:frontend   # vendors vscode-elements, codicons, and Konva into webui/scripts
```

Press `F5` in VS Code to build and launch an Extension Development Host with the extension loaded. Opening a `.dspf` file there opens the renderer directly.

## Useful scripts

- `npm test` - runs the Vitest suite (`src/ui/dspf.ts` parser tests, plus a `vm`-sandbox harness with pure-logic tests for `webui/main.js`)
- `npm run check-types` - TypeScript type-checking
- `npm run lint` - ESLint over `src/`
- `npm run compile` - full build (frontend assets + type-check + lint + esbuild)

## Project layout

- `src/extension.ts` - activation, registers the custom editor provider
- `src/ui/index.ts` - `RendererWebview`, wires the webview to the DDS source document
- `src/ui/dspf.ts` - the DDS parser/model and line-generators (framework-agnostic, fully unit-testable)
- `webui/main.js` - the webview's rendering/UI logic (plain JS, no bundler)
- `samples/intricate.dspf` - a multi-format sample file for manually exercising the renderer

## Notes for AI-assisted contributions

If you're using an AI coding tool against this repo, a few things that came up repeatedly and are worth knowing up front:

- **VS Code webviews cache local resources by URL.** `getBaseHtml` in `src/ui/index.ts` already busts the cache on every load - if you're debugging something that "won't update," restart the whole Extension Development Host (not just the webview panel) after an extension-host change.
- **`vscode-single-select`'s `.value` only matches something already in `.options`** - it doesn't add unmatched values. Setting `.options` and `.value` is the reliable way to populate one; relying on slotted `<vscode-option>` children built while detached from the document is fragile.
- DDS is fixed-column. When generating or hand-editing sample DDS text, prefer building it through `DisplayFile.getLinesForField`/`getHeaderLinesForFormat`/`getLinesForKeyword` and round-tripping it back through `DisplayFile.parse` to verify, rather than typing columns by hand.

## Contributors

- Daniel Long ([@danlong005](https://github.com/danlong005))
