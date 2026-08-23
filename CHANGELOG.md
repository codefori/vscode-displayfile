# Change Log

All notable changes to the "DSPF-Editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.4.0] - 2026-08-22

### Added

- `DSPATR` now gets a checkbox per display attribute (`HI - High intensity`, `UL - Underline`, ...) in the keyword editor, since its value is a space-separated list of attributes rather than a single code. The text box stays alongside them as the value's source of truth and stays fully editable, so a hand-written attribute we don't have tabled survives being ticked around, and typing into the box keeps the checkboxes in step.
- The keyword editor's Value field now offers a dropdown of the valid values for keywords whose value is a single code - `COLOR`, `CHECK`, `EDTCDE`, `DATFMT`, `TIMFMT` and `SFLEND` - each labelled with what it means (`Y - Date format (slashes)`), while what gets saved is just the bare code. It stays a creatable combobox, so a value that isn't on the list can still be typed, and a keyword with no known value set keeps the plain text box exactly as before. Picking a different keyword rebuilds the Value row to match.
- All 24 `CAxx` and `CFxx` command keys are now in the keyword name list - only `01`, `03`, `12` and `24` of each were there before, so anything else had to be typed by hand.

## [0.3.3] - 2026-08-22

### Fixed

- A keyword whose value ran past column 80 was written out as one over-long line, which DDS truncates at 80. Long keywords (a wordy `WDWTITLE`, say) now wrap onto continuation lines with a trailing `-`, so they compile and read back identically.
- Editing or deleting a keyword in the sidebar matched it by name and value, so two otherwise-identical keywords that differ only in their conditioning indicators (a pair of `DSPATR(HI)`s gated by different indicators, say) both acted on whichever one came first. Rows are now identified by position.
- The keyword editor saved a condition's indicator as a string (`"30"`) while every other producer of one uses a number, so a keyword conditioned through the form looked permanently "off" on the canvas - and its indicator showed up as a second, duplicate checkbox in the Indicators tab - until the document round-tripped through the parser again.
- A window title's `*COLOR` parameter (`WDWTITLE(*TEXT 'x' *COLOR RED)`) fell through into the `*DSPATR` case and pushed a bogus `DSPATR` keyword carrying the colour's value. With a malformed `*COLOR` that has no value after it, rendering that keyword threw and the whole format fell back to a blank canvas.

## [0.3.2] - 2026-08-18

### Added

- A read-only "Command Keys" tab in the sidebar, listing every `CAxx`/`CFxx` command-key keyword in the file and which record format it's on - including a file-level command key (coded before any record, applying to every format), labelled "File level" instead of being silently skipped.

### Fixed

- In the Preview view, checking a subfile control format's (`SFLCTL`) checkbox now also checks its subfile record's checkbox - the control format was already drawing the subfile's fields on screen either way, so the subfile's own checkbox looked unchecked/omitted despite being visible. Unchecking the control format afterward doesn't force the subfile back off, since it might still be wanted composed on its own.

## [0.3.1] - 2026-08-18

### Other

- Added an MIT license.

## [0.3.0] - 2026-08-18

### Added

- `Cmd`/`Ctrl+Z` now undoes canvas edits (and `Cmd+Shift+Z`/`Ctrl+Y` redoes them) while focus is on the canvas - previously only worked with focus in the text editor, since a webview doesn't automatically forward keybindings to VS Code.
- Windows can now be dragged and resized directly on the canvas, same as fields - drag the border to reposition it (border, title, and its own fields all move together), or drag the new handle in the bottom-right corner to resize it. Touching a `WINDOW(*DFT ...)` or `WINDOW(REF)` window this way converts it to the explicit `(startY startX sizeY sizeX)` form.

### Fixed

- Undo/redo (and any document change that didn't originate from the canvas itself, like typing directly in the source) only refreshed the sidebar, not the canvas - it now always fully rerenders so what's on screen actually matches the document.
- The keyword editor's Conditions section (up to 3 OR'd groups of 3 indicators) could push the Confirm button off-screen - it's now collapsed by default, auto-expanding only when editing a keyword that already has a condition set.

## [0.2.1] - 2026-08-18

### Changed

- Rewrote the README as real usage documentation for the Design/Preview views, windows, subfiles, indicators, and printer files - it was still describing an early "IBM i Renderer" prototype.
- Filled in the Marketplace description and added keywords/categories for discoverability.

## [0.2.0] - 2026-08-18

### Added

- Printer file (`.prtf`/`.PRTF`) support: the Design and Preview views now open for printer-file source too. Vertical field placement is computed accurately from `PAGSIZ` and the `SPACEB`/`SKIPB`/`SPACEA`/`SKIPA` line-advance keywords, not guessed - matching how a real printer file lays out when a line-number column is left blank. File type is detected from the file extension, not VS Code's language ID, since another extension controls what language ID gets assigned to `.prtf` files.
- The keyword combobox now includes `PAGSIZ`.
- A field or keyword can now be conditioned by up to 9 indicators, coded as up to 3 OR'd groups of up to 3 AND'd indicators each - matching SDA/real DDS. Previously only the first 3 (AND-only) were read; anything past that, and the AND/OR relator column, was silently dropped. The keyword condition editor now offers 3 groups of 3 indicators, with an OR divider between them.
- A "System user constant" button next to "System name constant", for the `*USER` keyword.
- The Basic field panel's Position is now editable (X and Y), instead of read-only text - a more precise way to reposition a field than dragging.
- An extension icon.

### Fixed

- The Add Field and Display Type controls no longer offer printer-illegal options (`Input`/`Both`/`Hidden`) when editing a printer file - printer-file fields are output-only.
- A canvas wider than its panel (a wide `PAGSIZ` printer page, or a large `DSPSIZ` alternate size) was centered, clipping both edges and hiding column 1 by default - it now always starts at the left edge.
- Fields inside a `WINDOW` record are coded in DDS relative to the window's own top-left corner, not the screen - they were being rendered (and dragged) as if their coordinates were absolute, so a window positioned away from the screen's own top-left rendered its fields in the wrong place.
- The drag handle used to resize a field's length covered almost the entire field when it was very narrow (e.g. 1 character wide), leaving no room to grab the field itself to move it - now capped at half the field's width.

## [0.1.1] - 2026-08-17

### Fixed

- Edits made through the renderer no longer autosave the source file. They apply to the open document like any other edit, so you can undo them (`Ctrl+Z`/`Cmd+Z`) or close without saving to discard them.

## [0.1.0] - 2026-08-17

### Added

- The renderer now opens automatically as the default editor for `.dspf` files, instead of requiring the source already open and a manual command.
- **Preview mode**: compose multiple record formats together, read-only, to see how a screen actually looks when an RPG program `WRITE`s several formats without clearing between them. Windows always render on top of whatever else is composed.
- **Indicators panel**: toggle indicators on/off to preview conditional field and keyword visibility (AND-only; the DDS AND/OR relator column isn't parsed yet).
- **File Keywords** and **Format Keywords** are now editable, and live together as tabs in the right-hand panel alongside the selected field's own properties/keywords.
- The sidebar's "add field" buttons (Named field, Date field, Time field, Constant text, System name/Date/Time constant) now actually create fields - they were previously wired up incorrectly and silently did nothing.
- Field properties (`Display Type`, `Type`) are now dropdowns instead of free text.
- The DDS keyword name field is a filterable, creatable combobox listing common DSPF/PRTF keywords, so you can pick one or type a name that isn't listed.
- The record-format selector is a searchable dropdown instead of a tab strip, so it scales to files with many record formats.
- Edits made through the renderer now save the source file automatically, and the render stays in sync with edits made directly in the source text too.

### Fixed

- Field spacing on the canvas no longer drifts from the actual DDS columns - the character grid is now measured from the real font instead of a hardcoded guess.
- A field whose name lands on the wrong DDS column (e.g. overlapping the record-type column) used to be silently dropped from the parsed model with no error.
- Several crashes in window rendering: a dead `Render.parseParms` reference, a missing `keywords` array on the window title, and a `colors`/`colours` typo.
- `DSPSIZ`-driven canvas sizing was doubling the pixel conversion, producing a wildly oversized canvas.
- Editing a field's `Type` didn't update its rendered placeholder character (I/O/B vs 3/6/9) - it was keyed off a value only the server-side parser ever computed.
- A property dropdown whose current value doesn't match any of its options (e.g. `Type` on a Date/Time field) could silently corrupt the field on the next edit instead of leaving it alone.
- A field with no length of its own (`REFFLD`/`REF`-referenced) rendered as an invisible, zero-width box.
- File-level (screen) keyword editing was fundamentally broken: the file-level record's line range was never initialized, and range-lookup functions explicitly excluded it.
- `globalFormat` was looked up by the literal name `GLOBAL` instead of `_GLOBAL`, silently broken since day one - `DSPSIZ`-based screen sizing only ever looked correct because the 80x24 default happened to match it.

### Other

- Added a `vm`-sandbox test harness and pure-logic test coverage for `webui/main.js`, which previously had none.
- Added `samples/intricate.dspf`, a multi-format sample file (subfile, window, indicators, referenced field) for exercising the renderer.