# DSPF Editor

A visual, drag-and-drop designer for IBM i DDS source, right inside VS Code —
**display files** (`.dspf`) and **printer files** (`.prtf`). Open a file and
you get a live canvas that mirrors the real 5250 screen or printed page:
drag fields around, resize them, edit their properties and keywords from a
side panel, and every change writes straight back to the DDS source as
plain, correctly-column-aligned text. Edits made directly in the source
(by you, or by someone else's commit) reflect back on the canvas too — the
two stay in sync.

> This project began as a fork of
> [codefori/vscode-ibmi-renderer](https://github.com/codefori/vscode-ibmi-renderer)
> and is now developed independently.

## Getting started

Open any `.dspf` or `.prtf` file and the **Design** view opens automatically
— no setup, no configuration. Two views are available, switchable from the
icons in the editor's tab bar (or by right-clicking the file):

- **Design** (pencil icon) — the full editor. Select a record format, add
  and edit fields, edit keywords, create/rename/delete formats.
- **Preview** (eye icon) — read-only. Compose several record formats
  together to see how the screen or page looks when an RPG program
  `WRITE`s them without clearing in between (windows always draw on top,
  the same as a real display session).

## Design view

### Record formats

The **Selected Format** dropdown at the top switches between the record
formats in the file — it's searchable, so it scales to files with many
formats. Next to it:

- **＋ (Add a new record format)** — create a new, empty record format.
- **✎ (Rename the current record format)** — rename it in place; its
  fields and keywords are untouched.
- **🗑 (Delete the current record format)** — remove it entirely.

If the file's `DSPSIZ`/`PAGSIZ` defines more than one size (e.g. `*DS3` and
`*DS4` together), a size toggle appears next to the dropdown.

### Editing fields on the canvas

- **Move** — drag a field; it snaps to the character grid.
- **Resize** — hover the field's right edge to reveal a small handle, then
  drag it to change the field's length.
- **Select** — click a field to open its properties in the right sidebar,
  with two tabs:
  - **Basic** — name, position (X and Y are directly editable text
    fields, not just drag targets — handy for precise placement, or for a
    field too narrow to comfortably grab and drag), display type, DDS
    type, length, and decimals.
  - **Keywords** — add, edit, or delete the field's keywords, including
    conditioning indicators. A field or keyword can be conditioned by up
    to 9 indicators, coded as up to 3 groups of up to 3 — indicators
    within a group are ANDed together, and the groups themselves are ORed,
    matching real DDS (and SDA). Keywords whose value is a single code
    (`COLOR`, `CHECK`, `EDTCDE`, `DATFMT`, `TIMFMT`, `SFLEND`) offer a
    dropdown of the valid values with what each one means — and, like the
    keyword name itself, it stays a combobox you can just type into, so
    nothing stops you entering a keyword or value it doesn't know about.

### Adding new fields

The left sidebar's **Add Field** panel offers:

- **Named field**, **Date field**, **Time field**
- **Constant text**
- **System name constant** (`SYSNAME`), **System user constant** (`USER`),
  **Date constant**, **Time constant**

New fields land just below whatever's already in the format, so they never
land right on top of an existing one.

### Format- and file-level keywords

Alongside whatever field is selected (or on their own, if nothing is), the
right sidebar also has:

- **Format Keywords** — keywords on the currently selected record format
  (e.g. `WINDOW`, `SFLCTL`).
- **File Keywords** — file-level (screen-level) keywords that apply to the
  whole display/printer file (e.g. `DSPSIZ`/`PAGSIZ`, `INDARA`, `CA03`).

### Indicators

The **Indicators** panel (in the left sidebar, in both Design and Preview)
lists every indicator referenced anywhere in the file and lets you toggle
each on/off, to preview how conditional fields and keywords render under
different indicator states. This is a preview-only tool — indicator values
are supplied at runtime in a real DDS program, so nothing here is ever
saved to the source.

## Preview view

Read-only, and built for composing. The **Composed Formats** panel lists
every record format in the file — check as many as you like to layer them
together on one canvas, the way multiple `WRITE`s (without a `CLEAR`
between them) would actually look on screen or on a page. Windows always
render on top of whatever's underneath them.

## Windows

A record format with a `WINDOW` keyword renders as a bordered popup over
the base screen, including its border color (`WDWBORDER`) and title
(`WDWTITLE`) when present. Its own fields are coded in DDS *relative to the
window's own top-left corner* (row 1, column 1 = the window's own first
interior row/column) — not the screen — and the editor handles that
translation for you automatically, both when rendering and when you drag a
field inside a window.

## Subfiles

A record format driven by `SFLCTL` renders its subfile's repeated rows
using the template row's own field layout, honoring `SFLPAG` for how many
rows to show.

## Printer files (`.prtf`)

Printer files render as a page instead of a screen:

- The canvas is sized from `PAGSIZ` instead of `DSPSIZ` (defaulting to a
  standard 66×132 page if `PAGSIZ` isn't coded).
- A field's vertical position, when no line number is coded on it, is
  computed from `SPACEB`/`SKIPB`/`SPACEA`/`SKIPA` the way a real printer
  file lays out — not guessed.
- Only **Output** usage is offered for printer-file fields (no
  Input/Both/Hidden), since printer files have no interactive input.

## Feedback

Found a bug, or DDS that doesn't render the way you'd expect? Please
[open an issue](https://github.com/danlong005/DSPF-Editor/issues).
