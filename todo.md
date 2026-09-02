# Feature backlog

Ideas for making keyword entry smarter (researched 2026-08-21), ranked by
value vs. effort. Not commitments - just what we want to keep in view.

## Ground rule for all of this

**Every control keeps a free-text escape hatch.** DDS is big, version-specific,
and full of keywords we won't have tabled. The editor must never block a
keyword or value we don't happen to know about - a smarter control is a
suggestion, never a gate.

We already do exactly this for the keyword *name*: `createKeywordNameSelect`
(`webui/main.js:2791`) is a `vscode-single-select` with `combobox = true` and
`creatable = true`, so you can pick from the list or just type something that
isn't on it - and `createValueControl` right above it now mirrors that for the
value. Every control below should keep doing the same. Note the workaround for
`.value` only selecting an entry already in `.options` - `CONTRIBUTING.md`
documents that gotcha, and it bit again in `createValueControl`.

## Where we are today

Tier 1 is done (shipped after 0.3.3): `KEYWORD_VALUES` (`webui/main.js:2640`)
tables the single-token value sets, `keywordValueOptions`
(`webui/main.js:2694`) turns one into dropdown options, `createValueControl`
(`webui/main.js:2766`) picks the dropdown or the plain textfield, and the
name select rebuilds that row on change. `DDS_KEYWORDS` (`webui/main.js:2604`)
now spreads in all 48 `COMMAND_KEY_KEYWORDS`.

What's still true: there is no *structural* keyword knowledge in the editor -
`DSPATR(ZZ)` and a one-arg `WINDOW(1)` still save silently, and nothing knows
a keyword's arity. Level and description are now tabled (see Tier 2 below) but
only as help text - nothing checks a keyword against the level it's coded at.
The knowledge that does exist is still scattered, now across four tables
rather than two:

- `DDS_KEYWORDS` - a flat `string[]` of names, no arity; `KEYWORD_VALUES`,
  `KEYWORD_HELP` and `PRINTER_KEYWORD_HELP` sit beside it as separate tables,
  each keyed by name again.
- `colours` / `dateFormats` / `timeFormats` (`webui/main.js:49-79`) - value
  maps for the canvas, two of which `KEYWORD_VALUES` now also feeds from.
- ~10 ad-hoc `keyword.name === 'X'` special cases: `WINDOW`
  (`src/ui/dspf.ts:810`), `WDWTITLE`/`WDWBORDER` (`webui/main.js:466-567`),
  `DSPSIZ`, `PAGSIZ`, `SFLCTL`/`SFLPAG`, and the printer spacing keywords
  (`src/ui/dspf.ts:287`).

The model is `interface Keyword { name, value?, conditions }`
(`src/ui/dspf.ts:862`) - **the value is one opaque string end to end**, pasted
verbatim inside `(...)` by `getLinesForKeyword` (`src/ui/dspf.ts:546`). Any
structured editing has to parse on open and recompose on confirm, or else
change that type and ripple through parse, serialize, and every consumer.

Good news on seed data: `.claude/skills/dds/SKILL.md` already holds the
richest keyword tables in the repo (DSPATR values, COLOR, EDTCDE, CHECK,
subfile keywords, WINDOW/WDWBORDER/WDWTITLE param forms, command keys) - it's
where `KEYWORD_VALUES` was transcribed from, and still the place to start for
anything it doesn't cover yet.

## Tier 1 - done

All three shipped: the value dropdown for single-token enum keywords
(`COLOR`, `CHECK`, `EDTCDE`, `DATFMT`, `TIMFMT`, `SFLEND`), rebuilding the
value control when the keyword name changes, and all 24 `CAxx`/`CFxx` in the
name list. `DSPATR` was deliberately left out - it's space-separated
multi-value, which is Tier 2's first item.

## Tier 2 - medium

- ~~**Multi-value keywords.**~~ Done: `DSPATR` gets a checkbox per attribute
  over a text box that stays the value's source of truth (a
  `vscode-multi-select` isn't creatable, so it couldn't keep the escape
  hatch). `MULTI_VALUE_KEYWORDS` marks which keywords take a list; nothing
  else needs one yet.
- ~~**Per-keyword description and level hint in the editor.**~~ Done:
  `KEYWORD_HELP` / `PRINTER_KEYWORD_HELP` (`webui/main.js`) table a level list
  and a one-line description per keyword, transcribed from IBM's *DDS for
  display files* / *DDS for printer files*; `keywordHelpText` renders the line
  under the Keyword field and the name select refreshes it. Two tables rather
  than one because the file types barely overlap - a printer file gets the
  printer meaning of `COLOR`, and nothing at all for `DSPATR`. Purely
  additive: an untabled keyword hides the line. (Still *not* the
  hover/IntelliSense-in-the-raw-source idea we ruled out - that was tooling
  over the DDS text; this is help text in the sidebar form we already render.)
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

## Small, found on the way

- **Names in `DDS_KEYWORDS` that IBM's references don't carry.** Writing the
  help tables turned up 15 entries in the keyword name list that appear in
  neither *DDS for display files* nor *DDS for printer files*: `ALIGN`,
  `CONCAT`, `DATA`, `DFRWRT`, `END`, `FORMFEED`, `HLPPGM`, `OUTPUT`,
  `OVERFLOW`, `PAGSIZ`, `TRNSPARENCY`, `UDATE`, `UDAY`, `UMONTH`, `UYEAR`.
  Some look like misspellings of real keywords (`TRNSPARENCY` for `TRNSPY`),
  some like CRTPRTF parameters or RPG special words that aren't DDS keywords
  at all - but `PAGSIZ` is one we actively parse and render printer pages
  from, and `samples/intricate.prtf` codes it, so this needs deciding rather
  than a blind delete. The help-line test pins the list, so it fails loudly if
  the name list changes without this being revisited.

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
