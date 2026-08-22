/** 
 * @typedef {import('./dspf.d.ts').DisplayFile} DisplayFile
 * @typedef {import('./dspf.d.ts').RecordInfo} RecordInfo
 * @typedef {import('./dspf.d.ts').FieldInfo} FieldInfo
 * @typedef {import('./dspf.d.ts').Keyword} Keyword
 * @typedef {import("konva").default.Rect} Rect
 * @typedef {import("konva").default.Stage} Stage
 * @typedef {import("konva").default.Group} Group
 * @typedef {import("konva").default.Layer} Layer
 * @typedef {{label: string, id?: string, value: string, options?: {label: string, value: string}[]}} Property
 * @typedef {{[key: string]: string}} NewProperties
 * @typedef {{title: string, html: string|Element}} Tab
 */

// Surfaces uncaught errors directly in the webview, since the extension host's
// devtools picker doesn't reliably target this webview over others (e.g. chat).
function showRendererError(error) {
  // vscode-elements' own combobox has a known internal bug: typing a filter
  // that matches no options while keyboard navigation is still "active"
  // leaves it reading a stale index and throwing from its own keydown
  // listener. That listener is registered by the library directly on the
  // DOM element, invoked by the browser itself - not something our code
  // calls into, so it can't be try/caught at the call site. This is the
  // only place it can be intercepted, so treat anything thrown from inside
  // that library as non-fatal noise: log it, but never surface the banner.
  if (error && typeof error.stack === `string` && error.stack.includes(`vscode-elements.js`)) {
    console.warn(`Ignored an internal vscode-elements error:`, error);
    return;
  }

  let banner = document.getElementById(`rendererErrorBanner`);
  if (!banner) {
    banner = document.createElement(`div`);
    banner.id = `rendererErrorBanner`;
    banner.style.background = `#5a1d1d`;
    banner.style.color = `white`;
    banner.style.padding = `0.5em 1em`;
    banner.style.fontFamily = `monospace`;
    banner.style.whiteSpace = `pre-wrap`;
    document.body.prepend(banner);
  }

  banner.textContent = (error && error.stack) ? error.stack : String(error);
}

window.addEventListener(`error`, (event) => showRendererError(event.error || event.message));
window.addEventListener(`unhandledrejection`, (event) => showRendererError(event.reason));

const colours = {
  RED: `red`,
  BLU: `#4287f5`,
  WHT: `#FFFFFF`,
  GRN: `green`,
  TRQ: `turquoise`,
  YLW: `yellow`,
  PNK: `pink`,
  BLK: `black`,
};

const SELECTED_COLOUR = `#383838`;

const dateFormats = {
  '*MDY': `mm/dd/yyyy`,
  '*DMY': `dd/mm/yyyy`,
  '*YMD': `yyyy/mm/dd`,
  '*JUL': 'yy/ddd',
  '*ISO': 'yyyy-mm-dd',
  '*USA': 'mm/dd/yyyy',
  '*EUR': 'dd.mm.yyyy',
  '*JIS': 'yyyy-mm-dd',
};

const timeFormats = {
  '*HMS': 'hh:mm:ss',
  '*ISO': 'hh.mm.ss',
  '*USA': 'hh:mm am',
  '*EUR': 'hh.mm.ss',
  '*JIS': 'hh:mm:ss',
};

const GLOBAL_RECORD_FORMAT = `_GLOBAL`;

const vscode = acquireVsCodeApi();

// Design and Preview are two separate registered custom editors for the same
// file (see package.json's customEditors / src/extension.ts) sharing this
// same webview bundle - baked into the served HTML per-panel (index.html's
// inline `window.__mode__` script, set from RendererWebview's `mode`), since
// a panel is one or the other for its whole lifetime, never both.
const isPreviewMode = (typeof window !== `undefined` && window.__mode__) === `preview`;

// Cmd/Ctrl+Z (and redo) pressed while focus is inside this webview never
// reaches VS Code's own keybinding service - focus has moved into this
// webview's own separate browser context, so the keystroke is purely a DOM
// event here unless something forwards it. Every canvas edit already goes
// through workspace.applyEdit (see RendererWebview.onDidGetMessage), so the
// underlying document's real undo/redo stack already has everything - this
// just asks the extension host to invoke it. Skipped while an actual text
// input has focus (e.g. typing a field's name) so that keystroke undoes the
// user's typing there instead, via the input's own native undo.
document.addEventListener(`keydown`, (event) => {
  const target = event.target;
  const isEditableTarget = !!(target && (
    target.tagName === `INPUT` ||
    target.tagName === `TEXTAREA` ||
    target.isContentEditable
  ));
  if (isEditableTarget) { return; }

  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) { return; }

  const key = event.key.toLowerCase();
  const isRedo = (key === `z` && event.shiftKey) || (key === `y` && event.ctrlKey);
  const isUndo = key === `z` && !event.shiftKey;
  if (!isUndo && !isRedo) { return; }

  event.preventDefault();
  vscode.postMessage({ command: isRedo ? `redo` : `undo` });
});

const FONT_SIZE = 14;
const FONT_FAMILY = `Consolas, "Liberation Mono", Menlo, Courier, monospace`;

// Measures the font's real glyph advance width so the pixel grid used for
// field positions/widths stays in lockstep with what the canvas actually draws.
/**
 * @param {string} fontFamily
 * @param {number} fontSize
 */
function measureCharWidth(fontFamily, fontSize) {
  const canvas = document.createElement(`canvas`);
  const ctx = canvas.getContext(`2d`);
  ctx.font = `${fontSize}px ${fontFamily}`;

  const sample = `0`.repeat(50);
  return ctx.measureText(sample).width / sample.length;
}

const pxwPerChar = measureCharWidth(FONT_FAMILY, FONT_SIZE);
const pxhPerLine = 20;
const pxhPerChar = 12.5;

function snapToFixedGrid(x, y) {
  const newX = Math.round(x / pxwPerChar) * pxwPerChar;
  const newY = Math.round(y / pxhPerLine) * pxhPerLine;
  return {x: newX, y: newY};
}

/**
 * @param {{x: number, y: number}} [offset] the same window offset getElement
 *   rendered this field with - subtracted back out so a dragged window
 *   field's saved position stays relative to the window, not the screen.
 */
function gridCordsToFieldCords(x, y, offset = { x: 0, y: 0 }) {
  return {
    x: Math.round(x / pxwPerChar) + 1 - offset.x,
    y: Math.round(y / pxhPerLine) + 1 - offset.y
  };
}

function widthInP(x) {
  return x * pxwPerChar;
}

function heightInP(x) {
  return x * pxhPerLine;
}

/** @type {DisplayFile|undefined} */
let activeDocument = undefined;

/** @type {"dds.dspf"|"dds.prtf"|undefined} */
let activeDocumentType = undefined;

/** @type {string|undefined} */
let lastSelectedFormat = undefined;

// Other formats to render layered on top of lastSelectedFormat, previewing how
// the screen looks when an RPG program WRITEs several formats without clearing
// between them. Only offered/rendered in the Preview view (isPreviewMode).
/** @type {Set<string>} */
let composedFormats = new Set();

// Which DSPSIZ size is currently selected for rendering, when a file defines
// more than one (e.g. *DS3 and *DS4 together). Only meaningful/shown when
// there's actually a choice to make.
/** @type {string|undefined} */
let dspSizeQualifier = undefined;

/** @type {Stage|undefined} */
let existingStage = undefined;

// Which indicators are currently "on", for previewing conditional display in
// the renderer. This is session-only UI state - indicator values aren't part
// of the DDS source, they're supplied at runtime, so this never gets saved.
/** @type {Set<number>} */
let activeIndicators = new Set();

// Which tab of the left (Composed Formats/Indicators) sidebar is selected.
// Toggling a checkbox in either tab triggers a full re-render of this
// sidebar (see setWindowForFormat -> updateRecordFormatSidebar) - without
// remembering this, that re-render would always snap back to the first tab.
let recordFormatSidebarTabIndex = 0;

/**
 * DDS's real model: a field/keyword's conditions are OR'd-together
 * AND-groups (up to 3 groups, via continuation lines - see
 * DisplayFile.appendConditionLine) - satisfied if ANY one group has ALL of
 * its own indicators satisfied.
 * @param {import('./dspf.d.ts').ConditionGroup[]} conditions
 */
function indicatorsSatisfied(conditions) {
  if (conditions.length === 0) { return true; }

  return conditions.some(group =>
    group.indicators.every(cond => activeIndicators.has(cond.indicator) !== cond.negate)
  );
}

/**
 * @returns {number[]} every indicator referenced anywhere in the document, sorted.
 */
function getReferencedIndicators() {
  /** @type {Set<number>} */
  const indicators = new Set();

  const collect = (conditions) => conditions.forEach(group => group.indicators.forEach(c => indicators.add(c.indicator)));

  (activeDocument?.formats || []).forEach(format => {
    format.keywords.forEach(keyword => collect(keyword.conditions));
    format.fields.forEach(field => {
      collect(field.conditions);
      field.keywords.forEach(keyword => collect(keyword.conditions));
    });
  });

  return Array.from(indicators).sort((a, b) => a - b);
}

/**
 * @param {DisplayFile} newDoc
 * @param {"dds.dspf"|"dds.prtf"} type
 */
function loadDDS(newDoc, type, withRerender = true) {
  activeDocument = newDoc;
  activeDocumentType = type;

  if (!withRerender) {
    // A full re-render didn't happen here - field-level edits (see
    // sendFieldUpdate) update the canvas/right sidebar optimistically on
    // their own instead, to avoid the flicker of a full teardown/rebuild.
    // But a keyword's conditions could change which indicators are
    // referenced, so the left sidebar's Indicators tab still needs to
    // catch up now that activeDocument has the fresh data.
    if (isPreviewMode) {
      updatePreviewSidebar();
    } else {
      updateRecordFormatSidebar();
    }
    return;
  }

  const validNames = activeDocument.formats
    .filter(format => format.name !== GLOBAL_RECORD_FORMAT)
    .map(format => format.name);

  if (isPreviewMode) {
    // No dropdown/"selected format" here - just drop any composed selections
    // for formats that no longer exist, then re-render whatever's left checked.
    composedFormats.forEach(name => {
      if (!validNames.includes(name)) { composedFormats.delete(name); }
    });
    renderComposedPreview();
    return;
  }

  // Never leave the selector on a blank/stale format - fall back to the
  // first one whenever there isn't already a valid selection (first load,
  // or the previously-selected format got renamed/deleted).
  const chosenFormat = (lastSelectedFormat && validNames.includes(lastSelectedFormat))
    ? lastSelectedFormat
    : validNames[0];

  setTabs(validNames, chosenFormat);

  if (chosenFormat) {
    setWindowForFormat(chosenFormat);
  }
}

/**
 * Blanks the canvas and both side panels - used whenever there's nothing
 * sensible to render (an unrecognized format name) or something unexpected
 * went wrong while trying to. Never shows an error to the user for this;
 * that's the whole point of showing nothing instead.
 */
function clearRenderedScreen() {
  if (existingStage) {
    existingStage.destroy();
    existingStage = undefined;
  }
  document.getElementById(`recordFormatSidebar`).innerHTML = ``;
  document.getElementById(`fieldInfoSidebar`).innerHTML = ``;
}

function setWindowForFormat(chosenFormat) {
  const selectedFormat = activeDocument.formats.find(currentFormat => currentFormat.name === chosenFormat);

  if (!selectedFormat) {
    // Not a real error the user needs to see (e.g. still typing into the
    // format combobox) - just show nothing rather than leaving stale
    // content on screen or logging a visible error.
    clearRenderedScreen();
    return;
  }

  // Belt and braces around the whole render: if anything here throws for a
  // reason we haven't anticipated (including inside a third-party component
  // we don't control), fall back to a blank screen instead of surfacing the
  // global error banner for what's still just "couldn't render this".
  try {
    renderFormat(chosenFormat, selectedFormat);
  } catch (error) {
    console.warn(`Failed to render format "${chosenFormat}":`, error);
    clearRenderedScreen();
  }
}

/**
 * The Preview view's render entry point - unlike Design's setWindowForFormat,
 * there's no single "selected" format (no dropdown in this view at all): the
 * canvas just shows every format currently checked in the Composed Formats
 * tab, layered together, all read-only. Called on load and whenever the
 * checked formats or active indicators change.
 */
function renderComposedPreview() {
  try {
    const globalFormat = activeDocument.formats.find(format => format.name === GLOBAL_RECORD_FORMAT);
    const { width: renderWidth, height: renderHeight } = getPageSize(globalFormat);

    let width = renderWidth * pxwPerChar;
    let height = renderHeight * pxhPerLine;

    if (existingStage) { existingStage.destroy(); }

    existingStage = new Konva.Stage({ container: `container`, width, height });
    const bg = new Konva.Rect({ x: 0, y: 0, width, height, fill: colours.BLK });
    let layer = new Konva.Layer({ id: `preview` });
    layer.add(bg);

    const formatsToRender = Array.from(composedFormats)
      .map(name => activeDocument.formats.find(format => format.name === name))
      .filter(Boolean);

    // Windows always draw on top of everything else - Array#sort is stable,
    // so this only reorders windows-vs-non-windows and otherwise preserves
    // the order the formats were checked in.
    formatsToRender.sort((a, b) => Number(a.isWindow) - Number(b.isWindow));

    // Routing through renderSelectedFormat (not addFieldsToLayer directly)
    // means a composed format that's itself a window still gets its
    // border/background drawn.
    formatsToRender.forEach(format => {
      renderSelectedFormat(layer, format, true);
    });

    existingStage.add(layer);
    updatePreviewSidebar();
    setActiveField();
  } catch (error) {
    console.warn(`Failed to render preview:`, error);
    clearRenderedScreen();
  }
}

/**
 * @param {string} chosenFormat
 * @param {RecordInfo} selectedFormat
 */
function renderFormat(chosenFormat, selectedFormat) {
  const globalFormat = activeDocument.formats.find(currentFormat => currentFormat.name === GLOBAL_RECORD_FORMAT);
  const { width: renderWidth, height: renderHeight } = getPageSize(globalFormat);

  let width = renderWidth * pxwPerChar;
  let height = renderHeight * pxhPerLine;

  if (existingStage) {
    existingStage.destroy();
  }

  existingStage = new Konva.Stage({
    container: 'container',
    width: width,
    height: height
  });

  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: width,
    height: height,
    fill: colours.BLK
  });

  bg.on('pointerclick', () => {
    setActiveField();
  });

  let layer = new Konva.Layer({
    id: selectedFormat.name
  });

  layer.add(bg);

  // This is the Design view's render path - always exactly one format,
  // fully editable. Composing several formats together read-only is the
  // Preview view's job entirely now (see renderComposedPreview).
  lastSelectedFormat = chosenFormat;
  renderSelectedFormat(layer, selectedFormat, false);

  existingStage.add(layer);

  updateRecordFormatSidebar();
  setActiveField();
}

/**
 *
 * @param {Layer} layer
 * @param {RecordInfo} [format]
 * @param {boolean} [displayOnly] render read-only, for a format composed alongside the focused one
 */
function renderSelectedFormat(layer, format, displayOnly = false) {
  /** @type {RecordInfo|undefined} */
  let windowFormat;

  /** @type {{baseX: number, baseY: number, baseWidth: number, baseHeight: number, x: number, y: number, width: number, height: number, color?: string}|undefined} */
  let windowConfig;

  /** @type {FieldInfo|undefined} */
  let windowTitle;

  const recordFormat = format;

  if (recordFormat) {
    if (recordFormat.isWindow) {
      if (recordFormat.windowReference) {
        windowFormat = activeDocument.formats.find(currentFormat => currentFormat.name === recordFormat.windowReference);
      } else {
        windowFormat = recordFormat;
      }

      const { x, y, width, height } = windowFormat.windowSize;
      windowConfig = {
        baseX: x,
        baseY: y,
        baseWidth: width,
        baseHeight: height, 
        x: widthInP(x),
        y: heightInP(y),
        width: widthInP(width),
        height: heightInP(height-1)
      };

      const borderInfo = windowFormat.keywords.find(keyword => keyword.name === `WDWBORDER`);
      if (borderInfo) {
        parts = parseParms(borderInfo.value);

        parts.forEach((part, index) => {
          switch (part.toUpperCase()) {
          case `*COLOR`:
            windowConfig.color = parts[index + 1];
            break;
          }
        });
      }

      const windowInfo = windowFormat.keywords.find(keyword => keyword.name === `WDWTITLE`);
      if (windowInfo) {
        windowTitle = {
          name: `WINDOWTITLE`,
          displayType: `const`,
          type: `A`,
          primitiveType: `char`,
          keywords: []
        };

        let xPositionValue = `center`;
        let yPositionValue = `top`;

        parts = parseParms(windowInfo.value);

        parts.forEach((part, index) => {
          switch (part.toUpperCase()) {
          case `*TEXT`:
            windowTitle.value = parts[index + 1];
            break;
          case `*COLOR`:
            windowTitle.keywords.push({
              name: `COLOR`,
              value: parts[index + 1],
              conditions: []
            });
            break;
          case `*DSPATR`:
            windowTitle.keywords.push({
              name: `DSPATR`,
              value: parts[index + 1],
              conditions: []
            });
            break;

          case `*CENTER`:
          case `*LEFT`:
          case `*RIGHT`:
            xPositionValue = part.substring(1).toLowerCase();
            break;

          case `*TOP`:
          case `*BOTTOM`:
            yPositionValue = part.substring(1).toLowerCase();
            break;
          }
        });

        // No *TEXT means nothing to actually show - WDWTITLE without it
        // isn't meaningful DDS, but don't crash rendering the rest of the
        // window over it.
        if (!windowTitle.value) {
          windowTitle = undefined;
        } else {
          // If no color is found, the default is blue.
          if (!windowTitle.keywords.find(keyword => keyword.name === `COLOR`)) {
            windowTitle.keywords.push({
              name: `COLOR`,
              value: `BLU`,
              conditions: []
            });
          }

          const txtLength = windowTitle.value.length;

          // Relative to the window's own top-left corner (1, 1) - the
          // window's own draggable Group (below) supplies its actual screen
          // position via its own transform, so these no longer fold
          // windowConfig.baseX/baseY in directly.
          const yPosition = (yPositionValue === `top` ? 0 : windowConfig.baseHeight);
          let xPosition = 1;

          switch (xPositionValue) {
          case `center`:
            xPosition = 1 + Math.floor((windowConfig.baseWidth / 2) - (txtLength / 2));
            break;
          case `right`:
            xPosition = 1 + windowConfig.baseWidth - txtLength;
            break;
          case `left`:
            xPosition = 1;
            break;
          }

          windowTitle.position = {
            x: xPosition,
            y: yPosition
          };
        }
      }
    }
  }

  /** @type {Group|undefined} everything belonging to this window (border,
   * resize handle, title, its own fields) lives inside this one draggable
   * Group, so dragging it moves all of that together, live. */
  let windowGroup;

  if (windowFormat) {
    if (windowConfig) {
      windowGroup = new Konva.Group({
        id: `${format.name}::window`,
        x: windowConfig.x,
        y: windowConfig.y,
        draggable: !displayOnly,
      });

      windowGroup.on(`dragmove`, () => {
        const snapped = snapToFixedGrid(windowGroup.x(), windowGroup.y());
        windowGroup.x(snapped.x);
        windowGroup.y(snapped.y);
      });

      windowGroup.on(`dragend`, () => {
        const absolute = windowGroup.absolutePosition();
        const snapped = snapToFixedGrid(absolute.x, absolute.y);
        windowGroup.absolutePosition(snapped);

        // Inverts windowConfig.x/y's own widthInP(baseX)/heightInP(baseY) -
        // NOT gridCordsToFieldCords, which assumes a field's "-1" convention
        // (pixel = widthInP(pos - 1)), one character off from a window's own
        // start-position convention (pixel = widthInP(base), no "-1").
        const startX = Math.round(snapped.x / pxwPerChar);
        const startY = Math.round(snapped.y / pxhPerLine);

        sendWindowResize(format, startY, startX, windowConfig.baseHeight, windowConfig.baseWidth);
      });

      const windowColor = colours[windowConfig.color] || colours.BLU;

      // Windows have an opaque interior in a real 5250 session - they cover
      // whatever's underneath, not just outline it. Matters most when this
      // format is composed on top of another one that already drew content
      // in the same area.
      /** @type {Rect} */
      const windowRect = new Konva.Rect({
        id: `windowBorder`,
        x: 0,
        y: 0,
        width: windowConfig.width,
        height: windowConfig.height,
        fill: colours.BLK,
        stroke: windowColor,
      });

      windowGroup.add(windowRect);

      if (!displayOnly) {
        windowGroup.add(createWindowResizeHandle(windowGroup, format, windowConfig));
      }

      layer.add(windowGroup);
    }

    if (windowTitle) {
      // Never independently editable/draggable on canvas - it's derived
      // from the WDWTITLE keyword's value, not a real field of its own -
      // but it's a child of the window's own group, so it still moves with
      // the window when it's dragged.
      windowGroup.add(getElement(windowTitle, true, windowFormat.name));
    }

    if (windowFormat.name !== format.name) {
      // WINDOW(REF): this record borrows its size/border from windowFormat,
      // but windowFormat's own fields still render layered into the same
      // window bounds - into the same group (so they move with it too),
      // not by re-deriving/re-drawing windowFormat's chrome a second time
      // (already drawn above, from windowFormat's own keywords).
      addFieldsToLayer(windowGroup, windowFormat, displayOnly, { x: -1, y: -1 });
    }
  }

  // TODO: make format optional
  if (format) {
    // A window record's own fields are coded relative to the window's own
    // top-left corner (row 1, column 1 = the window's first interior row/
    // column) - rendered as children of the window's own Group (whose
    // transform supplies the screen position) instead of baking an absolute
    // offset into each field, so dragging the window moves its fields and
    // title along with it live.
    addFieldsToLayer(windowGroup || layer, format, displayOnly, windowGroup ? { x: -1, y: -1 } : { x: 0, y: 0 });
  }
}

/**
 * 
 * @param {*} layer 
 * @param {RecordInfo} format 
 */
/**
 * How many screen columns a field actually occupies - matches the same
 * length rule getElement uses to render it (const's literal text, or the
 * field's own length floored at 1 for zero-length referenced fields).
 * @param {FieldInfo} field
 */
function fieldDisplayLength(field) {
  if (field.displayType === `const`) {
    return (field.value || ``).length;
  }
  return Math.max(1, field.length || 0);
}

/**
 * Finds fields/constants on the same row whose columns overlap, or sit
 * immediately next to each other with no blank column between them - on a
 * real 5250 display that doesn't render/behave correctly, even though it's
 * visually indistinguishable from a normal 1-column gap in this renderer.
 * @param {FieldInfo[]} fields
 * @returns {Set<FieldInfo>} every field involved in at least one conflict
 */
function findTouchingFields(fields) {
  const conflicting = new Set();
  const positioned = fields.filter(field => field.displayType !== `hidden` && field.position.x > 0 && field.position.y > 0);

  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i];
      const b = positioned[j];
      if (a.position.y !== b.position.y) { continue; }

      const aEnd = a.position.x + fieldDisplayLength(a) - 1;
      const bEnd = b.position.x + fieldDisplayLength(b) - 1;

      const overlaps = a.position.x <= bEnd && b.position.x <= aEnd;
      const noGap = (b.position.x === aEnd + 1) || (a.position.x === bEnd + 1);

      if (overlaps || noGap) {
        conflicting.add(a);
        conflicting.add(b);
      }
    }
  }

  return conflicting;
}

function addFieldsToLayer(layer, format, displayOnly = false, offset = { x: 0, y: 0 }) {
  // getElement's render offset (above) and its drag-end offset are different
  // once a window's fields render inside its own draggable Group - see
  // getElement's own doc comment for why. getWindowOffset is always the
  // right one for drag-end, and a no-op {0, 0} for anything not a window.
  const dragOffset = getWindowOffset(format);

  const subfileFormat = format.keywords.find(keyword => keyword.name === `SFLCTL`);
  // TODO: handle when subFileFormat is found

  if (subfileFormat) {
    const subfilePage = format.keywords.find(keyword => keyword.name === `SFLPAG`)
    const rows = Number(subfilePage ? subfilePage.value : 1);

    const subfileRecord = activeDocument.formats.find(format => format.name === subfileFormat.value);

    if (subfileRecord) {
      const subfileFields = subfileRecord.fields.filter(field => field.displayType !== `hidden` && field.position.x > 0 && field.position.y > 0);
      // Checked once against the template row - every repeated row has the same conflicts.
      const subfileConflicting = findTouchingFields(subfileFields);

      const low = Math.min(...subfileFields.map(field => field.position.y));
      const high = Math.max(...subfileFields.map(field => field.position.y));
      const linesPerItem = (high - low) + 1;

      for (let row = 0; row < rows; row++) {
        subfileFields.forEach(field => {
          // TODO: these fields cant be edited in this format
          let subField = JSON.parse(JSON.stringify(field));
          subField.position.y += (row * linesPerItem);

          if (indicatorsSatisfied(field.conditions)) {
            subField.name = `${field.name}_${row}`;
            const content = getElement(subField, true, subfileRecord.name, subfileConflicting.has(field), offset, dragOffset);
            layer.add(content);
          }
        });
      }


    } else {
      throw new Error(`Unable to find SFLCTL format ${subfileFormat.value} from ${format.name}`);
    }
  }

  const fields = format.fields.filter(field => field.displayType !== `hidden`);
  const conflicting = findTouchingFields(fields);
  fields.forEach(field => {
    if (indicatorsSatisfied(field.conditions)) {
      const content = getElement(field, displayOnly, format.name, conflicting.has(field), offset, dragOffset);
      layer.add(content);
    }
  });
}

/**
 * 
 * @param {FieldInfo} fieldInfo 
 * @returns {Konva.Group|undefined}
 */
function renderSpecificField(fieldInfo) {
  // Editing always targets the focused tab, even when other formats are
  // composed alongside it - see getElement()'s formatName param.
  const existingField = existingStage.findOne(`#${elementId(lastSelectedFormat, fieldInfo.name)}`);

  if (existingField) {
    existingField.destroy();
  }

  const format = activeDocument.formats.find(f => f.name === lastSelectedFormat);
  // A window's own fields are children of its own draggable Group (see
  // renderSelectedFormat), not the top-level layer directly - find that
  // instead, so an optimistically-updated field still moves with the window
  // if it's dragged before the next full rerender.
  const container = format && format.isWindow
    ? existingStage.findOne(`#${lastSelectedFormat}::window`)
    : existingStage.findOne(`#${lastSelectedFormat}`);

  if (container) {
    const renderOffset = format && format.isWindow ? { x: -1, y: -1 } : { x: 0, y: 0 };
    const content = getElement(fieldInfo, false, lastSelectedFormat, false, renderOffset, getWindowOffset(format));
    container.add(content);

    return content;
  }
}

/**
 * The {x, y} offset a record's own fields need shifted by if it's a window -
 * {0, 0} otherwise. A window's fields are coded relative to its own top-left
 * corner (row 1, column 1 = the window's own first interior row/column), not
 * the screen. Mirrors the WINDOW(REF) resolution in renderSelectedFormat (a
 * window can borrow another record's size instead of coding its own).
 * @param {RecordInfo|undefined} format
 * @returns {{x: number, y: number}}
 */
function getWindowOffset(format) {
  if (!format || !format.isWindow) { return { x: 0, y: 0 }; }

  const windowFormat = format.windowReference
    ? activeDocument.formats.find(f => f.name === format.windowReference)
    : format;

  if (!windowFormat) { return { x: 0, y: 0 }; }

  return { x: windowFormat.windowSize.x - 1, y: windowFormat.windowSize.y - 1 };
}

function elementId(formatName, fieldName) {
  return `${formatName}::${fieldName}`;
}

/**
 * A small draggable handle on a field's right edge that resizes its length -
 * dragging horizontally only, snapped to the character grid, with a floor of
 * 1 character. Invisible until hovered, so it doesn't visually clutter the
 * field the rest of the time.
 * @param {Group} group the field's own Konva group - not yet added to a layer
 * @param {FieldInfo} fieldInfo
 * @param {number} initialWidthPx
 */
function createResizeHandle(group, fieldInfo, initialWidthPx) {
  // A fixed 6px handle on a very narrow field (e.g. 1 character, ~8px wide)
  // covers almost the whole thing, leaving no room to grab the field's body
  // to move it instead of resize it. Capping the handle at half the field's
  // width guarantees some body is always left to grab, while leaving normal-
  // width fields (roughly 2+ characters) exactly as they were.
  const handleWidth = Math.max(2, Math.min(6, Math.floor(initialWidthPx / 2)));

  const handle = new Konva.Rect({
    id: `resizeHandle`,
    x: initialWidthPx - handleWidth,
    y: 0,
    width: handleWidth,
    height: pxhPerChar,
    fill: colours.WHT,
    opacity: 0,
    draggable: true,
  });

  handle.on(`mouseenter`, () => {
    handle.opacity(0.4);
    const stage = handle.getStage();
    if (stage) { stage.container().style.cursor = `ew-resize`; }
  });
  handle.on(`mouseleave`, () => {
    handle.opacity(0);
    const stage = handle.getStage();
    if (stage) { stage.container().style.cursor = `default`; }
  });

  handle.on(`dragmove`, () => {
    const snappedX = Math.max(pxwPerChar, Math.round(handle.x() / pxwPerChar) * pxwPerChar);
    handle.x(snappedX);
    handle.y(0);

    const newWidth = snappedX + handleWidth;
    const bg = group.findOne(`#bg`);
    const label = group.findOne(`#label`);
    if (bg) { bg.width(newWidth); }
    if (label) { label.width(newWidth); }
  });

  handle.on(`dragend`, () => {
    fieldInfo.length = Math.max(1, Math.round(handle.x() / pxwPerChar));
    sendFieldUpdate(lastSelectedFormat, fieldInfo.name, fieldInfo);
  });

  return handle;
}

/**
 * Rewrites a window's WINDOW keyword to the explicit
 * (startY startX sizeY sizeX) form and sends it as a format-header update -
 * shared by both the window-move and window-resize handlers below. Also how
 * a WINDOW(*DFT ...) or WINDOW(REF) window becomes independently draggable/
 * resizable going forward: touching it via drag/resize always writes the
 * full explicit form, same as the runtime would have resolved it to.
 * @param {RecordInfo} format
 * @param {number} startY
 * @param {number} startX
 * @param {number} sizeY
 * @param {number} sizeX
 */
function sendWindowResize(format, startY, startX, sizeY, sizeX) {
  const newValue = `${startY} ${startX} ${sizeY} ${sizeX}`;
  const hasWindowKeyword = format.keywords.some(keyword => keyword.name === `WINDOW`);

  const newKeywords = format.keywords.map(keyword =>
    keyword.name === `WINDOW` ? { ...keyword, value: newValue } : keyword
  );
  if (!hasWindowKeyword) {
    newKeywords.push({ name: `WINDOW`, value: newValue, conditions: [] });
  }

  sendFormatHeaderUpdate(format.name, newKeywords);
}

/**
 * A small draggable handle on a window's bottom-right corner that resizes
 * it - both dimensions at once, snapped to the character grid, with a floor
 * of 1 character/line. Invisible until hovered, same as a field's own
 * length-resize handle.
 * @param {Group} windowGroup the window's own draggable Konva group - bg is
 *   looked up on it by id, same pattern as a field's own resize handle
 * @param {RecordInfo} format
 * @param {{baseX: number, baseY: number, width: number, height: number}} windowConfig
 */
function createWindowResizeHandle(windowGroup, format, windowConfig) {
  const handleSize = 8;

  const handle = new Konva.Rect({
    id: `windowResizeHandle`,
    x: windowConfig.width - handleSize,
    y: windowConfig.height - handleSize,
    width: handleSize,
    height: handleSize,
    fill: colours.WHT,
    opacity: 0,
    draggable: true,
  });

  handle.on(`mouseenter`, () => {
    handle.opacity(0.4);
    const stage = handle.getStage();
    if (stage) { stage.container().style.cursor = `nwse-resize`; }
  });
  handle.on(`mouseleave`, () => {
    handle.opacity(0);
    const stage = handle.getStage();
    if (stage) { stage.container().style.cursor = `default`; }
  });

  handle.on(`dragmove`, () => {
    const snappedX = Math.max(pxwPerChar, Math.round(handle.x() / pxwPerChar) * pxwPerChar);
    const snappedY = Math.max(pxhPerLine, Math.round(handle.y() / pxhPerLine) * pxhPerLine);
    handle.x(snappedX);
    handle.y(snappedY);

    const border = windowGroup.findOne(`#windowBorder`);
    if (border) {
      border.width(snappedX + handleSize);
      border.height(snappedY + handleSize);
    }
  });

  handle.on(`dragend`, () => {
    // widthInP has no "-1" adjustment, heightInP's does (see windowConfig's
    // own construction in renderSelectedFormat) - inverted here to recover
    // the DDS-coded size from the rendered pixel size.
    const sizeX = Math.max(1, Math.round((handle.x() + handleSize) / pxwPerChar));
    const sizeY = Math.max(1, Math.round((handle.y() + handleSize) / pxhPerLine) + 1);

    sendWindowResize(format, windowConfig.baseY, windowConfig.baseX, sizeY, sizeX);
  });

  return handle;
}

/**
 * @param {FieldInfo} fieldInfo
 * @param {boolean} [displayOnly]
 * @param {string} [formatName] the record format this field belongs to, so its
 *   canvas id doesn't collide with a same-named field in another composed format
 * @param {boolean} [hasWarning] outlines the field in red - it touches or
 *   overlaps another field/constant on the same row, which doesn't render
 *   correctly on a real 5250 display
 * @param {{x: number, y: number}} [offset] a window's own field is rendered
 *   as a child of that window's own draggable Konva Group (see
 *   renderSelectedFormat) - its DDS-coded position is relative to the
 *   window's own top-left corner already, and the group's own transform
 *   supplies the window's screen position, so this is always the constant
 *   {x: -1, y: -1} (the same "-1" conversion getElement always does, just
 *   with no window-position-dependent shift needed on top of it). Zero for
 *   anything not inside a window.
 * @param {{x: number, y: number}} [dragOffset] Konva's absolutePosition()
 *   (used when a drag ends, below) always resolves through every ancestor's
 *   transform to the stage's own coordinate space, regardless of nesting -
 *   so converting a post-drag position back into this field's DDS-relative
 *   position needs the window's actual position-dependent offset, not the
 *   constant one above. Defaults to `offset` (correct for anything not
 *   inside a window, where both are {0, 0} anyway).
 */
function getElement(fieldInfo, displayOnly = false, formatName = lastSelectedFormat, hasWarning = false, offset = { x: 0, y: 0 }, dragOffset = offset) {
  const boxInfo = {
    id: elementId(formatName, fieldInfo.name),
    x: widthInP(fieldInfo.position.x - 1 + offset.x),
    y: heightInP(fieldInfo.position.y - 1 + offset.y),
    width: 0,
    height: heightInP(1),
    draggable: !displayOnly,
  };

  const labelInfo = {
    value: fieldInfo.value || ``,
    colour: colours.GRN,
    fontStyle: `normal`,
    textDecoration: ``
  };

  // Only keywords whose conditioning indicators are currently satisfied apply -
  // e.g. a field with two COLOR keywords gated by different indicators only
  // shows whichever one is actually "on" in the current indicator preview.
  const keywords = fieldInfo.keywords.filter(keyword => indicatorsSatisfied(keyword.conditions));

  keywords.forEach(keyword => {
    const key = keyword.name;
    switch (key) {
      case `PAGNBR`:
        labelInfo.value = `####`;
        break;
      case `COLOR`:
        labelInfo.colour = colours[keyword.value] || colours.GRN;
        break;
      case `SYSNAME`:
        labelInfo.value = `SYSNAME_`;
        break;
      case `USER`:
        labelInfo.value = `USERNAME__`;
        break;
      case `DATE`:
        const dateSep = keywords.find(keyword => keyword.name === `DATSEP`);

        // DDS's own default when DATFMT is omitted is *JOB (whatever format
        // the running job uses) - unknowable from a static file. *MDY is the
        // closest thing to a traditional IBM i default, so fall back to it.
        const dateFormat = keywords.find(keyword => keyword.name === `DATFMT`);
        const effectiveDateFormat = dateFormat ? dateFormat.value : `*MDY`;
        labelInfo.value = dateFormats[effectiveDateFormat] || `?FORMAT?`;

        if (dateSep && dateSep.value.toUpperCase() !== `*JOB`) {
          labelInfo.value = labelInfo.value.replace(new RegExp(`[./-:]`, `g`), dateSep.value);
        }
        break;
      case `TIME`:
        const sep = keywords.find(keyword => keyword.name === `TIMSEP`);

        const format = keywords.find(keyword => keyword.name === `TIMFMT`);
        const effectiveTimeFormat = format ? format.value : `*HMS`;
        labelInfo.value = timeFormats[effectiveTimeFormat] || `?FORMAT?`;

        if (sep && sep.value.toUpperCase() !== `*JOB`) {
          labelInfo.value = labelInfo.value.replace(new RegExp(`[./-:]`, `g`), sep.value);
        }
        break;
      case `UNDERLINE`:
        labelInfo.textDecoration = `underline`;
        break;
      case `HIGHLIGHT`:
        // css += `font-weight: 900;`;
        labelInfo.fontStyle = `900`;
        break;
      case `DSPATR`:
        keyword.value.split(` `).forEach(value => {
          switch (value) {
            case `UL`:
              // css += `text-decoration: underline;`;
              labelInfo.textDecoration = `underline`;
              break;
            case `HI`:
              // css += `font-weight: 900;`;
              // if (!keywords.find(keyword => keyword.name === `COLOR`)) {
              //   css += `color: ${colors.WHT};`;
              // }
              labelInfo.fontStyle = `900`;
              labelInfo.colour = colours.WHT;
              break;
            case `BL`:
              // Can Konva do a blinking effect?
              // css += `animation: blinker 1s step-start infinite;`;
              break;
          }
        });
        break;
    }
  });

  let padString = `_`;

  // fieldInfo.primitiveType is only ever set by the server-side parser (see
  // DisplayFile.parse in dspf.ts) - it never gets recomputed here after a
  // client-side edit to Type, so an optimistic re-render right after changing
  // Type would still be keying off the old value. Deriving straight from the
  // DDS type character (the same D/Z/Y rule the parser uses) keeps this
  // correct immediately, without needing primitiveType kept in sync at all.
  const isDecimalType = fieldInfo.type === `D` || fieldInfo.type === `Z` || fieldInfo.type === `Y`;

  if (isDecimalType) {
    switch (fieldInfo.displayType) {
      case `input`: padString = `3`; break;
      case `output`: padString = `6`; break;
      case `both`: padString = `9`; break;
    }
  } else {
    switch (fieldInfo.displayType) {
      case `input`: padString = `I`; break;
      case `output`: padString = `O`; break;
      case `both`: padString = `B`; break;
    }
  }

  // A field referencing another field for its definition (REF/REFFLD) has no
  // length of its own in this source - length 0 and no value would otherwise
  // render as an invisible, zero-width box. Show at least a 1-char placeholder
  // so there's a visible marker that a field exists here.
  const displayLength = Math.max(1, fieldInfo.length > 0 && labelInfo.value.length < fieldInfo.length ? fieldInfo.length : labelInfo.value.length);
  const displayValue = labelInfo.value
    .replace(new RegExp(`''`, `g`), `'`)
    .padEnd(displayLength, padString);

  boxInfo.width = widthInP(displayLength);

  let group = new Konva.Group(boxInfo);

  group.on('dragmove', (e) => {
    /** @type {Group} */
    const cGroup = e.target;

    /** @type {Stage} */
    const stage = e.target.getStage();
    const mousePos = stage.getPointerPosition();
    
    let {x, y} = mousePos;

    const boxPos = cGroup.absolutePosition();
    
    // Mouse pos inside the group
    x -= (x - boxPos.x);
    y -= (y - boxPos.y);

    const newCords = snapToFixedGrid(x, y);

    cGroup.absolutePosition({
      x: newCords.x,
      y: newCords.y
    });
  });

  group.on(`dragend`, e => {
    // const {x, y} = e.target.attrs;
    // get mouse x,y
    /** @type {Group} */
    const cGroup = e.target;
    const stage = cGroup.getStage();
    const mousePos = stage.getPointerPosition();
    
    let {x, y} = mousePos;
    const boxPos = cGroup.absolutePosition();
    
    // Mouse pos inside the group
    x -= (x - boxPos.x);
    y -= (y - boxPos.y);

    const newCords = snapToFixedGrid(x, y);
    
    cGroup.absolutePosition({
      x: newCords.x,
      y: newCords.y
    });

    const fieldCords = gridCordsToFieldCords(newCords.x, newCords.y, dragOffset);
    fieldInfo.position.x = fieldCords.x;
    fieldInfo.position.y = fieldCords.y;

    sendFieldUpdate(lastSelectedFormat, fieldInfo.name, fieldInfo);
  });

  group.add(new Konva.Rect({
    id: `bg`,
    fill: colours.BLK,
    x: 0,
    y: 0,
    width: boxInfo.width,
    height: pxhPerChar,
    stroke: hasWarning ? colours.RED : undefined,
    strokeWidth: hasWarning ? 1 : 0,
  }));

  // add text to the label
  group.add(new Konva.Text({
    id: `label`,
    text: displayValue,
    width: boxInfo.width,
    wrap: `none`,
    fontSize: FONT_SIZE,
    fontFamily: FONT_FAMILY,
    fill: labelInfo.colour,
    fontStyle: labelInfo.fontStyle,
    textDecoration: labelInfo.textDecoration,
  }));

  if (!displayOnly) {
    group.on('pointerclick', () => {
      setActiveField(group, fieldInfo);
    });
  }

  // A small drag handle on the right edge resizes the field's length
  // directly on the canvas. Only meaningful for a real field's own length -
  // not a constant's (driven by its literal text) or a date/time field's
  // (always fixed at 8 characters, whatever gets dragged here).
  const resizable = !displayOnly && fieldInfo.displayType !== `const` && fieldInfo.type !== `L` && fieldInfo.type !== `T`;
  if (resizable) {
    group.add(createResizeHandle(group, fieldInfo, boxInfo.width));
  }

  return group;
}

function parseParms(string) {
  let items = [];
  let inString = false;
  let current = ``;

  for (let i = 0; i < string.length; i++) {
    switch (string[i]) {
      case `'`:
        inString = !inString;
        break;
      case ` `:
        if (inString) { current += string[i]; }
        else {
          items.push(current);
          current = ``;
        }
        break;
      default:
        current += string[i];
        break;
    }
  }

  if (current.trim().length > 0) {
    items.push(current.trim());
  }

  return items;
}

/**
 * DSPSIZ can define one size (`24 80 *DS3`) or two, so the same screen can
 * adapt to either terminal size at runtime (`24 80 *DS3 27 132 *DS4`). Parses
 * it into a list of {height, width, qualifier} groups - one entry normally,
 * two if both are defined. The trailing *DSx qualifier is optional on a
 * given group (older DDS sometimes omits it).
 * @param {string} value
 * @returns {{height: number, width: number, qualifier: string|undefined}[]}
 */
function parseDspSizes(value) {
  const parts = parseParms(value);
  const sizes = [];

  let i = 0;
  while (i < parts.length) {
    const height = Number(parts[i]);
    const width = Number(parts[i + 1]);

    if (Number.isNaN(height) || Number.isNaN(width)) { break; }

    let qualifier;
    if (parts[i + 2] && parts[i + 2].toUpperCase().startsWith(`*DS`)) {
      qualifier = parts[i + 2].toUpperCase();
      i += 3;
    } else {
      i += 2;
    }

    sizes.push({ height, width, qualifier });
  }

  return sizes;
}

/**
 * Shows/hides and (re)builds the *DS3/*DS4 toggle in the top bar, based on
 * how many sizes the current file's DSPSIZ actually defines.
 * @param {{height: number, width: number, qualifier: string|undefined}[]} sizes
 */
function updateDspSizeToggle(sizes) {
  const container = document.getElementById(`dspSizeToggle`);
  container.innerHTML = ``;

  if (sizes.length < 2) {
    container.style.display = `none`;
    return;
  }

  container.style.display = ``;

  if (!sizes.some(s => s.qualifier === dspSizeQualifier)) {
    dspSizeQualifier = sizes[0].qualifier;
  }

  const group = document.createElement(`vscode-radio-group`);

  sizes.forEach((size, index) => {
    const radio = document.createElement(`vscode-radio`);
    radio.setAttribute(`name`, `dspSize`);
    radio.setAttribute(`value`, size.qualifier || String(index));
    radio.setAttribute(`label`, `${size.qualifier || `Size ${index + 1}`} (${size.height}x${size.width})`);
    if (size.qualifier === dspSizeQualifier) {
      radio.setAttribute(`checked`, `true`);
    }

    radio.addEventListener(`change`, () => {
      dspSizeQualifier = size.qualifier;
      if (isPreviewMode) {
        renderComposedPreview();
      } else if (lastSelectedFormat) {
        setWindowForFormat(lastSelectedFormat);
      }
    });

    group.appendChild(radio);
  });

  container.appendChild(group);
}

/**
 * PAGSIZ(lines columns) sizes a printer file's page. Unlike DSPSIZ, it never
 * defines more than one size - there's no *DSx-style alternate to choose
 * between.
 * @param {string} value
 * @returns {{height: number, width: number}|undefined}
 */
function parsePagSize(value) {
  const parts = parseParms(value);
  const height = Number(parts[0]);
  const width = Number(parts[1]);

  if (Number.isNaN(height) || Number.isNaN(width)) { return undefined; }

  return { height, width };
}

// Standard line-printer page size (CRTPRTF's PAGESIZE default) - used
// whenever a printer file's global record doesn't code PAGSIZ at all.
const DEFAULT_PAGE_SIZE = { height: 66, width: 132 };

/**
 * The canvas size (in characters) to render at, for either file type -
 * DSPSIZ/its *DS3/*DS4 toggle for a display file, PAGSIZ (no toggle - it
 * never has alternates) for a printer file. Shared by the Design view
 * (renderFormat) and the Preview view (renderComposedPreview) so they can't
 * drift out of sync on how a file's size is determined.
 * @param {RecordInfo|undefined} globalFormat
 * @returns {{width: number, height: number}}
 */
function getPageSize(globalFormat) {
  if (activeDocumentType === `dds.prtf`) {
    updateDspSizeToggle([]);

    const pageSize = globalFormat?.keywords.find(keyword => keyword.name === `PAGSIZ`);
    const size = pageSize ? parsePagSize(pageSize.value) : undefined;

    return size || DEFAULT_PAGE_SIZE;
  }

  const displaySize = globalFormat?.keywords.find(keyword => keyword.name === `DSPSIZ`);
  const sizes = displaySize ? parseDspSizes(displaySize.value) : [];

  updateDspSizeToggle(sizes);

  const chosenSize = sizes.length > 1
    ? (sizes.find(s => s.qualifier === dspSizeQualifier) || sizes[0])
    : sizes[0];

  return chosenSize ? { width: chosenSize.width, height: chosenSize.height } : { width: 80, height: 24 };
}

/**
 * @param {string[]} recordFormats
 */
function setTabs(recordFormats, setActiveTab) {
  const container = document.getElementById(`recordFormatSelector`);

  container.innerHTML = ``;

  const select = document.createElement(`vscode-single-select`);
  select.id = `recordFormatSelect`;
  select.combobox = true;
  select.filter = `contains`;
  select.style.width = `100%`;

  select.options = recordFormats.map(name => ({ label: name, value: name }));
  if (setActiveTab) {
    select.value = setActiveTab;
  }

  select.addEventListener(`change`, () => {
    if (select.value) {
      setWindowForFormat(select.value);
    }
  });

  container.appendChild(select);

  // Nothing to rename/delete when there are no real formats left. vscode-icon
  // (used for these toolbar buttons, for a larger icon than vscode-button
  // supports) has no built-in disabled state, so fake one.
  const disabled = recordFormats.length === 0;
  [`renameFormatButton`, `deleteFormatButton`].forEach(id => {
    const button = document.getElementById(id);
    if (button) {
      button.toggleAttribute(`disabled`, disabled);
      button.style.opacity = disabled ? `0.4` : ``;
      button.style.pointerEvents = disabled ? `none` : ``;
    }
  });
}


window.addEventListener("message", (event) => {
  const command = event.data.command;
  const fileType = event.data.fileType === `prtf` ? `dds.prtf` : `dds.dspf`;
  switch (command) {
    case `load`:
      loadDDS(event.data.dds, fileType);
      break;
    case 'update':
      loadDDS(event.data.dds, fileType, false);
      break;
  }
});


/** @type {Rect|undefined} */
let lastActiveKonvaElement;

/**
 * 
 * @param {*} [konvaElement] 
 * @param {FieldInfo} [fieldInfo] 
 */
function setActiveField(konvaElement, fieldInfo) {
  clearKeywordEditor();

  if (lastActiveKonvaElement) {
    const bg = lastActiveKonvaElement.findOne(`#bg`);
    // Remove background from last active element

    if (bg) {
      bg.fill(colours.BLK);
    }

    lastActiveKonvaElement = undefined;
  }

  if (konvaElement && fieldInfo) {
    lastActiveKonvaElement = konvaElement;

    const bg = lastActiveKonvaElement.findOne(`#bg`);
    bg.fill(SELECTED_COLOUR);

    updateSelectedFieldSidebar(fieldInfo);
  } else {
    clearFieldInfo();
  }
}

/**
 * The Design view's left sidebar - just Indicators. Composing other formats
 * together is the Preview view's job now (see updatePreviewSidebar).
 */
function updateRecordFormatSidebar() {
  const sidebar = document.getElementById(`recordFormatSidebar`);

  /** @type {Tab[]} */
  let tabs = [];

  const referencedIndicators = getReferencedIndicators();
  if (referencedIndicators.length > 0) {
    tabs.push({ title: `Indicators`, html: createIndicatorsPanel(referencedIndicators) });
  }

  const commandKeysTab = createCommandKeysPanel();
  if (commandKeysTab) { tabs.push(commandKeysTab); }

  if (tabs.length > 0) {
    // Clamp in case the previously-selected tab no longer exists (e.g. the
    // Indicators tab disappeared because nothing references an indicator anymore).
    const selectedIndex = Math.min(recordFormatSidebarTabIndex, tabs.length - 1);
    renderTabs(sidebar, tabs, selectedIndex, (index) => { recordFormatSidebarTabIndex = index; });
  } else {
    sidebar.innerHTML = ``;
  }
}

/**
 * The Preview view's left sidebar - Composed Formats lists every real
 * format (there's no "current" one to exclude, unlike Design), plus
 * Indicators when any are referenced.
 */
function updatePreviewSidebar() {
  const sidebar = document.getElementById(`recordFormatSidebar`);

  /** @type {Tab[]} */
  let tabs = [];

  const allFormats = activeDocument.formats
    .filter(format => format.name !== GLOBAL_RECORD_FORMAT)
    .map(format => format.name);

  if (allFormats.length > 0) {
    tabs.push({ title: `Composed Formats`, html: createComposedFormatsPanel(allFormats) });
  }

  const referencedIndicators = getReferencedIndicators();
  if (referencedIndicators.length > 0) {
    tabs.push({ title: `Indicators`, html: createIndicatorsPanel(referencedIndicators) });
  }

  const commandKeysTab = createCommandKeysPanel();
  if (commandKeysTab) { tabs.push(commandKeysTab); }

  if (tabs.length > 0) {
    const selectedIndex = Math.min(recordFormatSidebarTabIndex, tabs.length - 1);
    renderTabs(sidebar, tabs, selectedIndex, (index) => { recordFormatSidebarTabIndex = index; });
  } else {
    sidebar.innerHTML = ``;
  }
}

// CAxx/CFxx command-key keywords go up to 24 (CA01-CA24, CF01-CF24).
const COMMAND_KEY_PATTERN = /^(CA|CF)(0[1-9]|1[0-9]|2[0-4])$/;

/** @param {string} name */
function isCommandKeyKeyword(name) {
  return COMMAND_KEY_PATTERN.test(name);
}

/**
 * A read-only legend of every CAxx/CFxx command-key keyword declared
 * anywhere in the file, alongside which record format it's on - so you can
 * see what's already wired up before adding a new one, without opening
 * every record's Format Keywords tab to check.
 * @returns {{title: string, html: Element}|undefined} undefined if the file
 * uses no command keys at all, so callers can skip an empty tab.
 */
function createCommandKeysPanel() {
  if (!activeDocument) { return undefined; }

  /** @type {{format: string, keyword: Keyword}[]} */
  const entries = [];
  activeDocument.formats.forEach(format => {
    // A CAxx/CFxx coded before any record (the file-level/global record)
    // applies to every format in the file, not just one - labelled
    // distinctly here rather than shown under the internal `_GLOBAL` name.
    const formatLabel = format.name === GLOBAL_RECORD_FORMAT ? `File level` : format.name;

    format.keywords.forEach(keyword => {
      if (isCommandKeyKeyword(keyword.name)) {
        entries.push({ format: formatLabel, keyword });
      }
    });
  });

  if (entries.length === 0) { return undefined; }

  const section = document.createElement(`div`);

  entries.forEach(({ format, keyword }) => {
    const row = document.createElement(`div`);
    row.style.display = `flex`;
    row.style.alignItems = `center`;
    row.style.gap = `0.5em`;
    row.style.padding = `0.3em 1em`;

    const icon = document.createElement(`span`);
    icon.className = `codicon codicon-key`;
    row.appendChild(icon);

    const text = document.createElement(`span`);
    text.innerText = keyword.value ? `${keyword.name}(${keyword.value})` : keyword.name;
    row.appendChild(text);

    const formatText = document.createElement(`span`);
    formatText.innerText = format;
    formatText.style.opacity = `0.65`;
    formatText.style.marginLeft = `auto`;
    row.appendChild(formatText);

    section.appendChild(row);
  });

  return { title: `Command Keys`, html: section };
}

/**
 * @param {number[]} indicatorNumbers
 */
function createIndicatorsPanel(indicatorNumbers) {
  const section = document.createElement(`div`);

  indicatorNumbers.forEach(indicator => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`label`, `Indicator ${indicator}`);
    checkbox.style.display = `block`;
    checkbox.style.margin = `0.25em 1em`;

    if (activeIndicators.has(indicator)) {
      checkbox.setAttribute(`checked`, `true`);
    }

    checkbox.addEventListener(`change`, () => {
      if (checkbox.checked) {
        activeIndicators.add(indicator);
      } else {
        activeIndicators.delete(indicator);
      }

      // This panel is shared by both views (Design conditions the one format
      // it's editing; Preview re-renders whatever's currently composed).
      if (isPreviewMode) {
        renderComposedPreview();
      } else if (lastSelectedFormat) {
        setWindowForFormat(lastSelectedFormat);
      }
    });

    section.appendChild(checkbox);
  });

  return section;
}

/**
 * Preview-only: every real record format, to check on/off for composing
 * together. There's no "currently focused" one to exclude here.
 * @param {string[]} formatNames
 */
function createComposedFormatsPanel(formatNames) {
  const section = document.createElement(`div`);

  formatNames.forEach(name => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`label`, name);
    checkbox.style.display = `block`;
    checkbox.style.margin = `0.25em 1em`;

    if (composedFormats.has(name)) {
      checkbox.setAttribute(`checked`, `true`);
    }

    checkbox.addEventListener(`change`, () => {
      if (checkbox.checked) {
        composedFormats.add(name);

        // A subfile control format's own SFLCTL keyword already pulls in
        // and renders its subfile's fields (see addFieldsToLayer) - check
        // the subfile record too, so its checkbox reflects what's already
        // on screen instead of looking unchecked. Not reversed on uncheck -
        // the subfile might still be wanted composed on its own.
        const format = activeDocument.formats.find(f => f.name === name);
        const subfileKeyword = format?.keywords.find(keyword => keyword.name === `SFLCTL`);
        if (subfileKeyword?.value) {
          composedFormats.add(subfileKeyword.value);
        }
      } else {
        composedFormats.delete(name);
      }

      renderComposedPreview();
    });

    section.appendChild(checkbox);
  });

  return section;
}

function clearFieldInfo() {
  const sidebar = document.getElementById(`fieldInfoSidebar`);

  /** @type {{title: string, html: string|Element}[]} */
  const tabs = [];

  if (!isPreviewMode) {
    // Nothing is editable in the Preview view, and there's no single
    // focused format there either (no dropdown - see renderComposedPreview),
    // so neither of these has anything coherent to show.
    tabs.push({ title: `Add Field`, html: createAddFieldPanel() });
    tabs.push(createFormatKeywordsTab());
  }

  tabs.push(createFileKeywordsTab());

  renderFieldTabs(sidebar, tabs);
}

/**
 * Templates below always propose the same base name (e.g. "NEWFLD1") -
 * clicking the same button twice without renaming the first one would
 * otherwise silently create two fields with identical names. Appends/bumps
 * a trailing number until the name is free within the current format.
 * @param {string} baseName
 */
function uniqueFieldName(baseName) {
  const currentFormat = activeDocument && lastSelectedFormat
    ? activeDocument.formats.find(format => format.name === lastSelectedFormat)
    : undefined;
  const existingNames = new Set((currentFormat ? currentFormat.fields : []).map(field => field.name));

  if (!existingNames.has(baseName)) { return baseName; }

  // Strip any trailing digits first, so repeated clicks land on NEWFLD2,
  // NEWFLD3, ... instead of colliding forever or growing NEWFLD11, NEWFLD111.
  const stem = baseName.replace(/\d+$/, ``);
  let suffix = 2;
  while (existingNames.has(`${stem}${suffix}`)) { suffix++; }
  return `${stem}${suffix}`;
}

/**
 * Every template below also proposed the same fixed position (1, 1) -
 * adding a second field/constant right after the first landed it directly
 * on top, hiding whichever was added first and making it unclickable.
 * Defaults new ones to the row below whatever's already in the format,
 * so they land somewhere visibly free instead. Not overlap-proof against
 * every existing field (only checks the lowest row used), but fields can
 * always be dragged afterward - this only needs to beat "always (1, 1)".
 */
function nextAvailableFieldPosition() {
  const currentFormat = activeDocument && lastSelectedFormat
    ? activeDocument.formats.find(format => format.name === lastSelectedFormat)
    : undefined;
  const fields = currentFormat ? currentFormat.fields : [];

  if (fields.length === 0) { return { x: 1, y: 1 }; }

  const maxY = Math.max(...fields.map(field => field.position.y));
  return { x: 1, y: maxY + 1 };
}

function createAddFieldPanel() {
  const panel = document.createElement(`div`);

  const createGroupHeader = (title) => {
    const header = document.createElement(`div`);
    header.innerText = title.toUpperCase();
    header.style.fontSize = `0.8em`;
    header.style.fontWeight = `600`;
    header.style.letterSpacing = `0.05em`;
    header.style.opacity = `0.65`;
    header.style.margin = `1.2em 1em 0.4em`;
    return header;
  };

  /**
   * @param {string} label
   * @param {string} icon
   * @param {FieldInfo} field
   */
  const createButton = (label, icon, field) => {
    const button = document.createElement(`vscode-button`);
    button.setAttribute(`secondary`, `true`);
    button.setAttribute(`icon`, icon);
    button.style.margin = `0.2em 1em`;
    button.style.display = `block`;
    button.style.textAlign = `left`;
    button.innerText = label;

    button.onclick = () => {
      if (lastSelectedFormat) {
        const fieldToSend = { ...field, position: nextAvailableFieldPosition() };
        // Constants have no name at all - nothing to de-duplicate.
        if (fieldToSend.name) {
          fieldToSend.name = uniqueFieldName(fieldToSend.name);
        }
        sendNewField(lastSelectedFormat, fieldToSend);
      }
    };

    return button;
  }

  // Input/Both/Hidden usage doesn't exist on a printer file - only Output is
  // DDS-legal there, so default this button accordingly per file type.
  const isPrinterFile = activeDocumentType === `dds.prtf`;

  panel.appendChild(createGroupHeader(`Fields`));
  panel.appendChild(createButton(`Named field`, `add`, {
    name: `NEWFLD1`,
    type: `A`,
    length: 10,
    decimals: 0,
    displayType: isPrinterFile ? `output` : `input`,
    keywords: [],
    conditions: [],
  }));
  panel.appendChild(createButton(`Date field`, `calendar`, {
    name: `DATEFLD`,
    type: `L`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `DATFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Time field`, `calendar`, {
    name: `TIMEFLD`,
    type: `T`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `TIMFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  // Timestamp fields aren't wired up yet: the parser only special-cases
  // types L (date) and T (time), not Z (timestamp), so there's no
  // primitiveType/keyword support to generate a working field from here.

  panel.appendChild(createGroupHeader(`Specials`));
  panel.appendChild(createButton(`Constant text`, `symbol-constant`, {
    value: `Constant`,
    displayType: `const`,
    keywords: [],
    conditions: [],
  }));
  panel.appendChild(createButton(`System name constant`, `account`, {
    name: `SYSFLD`,
    type: `A`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `SYSNAME`, value: undefined, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`System user constant`, `account`, {
    name: `USRFLD`,
    type: `A`,
    length: 10,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `USER`, value: undefined, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Date constant`, `calendar`, {
    name: `DATECST`,
    type: `L`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `DATFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Time constant`, `calendar`, {
    name: `TIMECST`,
    type: `T`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    keywords: [{name: `TIMFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));

  return panel;
}

/**
 * A tab showing the current record format's own keywords - present in the
 * right panel regardless of whether a field is selected, so it sits
 * alongside whatever's currently shown (the add-field toolbox, or a
 * selected field's own properties/keywords) rather than living separately
 * in the left sidebar.
 * @returns {{title: string, html: Element}}
 */
function createFormatKeywordsTab() {
  const currentFormat = activeDocument && lastSelectedFormat
    ? activeDocument.formats.find(format => format.name === lastSelectedFormat)
    : undefined;

  const html = currentFormat
    ? createKeywordPanel(`keywords-${currentFormat.name}`, currentFormat.keywords, isPreviewMode ? undefined : (keywords) => {
      sendFormatHeaderUpdate(currentFormat.name, keywords);
    })
    : document.createElement(`div`);

  return { title: `Format Keywords`, html };
}

/**
 * A tab for the file-level (a.k.a. "screen level") keywords - the ones
 * written above every record format in the source, like DSPSIZ. Same
 * treatment as createFormatKeywordsTab, just scoped to the whole file
 * instead of the current record.
 * @returns {{title: string, html: Element}}
 */
function createFileKeywordsTab() {
  const globalFormat = activeDocument
    ? activeDocument.formats.find(format => format.name === GLOBAL_RECORD_FORMAT)
    : undefined;

  const html = globalFormat
    ? createKeywordPanel(`keywords-${globalFormat.name}`, globalFormat.keywords, isPreviewMode ? undefined : (keywords) => {
      sendFormatHeaderUpdate(globalFormat.name, keywords);
    })
    : document.createElement(`div`);

  return { title: `File Keywords`, html };
}

/**
 *
 * @param {FieldInfo} fieldInfo
 */
function updateSelectedFieldSidebar(fieldInfo) {
  const sidebar = document.getElementById(`fieldInfoSidebar`);

  /** @type {Property[]} */
  const properties = [];

  // Constants get an internal placeholder name (TEXT1, TEXT2, ...) purely so
  // the webview has an id to track/select them by - getLinesForField's
  // `const` branch never writes it out, so editing it here would look like
  // it did something while actually having no effect on the saved DDS.
  if (fieldInfo.name && fieldInfo.displayType !== `const`) {
    properties.push({ label: `Name`, value: fieldInfo.name, id: `name` });
  }

  if (fieldInfo.displayType === `const`) {
    // A constant's displayType isn't one of input/output/both/hidden, so the
    // dropdown below can't represent it - showing it risked corrupting the
    // field (collectValues() reads back "" for an unmatched selection, which
    // then fails getLinesForField's `displayType === 'const'` check entirely,
    // silently dropping the field's text from the generated DDS). There's
    // also nothing useful to change here for a constant, so just leave it out.
    properties.push({ label: `Value`, value: fieldInfo.value, id: `value` });
  } else {
    // Input/Both/Hidden usage doesn't exist on a printer file - only Output
    // is DDS-legal there, so don't offer the others.
    const displayTypeOptions = activeDocumentType === `dds.prtf`
      ? [{ label: `Output`, value: `output` }]
      : [
        { label: `Input`, value: `input` },
        { label: `Output`, value: `output` },
        { label: `Both`, value: `both` },
        { label: `Hidden`, value: `hidden` },
      ];

    properties.push(
      { label: `Display Type`, value: fieldInfo.displayType, id: `displayType`, options: displayTypeOptions },
    );
  }

  properties.push(
    { label: `Position X`, value: fieldInfo.position.x, id: `positionX` },
    { label: `Position Y`, value: fieldInfo.position.y, id: `positionY` },
  );

  if (fieldInfo.type) {
    properties.push(
      { label: `Type`, value: fieldInfo.type, id: `type`, options: [
        { label: `Alpha`, value: `A` },
        { label: `Numeric`, value: `D` },
      ] },
      { label: `Length`, value: fieldInfo.length, id: `length` },
    );

    if (fieldInfo.type !== `A`) {
      properties.push({ label: `Decimals`, value: fieldInfo.decimals, id: `decimals` });
    }
  }

  renderFieldTabs(sidebar, [
    {
      title: `Basic`,
      html: createValuesPanel(`properties-${fieldInfo.name}`, properties, (newProps) => {
        const originalFieldName = fieldInfo.name;

        // position.x/y are nested, not flat like the rest of newProps - pull
        // them out and coerce to numbers (everything from collectValues() is
        // a string) so downstream arithmetic (e.g. findTouchingFields' `+`)
        // doesn't silently fall back to string concatenation.
        const { positionX, positionY, ...rest } = newProps;

        fieldInfo = {
          ...fieldInfo,
          ...rest,
          position: {
            x: positionX !== undefined ? Number(positionX) : fieldInfo.position.x,
            y: positionY !== undefined ? Number(positionY) : fieldInfo.position.y,
          },
        };

        sendFieldUpdate(lastSelectedFormat, originalFieldName, fieldInfo);
      })
    },
    {
      title: `Keywords`,
      html: createKeywordPanel(`keywords-${fieldInfo.name}`, fieldInfo.keywords, (keywords) => {
        fieldInfo.keywords = keywords;
        sendFieldUpdate(lastSelectedFormat, fieldInfo.name, fieldInfo);
      }),
    },
  ]);

  const deleteButton = document.createElement(`vscode-button`);
  deleteButton.setAttribute(`secondary`, `true`);
  deleteButton.innerText = `Delete`;
  
  // Center the button
  deleteButton.style.margin = `1em`;
  deleteButton.style.display = `block`;

  deleteButton.addEventListener(`click`, (e) => {
    if (fieldInfo.name) {
      sendDelete(lastSelectedFormat, fieldInfo.name);
    }
  });

  sidebar.appendChild(deleteButton);
}

/**
 * @param {HTMLElement} container
 * @param {Tab[]} tabs
 * @param {number} [selectedIndex]
 * @param {(index: number) => void} [onSelect] called whenever the user picks a different tab
 */
function renderTabs(container, tabs, selectedIndex = 0, onSelect = undefined) {
  container.innerHTML = ``;

  const tabsElement = document.createElement(`vscode-tabs`);
  tabsElement.setAttribute(`selected-index`, String(selectedIndex));

  for (const tab of tabs) {
    const header = document.createElement(`vscode-tab-header`);
    header.setAttribute(`slot`, `header`);
    header.innerText = tab.title;
    tabsElement.appendChild(header);

    const panel = document.createElement(`vscode-tab-panel`);
    panel.style.padding = `1em 0`;
    if (typeof tab.html === `string`) {
      panel.innerHTML = tab.html;
    } else {
      panel.appendChild(tab.html);
    }
    tabsElement.appendChild(panel);
  }

  if (onSelect) {
    tabsElement.addEventListener(`vsc-tabs-select`, (event) => {
      onSelect(event.detail.selectedIndex);
    });
  }

  container.appendChild(tabsElement);
}

/**
 * A small, fixed set of tabs (Basic/Keywords for a selected field) - unlike
 * the record-format list, this never grows unboundedly, so a tab strip is a
 * fine fit here. Always resets to the first tab, since the context (which
 * field, or no field) has just changed.
 * @param {HTMLElement} container
 * @param {Tab[]} tabs
 */
function renderFieldTabs(container, tabs) {
  renderTabs(container, tabs);
}

/**
 * @param {string} recordFormat 
 * @param {FieldInfo} fieldInfo 
 */
function sendNewField(recordFormat, fieldInfo) {
  vscode.postMessage({
    command: `newField`,
    recordFormat,
    fieldInfo
  });
}

function sendDelete(recordFormat, fieldName) {
  vscode.postMessage({
    command: `deleteField`,
    recordFormat,
    fieldName
  });
}

/**
 * @param {string} recordFormat 
 * @param {string} originalFieldName 
 * @param {FieldInfo} newFieldInfo 
 */
function sendFieldUpdate(recordFormat, originalFieldName, newFieldInfo) {
  vscode.postMessage({
    command: `updateField`,
    recordFormat,
    originalFieldName,
    fieldInfo: newFieldInfo
  });

  // const currentFormat = activeDocument.formats.find(format => format.name === recordFormat);
  // if (currentFormat) {
  //   const field = currentFormat.fields.find(field => field.name === originalFieldName);
  //   for (const propKey in newFieldInfo) {
  //     const propValue = newFieldInfo[propKey];

  //     field[propKey] = propValue;
  //   }
  // }

  const newGroup = renderSpecificField(newFieldInfo);

  if (newGroup) {
    setActiveField(newGroup, newFieldInfo);
  }
}

/**
 * @param {string} recordFormat
 * @param {Keyword[]} newKeywords
 */
function sendFormatHeaderUpdate(recordFormat, newKeywords) {
  vscode.postMessage({
    command: `updateFormat`,
    recordFormat,
    newKeywords
  });
}

/**
 * @param {string} recordFormat
 */
function sendDeleteFormat(recordFormat) {
  vscode.postMessage({
    command: `deleteFormat`,
    recordFormat
  });
}

/**
 * @param {string} formatName
 */
function sendNewFormat(formatName) {
  vscode.postMessage({
    command: `newFormat`,
    formatName
  });
}

/**
 * @param {string} recordFormat
 * @param {string} newFormatName
 */
function sendRenameFormat(recordFormat, newFormatName) {
  vscode.postMessage({
    command: `renameFormat`,
    recordFormat,
    newFormatName
  });
}

/**
 * DDS record format names: letters/digits/$/#/@/_, starting with a letter
 * or $/#/@, up to 10 characters.
 * @param {string} name
 */
function isValidFormatName(name) {
  return /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/.test(name);
}

/**
 * Wires up the static "New Format" button/inline form in the top bar. These
 * elements live directly in index.html (not rebuilt on every render like
 * the record format selector), so this only needs to run once.
 */
function initNewFormatUi() {
  // Nothing is editable in the Preview view - there's no reason to offer this.
  if (isPreviewMode) { return; }

  const button = document.getElementById(`newFormatButton`);
  const form = document.getElementById(`newFormatForm`);
  const nameField = document.getElementById(`newFormatName`);
  const confirmButton = document.getElementById(`newFormatConfirm`);

  const showForm = () => {
    button.style.display = `none`;
    form.style.display = `flex`;
    nameField.value = ``;
    nameField.focus();
  };

  const hideForm = () => {
    form.style.display = `none`;
    button.style.display = ``;
  };

  const submit = () => {
    const typed = (nameField.value || ``).trim().toUpperCase();
    if (!typed || !isValidFormatName(typed)) { return; }

    const existingNames = activeDocument ? activeDocument.formats.map(format => format.name) : [];
    if (typed === GLOBAL_RECORD_FORMAT || existingNames.includes(typed)) {
      // Name already taken - leave the form open so the user can pick another.
      return;
    }

    // Optimistically select the new format now, so that once the extension
    // host round-trips the reload it's the one that ends up shown, instead
    // of loadDDS falling back to whatever the first format happens to be.
    lastSelectedFormat = typed;
    sendNewFormat(typed);
    hideForm();
  };

  button.addEventListener(`click`, showForm);
  confirmButton.addEventListener(`click`, submit);
  nameField.addEventListener(`keydown`, (event) => {
    if (event.key === `Enter`) {
      submit();
    } else if (event.key === `Escape`) {
      hideForm();
    }
  });
}

/**
 * Wires up the static "Rename Format" button/inline form in the top bar -
 * same pattern as initNewFormatUi, just pre-filled with the currently
 * selected format's name and sending a rename instead of a create.
 */
function initRenameFormatUi() {
  // Nothing is editable in the Preview view - there's no reason to offer this.
  if (isPreviewMode) { return; }

  const button = document.getElementById(`renameFormatButton`);
  const form = document.getElementById(`renameFormatForm`);
  const nameField = document.getElementById(`renameFormatName`);
  const confirmButton = document.getElementById(`renameFormatConfirm`);

  const showForm = () => {
    if (!lastSelectedFormat) { return; }
    button.style.display = `none`;
    form.style.display = `flex`;
    nameField.value = lastSelectedFormat;
    nameField.focus();
  };

  const hideForm = () => {
    form.style.display = `none`;
    button.style.display = ``;
  };

  const submit = () => {
    if (!lastSelectedFormat) { return; }

    const typed = (nameField.value || ``).trim().toUpperCase();
    if (!typed || !isValidFormatName(typed)) { return; }

    if (typed === lastSelectedFormat) {
      // No actual change.
      hideForm();
      return;
    }

    const existingNames = activeDocument ? activeDocument.formats.map(format => format.name) : [];
    if (typed === GLOBAL_RECORD_FORMAT || existingNames.includes(typed)) {
      // Name already taken - leave the form open so the user can pick another.
      return;
    }

    const oldName = lastSelectedFormat;
    // Optimistically point at the new name now, so it's still the one shown
    // once the extension host round-trips the reload.
    lastSelectedFormat = typed;
    sendRenameFormat(oldName, typed);
    hideForm();
  };

  button.addEventListener(`click`, showForm);
  confirmButton.addEventListener(`click`, submit);
  nameField.addEventListener(`keydown`, (event) => {
    if (event.key === `Enter`) {
      submit();
    } else if (event.key === `Escape`) {
      hideForm();
    }
  });
}

/**
 * Wires up the static "Delete Format" button in the top bar - deletes
 * whichever format is currently selected. No confirmation dialog, matching
 * the existing field-level Delete button; a normal WorkspaceEdit still
 * leaves this on the undo stack.
 */
function initDeleteFormatUi() {
  // Nothing is editable in the Preview view - there's no reason to offer this
  // (the row it lives in is already hidden entirely by initNewFormatUi).
  if (isPreviewMode) { return; }

  const button = document.getElementById(`deleteFormatButton`);

  button.addEventListener(`click`, () => {
    if (lastSelectedFormat) {
      sendDeleteFormat(lastSelectedFormat);
      // Don't keep pointing at a format that's about to disappear - let the
      // next loadDDS fall back to whatever format ends up first instead.
      lastSelectedFormat = undefined;
    }
  });
}

/**
 * Hides the top-bar chrome that only makes sense when something's editable:
 * New Format/Delete Format, and the Selected Format dropdown (Preview has
 * no "selected" format at all - see renderComposedPreview). The DSPSIZ
 * DS3/DS4 toggle stays, since it's relevant to both views.
 */
function hidePreviewOnlyChrome() {
  document.getElementById(`formatToolbarRow`).style.display = `none`;
  document.getElementById(`selectedFormatRow`).style.display = `none`;
}

window.addEventListener(`DOMContentLoaded`, () => {
  if (isPreviewMode) {
    hidePreviewOnlyChrome();
  }
  initNewFormatUi();
  initRenameFormatUi();
  initDeleteFormatUi();
});

/**
 * Used to create panels for editable key/value lists.
 * @param {string} id
 * @param {Keyword[]} inputKeywords 
 * @param {(keywords: Keyword[]) => void} [onUpdate]
 */
function createKeywordPanel(id, inputKeywords, onUpdate) {
  /** @type {Keyword[]} */
  const keywords = JSON.parse(JSON.stringify(inputKeywords));

  const section = document.createElement(`div`);
  section.id = id;

  const tree = document.createElement(`vscode-tree`);
  tree.id = id;

  const actions = onUpdate ? [
    {
      icon: "edit",
      actionId: "edit",
      tooltip: "Edit",
    },
    {
      icon: "trash",
      actionId: "delete",
      tooltip: "Delete",
    },
  ] : [];

  const icons = {
    branch: 'folder',
    leaf: 'circle-filled',
    open: 'folder-opened',
  };

  const rerenderTree = () => {
    tree.data = keywords.map((keyword, index) => {
      return {
        icons,
        label: keyword.name,
        value: keyword,
        description: keyword.value,
        actions,
        // A plain "OR" chip between groups so the AND/OR structure is
        // visible at a glance without opening the editor - indicators
        // within a group are AND'd, groups themselves are OR'd.
        subItems: keyword.conditions.flatMap((group, groupIndex) => [
          ...(groupIndex > 0 ? [{ label: `OR`, icons }] : []),
          ...group.indicators.map(c => ({
            label: String(c.indicator),
            description: c.negate ? `Negated` : undefined,
            icons
          })),
        ]),
      };
    });
  };

  rerenderTree();

  tree.addEventListener('vsc-run-action', (event) => {
    console.log(event.detail);
    /** @type {Keyword} */
    const currentKeyword = event.detail.value;
    const oldKeywordIndex = keywords.findIndex(k => k.name === currentKeyword.name && k.value === currentKeyword.value);

    switch (event.detail.actionId) {
      case `delete`:
        if (oldKeywordIndex >= 0) {
          keywords.splice(oldKeywordIndex, 1);
        }
        rerenderTree();
        onUpdate(keywords);
        break;

      case `edit`:
        editKeyword((newKeyword) => {
          if (oldKeywordIndex >= 0) {
            keywords[oldKeywordIndex] = newKeyword;
          } else {
            keywords.push(newKeyword);
          }

          clearKeywordEditor();
          rerenderTree();
          onUpdate(keywords);
        }, event.detail.value);
        break;
    }
  });

  section.appendChild(tree);

  if (onUpdate) {
    const newKeyword = document.createElement(`vscode-button`);
    newKeyword.setAttribute(`icon`, `add`);

    newKeyword.innerText = `New Keyword`;
    newKeyword.style.margin = `1em`;
    newKeyword.style.display = `block`;

    newKeyword.addEventListener(`click`, (e) => {
      editKeyword((newKeyword) => {
        keywords.push(newKeyword);
        clearKeywordEditor();
        rerenderTree();
        onUpdate(keywords);
      });
    });

    section.appendChild(newKeyword);
  }

  return section;
}

/**
 * Used to create a panel for editable properties.
 * Properties with the `id` property are editable.
 * @param {string} id 
 * @param {Property[]} properties 
 * @param {(newProps: NewProperties) => {}} onUpdate 
 */
function createValuesPanel(id, properties, onUpdate) {
  const section = document.createElement(`div`);
  section.id = id;

  // vscode-table-cell forces `overflow: hidden`, which clips a select's dropdown
  // popup (it's position:absolute relative to itself, not portaled to <body>) so
  // it never becomes visible when opened. A form-group layout has no such clip.
  const group = document.createElement(`vscode-form-group`);
  group.setAttribute(`variant`, `vertical`);
  group.style.padding = `0 1em`;

  const createRow = (label) => {
    const row = document.createElement(`div`);
    row.style.display = `flex`;
    row.style.flexDirection = `column`;
    row.style.gap = `0.3em`;
    row.style.marginBottom = `1em`;

    const labelElement = document.createElement(`vscode-label`);
    labelElement.innerText = label;
    labelElement.style.opacity = `0.8`;
    labelElement.style.fontSize = `0.9em`;
    row.appendChild(labelElement);

    return row;
  };

  // Every edit applies immediately (no Update button) - collectValues() always
  // reads the full set of controls so each change sends a consistent snapshot,
  // not just the one field that changed.
  const collectValues = () => {
    /** @type {{[key: string]: string}} */
    const values = {};

    section.querySelectorAll(`[data-field-id]`).forEach(field => {
      if (field.tagName === `VSCODE-SINGLE-SELECT`) {
        // A select's .value comes back undefined when the field's actual
        // value isn't one of its options (e.g. the Type dropdown only offers
        // Alpha/Numeric, so a Date/Time field's real type doesn't match any
        // option). Sending that through would overwrite the real value with
        // literally the string "undefined" once it hits a template literal
        // in getLinesForField - corrupting the field and, since that throws
        // off fixed-column parsing on reload, potentially every line after
        // it too. Leaving the key out entirely just leaves that property
        // untouched instead.
        if (field.value) {
          values[field.dataset.fieldId] = field.value;
        }
      } else {
        values[field.dataset.fieldId] = field.innerText;
      }
    });

    return values;
  };

  const createInputElement = (fieldId, value) => {
    const input = document.createElement(`code`);
    input.dataset.fieldId = fieldId;
    input.innerText = value;
    input.setAttribute(`contenteditable`, `true`);
    input.style.display = `block`;
    input.style.width = `100%`;
    input.style.boxSizing = `border-box`;
    input.style.padding = `0.4em 0.5em`;
    input.style.border = `1px solid var(--vscode-settings-textInputBorder, transparent)`;
    input.style.borderRadius = `2px`;
    input.style.background = `var(--vscode-settings-textInputBackground)`;
    input.style.color = `var(--vscode-settings-textInputForeground)`;
    input.addEventListener(`blur`, () => onUpdate(collectValues()));

    return input;
  };

  const createSelectElement = (fieldId, value, options) => {
    const select = document.createElement(`vscode-single-select`);
    select.dataset.fieldId = fieldId;
    select.style.width = `100%`;
    // Assigning slotted <vscode-option> children only registers reliably once
    // the element is connected and a slotchange fires - fragile when building
    // the whole tree detached, as we do here. Setting .options directly writes
    // the component's internal state synchronously, so selection works immediately.
    // The initial selection isn't derived from the `selected` flags in that path
    // though - it has to be set explicitly via .value.
    select.options = options.map(option => ({
      label: option.label,
      value: option.value,
    }));
    select.value = value;

    select.addEventListener(`change`, () => onUpdate(collectValues()));

    return select;
  };

  for (let prop of properties) {
    const row = createRow(prop.label);

    if (prop.options) {
      row.appendChild(createSelectElement(prop.id, prop.value, prop.options));
    } else if (prop.id) {
      row.appendChild(createInputElement(prop.id, prop.value));
    } else {
      const plainValue = document.createElement(`div`);
      plainValue.innerText = prop.value;
      row.appendChild(plainValue);
    }

    group.appendChild(row);
  }

  section.appendChild(group);

  return section;
}

function clearKeywordEditor() {
  const keywordEditorArea = document.getElementById(`keywordEditorArea`);
  keywordEditorArea.innerHTML = ``;
}

// Common DDS keywords for display files (DSPF) and printer files (PRTF), at
// file/record/field level. Not necessarily exhaustive - CAxx/CFxx go up to 24,
// and there are obscure/version-specific keywords not listed here. The keyword
// select below is a filterable combobox that also accepts free text, so a
// keyword missing from this list can still just be typed directly.
const DDS_KEYWORDS = [
  `AFPRSC`, `ALARM`, `ALIGN`, `ASSUME`, `AUTO`,
  `BARCODE`, `BLANKS`, `BLINK`,
  `CA01`, `CA03`, `CA12`, `CA24`, `CDEFNT`, `CF01`, `CF03`, `CF12`, `CF24`,
  `CHANGE`, `CHECK`, `CHGINPDFT`, `CHRSIZ`, `CLRL`, `COLOR`, `CONCAT`, `CPI`, `CSRLOC`,
  `DATA`, `DATE`, `DATFMT`, `DATSEP`, `DFRWRT`, `DFT`, `DSPATR`, `DSPSIZ`, `DUPLEX`,
  `EDTCDE`, `EDTWRD`, `END`, `ENDPAGE`, `ERRMSG`, `ERRMSGID`, `ERRSFL`,
  `FONT`, `FORCE`, `FORMFEED`,
  `HELP`, `HLPARA`, `HLPID`, `HLPPGM`, `HLPRTN`,
  `IGCALTTYP`, `INDARA`, `INDTXT`,
  `KEEP`, `LPI`,
  `MNUBAR`, `MSGID`, `MSGLOC`,
  `OUTBIN`, `OUTPUT`, `OVERFLOW`, `OVERLAY`,
  `PAGEDOWN`, `PAGEUP`, `PAGNBR`, `PAGRTT`, `PAGSIZ`, `PRINT`, `PRTQLTY`, `PULLDOWN`, `PUTOVR`, `PUTRETAIN`,
  `RANGE`, `REF`, `REFFLD`, `RMVWDW`, `ROLLDOWN`, `ROLLUP`, `RTNCSRLOC`,
  `SFL`, `SFLCLR`, `SFLCSRRRN`, `SFLCTL`, `SFLDROP`, `SFLDSP`, `SFLDSPCTL`, `SFLEND`,
  `SFLENTER`, `SFLFOLD`, `SFLINZ`, `SFLLIN`, `SFLMODE`, `SFLMSG`, `SFLMSGID`, `SFLMSGRCD`,
  `SFLNXTCHG`, `SFLPAG`, `SFLPGMQ`, `SFLRCDNBR`, `SFLRNA`, `SFLROLVAL`, `SFLSCROLL`, `SFLSIZ`,
  `SKIPA`, `SKIPB`, `SPACEA`, `SPACEB`, `SYSNAME`,
  `TEXT`, `TIME`, `TIMFMT`, `TIMSEP`, `TRNSPARENCY`,
  `UDATE`, `UDAY`, `UMONTH`, `UNDERLINE`, `USER`, `USRDFN`, `USRRSTDSP`, `UYEAR`,
  `VALUES`, `VLDCMDKEY`,
  `WDWBORDER`, `WDWTITLE`, `WINDOW`, `WRDWRAP`,
].sort();

/**
 * Uppercases everything except DDS string literals (single-quoted text,
 * e.g. a WDWTITLE's title), since keyword values are conventionally
 * uppercase but literal text is case-sensitive as typed. A doubled quote
 * (`''`) inside a literal is DDS's escape for a literal quote character,
 * not the end of the string, so it doesn't toggle back out.
 * @param {string} text
 */
function uppercaseOutsideQuotes(text) {
  let result = ``;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === `'`) {
      if (inQuotes && text[i + 1] === `'`) {
        result += `''`;
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      result += char;
      continue;
    }

    result += inQuotes ? char : char.toUpperCase();
  }

  return result;
}

/**
 * @param {(keyword: Keyword) => void} onUpdate
 * @param {Keyword} [keyword]
 */
function editKeyword(onUpdate, keyword) {
  const group = document.createElement(`vscode-form-group`);
  group.id = `currentKeywordEditor`;
  group.setAttribute(`variant`, `vertical`);
  group.style.paddingLeft = `1em`;
  group.style.paddingRight = `1em`;

  const createLabel = (label, forId) => {
    const labelElement = document.createElement(`vscode-label`);
    labelElement.setAttribute(`for`, forId);
    labelElement.innerText = label;
    labelElement.style.marginTop = `0.5em`;
    return labelElement;
  };

  const createInputField = (id, value) => {
    const input = document.createElement(`vscode-textfield`);
    input.setAttribute(`id`, id);
    input.setAttribute(`value`, value);
    return input;
  };

  const createKeywordNameSelect = (id, value) => {
    const select = document.createElement(`vscode-single-select`);
    select.setAttribute(`id`, id);
    select.combobox = true;
    select.creatable = true;
    select.filter = `startsWith`;

    // Setting .value only selects something already present in .options - it
    // doesn't add it. If we're editing a keyword this list doesn't happen to
    // cover, make sure its name is still there so it shows up instead of
    // silently going blank.
    const names = value && !DDS_KEYWORDS.includes(value) ? [value, ...DDS_KEYWORDS] : DDS_KEYWORDS;
    select.options = names.map(name => ({ label: name, value: name }));
    if (value) {
      select.value = value;
    }

    return select;
  };

  const createIndicatorSelect = (id, defaultValue) => {
    const select = document.createElement(`vscode-single-select`);
    select.setAttribute(`id`, id);

    const options = [`None`];

    for (let i = 1; i <= 99; i++) {
      options.push(String(i));
    }

    select.options = options.map(option => ({
      label: option,
      value: option,
    }));
    // defaultValue is the numeric indicator (or undefined); options are strings.
    select.value = defaultValue !== undefined ? String(defaultValue) : `None`;

    return select;
  };

  const createCheckbox = (id, label, checked) => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`id`, id);
    checkbox.setAttribute(`label`, label);
    if (checked) {
      checkbox.setAttribute(`checked`, checked);
    }
    return checkbox;
  };

  group.appendChild(createLabel(`Keyword`, `keyword`));
  group.appendChild(createKeywordNameSelect(`keyword`, keyword ? keyword.name : ``));

  group.appendChild(createLabel(`Value`, `value`));
  group.appendChild(createInputField(`value`, keyword ? (keyword.value || ``) : ``));

  // Real DDS conditions a field/keyword with up to 3 OR'd groups (each an
  // AND of up to 3 indicators, via continuation lines) - 3x3 covers the
  // vast majority of real DDS (parsing/rendering still supports more than
  // this if a file happens to have it, this cap is purely about keeping
  // the editing form a reasonable size). That's still ~30 stacked form
  // elements, easily pushing Confirm off-screen - collapsed by default
  // (auto-expanded only if the keyword already has a condition set) keeps
  // Keyword/Value/Confirm compact and always visible without scrolling.
  const GROUP_COUNT = 3;
  const INDICATORS_PER_GROUP = 3;
  const existingGroups = keyword ? keyword.conditions : [];
  const hasExistingConditions = existingGroups.some(g => g.indicators && g.indicators.length > 0);

  const conditionsSection = document.createElement(`vscode-collapsible`);
  conditionsSection.setAttribute(`title`, `Conditions`);
  conditionsSection.style.display = `block`;
  conditionsSection.style.marginTop = `1em`;
  if (hasExistingConditions) {
    conditionsSection.setAttribute(`open`, ``);
  }

  for (let g = 0; g < GROUP_COUNT; g++) {
    if (g > 0) {
      const orLabel = document.createElement(`vscode-label`);
      orLabel.innerText = `OR`;
      orLabel.style.marginTop = `1em`;
      orLabel.style.fontWeight = `600`;
      orLabel.style.opacity = `0.7`;
      conditionsSection.appendChild(orLabel);
    }

    const existingIndicators = existingGroups[g]?.indicators || [];

    for (let s = 0; s < INDICATORS_PER_GROUP; s++) {
      const indId = `ind-${g}-${s}`;
      const negId = `neg-${g}-${s}`;
      const existing = existingIndicators[s];

      conditionsSection.appendChild(createLabel(`Indicator ${g * INDICATORS_PER_GROUP + s + 1}`, indId));
      conditionsSection.appendChild(createIndicatorSelect(indId, existing?.indicator));
      conditionsSection.appendChild(createCheckbox(negId, `Negate`, existing?.negate));
    }
  }

  group.appendChild(conditionsSection);

  const button = document.createElement(`vscode-button`);
  button.setAttribute(`icon`, `check`);
  button.style.marginTop = `1em`;
  button.style.display = `block`;
  button.innerText = `Confirm`;
  button.onclick = () => {
    // DDS keyword names and values are conventionally uppercase - parsed
    // keywords already come back uppercased (see parseKeywords), so typing
    // a new/edited one in lowercase here would otherwise be the only way to
    // end up with a lowercase keyword in the source.
    const keywordName = (group.querySelector(`#keyword`).value || ``).toUpperCase();
    // Keyword names never contain quoted literals, but a value might
    // (e.g. WDWTITLE's title) - leave that text's case alone.
    const keywordValue = uppercaseOutsideQuotes(group.querySelector(`#value`).value || ``);

    /** @type {import('./dspf.d.ts').ConditionGroup[]} */
    const conditions = [];

    for (let g = 0; g < GROUP_COUNT; g++) {
      /** @type {import('./dspf.d.ts').Conditional[]} */
      const indicators = [];

      for (let s = 0; s < INDICATORS_PER_GROUP; s++) {
        const ind = group.querySelector(`#ind-${g}-${s}`).value;
        const neg = group.querySelector(`#neg-${g}-${s}`).checked;

        if (ind !== `None`) {
          // The select's options are strings; Conditional.indicator is a
          // number everywhere else (the parser produces numbers, and
          // activeIndicators is a Set of them), so convert here rather than
          // leaking a string into the model until the next round-trip
          // through the document reparses it back into a number.
          indicators.push({ indicator: Number(ind), negate: neg });
        }
      }

      // Skip an empty group entirely - e.g. leaving group 2 blank while
      // using groups 1 and 3 shouldn't emit a meaningless empty OR'd group.
      if (indicators.length > 0) {
        conditions.push({ indicators });
      }
    }

    const newKeyword = {
      name: keywordName,
      value: keywordValue ? keywordValue : undefined,
      conditions
    };

    onUpdate(newKeyword);
  };

  group.appendChild(button);

  const keywordEditorArea = document.getElementById(`keywordEditorArea`);
  keywordEditorArea.innerHTML = ``;

  keywordEditorArea.appendChild(document.createElement(`vscode-divider`));
  keywordEditorArea.appendChild(group);
}