import { describe, expect, it } from "vitest";
import { FakeElement } from "./webui-harness";
import { loadWebui } from "./webui-harness";

/** Finds and checks/unchecks one of createIndicatorsPanel's checkboxes by label, firing its change handler. */
function toggleIndicatorCheckbox(panel: FakeElement, indicator: number, checked: boolean) {
  const checkbox = panel.children.find(c => c.attributes.label === `Indicator ${indicator}`);
  if (!checkbox) { throw new Error(`No checkbox for indicator ${indicator}`); }
  checkbox.attributes.checked = checked ? `true` : `false`;
  checkbox.trigger(`change`);
}

/** Finds and checks/unchecks one of createComposedFormatsPanel's checkboxes by label, firing its change handler. */
function toggleComposedFormatCheckbox(panel: FakeElement, formatName: string, checked: boolean) {
  const checkbox = panel.children.find(c => c.attributes.label === formatName);
  if (!checkbox) { throw new Error(`No checkbox for format ${formatName}`); }
  checkbox.attributes.checked = checked ? `true` : `false`;
  checkbox.trigger(`change`);
}

function cond(indicator: number, negate = false) {
  return { indicator, negate };
}

/** Wraps Conditionals into one AND-group - real DDS's `conditions` shape is ConditionGroup[], OR'd together. */
function group(...indicators: ReturnType<typeof cond>[]) {
  return { indicators };
}

/** Depth-first search for a FakeElement with a given dataset key, anywhere under root. */
function findByDataFieldId(root: FakeElement, fieldId: string): FakeElement | undefined {
  if (root.dataset.fieldId === fieldId) { return root; }
  for (const child of root.children) {
    const found = findByDataFieldId(child, fieldId);
    if (found) { return found; }
  }
  return undefined;
}

describe(`indicatorsSatisfied`, () => {
  it(`is satisfied with no conditions at all`, () => {
    const sandbox = loadWebui();
    expect(sandbox.indicatorsSatisfied([])).toBe(true);
  });

  it(`requires every indicator within a group to be on (AND)`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30, 40]);
    toggleIndicatorCheckbox(panel, 30, true);
    // 40 stays off

    expect(sandbox.indicatorsSatisfied([group(cond(30))])).toBe(true);
    expect(sandbox.indicatorsSatisfied([group(cond(40))])).toBe(false);
    expect(sandbox.indicatorsSatisfied([group(cond(30), cond(40))])).toBe(false);

    toggleIndicatorCheckbox(panel, 40, true);
    expect(sandbox.indicatorsSatisfied([group(cond(30), cond(40))])).toBe(true);
  });

  it(`respects negation`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([50]);

    // Indicator off: a negated condition on it is satisfied.
    expect(sandbox.indicatorsSatisfied([group(cond(50, true))])).toBe(true);
    expect(sandbox.indicatorsSatisfied([group(cond(50, false))])).toBe(false);

    toggleIndicatorCheckbox(panel, 50, true);
    expect(sandbox.indicatorsSatisfied([group(cond(50, true))])).toBe(false);
    expect(sandbox.indicatorsSatisfied([group(cond(50, false))])).toBe(true);
  });

  it(`unchecking an indicator turns its conditions back off`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([60]);
    toggleIndicatorCheckbox(panel, 60, true);
    expect(sandbox.indicatorsSatisfied([group(cond(60))])).toBe(true);

    toggleIndicatorCheckbox(panel, 60, false);
    expect(sandbox.indicatorsSatisfied([group(cond(60))])).toBe(false);
  });

  it(`is satisfied if ANY group is satisfied (OR between groups)`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30, 40]);
    const conditions = [group(cond(30)), group(cond(40))];

    expect(sandbox.indicatorsSatisfied(conditions)).toBe(false);

    toggleIndicatorCheckbox(panel, 30, true);
    expect(sandbox.indicatorsSatisfied(conditions)).toBe(true);

    toggleIndicatorCheckbox(panel, 30, false);
    toggleIndicatorCheckbox(panel, 40, true);
    expect(sandbox.indicatorsSatisfied(conditions)).toBe(true);
  });

  it(`mixes AND within a group and OR between groups`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30, 31, 40]);
    const conditions = [group(cond(30), cond(31)), group(cond(40))];

    toggleIndicatorCheckbox(panel, 30, true);
    expect(sandbox.indicatorsSatisfied(conditions)).toBe(false); // first group incomplete, second not satisfied

    toggleIndicatorCheckbox(panel, 31, true);
    expect(sandbox.indicatorsSatisfied(conditions)).toBe(true); // first group now complete

    toggleIndicatorCheckbox(panel, 30, false);
    toggleIndicatorCheckbox(panel, 31, false);
    toggleIndicatorCheckbox(panel, 40, true);
    expect(sandbox.indicatorsSatisfied(conditions)).toBe(true); // second group satisfies the OR
  });
});

describe(`getReferencedIndicators`, () => {
  it(`collects indicators from field conditions, field keyword conditions, and format keyword conditions - deduped and sorted`, () => {
    const sandbox = loadWebui();

    const model = {
      formats: [
        {
          name: `FMT1`,
          keywords: [{ name: `SFLCLR`, value: undefined, conditions: [group(cond(90))] }],
          fields: [
            {
              name: `FLD1`,
              conditions: [group(cond(30))],
              keywords: [{ name: `COLOR`, value: `RED`, conditions: [group(cond(30))] }],
            },
            {
              name: `FLD2`,
              conditions: [group(cond(10))],
              keywords: [],
            },
          ],
        },
        {
          name: `FMT2`,
          keywords: [],
          fields: [{ name: `FLD3`, conditions: [group(cond(90))], keywords: [] }],
        },
      ],
    };

    sandbox.loadDDS(model, `dds.dspf`, false);

    expect(sandbox.getReferencedIndicators()).toEqual([10, 30, 90]);
  });

  it(`collects indicators from every OR'd group, not just the first`, () => {
    const sandbox = loadWebui();

    const model = {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [{ name: `FLD1`, conditions: [group(cond(30)), group(cond(70))], keywords: [] }],
        },
      ],
    };

    sandbox.loadDDS(model, `dds.dspf`, false);

    expect(sandbox.getReferencedIndicators()).toEqual([30, 70]);
  });

  it(`returns an empty list when nothing references any indicator`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [{ name: `FLD1`, conditions: [], keywords: [] }] }] }, `dds.dspf`, false);
    expect(sandbox.getReferencedIndicators()).toEqual([]);
  });
});

describe(`elementId`, () => {
  it(`namespaces by record format so same-named fields in different formats don't collide`, () => {
    const sandbox = loadWebui();
    expect(sandbox.elementId(`FMTA`, `FLD1`)).toBe(`FMTA::FLD1`);
    expect(sandbox.elementId(`FMTB`, `FLD1`)).toBe(`FMTB::FLD1`);
    expect(sandbox.elementId(`FMTA`, `FLD1`)).not.toBe(sandbox.elementId(`FMTB`, `FLD1`));
  });
});

describe(`getElement (canvas field rendering)`, () => {
  function textOf(group: any): string {
    const text = group.children.find((c: any) => c.type === `Text`);
    return text.config.text;
  }

  it(`derives the alpha/numeric placeholder character straight from the DDS type, not the possibly-stale primitiveType`, () => {
    const sandbox = loadWebui();

    // primitiveType deliberately set wrong (char) while type says numeric (D) -
    // this is exactly the state a client-side Type edit used to leave behind
    // before the fix, since primitiveType is only ever computed server-side.
    const numericField = {
      name: `NUM1`, type: `D`, primitiveType: `char`, length: 5, decimals: 0,
      displayType: `input`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const numericGroup = sandbox.getElement(numericField, false, `FMT`);
    expect(textOf(numericGroup)).toBe(`33333`);

    const alphaField = {
      name: `ALP1`, type: `A`, primitiveType: `decimal`, length: 4, decimals: 0,
      displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const alphaGroup = sandbox.getElement(alphaField, false, `FMT`);
    expect(textOf(alphaGroup)).toBe(`OOOO`);
  });

  it(`uses the both/input/output-specific padding character for both primitive types`, () => {
    const sandbox = loadWebui();
    const base = { type: `A`, length: 3, decimals: 0, value: undefined, position: { x: 1, y: 1 }, keywords: [] };

    expect(textOf(sandbox.getElement({ ...base, name: `F1`, displayType: `input` }, false, `FMT`))).toBe(`III`);
    expect(textOf(sandbox.getElement({ ...base, name: `F2`, displayType: `output` }, false, `FMT`))).toBe(`OOO`);
    expect(textOf(sandbox.getElement({ ...base, name: `F3`, displayType: `both` }, false, `FMT`))).toBe(`BBB`);

    const decBase = { type: `D`, length: 3, decimals: 0, value: undefined, position: { x: 1, y: 1 }, keywords: [] };
    expect(textOf(sandbox.getElement({ ...decBase, name: `F4`, displayType: `input` }, false, `FMT`))).toBe(`333`);
    expect(textOf(sandbox.getElement({ ...decBase, name: `F5`, displayType: `output` }, false, `FMT`))).toBe(`666`);
    expect(textOf(sandbox.getElement({ ...decBase, name: `F6`, displayType: `both` }, false, `FMT`))).toBe(`999`);
  });

  it(`floors the rendered width at 1 character for a zero-length referenced field`, () => {
    const sandbox = loadWebui();
    const referencedField = {
      name: `REFFLD1`, type: ``, primitiveType: undefined, length: 0, decimals: 0,
      displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const group = sandbox.getElement(referencedField, false, `FMT`);
    expect(textOf(group).length).toBe(1);
    expect(group.config.width).toBeGreaterThan(0);
  });

  it(`namespaces the canvas element id by the owning record format`, () => {
    const sandbox = loadWebui();
    const field = { name: `SAMENAME`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [] };

    const groupA = sandbox.getElement(field, false, `FMTA`);
    const groupB = sandbox.getElement(field, false, `FMTB`);

    expect(groupA.config.id).toBe(`FMTA::SAMENAME`);
    expect(groupB.config.id).toBe(`FMTB::SAMENAME`);
  });

  it(`only applies a keyword whose conditioning indicator is currently on`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30]);
    toggleIndicatorCheckbox(panel, 30, false);

    // getElement applies keywords in array order (last match wins), so like
    // real DDS authoring, the conditioned override is written after the
    // unconditioned default - it only takes effect once its indicator is on.
    const field = {
      name: `F1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `COLOR`, value: `GRN`, conditions: [] },
        { name: `COLOR`, value: `RED`, conditions: [group(cond(30))] },
      ],
    };

    const offGroup = sandbox.getElement(field, false, `FMT`);
    const offText = offGroup.children.find((c: any) => c.type === `Text`);
    expect(offText.config.fill).toBe(`green`); // colours.GRN

    toggleIndicatorCheckbox(panel, 30, true);
    const onGroup = sandbox.getElement(field, false, `FMT`);
    const onText = onGroup.children.find((c: any) => c.type === `Text`);
    expect(onText.config.fill).toBe(`red`); // colours.RED - the conditioned COLOR now wins
  });

  it(`shifts a field's rendered position by a supplied offset, in whole characters`, () => {
    const sandbox = loadWebui();
    const PX_PER_CHAR = 8;
    const PX_PER_LINE = 20;
    const field = { name: `F1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 3, y: 2 }, keywords: [] };

    const unoffset = sandbox.getElement(field, false, `FMT`);
    const offset = sandbox.getElement(field, false, `FMT`, false, { x: 19, y: 2 });

    expect(offset.config.x - unoffset.config.x).toBe(19 * PX_PER_CHAR);
    expect(offset.config.y - unoffset.config.y).toBe(2 * PX_PER_LINE);
  });
});

describe(`getWindowOffset - window fields are coded relative to the window, not the screen`, () => {
  it(`returns no offset for a non-window record`, () => {
    const sandbox = loadWebui();
    const format = { name: `FMT1`, isWindow: false, fields: [], keywords: [] };
    expect(sandbox.getWindowOffset(format)).toEqual({ x: 0, y: 0 });
  });

  it(`returns no offset when there's no format at all (e.g. still typing a format name)`, () => {
    const sandbox = loadWebui();
    expect(sandbox.getWindowOffset(undefined)).toEqual({ x: 0, y: 0 });
  });

  it(`offsets by the window's own coded start position`, () => {
    const sandbox = loadWebui();
    const format = {
      name: `WIN1`, isWindow: true, windowReference: undefined,
      windowSize: { x: 20, y: 3, width: 40, height: 8 },
      fields: [], keywords: [],
    };
    // Row 1 / column 1 inside the window lands on the window's own start
    // position, so the offset is one less than it (added to a 1-based field
    // coordinate before it's converted to a 0-based pixel offset).
    expect(sandbox.getWindowOffset(format)).toEqual({ x: 19, y: 2 });
  });

  it(`resolves WINDOW(REF) to the referenced record's own coded size`, () => {
    const sandbox = loadWebui();
    const template = { name: `TEMPLATE`, isWindow: true, windowReference: undefined, windowSize: { x: 10, y: 5, width: 30, height: 6 }, fields: [], keywords: [] };
    const usesRef = { name: `USES_REF`, isWindow: true, windowReference: `TEMPLATE`, windowSize: { x: 0, y: 0, width: 80, height: 24 }, fields: [], keywords: [] };

    // getWindowOffset resolves the reference by looking it up in
    // activeDocument.formats (module state loadDDS sets), not accessible
    // from a test directly - so give it the same objects it'll find there.
    sandbox.loadDDS({ formats: [template, usesRef] }, `dds.dspf`, false);

    expect(sandbox.getWindowOffset(usesRef)).toEqual({ x: 9, y: 4 });
  });
});

describe(`gridCordsToFieldCords - dragging a field within a window`, () => {
  it(`subtracts the same offset the field was rendered with, so its saved position stays window-relative`, () => {
    const sandbox = loadWebui();
    const PX_PER_CHAR = 8;
    const PX_PER_LINE = 20;

    const unoffset = sandbox.gridCordsToFieldCords(3 * PX_PER_CHAR, 4 * PX_PER_LINE);
    const offset = sandbox.gridCordsToFieldCords(3 * PX_PER_CHAR, 4 * PX_PER_LINE, { x: 19, y: 2 });

    expect(offset.x).toBe(unoffset.x - 19);
    expect(offset.y).toBe(unoffset.y - 2);
  });
});

describe(`addFieldsToLayer field visibility`, () => {
  it(`only adds fields whose conditions are currently satisfied`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([80]);
    // leave indicator 80 off

    const format = {
      name: `FMT`,
      keywords: [],
      fields: [
        { name: `ALWAYS`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
        { name: `ONLYIF80`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 2, y: 1 }, keywords: [], conditions: [group(cond(80))] },
      ],
    };

    const layer = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer, format, false);
    expect(layer.children.map((c: any) => c.config.id)).toEqual([`FMT::ALWAYS`]);

    toggleIndicatorCheckbox(panel, 80, true);
    const layer2 = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer2, format, false);
    expect(layer2.children.map((c: any) => c.config.id).sort()).toEqual([`FMT::ALWAYS`, `FMT::ONLYIF80`]);
  });

  it(`hidden fields never render regardless of indicators`, () => {
    const sandbox = loadWebui();
    const format = {
      name: `FMT`,
      keywords: [],
      fields: [
        { name: `HID`, type: `A`, length: 1, decimals: 0, displayType: `hidden`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
      ],
    };
    const layer = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer, format, false);
    expect(layer.children.length).toBe(0);
  });
});

describe(`createValuesPanel select-value corruption guard`, () => {
  it(`omits a select's value from the update entirely when it doesn't match any option, instead of sending undefined`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [
      { label: `Name`, value: `MYFLD`, id: `name` },
      {
        label: `Type`, value: `L`, id: `type`, // Date - not one of the dropdown's own options
        options: [{ label: `Alpha`, value: `A` }, { label: `Numeric`, value: `D` }],
      },
    ];

    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });

    const typeSelect = findByDataFieldId(section, `type`);
    expect(typeSelect).toBeDefined();
    expect(typeSelect!.value).toBeUndefined(); // confirms the FakeElement itself models the real "no match" behavior

    typeSelect!.trigger(`change`);

    expect(lastUpdate).toBeDefined();
    expect(`type` in lastUpdate).toBe(false);
    // The other, valid control's value should still come through normally.
    expect(lastUpdate.name).toBe(`MYFLD`);
  });

  it(`includes a select's value normally when it does match an option`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [
      {
        label: `Type`, value: `A`, id: `type`,
        options: [{ label: `Alpha`, value: `A` }, { label: `Numeric`, value: `D` }],
      },
    ];

    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });
    const typeSelect = findByDataFieldId(section, `type`);
    typeSelect!.trigger(`change`);

    expect(lastUpdate.type).toBe(`A`);
  });

  it(`applies a contenteditable text field's value on blur`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [{ label: `Length`, value: 10, id: `length` }];
    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });

    const lengthInput = findByDataFieldId(section, `length`);
    lengthInput!.innerText = `20`;
    lengthInput!.trigger(`blur`);

    expect(lastUpdate.length).toBe(`20`);
  });
});

describe(`updateSelectedFieldSidebar - constant fields`, () => {
  it(`never shows a Display Type control for a constant (it can't represent "const" and corrupts the field if edited)`, () => {
    const sandbox = loadWebui();

    const constField = {
      name: undefined, displayType: `const`, value: `Hello`, position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(constField);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `displayType`)).toBeUndefined();
    // Value should still be there and editable.
    expect(findByDataFieldId(sidebar, `value`)).toBeDefined();
  });

  it(`shows an editable Display Type control for a non-constant field`, () => {
    const sandbox = loadWebui();

    const field = {
      name: `FLD1`, displayType: `input`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `displayType`)).toBeDefined();
  });

  it(`never shows a Name control for a constant, even one with a parser-assigned placeholder name`, () => {
    const sandbox = loadWebui();

    // The parser gives unnamed literal fields an internal name like TEXT1
    // purely so the webview has something to key/select them by -
    // getLinesForField's `const` branch never writes it out, so editing it
    // here would look like it did something while having no real effect.
    const constField = {
      name: `TEXT1`, displayType: `const`, value: `Hello`, position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(constField);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `name`)).toBeUndefined();
  });

  it(`shows an editable Name control for a non-constant field`, () => {
    const sandbox = loadWebui();

    const field = {
      name: `FLD1`, displayType: `input`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `name`)).toBeDefined();
  });
});

describe(`updateSelectedFieldSidebar - printer file Display Type restriction`, () => {
  it(`only offers Output for a printer file field (Input/Both/Hidden aren't DDS-legal there)`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.prtf`, false);

    const field = {
      name: `FLD1`, displayType: `output`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    const displayType = findByDataFieldId(sidebar, `displayType`);
    expect(displayType!.options).toEqual([{ label: `Output`, value: `output` }]);
  });

  it(`still offers all four options for a display file field`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.dspf`, false);

    const field = {
      name: `FLD1`, displayType: `input`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    const displayType = findByDataFieldId(sidebar, `displayType`);
    expect(displayType!.options.map((o: any) => o.value)).toEqual([`input`, `output`, `both`, `hidden`]);
  });
});

describe(`updateSelectedFieldSidebar - editable Position`, () => {
  it(`shows the field's current X/Y as editable inputs`, () => {
    const sandbox = loadWebui();
    const field = {
      name: `FLD1`, displayType: `output`, type: `A`, length: 5, decimals: 0,
      position: { x: 12, y: 7 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `positionX`)!.innerText).toBe(12);
    expect(findByDataFieldId(sidebar, `positionY`)!.innerText).toBe(7);
  });

  it(`sends an updated, numeric position when edited, without disturbing the rest of the field`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const field = {
      name: `FLD1`, displayType: `output`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [], conditions: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    const positionX = findByDataFieldId(sidebar, `positionX`)!;
    const positionY = findByDataFieldId(sidebar, `positionY`)!;
    positionX.innerText = `20`;
    positionY.innerText = `9`;
    positionX.trigger(`blur`);

    const sent = sandbox.postedMessages.find((m: any) => m.command === `updateField`);
    expect(sent.fieldInfo.position).toEqual({ x: 20, y: 9 });
    expect(typeof sent.fieldInfo.position.x).toBe(`number`);
    expect(typeof sent.fieldInfo.position.y).toBe(`number`);
    expect(sent.fieldInfo.name).toBe(`FLD1`);
  });
});

describe(`createAddFieldPanel - Named field default usage`, () => {
  it(`defaults to Output for a printer file (Input isn't DDS-legal there)`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.prtf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const panel = sandbox.createAddFieldPanel();
    const namedFieldButton = panel.children.find((c: FakeElement) => c.innerText === `Named field`);
    namedFieldButton.onclick();

    const sent = sandbox.postedMessages.find((m: any) => m.command === `newField`);
    expect(sent.fieldInfo.displayType).toBe(`output`);
  });

  it(`still defaults to Input for a display file`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const panel = sandbox.createAddFieldPanel();
    const namedFieldButton = panel.children.find((c: FakeElement) => c.innerText === `Named field`);
    namedFieldButton.onclick();

    const sent = sandbox.postedMessages.find((m: any) => m.command === `newField`);
    expect(sent.fieldInfo.displayType).toBe(`input`);
  });
});

describe(`createAddFieldPanel - System user constant`, () => {
  it(`adds a 10-character output field carrying the USER keyword`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const panel = sandbox.createAddFieldPanel();
    const userConstantButton = panel.children.find((c: FakeElement) => c.innerText === `System user constant`);
    userConstantButton.onclick();

    const sent = sandbox.postedMessages.find((m: any) => m.command === `newField`);
    expect(sent.fieldInfo.length).toBe(10);
    expect(sent.fieldInfo.displayType).toBe(`output`);
    expect(sent.fieldInfo.keywords).toEqual([{ name: `USER`, value: undefined, conditions: [] }]);
  });

  it(`is offered for a printer file too, same as the other Specials buttons`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.prtf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const panel = sandbox.createAddFieldPanel();
    const userConstantButton = panel.children.find((c: FakeElement) => c.innerText === `System user constant`);
    userConstantButton.onclick();

    const sent = sandbox.postedMessages.find((m: any) => m.command === `newField`);
    expect(sent.fieldInfo.displayType).toBe(`output`);
  });
});

describe(`parseDspSizes`, () => {
  it(`parses a single size with a qualifier`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80 *DS3`)).toEqual([
      { height: 24, width: 80, qualifier: `*DS3` },
    ]);
  });

  it(`parses a single size with no qualifier`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80`)).toEqual([
      { height: 24, width: 80, qualifier: undefined },
    ]);
  });

  it(`parses two sizes defined together`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80 *DS3 27 132 *DS4`)).toEqual([
      { height: 24, width: 80, qualifier: `*DS3` },
      { height: 27, width: 132, qualifier: `*DS4` },
    ]);
  });

  it(`returns an empty list for garbage input`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`*DS3`)).toEqual([]);
    expect(sandbox.parseDspSizes(``)).toEqual([]);
  });
});

describe(`parsePagSize`, () => {
  it(`parses a page size`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parsePagSize(`66 132`)).toEqual({ height: 66, width: 132 });
  });

  it(`returns undefined for garbage input`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parsePagSize(`*DS3`)).toBeUndefined();
    expect(sandbox.parsePagSize(``)).toBeUndefined();
  });
});

describe(`getPageSize`, () => {
  it(`uses PAGSIZ for a printer file`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.prtf`, false);

    const globalFormat = { keywords: [{ name: `PAGSIZ`, value: `66 132`, conditions: [] }] };
    expect(sandbox.getPageSize(globalFormat)).toEqual({ width: 132, height: 66 });
  });

  it(`falls back to the standard 66x132 page size when a printer file has no PAGSIZ`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.prtf`, false);

    expect(sandbox.getPageSize(undefined)).toEqual({ width: 132, height: 66 });
  });

  it(`ignores DSPSIZ on a printer file, even if present`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.prtf`, false);

    const globalFormat = { keywords: [{ name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] }] };
    expect(sandbox.getPageSize(globalFormat)).toEqual({ width: 132, height: 66 });
  });

  it(`still uses DSPSIZ for a display file`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [] }, `dds.dspf`, false);

    const globalFormat = { keywords: [{ name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] }] };
    expect(sandbox.getPageSize(globalFormat)).toEqual({ width: 80, height: 24 });
  });
});

describe(`findTouchingFields`, () => {
  function field(name: string, x: number, y: number, length: number): any {
    return { name, position: { x, y }, length, displayType: `output`, keywords: [], conditions: [] };
  }

  function constField(name: string, x: number, y: number, value: string): any {
    return { name, position: { x, y }, value, displayType: `const`, keywords: [], conditions: [] };
  }

  it(`flags nothing when there's a real gap between fields`, () => {
    const sandbox = loadWebui();
    // A occupies cols 1-5, B starts at col 7 - one blank column (6) between them.
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 7, 1, 5);
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`flags fields with zero gap (immediately touching)`, () => {
    const sandbox = loadWebui();
    // A occupies cols 1-5, B starts at col 6 - no blank column between them.
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 6, 1, 5);
    const conflicting = sandbox.findTouchingFields([a, b]);
    expect(conflicting.has(a)).toBe(true);
    expect(conflicting.has(b)).toBe(true);
  });

  it(`flags fields that actually overlap`, () => {
    const sandbox = loadWebui();
    const a = field(`A`, 1, 1, 5); // cols 1-5
    const b = field(`B`, 3, 1, 5); // cols 3-7, overlaps A
    const conflicting = sandbox.findTouchingFields([a, b]);
    expect(conflicting.has(a)).toBe(true);
    expect(conflicting.has(b)).toBe(true);
  });

  it(`ignores fields on different rows`, () => {
    const sandbox = loadWebui();
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 6, 2, 5); // same columns, different row
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`ignores hidden fields`, () => {
    const sandbox = loadWebui();
    const a = { ...field(`A`, 1, 1, 5), displayType: `hidden` };
    const b = field(`B`, 6, 1, 5);
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`uses a constant's literal text length, not a field length`, () => {
    const sandbox = loadWebui();
    const label = constField(`LBL`, 1, 1, `Name:`); // 5 chars, cols 1-5
    const touching = field(`F`, 6, 1, 10); // starts right where the label ends
    const notTouching = field(`F2`, 7, 1, 10); // one blank column after the label

    expect(sandbox.findTouchingFields([label, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([label, notTouching]).size).toBe(0);
  });

  it(`floors a zero-length field at 1, matching how it actually renders`, () => {
    const sandbox = loadWebui();
    const referenced = field(`REF`, 1, 1, 0); // renders as 1 char wide (see getElement's floor)
    const touching = field(`F`, 2, 1, 5); // right after that 1 rendered character
    const notTouching = field(`F2`, 3, 1, 5);

    expect(sandbox.findTouchingFields([referenced, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([referenced, notTouching]).size).toBe(0);
  });

  it(`flags two constants (labels) touching each other, not just fields`, () => {
    const sandbox = loadWebui();
    const a = constField(`LBL1`, 1, 1, `Name:`); // cols 1-5
    const touching = constField(`LBL2`, 6, 1, `Date:`); // starts right where LBL1 ends
    const notTouching = constField(`LBL3`, 7, 1, `Date:`); // one blank column after LBL1

    expect(sandbox.findTouchingFields([a, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([a, notTouching]).size).toBe(0);
  });
});

describe(`DATE/TIME fields with no DATFMT/TIMFMT`, () => {
  function textOf(group: any): string {
    return group.children.find((c: any) => c.type === `Text`).config.text;
  }

  it(`falls back to *MDY when a DATE field has no DATFMT`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 }, keywords: [{ name: `DATE`, value: undefined, conditions: [] }],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm/dd/yyyy`);
  });

  it(`falls back to *HMS when a TIME field has no TIMFMT`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 }, keywords: [{ name: `TIME`, value: undefined, conditions: [] }],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh:mm:ss`);
  });

  it(`still uses an explicit DATFMT/TIMFMT when given`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATFMT`, value: `*ISO`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`yyyy-mm-dd`);
  });

  it(`still applies an explicit DATSEP/TIMSEP on top of the fallback format`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATSEP`, value: `-`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm-dd-yyyy`);
  });

  it(`still uses an explicit TIMFMT when given (symmetry with DATFMT)`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMFMT`, value: `*ISO`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh.mm.ss`);
  });

  it(`still applies an explicit TIMSEP on top of the fallback format (symmetry with DATSEP)`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMSEP`, value: `-`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh-mm-ss`);
  });

  it(`doesn't touch the separator when DATSEP/TIMSEP is explicitly *JOB, even with the fallback format`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATSEP`, value: `*JOB`, conditions: [] },
      ],
    };
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMSEP`, value: `*JOB`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm/dd/yyyy`);
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh:mm:ss`);
  });
});

describe(`setWindowForFormat error trapping`, () => {
  function basicModel() {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [
            // Referenced indicator so the sidebar has an "Indicators" section
            // to render - proof the successful-render path was exercised
            // before the error path clears it back out.
            { name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [{ indicators: [{ indicator: 50, negate: false }] }] },
          ],
        },
      ],
    };
  }

  it(`clears the screen instead of throwing when the typed format name doesn't exist yet`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(basicModel(), `dds.dspf`, false);

    // Render something real first, so there's actually content to clear.
    // (Sections are built with appendChild, not an innerHTML string, so
    // presence of content shows up as child elements, not innerHTML text.)
    sandbox.setWindowForFormat(`FMT1`);
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBeGreaterThan(0);

    // e.g. the user is still mid-typing a format name into the combobox.
    expect(() => sandbox.setWindowForFormat(`NOT_A_REAL_FORMAT`)).not.toThrow();
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBe(0);
    expect(sandbox.document.getElementById(`fieldInfoSidebar`).innerHTML).toBe(``);
  });

  it(`clears the screen instead of throwing when rendering fails unexpectedly for any other reason`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(basicModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBeGreaterThan(0);

    // Simulate a failure deep in rendering (e.g. a Konva/library error) that
    // has nothing to do with the format name being valid.
    sandbox.Konva.Stage = class {
      constructor() { throw new Error(`boom`); }
    };

    expect(() => sandbox.setWindowForFormat(`FMT1`)).not.toThrow();
    expect(sandbox.document.getElementById(`recordFormatSidebar`).innerHTML).toBe(``);
    expect(sandbox.document.getElementById(`fieldInfoSidebar`).innerHTML).toBe(``);
  });
});

describe(`showRendererError`, () => {
  it(`does not show the banner for vscode-elements' own internal keydown bug`, () => {
    const sandbox = loadWebui();
    // Mirrors the real crash: the combobox's own keydown listener throws
    // "Cannot read properties of undefined (reading 'index')" from inside
    // vscode-elements.js when Enter is pressed while a typed filter matches
    // no options - it's not something our code calls into or can try/catch.
    const libraryError = new Error(`Cannot read properties of undefined (reading 'index')`);
    libraryError.stack = `TypeError: Cannot read properties of undefined (reading 'index')\n    at ds._onEnterKeyDown (.../webui/scripts/vscode-elements.js:1180:10942)`;

    sandbox.showRendererError(libraryError);

    // No banner element should have been created/inserted at all.
    expect(sandbox.document.body.children.length).toBe(0);
  });

  it(`still shows the banner for a real error from our own code`, () => {
    const sandbox = loadWebui();
    const ourError = new Error(`something actually broke`);
    ourError.stack = `Error: something actually broke\n    at renderFormat (.../webui/main.js:252:1)`;

    sandbox.showRendererError(ourError);

    // The fake document's getElementById only resolves the harness's fixed
    // IDs, not elements created and appended at runtime - so look it up the
    // same way showRendererError actually inserted it, via document.body.
    const banner = sandbox.document.body.children.find((el: any) => el.id === `rendererErrorBanner`);
    expect(banner).not.toBeUndefined();
    expect(banner.textContent).toContain(`something actually broke`);
  });
});

describe(`undo/redo keydown forwarding`, () => {
  function keyEvent(overrides: any = {}) {
    let prevented = false;
    return {
      key: `z`, metaKey: false, ctrlKey: false, shiftKey: false,
      target: { tagName: `DIV` },
      preventDefault: () => { prevented = true; },
      get defaultPrevented() { return prevented; },
      ...overrides,
    };
  }

  it(`forwards Cmd+Z as undo`, () => {
    const sandbox = loadWebui();
    const event = keyEvent({ metaKey: true });
    sandbox.document.trigger(`keydown`, event);

    expect(sandbox.postedMessages).toContainEqual({ command: `undo` });
    expect(event.defaultPrevented).toBe(true);
  });

  it(`forwards Ctrl+Z as undo`, () => {
    const sandbox = loadWebui();
    sandbox.document.trigger(`keydown`, keyEvent({ ctrlKey: true }));
    expect(sandbox.postedMessages).toContainEqual({ command: `undo` });
  });

  it(`forwards Cmd+Shift+Z as redo`, () => {
    const sandbox = loadWebui();
    sandbox.document.trigger(`keydown`, keyEvent({ metaKey: true, shiftKey: true }));
    expect(sandbox.postedMessages).toContainEqual({ command: `redo` });
  });

  it(`forwards Ctrl+Y as redo (the Windows/Linux convention)`, () => {
    const sandbox = loadWebui();
    sandbox.document.trigger(`keydown`, keyEvent({ ctrlKey: true, key: `y` }));
    expect(sandbox.postedMessages).toContainEqual({ command: `redo` });
  });

  it(`ignores Z pressed without any modifier key`, () => {
    const sandbox = loadWebui();
    const event = keyEvent();
    sandbox.document.trigger(`keydown`, event);

    expect(sandbox.postedMessages).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it(`leaves an actual text input's own native undo alone`, () => {
    const sandbox = loadWebui();
    const event = keyEvent({ metaKey: true, target: { tagName: `INPUT` } });
    sandbox.document.trigger(`keydown`, event);

    expect(sandbox.postedMessages).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it(`leaves a contenteditable field's own native undo alone`, () => {
    const sandbox = loadWebui();
    const event = keyEvent({ metaKey: true, target: { tagName: `CODE`, isContentEditable: true } });
    sandbox.document.trigger(`keydown`, event);

    expect(sandbox.postedMessages).toEqual([]);
  });
});

describe(`isValidFormatName`, () => {
  it.each([
    `FMT1`, `A`, `$FMT`, `#FMT`, `@FMT`, `AB_CD`, `A123456789`,
  ])(`accepts %s`, (name) => {
    const sandbox = loadWebui();
    expect(sandbox.isValidFormatName(name)).toBe(true);
  });

  it.each([
    [``, `empty`],
    [`1FMT`, `starting with a digit`],
    [`FMT NAME`, `containing a space`],
    [`A12345678901`, `over 10 characters`],
    [`fmt1`, `lowercase (names are uppercased before validating)`],
    [`FMT-1`, `containing a hyphen`],
  ])(`rejects %s (%s)`, (name) => {
    const sandbox = loadWebui();
    expect(sandbox.isValidFormatName(name)).toBe(false);
  });
});

describe(`setTabs (record format selector) - Delete Format button state`, () => {
  it(`disables the Delete Format button when there are no record formats left`, () => {
    const sandbox = loadWebui();
    sandbox.setTabs([], undefined);
    expect(sandbox.document.getElementById(`deleteFormatButton`).getAttribute(`disabled`)).not.toBeUndefined();
  });

  it(`enables the Delete Format button when at least one record format exists`, () => {
    const sandbox = loadWebui();
    // Start disabled (no formats), then confirm a later render re-enables it.
    sandbox.setTabs([], undefined);
    sandbox.setTabs([`FMT1`], `FMT1`);
    expect(sandbox.document.getElementById(`deleteFormatButton`).getAttribute(`disabled`)).toBeUndefined();
  });
});

describe(`createCommandKeysPanel`, () => {
  it(`returns undefined when the file uses no CAxx/CFxx keywords at all`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({
      formats: [{ name: `FMT1`, keywords: [{ name: `COLOR`, value: `BLU`, conditions: [] }], fields: [] }],
    }, `dds.dspf`, false);

    expect(sandbox.createCommandKeysPanel()).toBeUndefined();
  });

  it(`lists every command key across every format, ignoring non-command keywords`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({
      formats: [
        { name: `FMT1`, keywords: [
          { name: `CF03`, value: `03`, conditions: [] },
          { name: `COLOR`, value: `BLU`, conditions: [] },
        ], fields: [] },
        { name: `FMT2`, keywords: [
          { name: `CA12`, value: undefined, conditions: [] },
        ], fields: [] },
      ],
    }, `dds.dspf`, false);

    const tab = sandbox.createCommandKeysPanel();
    expect(tab.title).toBe(`Command Keys`);
    expect(tab.html.children.length).toBe(2);
  });

  it(`includes a file-level command key, labelled distinctly from a record format`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({
      formats: [
        { name: `_GLOBAL`, keywords: [{ name: `CF03`, value: `03`, conditions: [] }], fields: [] },
        { name: `FMT1`, keywords: [], fields: [] },
      ],
    }, `dds.dspf`, false);

    const tab = sandbox.createCommandKeysPanel();
    expect(tab.html.children.length).toBe(1);
    const formatText = tab.html.children[0].children.find((c: FakeElement) => c.innerText === `File level`);
    expect(formatText).toBeDefined();
  });

  it(`shows as a tab in the Design view's left sidebar too, not just Preview`, () => {
    const sandbox = loadWebui(`design`);
    sandbox.loadDDS({
      formats: [{ name: `FMT1`, keywords: [{ name: `CF03`, value: `03`, conditions: [] }], fields: [] }],
    }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const sidebar = sandbox.document.getElementById(`recordFormatSidebar`);
    const tabsElement = sidebar.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);
    const headers = tabsElement.children
      .filter((el: FakeElement) => el.tagName === `VSCODE-TAB-HEADER`)
      .map((el: FakeElement) => el.innerText);
    expect(headers).toContain(`Command Keys`);
  });
});

describe(`createComposedFormatsPanel - subfile auto-check`, () => {
  function modelWithSubfile() {
    return {
      formats: [
        { name: `SFLCTLFMT`, keywords: [{ name: `SFLCTL`, value: `SFLREC`, conditions: [] }], fields: [] },
        { name: `SFLREC`, keywords: [], fields: [] },
      ],
    };
  }

  it(`checking a subfile control format also checks its subfile record - it's already drawn on screen either way`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(modelWithSubfile(), `dds.dspf`, true);

    let panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    toggleComposedFormatCheckbox(panel, `SFLCTLFMT`, true);

    panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    const sflctl = panel.children.find((c: FakeElement) => c.attributes.label === `SFLCTLFMT`);
    const sflrec = panel.children.find((c: FakeElement) => c.attributes.label === `SFLREC`);
    expect(sflctl.checked).toBe(true);
    expect(sflrec.checked).toBe(true);
  });

  it(`unchecking the control format afterward doesn't force-uncheck the subfile`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(modelWithSubfile(), `dds.dspf`, true);

    let panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    toggleComposedFormatCheckbox(panel, `SFLCTLFMT`, true);
    panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    toggleComposedFormatCheckbox(panel, `SFLCTLFMT`, false);

    panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    const sflctl = panel.children.find((c: FakeElement) => c.attributes.label === `SFLCTLFMT`);
    const sflrec = panel.children.find((c: FakeElement) => c.attributes.label === `SFLREC`);
    expect(sflctl.checked).toBe(false);
    expect(sflrec.checked).toBe(true);
  });

  it(`checking an ordinary format with no SFLCTL keyword doesn't check anything else`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(modelWithSubfile(), `dds.dspf`, true);

    let panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    toggleComposedFormatCheckbox(panel, `SFLREC`, true);

    panel = sandbox.createComposedFormatsPanel([`SFLCTLFMT`, `SFLREC`]);
    const sflctl = panel.children.find((c: FakeElement) => c.attributes.label === `SFLCTLFMT`);
    expect(sflctl.checked).toBe(false);
  });
});

describe(`updatePreviewSidebar - Composed Formats/Indicators tabs`, () => {
  function modelWithComposedFormatsAndIndicators() {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [
            { name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [{ indicators: [{ indicator: 50, negate: false }] }] },
          ],
        },
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
  }

  it(`renders both as tabs, not accordions, defaulting to the first`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(modelWithComposedFormatsAndIndicators(), `dds.dspf`, true);

    const sidebar = sandbox.document.getElementById(`recordFormatSidebar`);
    const tabsElement = sidebar.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);
    expect(tabsElement).toBeDefined();
    expect(tabsElement.getAttribute(`selected-index`)).toBe(`0`);

    const headers = tabsElement.children
      .filter((el: FakeElement) => el.tagName === `VSCODE-TAB-HEADER`)
      .map((el: FakeElement) => el.innerText);
    expect(headers).toEqual([`Composed Formats`, `Indicators`]);
  });

  it(`keeps the previously selected tab across a re-render instead of resetting to the first tab`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(modelWithComposedFormatsAndIndicators(), `dds.dspf`, true);

    const sidebar = sandbox.document.getElementById(`recordFormatSidebar`);
    const findTabs = () => sidebar.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);

    // Simulate the user clicking the second tab (Indicators).
    findTabs().trigger(`vsc-tabs-select`, { detail: { selectedIndex: 1 } });

    // Anything that re-renders this sidebar (e.g. toggling a checkbox inside
    // it) should land back on the tab the user was actually looking at,
    // rather than snapping back to the first one.
    sandbox.renderComposedPreview();

    expect(findTabs().getAttribute(`selected-index`)).toBe(`1`);
  });
});

describe(`Design vs Preview mode`, () => {
  function twoFormatModel() {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [{ name: `CF03`, value: `03`, conditions: [] }],
          fields: [],
        },
        // A second format so the Composed Formats tab has something to list.
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
  }

  function tabHeaders(sandbox: any, containerId: string): string[] {
    const container = sandbox.document.getElementById(containerId);
    const tabsElement = container.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);
    if (!tabsElement) { return []; }
    return tabsElement.children
      .filter((el: FakeElement) => el.tagName === `VSCODE-TAB-HEADER`)
      .map((el: FakeElement) => el.innerText);
  }

  it(`never shows the Composed Formats tab in the Design view, even with other formats available`, () => {
    const sandbox = loadWebui(`design`);
    sandbox.loadDDS(twoFormatModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(tabHeaders(sandbox, `recordFormatSidebar`)).not.toContain(`Composed Formats`);
  });

  it(`shows the Composed Formats tab only in the Preview view`, () => {
    const sandbox = loadWebui(`preview`);
    // Preview has no dropdown/setWindowForFormat - loading with rerender is
    // what drives its render path (renderComposedPreview).
    sandbox.loadDDS(twoFormatModel(), `dds.dspf`, true);

    // twoFormatModel's FMT1 carries a CF03 keyword, so Command Keys shows too.
    expect(tabHeaders(sandbox, `recordFormatSidebar`)).toEqual([`Composed Formats`, `Command Keys`]);
  });

  it(`offers the Add Field panel only in the Design view`, () => {
    const design = loadWebui(`design`);
    design.loadDDS(twoFormatModel(), `dds.dspf`, false);
    design.setWindowForFormat(`FMT1`);
    expect(tabHeaders(design, `fieldInfoSidebar`)).toContain(`Add Field`);

    const preview = loadWebui(`preview`);
    preview.loadDDS(twoFormatModel(), `dds.dspf`, false);
    preview.setWindowForFormat(`FMT1`);
    expect(tabHeaders(preview, `fieldInfoSidebar`)).not.toContain(`Add Field`);
  });

  it(`makes the format keywords panel read-only in the Preview view`, () => {
    const design = loadWebui(`design`);
    design.loadDDS(twoFormatModel(), `dds.dspf`, false);
    design.setWindowForFormat(`FMT1`);
    const designPanel = design.createFormatKeywordsTab().html;
    // Editable: the keyword tree plus a "New Keyword" button.
    expect(designPanel.children.length).toBe(2);

    const preview = loadWebui(`preview`);
    preview.loadDDS(twoFormatModel(), `dds.dspf`, false);
    preview.setWindowForFormat(`FMT1`);
    const previewPanel = preview.createFormatKeywordsTab().html;
    // Read-only: no "New Keyword" button, and its tree rows get no edit/delete actions.
    expect(previewPanel.children.length).toBe(1);
  });
});

describe(`renderComposedPreview`, () => {
  function twoRealFormatsModel() {
    return {
      formats: [
        {
          name: `HEADER`,
          keywords: [],
          fields: [{ name: `H1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] }],
        },
        {
          name: `FOOTER`,
          keywords: [],
          fields: [{ name: `F1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 2 }, keywords: [], conditions: [] }],
        },
      ],
    };
  }

  it(`renders every currently-checked format together, with no single "selected" one required`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(twoRealFormatsModel(), `dds.dspf`, false);

    // Capture the layer renderComposedPreview builds, so its rendered
    // content can be inspected after the fact.
    let capturedLayer: any;
    const RealLayer = sandbox.Konva.Layer;
    sandbox.Konva.Layer = class extends RealLayer {
      constructor(c: any) { super(c); capturedLayer = this; }
    };

    // Check both formats via the same checkbox path the UI uses.
    const panel = sandbox.createComposedFormatsPanel([`HEADER`, `FOOTER`]);
    toggleComposedFormatCheckbox(panel, `HEADER`, true);
    toggleComposedFormatCheckbox(panel, `FOOTER`, true);

    const ids = capturedLayer.children.map((c: any) => c.config.id);
    expect(ids).toContain(`HEADER::H1`);
    expect(ids).toContain(`FOOTER::F1`);
  });

  it(`stops rendering a format once it's unchecked`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(twoRealFormatsModel(), `dds.dspf`, false);

    let capturedLayer: any;
    const RealLayer = sandbox.Konva.Layer;
    sandbox.Konva.Layer = class extends RealLayer {
      constructor(c: any) { super(c); capturedLayer = this; }
    };

    const panel = sandbox.createComposedFormatsPanel([`HEADER`, `FOOTER`]);
    toggleComposedFormatCheckbox(panel, `HEADER`, true);
    toggleComposedFormatCheckbox(panel, `FOOTER`, true);
    toggleComposedFormatCheckbox(panel, `HEADER`, false);

    const ids = capturedLayer.children.map((c: any) => c.config.id);
    expect(ids).not.toContain(`HEADER::H1`);
    expect(ids).toContain(`FOOTER::F1`);
  });
});

describe(`uniqueFieldName`, () => {
  function modelWithFields(fieldNames: string[]) {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: fieldNames.map((name, i) => ({
            name, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined,
            position: { x: 1, y: i + 1 }, keywords: [], conditions: [],
          })),
        },
      ],
    };
  }

  it(`returns the base name unchanged when it's not already used`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithFields([]), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.uniqueFieldName(`NEWFLD1`)).toBe(`NEWFLD1`);
  });

  it(`bumps a trailing number when the base name is already taken`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithFields([`NEWFLD1`]), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.uniqueFieldName(`NEWFLD1`)).toBe(`NEWFLD2`);
  });

  it(`keeps bumping past several already-taken numbers`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithFields([`NEWFLD1`, `NEWFLD2`, `NEWFLD3`]), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.uniqueFieldName(`NEWFLD1`)).toBe(`NEWFLD4`);
  });

  it(`appends a number when the base name doesn't already end in one`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithFields([`DATEFLD`]), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.uniqueFieldName(`DATEFLD`)).toBe(`DATEFLD2`);
  });

  it(`only considers fields in the currently selected format, not other formats`, () => {
    const sandbox = loadWebui();
    const model = {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [{ name: `NEWFLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] }],
        },
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
    sandbox.loadDDS(model, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT2`);

    expect(sandbox.uniqueFieldName(`NEWFLD1`)).toBe(`NEWFLD1`);
  });
});

describe(`nextAvailableFieldPosition`, () => {
  it(`defaults to (1, 1) when the format has no fields yet`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.nextAvailableFieldPosition()).toEqual({ x: 1, y: 1 });
  });

  it(`lands on the row after the lowest field currently in the format, instead of always (1, 1)`, () => {
    const sandbox = loadWebui();
    const model = {
      formats: [{
        name: `FMT1`,
        keywords: [],
        fields: [
          { name: `A`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
          { name: `B`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 3 }, keywords: [], conditions: [] },
        ],
      }],
    };
    sandbox.loadDDS(model, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    expect(sandbox.nextAvailableFieldPosition()).toEqual({ x: 1, y: 4 });
  });

  it(`never proposes the same position twice in a row (the actual reported bug)`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    // Mirrors adding a Named field then, right after, a Constant text - both
    // used to hardcode position (1, 1) and land exactly on top of each other.
    const first = sandbox.nextAvailableFieldPosition();
    const modelWithFirstField = {
      formats: [{
        name: `FMT1`,
        keywords: [],
        fields: [{ name: `NEWFLD1`, type: `A`, length: 10, decimals: 0, displayType: `input`, value: undefined, position: first, keywords: [], conditions: [] }],
      }],
    };
    sandbox.loadDDS(modelWithFirstField, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    const second = sandbox.nextAvailableFieldPosition();

    expect(second).not.toEqual(first);
  });
});

describe(`editKeyword - uppercasing`, () => {
  /** editKeyword doesn't return the form group it builds - it appends
   * directly to #keywordEditorArea - so dig it back out to drive the form.
   * (Its id is set via the .id property, not setAttribute, so look it up
   * by tag instead of the #id selector querySelector relies on.) */
  function currentKeywordEditorGroup(sandbox: any): FakeElement {
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    return area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
  }

  it(`uppercases a typed keyword name, even one not in the predefined list, before saving`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; });

    const group = currentKeywordEditorGroup(sandbox);
    const keywordSelect = group.children.find((el: FakeElement) => el.attributes.id === `keyword`);
    // Mirrors typing a brand-new keyword name into the creatable combobox -
    // not one of the predefined DDS_KEYWORDS options.
    keywordSelect.value = `myowncmt`;

    const confirmButton = group.children[group.children.length - 1];
    confirmButton.onclick();

    expect(saved.name).toBe(`MYOWNCMT`);
  });

  it(`uppercases a typed value before saving, even when typed in lowercase`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `COLOR`, value: ``, conditions: [] });

    const group = currentKeywordEditorGroup(sandbox);
    const valueField = group.querySelector(`#value`);
    valueField.value = `blu`;

    const confirmButton = group.children[group.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`BLU`);
  });

  it(`leaves quoted literal text alone while still uppercasing the rest of the value`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `WDWTITLE`, value: ``, conditions: [] });

    const group = currentKeywordEditorGroup(sandbox);
    const valueField = group.querySelector(`#value`);
    valueField.value = `*text 'Confirm delete' *color wht *top *center`;

    const confirmButton = group.children[group.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`*TEXT 'Confirm delete' *COLOR WHT *TOP *CENTER`);
  });
});

describe(`createKeywordPanel - identifying which keyword a row acts on`, () => {
  /** Two keywords identical apart from their conditioning indicators -
   * ordinary DDS (an indicator picks which DSPATR applies), and the case
   * that a name+value match can't tell apart. */
  function twoIdenticalDspatrs() {
    return [
      { name: `DSPATR`, value: `HI`, conditions: [group(cond(30))] },
      { name: `DSPATR`, value: `HI`, conditions: [group(cond(31))] },
    ];
  }

  function treeOf(panel: FakeElement): FakeElement {
    const tree = panel.children.find(c => c.tagName === `VSCODE-TREE`);
    if (!tree) { throw new Error(`No tree in the keyword panel`); }
    return tree;
  }

  /** Mirrors vscode-elements' own vsc-run-action detail: the action id plus
   * the `value` of the item the action was run on. */
  function runAction(tree: FakeElement, rowIndex: number, actionId: string) {
    const item = (tree as any).data[rowIndex];
    tree.trigger(`vsc-run-action`, { detail: { actionId, item, value: item.value } });
  }

  function currentKeywordEditorGroup(sandbox: any): FakeElement {
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    return area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
  }

  it(`deletes the row that was clicked, not the first keyword that looks like it`, () => {
    const sandbox = loadWebui();
    let updated: any;
    const panel = sandbox.createKeywordPanel(`kw`, twoIdenticalDspatrs(), (keywords: any) => { updated = keywords; });

    runAction(treeOf(panel), 1, `delete`);

    expect(updated).toHaveLength(1);
    expect(updated[0].conditions).toEqual([group(cond(30))]);
  });

  it(`edits the row that was clicked, not the first keyword that looks like it`, () => {
    const sandbox = loadWebui();
    let updated: any;
    const panel = sandbox.createKeywordPanel(`kw`, twoIdenticalDspatrs(), (keywords: any) => { updated = keywords; });

    runAction(treeOf(panel), 1, `edit`);

    // The form opens on the second keyword - its indicator, not the first's.
    const formGroup = currentKeywordEditorGroup(sandbox);
    expect(formGroup.querySelector(`#ind-0-0`).value).toBe(`31`);

    formGroup.querySelector(`#value`).value = `UL`;
    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(updated).toHaveLength(2);
    expect(updated[0]).toEqual({ name: `DSPATR`, value: `HI`, conditions: [group(cond(30))] });
    expect(updated[1].value).toBe(`UL`);
  });
});

describe(`editKeyword - the Value control`, () => {
  function currentKeywordEditorGroup(sandbox: any): FakeElement {
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    return area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
  }

  function valueControl(formGroup: FakeElement): FakeElement {
    return formGroup.querySelector(`#value`);
  }

  function nameSelect(formGroup: FakeElement): FakeElement {
    return formGroup.querySelector(`#keyword`);
  }

  /** Mirrors picking a different keyword in the (creatable) name combobox. */
  function pickKeyword(formGroup: FakeElement, name: string) {
    const select = nameSelect(formGroup);
    select.value = name;
    select.trigger(`change`);
  }

  it(`offers a dropdown of known values for a keyword we have tabled`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `COLOR`, value: ``, conditions: [] });

    const control = valueControl(currentKeywordEditorGroup(sandbox));
    expect(control.tagName).toBe(`VSCODE-SINGLE-SELECT`);
    // The meaning is in the label; the value saved is only ever the DDS code.
    expect(control.options).toContainEqual({ label: `GRN - Green (the default)`, value: `GRN` });
    expect(control.options.map(o => o.value)).toContain(`BLU`);
  });

  it(`keeps the plain free-text box for a keyword we have no value set for`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `MYOWNKW`, value: `whatever`, conditions: [] });

    expect(valueControl(currentKeywordEditorGroup(sandbox)).tagName).toBe(`VSCODE-TEXTFIELD`);
  });

  it(`stays creatable, so a value that isn't on the list can still be typed and saved`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `COLOR`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const control = valueControl(formGroup);
    expect(control.creatable).toBe(true);
    control.value = `mauve`;

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`MAUVE`);
  });

  it(`shows an existing value the table doesn't cover instead of blanking it`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `COLOR`, value: `PURPLE`, conditions: [] });

    // .value only selects something already in .options, so an unknown value
    // has to be added as one - otherwise the editor silently drops it.
    const control = valueControl(currentKeywordEditorGroup(sandbox));
    expect(control.value).toBe(`PURPLE`);
  });

  it(`saves the bare code picked from the dropdown, not its explanatory label`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `EDTCDE`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    valueControl(formGroup).value = `Y`;

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`Y`);
  });

  it(`seeds DATFMT and TIMFMT from the same maps the canvas renders them with`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DATFMT`, value: ``, conditions: [] });

    const control = valueControl(currentKeywordEditorGroup(sandbox));
    expect(control.options).toContainEqual({ label: `*MDY - mm/dd/yyyy`, value: `*MDY` });
  });

  it(`rebuilds the Value row when a different keyword is picked`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `TEXT`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    expect(valueControl(formGroup).tagName).toBe(`VSCODE-TEXTFIELD`);

    pickKeyword(formGroup, `COLOR`);

    const rebuilt = valueControl(formGroup);
    expect(rebuilt.tagName).toBe(`VSCODE-SINGLE-SELECT`);
    expect(rebuilt.options.map(o => o.value)).toContain(`TRQ`);
    // Replaced in place - not appended alongside the old control, and still
    // ahead of the Conditions section and Confirm button.
    expect(formGroup.querySelectorAll(`#value`)).toHaveLength(1);
    expect(formGroup.children[formGroup.children.length - 1].innerText).toBe(`Confirm`);
  });

  it(`carries a typed value over to a keyword we can't say it's wrong for`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `COLOR`, value: `RED`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    // WDWTITLE has no value set of its own, so its box is free text -
    // nothing there says RED is wrong, so don't throw it away.
    pickKeyword(formGroup, `WDWTITLE`);

    expect(valueControl(formGroup).tagName).toBe(`VSCODE-TEXTFIELD`);

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`RED`);
  });

  it(`drops a value the newly picked keyword's own list rules out`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `COLOR`, value: `RED`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    pickKeyword(formGroup, `EDTCDE`);

    const rebuilt = valueControl(formGroup);
    expect(rebuilt.tagName).toBe(`VSCODE-SINGLE-SELECT`);
    expect(rebuilt.value).toBeUndefined();
    // RED isn't an edit code, so it isn't carried over as an option either.
    expect(rebuilt.options.map(o => o.value)).not.toContain(`RED`);
  });

  it(`keeps a value that's valid for both keywords`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DATFMT`, value: `*ISO`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    pickKeyword(formGroup, `TIMFMT`);

    expect(valueControl(formGroup).value).toBe(`*ISO`);
  });
});

describe(`editKeyword - multi-value keywords (DSPATR)`, () => {
  function currentKeywordEditorGroup(sandbox: any): FakeElement {
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    return area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
  }

  function valueBox(formGroup: FakeElement): FakeElement {
    return formGroup.querySelector(`#value`);
  }

  /** The checkbox for one DSPATR code, found by the code its label starts with. */
  function attributeCheckbox(formGroup: FakeElement, code: string): FakeElement {
    const row = valueBox(formGroup).parentElement!;
    const checkbox = row.children.find(child =>
      child.tagName === `VSCODE-CHECKBOX` && child.attributes.label.startsWith(`${code} - `));
    if (!checkbox) { throw new Error(`No checkbox for DSPATR(${code})`); }
    return checkbox;
  }

  function toggle(formGroup: FakeElement, code: string, checked: boolean) {
    const checkbox = attributeCheckbox(formGroup, code);
    checkbox.attributes.checked = checked ? `true` : `false`;
    checkbox.trigger(`change`);
  }

  function isChecked(formGroup: FakeElement, code: string) {
    return attributeCheckbox(formGroup, code).checked;
  }

  it(`offers a checkbox per attribute alongside a box that's still free text`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    // Not a dropdown: DSPATR(HI UL) is a list, which a single-select can't say.
    expect(valueBox(formGroup).tagName).toBe(`VSCODE-TEXTFIELD`);
    expect(attributeCheckbox(formGroup, `HI`).attributes.label).toBe(`HI - High intensity`);
    expect(attributeCheckbox(formGroup, `MDT`)).toBeDefined();
  });

  it(`builds a space-separated value as attributes are checked`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `DSPATR`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    toggle(formGroup, `HI`, true);
    toggle(formGroup, `UL`, true);

    expect(valueBox(formGroup).value).toBe(`HI UL`);

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.value).toBe(`HI UL`);
  });

  it(`ticks the boxes for the attributes an existing keyword already has`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: `HI UL`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    expect(isChecked(formGroup, `HI`)).toBe(true);
    expect(isChecked(formGroup, `UL`)).toBe(true);
    expect(isChecked(formGroup, `RI`)).toBe(false);
  });

  it(`removes just the unchecked attribute, leaving the rest in place`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: `HI UL RI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    toggle(formGroup, `UL`, false);

    expect(valueBox(formGroup).value).toBe(`HI RI`);
  });

  it(`keeps a code we don't have tabled instead of dropping it`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: `ZZ HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    expect(isChecked(formGroup, `HI`)).toBe(true);

    // Toggling a known attribute rebuilds the value from the box, so the
    // hand-written ZZ has to survive it.
    toggle(formGroup, `UL`, true);
    expect(valueBox(formGroup).value).toBe(`ZZ HI UL`);

    toggle(formGroup, `HI`, false);
    expect(valueBox(formGroup).value).toBe(`ZZ UL`);
  });

  it(`updates the checkboxes when the value is typed into the box directly`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const box = valueBox(formGroup);
    box.value = `hi ri`;
    // Whichever of the textfield's events reaches us - the native one or
    // vscode-textfield's own - has to keep the boxes in step.
    box.trigger(`vsc-input`);

    // Lowercase as typed - confirm uppercases on save, and the boxes
    // shouldn't sit unticked in the meantime.
    expect(isChecked(formGroup, `HI`)).toBe(true);
    expect(isChecked(formGroup, `RI`)).toBe(true);
    expect(isChecked(formGroup, `UL`)).toBe(false);
  });

  it(`updates the checkboxes on the native input event too`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: ``, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const box = valueBox(formGroup);
    box.value = `BL`;
    box.trigger(`input`);

    expect(isChecked(formGroup, `BL`)).toBe(true);
  });

  it(`drops a carried-over value whose codes aren't attributes`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `COLOR`, value: `RED`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const nameSelect = formGroup.querySelector(`#keyword`);
    nameSelect.value = `DSPATR`;
    nameSelect.trigger(`change`);

    expect(valueBox(formGroup).value).toBe(``);
    expect(isChecked(formGroup, `HI`)).toBe(false);
  });

  it(`carries over a value whose codes are all attributes`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `MYOWNKW`, value: `HI UL`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const nameSelect = formGroup.querySelector(`#keyword`);
    nameSelect.value = `DSPATR`;
    nameSelect.trigger(`change`);

    expect(valueBox(formGroup).value).toBe(`HI UL`);
    expect(isChecked(formGroup, `UL`)).toBe(true);
  });
});

describe(`the keyword name list - command keys`, () => {
  /** The list is a module-level const, so read it back off the name
   * combobox the editor actually builds from it. */
  function keywordNames(sandbox: any): string[] {
    sandbox.editKeyword(() => {});
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    const formGroup = area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
    return formGroup.querySelector(`#keyword`).options.map((option: any) => option.value);
  }

  it(`offers every CA01-CA24 and CF01-CF24`, () => {
    const sandbox = loadWebui();
    const names = keywordNames(sandbox);

    expect(names.filter(name => sandbox.isCommandKeyKeyword(name))).toHaveLength(48);
    // The ones that used to have to be typed by hand, plus the boundaries.
    [`CA01`, `CA05`, `CA24`, `CF05`, `CF17`, `CF24`].forEach(name => expect(names).toContain(name));
  });

  it(`has no duplicates, and nothing outside the real 01-24 range`, () => {
    const sandbox = loadWebui();
    const names = keywordNames(sandbox);

    expect(new Set(names).size).toBe(names.length);
    names.filter(name => /^(CA|CF)\d/.test(name)).forEach(name => {
      expect(sandbox.isCommandKeyKeyword(name)).toBe(true);
    });
  });
});

describe(`editKeyword - condition groups (up to 3 OR'd groups of 3 AND'd indicators)`, () => {
  function currentKeywordEditorGroup(sandbox: any): FakeElement {
    const area = sandbox.document.getElementById(`keywordEditorArea`);
    return area.children.find((el: FakeElement) => el.tagName === `VSCODE-FORM-GROUP`);
  }

  it(`builds one group per set of selected indicators, skipping an empty group left in between`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `DSPATR`, value: `HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    // Group 0, slot 0
    formGroup.querySelector(`#ind-0-0`).value = `10`;
    // Group 1 left entirely blank (all still "None")
    // Group 2, slot 0
    formGroup.querySelector(`#ind-2-0`).value = `20`;
    formGroup.querySelector(`#neg-2-0`).attributes.checked = `true`;

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.conditions).toEqual([
      { indicators: [{ indicator: 10, negate: false }] },
      { indicators: [{ indicator: 20, negate: true }] },
    ]);
  });

  it(`builds a single group from multiple indicators picked within it (AND)`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `DSPATR`, value: `HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    formGroup.querySelector(`#ind-0-0`).value = `10`;
    formGroup.querySelector(`#ind-0-1`).value = `11`;

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.conditions).toEqual([
      { indicators: [{ indicator: 10, negate: false }, { indicator: 11, negate: false }] },
    ]);
  });

  it(`saves indicators as numbers, so a just-edited keyword's conditions still match the indicator panel`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `DSPATR`, value: `HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    formGroup.querySelector(`#ind-0-0`).value = `30`;

    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.conditions[0].indicators[0].indicator).toBe(30);

    // activeIndicators is a Set of numbers, so a string `30` here would never
    // be satisfied - the keyword would look permanently "off" on the canvas
    // until the document round-tripped through the parser again.
    const panel = sandbox.createIndicatorsPanel([30]);
    toggleIndicatorCheckbox(panel, 30, true);
    expect(sandbox.indicatorsSatisfied(saved.conditions)).toBe(true);
  });

  it(`emits no conditions at all when nothing is selected in any group`, () => {
    const sandbox = loadWebui();
    let saved: any;
    sandbox.editKeyword((newKeyword: any) => { saved = newKeyword; }, { name: `DSPATR`, value: `HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const confirmButton = formGroup.children[formGroup.children.length - 1];
    confirmButton.onclick();

    expect(saved.conditions).toEqual([]);
  });

  it(`pre-fills existing multi-group conditions when editing an already-conditioned keyword`, () => {
    const sandbox = loadWebui();
    const existing = { name: `DSPATR`, value: `HI`, conditions: [group(cond(10)), group(cond(20, true))] };
    sandbox.editKeyword(() => {}, existing);

    const formGroup = currentKeywordEditorGroup(sandbox);
    expect(formGroup.querySelector(`#ind-0-0`).value).toBe(`10`);
    expect(formGroup.querySelector(`#ind-1-0`).value).toBe(`20`);
    expect(formGroup.querySelector(`#neg-1-0`).checked).toBe(true);
  });

  function conditionsSection(formGroup: FakeElement): FakeElement | undefined {
    return formGroup.children.find(c => c.tagName === `VSCODE-COLLAPSIBLE`);
  }

  it(`collapses the Conditions section by default for a keyword with no existing conditions`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: `HI`, conditions: [] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const section = conditionsSection(formGroup)!;
    expect(section).toBeDefined();
    expect(section.attributes.open).toBeUndefined();
  });

  it(`collapses the Conditions section by default for a brand-new keyword (no existing keyword at all)`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {});

    const formGroup = currentKeywordEditorGroup(sandbox);
    const section = conditionsSection(formGroup)!;
    expect(section.attributes.open).toBeUndefined();
  });

  it(`auto-expands the Conditions section when editing a keyword that already has a condition set`, () => {
    const sandbox = loadWebui();
    const existing = { name: `DSPATR`, value: `HI`, conditions: [group(cond(10))] };
    sandbox.editKeyword(() => {}, existing);

    const formGroup = currentKeywordEditorGroup(sandbox);
    const section = conditionsSection(formGroup)!;
    expect(section.attributes.open).toBe(``);
  });

  it(`the Confirm button is still the last element, regardless of the Conditions section`, () => {
    const sandbox = loadWebui();
    sandbox.editKeyword(() => {}, { name: `DSPATR`, value: `HI`, conditions: [group(cond(10))] });

    const formGroup = currentKeywordEditorGroup(sandbox);
    const lastChild = formGroup.children[formGroup.children.length - 1];
    expect(lastChild.innerText).toBe(`Confirm`);
  });
});

describe(`uppercaseOutsideQuotes`, () => {
  it(`uppercases plain text with no quotes`, () => {
    const sandbox = loadWebui();
    expect(sandbox.uppercaseOutsideQuotes(`blu`)).toBe(`BLU`);
  });

  it(`leaves the contents of a single quoted literal alone`, () => {
    const sandbox = loadWebui();
    expect(sandbox.uppercaseOutsideQuotes(`*text 'Hello there'`)).toBe(`*TEXT 'Hello there'`);
  });

  it(`still uppercases text after a closed quote`, () => {
    const sandbox = loadWebui();
    expect(sandbox.uppercaseOutsideQuotes(`*text 'Hello' *color blu`)).toBe(`*TEXT 'Hello' *COLOR BLU`);
  });

  it(`treats a doubled quote as an escaped literal quote, not the end of the string`, () => {
    const sandbox = loadWebui();
    // DDS's escape for a literal ' character inside a string is '' - this
    // must not be mistaken for the string closing and reopening.
    expect(sandbox.uppercaseOutsideQuotes(`*text 'it''s here' *color blu`)).toBe(`*TEXT 'it''s here' *COLOR BLU`);
  });

  it(`handles multiple separate quoted sections`, () => {
    const sandbox = loadWebui();
    expect(sandbox.uppercaseOutsideQuotes(`'one' and 'two'`)).toBe(`'one' AND 'two'`);
  });
});

describe(`loadDDS - refreshing the Indicators tab after a non-rerendering update`, () => {
  function fieldWithConditions(conditions: any[]) {
    return {
      formats: [{
        name: `FMT1`,
        keywords: [],
        fields: [{
          name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined,
          position: { x: 1, y: 1 }, conditions: [],
          keywords: conditions.length > 0 ? [{ name: `DSPATR`, value: `HI`, conditions }] : [],
        }],
      }],
    };
  }

  function indicatorsTabPresent(sandbox: any, containerId: string): boolean {
    const container = sandbox.document.getElementById(containerId);
    const tabsElement = container.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);
    if (!tabsElement) { return false; }
    const headers = tabsElement.children
      .filter((el: FakeElement) => el.tagName === `VSCODE-TAB-HEADER`)
      .map((el: FakeElement) => el.innerText);
    return headers.includes(`Indicators`);
  }

  it(`shows a newly-referenced indicator without a full re-render (Design view)`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(fieldWithConditions([]), `dds.dspf`, true);
    sandbox.setWindowForFormat(`FMT1`);
    expect(indicatorsTabPresent(sandbox, `recordFormatSidebar`)).toBe(false);

    // Mirrors sendFieldUpdate's round-trip: the extension host reparses and
    // posts back an 'update' message (withRerender=false), since the field
    // itself was already updated optimistically on the client.
    sandbox.loadDDS(fieldWithConditions([group(cond(30))]), `dds.dspf`, false);

    expect(indicatorsTabPresent(sandbox, `recordFormatSidebar`)).toBe(true);
  });

  it(`shows a newly-referenced indicator without a full re-render (Preview view)`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.loadDDS(fieldWithConditions([]), `dds.dspf`, true);
    expect(indicatorsTabPresent(sandbox, `recordFormatSidebar`)).toBe(false);

    sandbox.loadDDS(fieldWithConditions([group(cond(30))]), `dds.dspf`, false);

    expect(indicatorsTabPresent(sandbox, `recordFormatSidebar`)).toBe(true);
  });
});

describe(`window title rendering (WDWTITLE)`, () => {
  function modelWithWindowTitle(wdwTitleValue: string) {
    return {
      formats: [{
        name: `CONFIRMWIN`,
        isWindow: true,
        windowReference: undefined,
        windowSize: { y: 3, x: 20, width: 40, height: 8 },
        keywords: [
          { name: `WINDOW`, value: `3 20 8 40`, conditions: [] },
          { name: `WDWTITLE`, value: wdwTitleValue, conditions: [] },
        ],
        fields: [],
      }],
    };
  }

  function captureLayer(sandbox: any) {
    let capturedLayer: any;
    const RealLayer = sandbox.Konva.Layer;
    sandbox.Konva.Layer = class extends RealLayer {
      constructor(c: any) { super(c); capturedLayer = this; }
    };
    return () => capturedLayer;
  }

  it(`renders the window's title text, centered at the top by default`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithWindowTitle(`*TEXT 'Confirm Delete' *COLOR WHT *TOP *CENTER`), `dds.dspf`, false);
    const getLayer = captureLayer(sandbox);

    sandbox.setWindowForFormat(`CONFIRMWIN`);

    // A child of the window's own draggable group, not the layer directly -
    // findOne searches recursively, so this doesn't care how deep it's nested.
    const titleGroup = getLayer().findOne(`#CONFIRMWIN::WINDOWTITLE`);
    expect(titleGroup).toBeDefined();
    // Not editable/draggable - it's derived from the keyword, not a real field.
    expect(titleGroup.config.draggable).toBe(false);

    const text = titleGroup.children.find((c: any) => c.type === `Text`);
    expect(text.config.text).toBe(`Confirm Delete`);
  });

  it(`treats *COLOR as its own parameter, not the start of a *DSPATR`, () => {
    const sandbox = loadWebui();
    // A trailing *COLOR with no value after it is malformed DDS, but it's the
    // shape that exposes the fall-through: *COLOR must not also push a DSPATR
    // keyword carrying (here, missing) the colour's value. Rendering that
    // valueless DSPATR throws, and setWindowForFormat's catch-all turns the
    // whole format into a blank canvas - so this checks the window renders.
    sandbox.loadDDS(modelWithWindowTitle(`*TEXT 'Confirm Delete' *TOP *CENTER *COLOR`), `dds.dspf`, false);
    const getLayer = captureLayer(sandbox);

    sandbox.setWindowForFormat(`CONFIRMWIN`);

    const titleGroup = getLayer().findOne(`#CONFIRMWIN::WINDOWTITLE`);
    expect(titleGroup).toBeDefined();
    const text = titleGroup.children.find((c: any) => c.type === `Text`);
    expect(text.config.text).toBe(`Confirm Delete`);
  });

  it(`doesn't render anything (or crash) when WDWTITLE has no *TEXT`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithWindowTitle(`*COLOR WHT *TOP *CENTER`), `dds.dspf`, false);
    const getLayer = captureLayer(sandbox);

    expect(() => sandbox.setWindowForFormat(`CONFIRMWIN`)).not.toThrow();

    const titleGroup = getLayer().children.find((c: any) => c.config.id === `CONFIRMWIN::WINDOWTITLE`);
    expect(titleGroup).toBeUndefined();
  });
});

describe(`window drag/resize`, () => {
  const PX_PER_CHAR = 8;
  const PX_PER_LINE = 20;
  const HANDLE_SIZE = 8;

  function captureLayer(sandbox: any) {
    let capturedLayer: any;
    const RealLayer = sandbox.Konva.Layer;
    sandbox.Konva.Layer = class extends RealLayer {
      constructor(c: any) { super(c); capturedLayer = this; }
    };
    return () => capturedLayer;
  }

  function modelWithWindowField() {
    return {
      formats: [{
        name: `WIN1`, isWindow: true, windowReference: undefined,
        windowSize: { x: 20, y: 3, width: 40, height: 8 },
        keywords: [{ name: `WINDOW`, value: `3 20 8 40`, conditions: [] }],
        fields: [
          { name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 3, y: 2 }, keywords: [], conditions: [] },
        ],
      }],
    };
  }

  it(`renders the window's own group at its coded screen position, draggable`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithWindowField(), `dds.dspf`, false);
    const getLayer = captureLayer(sandbox);

    sandbox.setWindowForFormat(`WIN1`);

    const windowGroup = getLayer().findOne(`#WIN1::window`);
    expect(windowGroup).toBeDefined();
    expect(windowGroup.config.x).toBe(20 * PX_PER_CHAR);
    expect(windowGroup.config.y).toBe(3 * PX_PER_LINE);
    expect(windowGroup.config.draggable).toBe(true);
  });

  it(`renders a window's own field relative to the window - group position + field position equals the old absolute pixel position`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithWindowField(), `dds.dspf`, false);
    const getLayer = captureLayer(sandbox);

    sandbox.setWindowForFormat(`WIN1`);

    const windowGroup = getLayer().findOne(`#WIN1::window`);
    const fieldGroup = getLayer().findOne(`#WIN1::FLD1`);
    expect(fieldGroup).toBeDefined();

    // field.position = {x: 3, y: 2}, window at {x: 20, y: 3} - the pre-refactor
    // absolute pixel position was widthInP(3 - 1 + 19) / heightInP(2 - 1 + 2)
    // (offset {19, 2} = windowSize - 1), i.e. column 21, line 3.
    const absoluteX = windowGroup.config.x + fieldGroup.config.x;
    const absoluteY = windowGroup.config.y + fieldGroup.config.y;
    expect(absoluteX).toBe(21 * PX_PER_CHAR);
    expect(absoluteY).toBe(3 * PX_PER_LINE);
  });

  it(`isn't draggable and offers no resize handle in a read-only (displayOnly) render`, () => {
    const sandbox = loadWebui();
    const model = modelWithWindowField();
    sandbox.loadDDS(model, `dds.dspf`, false);
    const layer = new sandbox.Konva.Layer({});

    sandbox.renderSelectedFormat(layer, model.formats[0], true);

    const windowGroup = layer.findOne(`#WIN1::window`);
    expect(windowGroup.config.draggable).toBe(false);
    expect(windowGroup.findOne(`#windowResizeHandle`)).toBeUndefined();
  });

  it(`sends an updated WINDOW keyword with the new position after a move, keeping the current size`, () => {
    const sandbox = loadWebui();
    const model = modelWithWindowField();
    sandbox.loadDDS(model, `dds.dspf`, false);
    const layer = new sandbox.Konva.Layer({});
    sandbox.renderSelectedFormat(layer, model.formats[0], false);

    const windowGroup = layer.findOne(`#WIN1::window`);
    // Simulate a drag to a new position: column 25, line 5.
    windowGroup.x(25 * PX_PER_CHAR);
    windowGroup.y(5 * PX_PER_LINE);
    windowGroup.trigger(`dragend`);

    const sent = sandbox.postedMessages.find((m: any) => m.command === `updateFormat`);
    expect(sent.recordFormat).toBe(`WIN1`);
    const windowKeyword = sent.newKeywords.find((k: any) => k.name === `WINDOW`);
    expect(windowKeyword.value).toBe(`5 25 8 40`); // startY startX sizeY sizeX - size unchanged
  });

  it(`sends an updated WINDOW keyword with the new size after a resize, keeping the current position`, () => {
    const sandbox = loadWebui();
    const model = modelWithWindowField();
    sandbox.loadDDS(model, `dds.dspf`, false);
    const layer = new sandbox.Konva.Layer({});
    sandbox.renderSelectedFormat(layer, model.formats[0], false);

    const windowGroup = layer.findOne(`#WIN1::window`);
    const handle = windowGroup.findOne(`#windowResizeHandle`);
    expect(handle).toBeDefined();

    // Resize to 50 columns wide, 10 lines tall - inverting
    // createWindowResizeHandle's own dragend formulas.
    handle.x(50 * PX_PER_CHAR - HANDLE_SIZE);
    handle.y((10 - 1) * PX_PER_LINE - HANDLE_SIZE);
    handle.trigger(`dragend`);

    const sent = sandbox.postedMessages.find((m: any) => m.command === `updateFormat`);
    const windowKeyword = sent.newKeywords.find((k: any) => k.name === `WINDOW`);
    expect(windowKeyword.value).toBe(`3 20 10 50`); // position unchanged
  });

  it(`converts a *DFT/REF-style WINDOW keyword to the explicit form on the first drag`, () => {
    const sandbox = loadWebui();
    const model = modelWithWindowField();
    // Not yet explicit - mirrors a WINDOW(*DFT ...) or WINDOW(REF) window.
    model.formats[0].keywords = [{ name: `WINDOW`, value: `*DFT 8 40`, conditions: [] }];
    sandbox.loadDDS(model, `dds.dspf`, false);
    const layer = new sandbox.Konva.Layer({});
    sandbox.renderSelectedFormat(layer, model.formats[0], false);

    const windowGroup = layer.findOne(`#WIN1::window`);
    windowGroup.x(25 * PX_PER_CHAR);
    windowGroup.y(5 * PX_PER_LINE);
    windowGroup.trigger(`dragend`);

    const sent = sandbox.postedMessages.find((m: any) => m.command === `updateFormat`);
    const windowKeyword = sent.newKeywords.find((k: any) => k.name === `WINDOW`);
    expect(windowKeyword.value).toBe(`5 25 8 40`);
  });
});

describe(`initRenameFormatUi`, () => {
  function twoFormatModel() {
    return {
      formats: [
        { name: `FMT1`, keywords: [], fields: [] },
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
  }

  it(`pre-fills the rename field with the currently selected format's name`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(twoFormatModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    sandbox.initRenameFormatUi();

    sandbox.document.getElementById(`renameFormatButton`).trigger(`click`);

    expect(sandbox.document.getElementById(`renameFormatName`).value).toBe(`FMT1`);
  });

  it(`optimistically tracks the new name after a successful rename, and closes the form`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(twoFormatModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    sandbox.initRenameFormatUi();

    const button = sandbox.document.getElementById(`renameFormatButton`);
    const nameField = sandbox.document.getElementById(`renameFormatName`);
    const form = sandbox.document.getElementById(`renameFormatForm`);

    button.trigger(`click`);
    nameField.value = `renamed`; // lowercase, to also prove it gets uppercased
    nameField.trigger(`keydown`, { key: `Enter` });

    expect(form.style.display).toBe(`none`);

    // Re-opening should now pre-fill with the new (uppercased) name, proving
    // lastSelectedFormat was updated to track it.
    button.trigger(`click`);
    expect(nameField.value).toBe(`RENAMED`);
  });

  it(`rejects a name that's already used by another format, leaving the form open`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(twoFormatModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    sandbox.initRenameFormatUi();

    const button = sandbox.document.getElementById(`renameFormatButton`);
    const nameField = sandbox.document.getElementById(`renameFormatName`);
    const form = sandbox.document.getElementById(`renameFormatForm`);

    button.trigger(`click`);
    nameField.value = `FMT2`;
    nameField.trigger(`keydown`, { key: `Enter` });

    expect(form.style.display).not.toBe(`none`);
  });

  it(`does nothing in the Preview view`, () => {
    const sandbox = loadWebui(`preview`);
    sandbox.initRenameFormatUi();

    expect(() => sandbox.document.getElementById(`renameFormatButton`).trigger(`click`)).not.toThrow();
  });
});

describe(`drag-to-resize handle`, () => {
  function field(overrides: any = {}) {
    return {
      name: `FLD1`, type: `A`, length: 10, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 }, keywords: [], conditions: [],
      ...overrides,
    };
  }

  it(`is offered for a normal editable field`, () => {
    const sandbox = loadWebui();
    const group = sandbox.getElement(field(), false, `FMT1`);
    expect(group.findOne(`#resizeHandle`)).toBeDefined();
  });

  it(`is not offered for a constant - its width comes from its literal text`, () => {
    const sandbox = loadWebui();
    const constField = { name: undefined, displayType: `const`, value: `Hello`, position: { x: 1, y: 1 }, keywords: [], conditions: [] };
    const group = sandbox.getElement(constField, false, `FMT1`);
    expect(group.findOne(`#resizeHandle`)).toBeUndefined();
  });

  it(`is not offered for a date or time field - always fixed at 8 characters`, () => {
    const sandbox = loadWebui();
    const dateField = field({ name: `DATEFLD`, type: `L`, length: 8, keywords: [{ name: `DATE`, value: undefined, conditions: [] }] });
    const timeField = field({ name: `TIMEFLD`, type: `T`, length: 8, keywords: [{ name: `TIME`, value: undefined, conditions: [] }] });
    expect(sandbox.getElement(dateField, false, `FMT1`).findOne(`#resizeHandle`)).toBeUndefined();
    expect(sandbox.getElement(timeField, false, `FMT1`).findOne(`#resizeHandle`)).toBeUndefined();
  });

  it(`is not offered in a read-only (displayOnly) render`, () => {
    const sandbox = loadWebui();
    const group = sandbox.getElement(field(), true, `FMT1`);
    expect(group.findOne(`#resizeHandle`)).toBeUndefined();
  });

  // The harness's fake canvas measureText returns text.length * 8, so
  // measureCharWidth (50 chars / 50) always resolves to a deterministic
  // 8px-per-character grid here, regardless of real font metrics.
  const PX_PER_CHAR = 8;

  it(`snaps to the character grid and keeps a floor of 1 character while dragging`, () => {
    const sandbox = loadWebui();
    const group = sandbox.getElement(field({ length: 10 }), false, `FMT1`);
    const handle = group.findOne(`#resizeHandle`);

    // Dragged to somewhere between character boundaries, and past the left
    // edge entirely (a negative x) - should snap and floor, not go negative.
    handle.x(-999);
    handle.trigger(`dragmove`);
    expect(handle.x()).toBe(PX_PER_CHAR);
    expect(handle.y()).toBe(0);

    // The field's own background/label should resize live while dragging.
    const bg = group.findOne(`#bg`);
    const label = group.findOne(`#label`);
    expect(bg.width()).toBe(handle.x() + 6);
    expect(label.width()).toBe(handle.x() + 6);
  });

  it(`commits the new length and sends a field update on dragend`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [] }] }, `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const fieldInfo = field({ length: 10 });
    const group = sandbox.getElement(fieldInfo, false, `FMT1`);
    const handle = group.findOne(`#resizeHandle`);

    // 4 characters wide.
    handle.x(PX_PER_CHAR * 4);
    handle.trigger(`dragmove`);
    handle.trigger(`dragend`);

    expect(fieldInfo.length).toBe(4);
  });

  it(`shrinks the handle for a very narrow field, so some body remains grabbable to move it`, () => {
    const sandbox = loadWebui();
    const narrowField = field({ length: 1 });
    const group = sandbox.getElement(narrowField, false, `FMT1`);
    const handle = group.findOne(`#resizeHandle`);

    // A 1-char field is PX_PER_CHAR px wide - a fixed 6px handle would cover
    // almost the whole thing, leaving no body to grab for a move instead of
    // a resize. Capped at half the field's width instead.
    expect(handle.width()).toBe(4);
    expect(handle.x()).toBe(4); // leaves the left half of the field as body
  });

  it(`keeps the normal 6px handle for a field wide enough not to need shrinking`, () => {
    const sandbox = loadWebui();
    const group = sandbox.getElement(field({ length: 10 }), false, `FMT1`);
    const handle = group.findOne(`#resizeHandle`);
    expect(handle.width()).toBe(6);
  });
});
