# Feature backlog

Ideas for making keyword entry smarter (researched 2026-08-21), ranked by
value vs. effort. Not commitments - just what we want to keep in view.

## Ground rule for all of this

**Every control keeps a free-text escape hatch.** DDS is big, version-specific,
and full of keywords we won't have tabled. The editor must never block a
keyword or value we don't happen to know about - a smarter control is a
suggestion, never a gate.

We already do exactly this for the keyword *name*: `createKeywordNameSelect`
(`webui/main.js:2675`) is a `vscode-single-select` with `combobox = true` and
`creatable = true`, so you can pick from the list or just type something that
isn't on it. Every value control below should mirror that same pattern, which
makes this a proven direction rather than a new one. Note its workaround for
`.value` only selecting an entry already in `.options` - `CONTRIBUTING.md`
documents that gotcha, and it will bite again here.

## Where we are today

The Value field is one bare free-text `vscode-textfield`
(`webui/main.js:2728`). There is no per-keyword knowledge in the editor at
all - `COLOR(PURPLE)`, `DSPATR(ZZ)`, and a one-arg `WINDOW(1)` all save
silently. The only thing confirm does is uppercase (`webui/main.js:2787`).

What keyword knowledge the codebase *does* have is scattered and read-only,
none of it reaching the editor:

- `DDS_KEYWORDS` (`webui/main.js:2592`) - a flat `string[]` of ~120 names, no
  arity, level, values, or descriptions.
- `colours` / `dateFormats` / `timeFormats` (`webui/main.js:49-79`) - value
  maps used only when rendering the canvas.
- ~10 ad-hoc `keyword.name === 'X'` special cases: `WINDOW`
  (`src/ui/dspf.ts:766`), `WDWTITLE`/`WDWBORDER` (`webui/main.js:466-567`),
  `DSPSIZ`, `PAGSIZ`, `SFLCTL`/`SFLPAG`, and the printer spacing keywords
  (`src/ui/dspf.ts:287`).

The model is `interface Keyword { name, value?, conditions }`
(`src/ui/dspf.ts:820`) - **the value is one opaque string end to end**, pasted
verbatim inside `(...)` by `getLinesForKeyword` (`src/ui/dspf.ts:540`). Any
structured editing has to parse on open and recompose on confirm, or else
change that type and ripple through parse, serialize, and every consumer.

Good news on seed data: `.claude/skills/dds/SKILL.md` already holds the
richest keyword tables in the repo (DSPATR values, COLOR, EDTCDE, CHECK,
subfile keywords, WINDOW/WDWBORDER/WDWTITLE param forms, command keys). It's
Markdown and invisible to the extension, but it's the obvious source to
transcribe a real table from.

## Tier 1 - high value, low effort

- **Value dropdown for single-token enum keywords.** When the selected keyword
  has a known value set, swap the free-text box for a creatable combobox
  seeded with those values; an unknown keyword keeps the plain textfield
  exactly as today. Covers `COLOR`, `CHECK`, `EDTCDE`, `DATFMT`, `TIMFMT`,
  `SFLEND`. Show the meaning in the option label (`HI - High intensity`) while
  the saved value stays the bare code. This is the one the whole idea started
  from, and `COLOR`/`DSPATR` are far and away the most-used keywords in our
  own samples.
- **Rebuild the value control when the keyword name changes.** Prerequisite
  for the above - the name select has no change handler today, so the value
  row needs to re-render when a different keyword is picked.
- **List all 24 `CAxx`/`CFxx` in `DDS_KEYWORDS`.** Only `01/03/12/24` of each
  are there now, so `CF05` has to be typed by hand. `COMMAND_KEY_PATTERN`
  (`webui/main.js:1539`) already encodes the real range.

## Tier 2 - medium

- **Multi-value keywords.** `DSPATR(HI UL)` is a space-separated list, which a
  single-select can't express. Wants a `vscode-multi-select` or a row of
  checkboxes - with free text still reachable for anything not on the list.
- **Per-keyword description and level hint in the editor.** One line
  explaining the selected keyword and where it's legal (file / record /
  field). Purely additive, no validation. This is *not* the
  hover/IntelliSense-in-the-raw-source idea we ruled out - that was tooling
  over the DDS text; this is help text in the sidebar form we already render.
- **Structured parameter forms for positional keywords.** `WINDOW` gets four
  number boxes plus `*NOMSGLIN`; `CAxx`/`CFxx` gets indicator + optional
  quoted text; `SFLCTL` gets a dropdown of the subfile record names actually
  in the file; `SFLSIZ`/`SFLPAG` get one number; `REFFLD` gets a field name.
  Parse the string on open, recompose on confirm, and **fall back to the plain
  text box whenever parsing fails** - a hand-written value we can't parse must
  stay editable.

## Tier 3 - larger, and the unifying refactor

- **A real keyword metadata module.** One table - name to level, arity, param
  specs, allowed values, description - feeding the name list, the value
  control, the help text, and eventually validation. Consolidates everything
  currently split across `DDS_KEYWORDS`, the three render maps, and the ad-hoc
  special cases. Open question: `webui/main.js` is plain script with no module
  system, so the table either lives in the webview or needs a new `webui/`
  script wired into `index.html`; sharing it with `src/ui/dspf.ts` isn't free.
  Probably worth doing incrementally underneath Tier 1 rather than as a
  big-bang rewrite.
- **Soft, non-blocking validation warnings.** Flag an unrecognised value or a
  suspicious arity as a warning only. Never blocks confirm - see the ground
  rule.

## Bugs noticed while researching the keyword path

- **`getLinesForKeyword` emits no continuation lines**
  (`src/ui/dspf.ts:540`) - a long value overflows column 80 instead of
  wrapping with a `-`/`+` continuation.

## Explicitly not pursuing

- **REFFLD resolution against a live IBM i connection** - we're intentionally
  a local-only DDS source editor with no connection to a real IBM i system.
  Not worth chasing unless that scope changes.
- **Becoming a general RPG/ILE IDE** - out of scope; this stays a focused
  visual DDS designer.
- **Multi-size window resize** (`*DS3`/`*DS4`-conditioned `WINDOW` keywords,
  or paired window records per size) - real DDS support for this is either a
  niche, IBM-discouraged pattern or relies on an invented naming convention to
  pair two records as "the same window." Not worth the complexity for how
  rarely it's used.
- **Hover/IntelliSense keyword docs in the raw source editor** (seen in
  Carbon/400) - contextual completion/documentation when editing the raw DDS
  text directly, independent of the canvas. Ruled out for now. (The Tier 2
  description/level hint above is a different thing - it lives in the sidebar
  form, not over the text.)

## Reference

- [DSPF Designer](https://marketplace.visualstudio.com/items?itemName=Balrocj.dspf-designer) - closest direct competitor; we already beat it on subfile support, PRTF, record creation, undo/redo, and field snapping.
- [Display file DDS edit](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit) ([source](https://github.com/christianlarsen/dspf-edit))
- [Carbon/400](https://carbon400.com/en/)
- `.claude/skills/dds/SKILL.md` - in-repo DDS reference tables; best seed
  material for a keyword metadata table.
