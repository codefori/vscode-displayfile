import { expect, describe, it } from "vitest";
import { DdsLineRange, DisplayFile, FieldInfo, GLOBAL_RECORD_NAME, planLineInsertion } from "../ui/dspf";
import exp from "constants";

describe('DisplayFile tests', () => {

  const dspf1: string[] = [
    `     A                                      DSPSIZ(24 80 *DS3)                  `,
    `     A          R HEAD                                                          `,
    `     A                                  1 32'vscode-displayfile'                `,
    `     A          R FMT1                                                          `,     
    `     A                                      SLNO(03)                            `,
    `     A                                  1  3'Opt'                               `,
    `     A                                      COLOR(BLU)                          `,
    `     A                                  1  8'Name'                              `,
    `     A                                      COLOR(BLU)                          `,
    `     A          R GLOBAL                                                        `,     
    `     A                                      SLNO(04)                            `,
    `     A                                  1  3'---'                               `,
    `     A          R FORM1                                                         `,     
    `     A                                      SLNO(06)                            `,
    `     A            FLD0101       10A  B  3  5                                    `,
    `     A  20                                  DSPATR(PR)                          `,
    `     A                                      COLOR(YLW)                          `,
    `     A            FLD0102       10   B  3  5                                    `,
  ];

  it('getRangeForFormat', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.getHeaderRangeForFormat(`DONOTEXIST`)).toBeUndefined();
    
    let range: DdsLineRange | undefined;

    range = dds.getHeaderRangeForFormat(`FMT1`);
    expect(range?.start).toBe(3);
    expect(range?.end).toBe(9);

    range = dds.getHeaderRangeForFormat(`HEAD`);
    expect(range?.start).toBe(1);
    expect(range?.end).toBe(3);
  });

  it('getRangeForField', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    let range: DdsLineRange | undefined;

    expect(dds.getRangeForField(`FORM1`, `UNKNOWN`)).toBeUndefined();

    range = dds.getRangeForField(`FORM1`, `FLD0101`);
    expect(range?.start).toBe(14);
    expect(range?.end).toBe(16);

    range = dds.getRangeForField(`FORM1`, `FLD0102`);
    expect(range?.start).toBe(17);
    expect(range?.end).toBe(17);
  });

  it('generates the same as what is provided', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const form1 = dds.formats.find(f => f.name === `FORM1`);
    expect(form1).toBeDefined();

    const FLD0101 = form1?.fields.find(f => f.name === `FLD0101`);
    expect(FLD0101).toBeDefined();
    expect(FLD0101?.keywords.length).toBe(2);

    const DSPATR = FLD0101?.keywords.find(k => k.name === `DSPATR`);
    expect(DSPATR).toBeDefined();
    expect(DSPATR?.value).toBe(`PR`);
    expect(DSPATR?.conditions.length).toBe(1);

    const cond = DSPATR?.conditions[0].indicators[0];
    expect(cond).toBeDefined();
    expect(cond?.indicator).toBe(20);
    expect(cond?.negate).toBeFalsy();

    const generatedKeywordLines = DisplayFile.getLinesForKeyword(DSPATR!);
    expect(generatedKeywordLines.length).toBe(1);
    expect(generatedKeywordLines[0]).toBe(dspf1[15].trimEnd());

    const generateFieldLines = DisplayFile.getLinesForField(FLD0101!);
    expect(generateFieldLines.length).toBe(3);

    expect(generateFieldLines[0]).toBe(dspf1[14].trimEnd());
    expect(generateFieldLines[1]).toBe(dspf1[15].trimEnd());
    expect(generateFieldLines[2]).toBe(dspf1[16].trimEnd());

    const generatedRecordFormatLines = DisplayFile.getHeaderLinesForFormat(form1!.name, form1!.keywords);
    expect(generatedRecordFormatLines.length).toBe(2);
    expect(generatedRecordFormatLines[0]).toBe(dspf1[12].trimEnd());
    expect(generatedRecordFormatLines[1]).toBe(dspf1[13].trimEnd());

  });

  it('getLinesForField', () => {
    let field = new FieldInfo(0);
    field.displayType = `const`;
    field.value = `Some text`;
    field.position.x = 10;
    field.position.y = 4;

    let lines = DisplayFile.getLinesForField(field);

    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(`     A                                  4 10'Some text'`);

    field.keywords.push(
      {
      name: "COLOR",
      value: "BLU",
      conditions: []
      },
      {
        name: "DSPATR",
        value: "PR",
        conditions: []
      }
    );

    lines = DisplayFile.getLinesForField(field);
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe(`     A                                  4 10'Some text'`);
    expect(lines[1]).toBe(`     A                                      COLOR(BLU)`);
    expect(lines[2]).toBe(`     A                                      DSPATR(PR)`);
  });

  it('No duplicate RecordInfo', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);
    let names = dds.formats.map(rcd => rcd.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('updateFormatHeader on the file-level (global) record', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    // The global record sits at index 0, which getRangeForField/
    // getHeaderRangeForFormat used to explicitly exclude (`> 0` guard).
    const range = dds.getHeaderRangeForFormat(GLOBAL_RECORD_NAME);
    expect(range?.start).toBe(0);
    expect(range?.end).toBe(1);
    expect(range?.endHeader).toBe(0);

    const update = dds.updateFormatHeader(GLOBAL_RECORD_NAME, [
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
      { name: `INDARA`, value: undefined, conditions: [] },
    ]);
    // No 'R _GLOBAL' line should ever be generated - it isn't a real record.
    expect(update?.newLines.some(l => l.includes(`R ${GLOBAL_RECORD_NAME}`))).toBe(false);
    expect(update?.range).toEqual({ start: 0, end: 0 });

    const newDoc = [...dspf1];
    newDoc.splice(update!.range!.start, (update!.range!.end - update!.range!.start) + 1, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    const global = reparsed.formats.find(f => f.name === GLOBAL_RECORD_NAME);
    expect(global?.keywords).toEqual([
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
      { name: `INDARA`, conditions: [] },
    ]);
    // Every other format should be completely undisturbed.
    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `FMT1`, `GLOBAL`, `FORM1`]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`vscode-displayfile`);
  });

  it('updateFormatHeader inserts when there are no existing file-level keywords', () => {
    const lines = [
      `     A          R HEAD                                                          `,
      `     A                                  1  1'Hi'                                `,
    ];

    let dds = new DisplayFile();
    dds.parse(lines);

    const range = dds.getHeaderRangeForFormat(GLOBAL_RECORD_NAME);
    expect(range?.start).toBe(0);
    expect(range?.endHeader).toBe(-1);

    const update = dds.updateFormatHeader(GLOBAL_RECORD_NAME, [
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
    ]);
    // end < start signals "insert before start", not "replace start..end" -
    // there's no existing file-level content to anchor a replace on.
    expect(update?.range).toEqual({ start: 0, end: -1 });

    const newDoc = [...lines];
    newDoc.splice(update!.range!.start, 0, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    expect(reparsed.formats.find(f => f.name === GLOBAL_RECORD_NAME)?.keywords).toEqual([
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
    ]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`Hi`);
  });

  it('updateFormatHeader on a record with no fields and no keywords', () => {
    const lines = [
      `     A          R EMPTYFMT                                                      `,
      `     A          R NEXTFMT                                                       `,
      `     A                                  1  1'x'                                 `,
    ];

    let dds = new DisplayFile();
    dds.parse(lines);

    const update = dds.updateFormatHeader(`EMPTYFMT`, [
      { name: `TEXT`, value: `'hi'`, conditions: [] },
    ]);
    expect(update?.range).toEqual({ start: 0, end: 0 });

    const newDoc = [...lines];
    newDoc.splice(update!.range!.start, (update!.range!.end - update!.range!.start) + 1, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    expect(reparsed.formats.find(f => f.name === `EMPTYFMT`)?.keywords).toEqual([
      { name: `TEXT`, value: `'hi'`, conditions: [] },
    ]);
    // NEXTFMT and its field must survive untouched.
    expect(reparsed.formats.find(f => f.name === `NEXTFMT`)?.fields[0].value).toBe(`x`);
  });

  it('addFormat appends a new empty record format at the end of the file', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const update = dds.addFormat(`NEWFMT`);
    expect(update.newLines).toEqual([`     A          R NEWFMT`]);
    // dspf1 has no trailing newline, so the insertion point is one past its last line.
    expect(update.range).toEqual({ start: dspf1.length, end: dspf1.length });

    const newDoc = [...dspf1];
    newDoc.splice(update.range!.start, 0, ...update.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `FMT1`, `GLOBAL`, `FORM1`, `NEWFMT`]);
    expect(reparsed.formats.find(f => f.name === `NEWFMT`)?.fields).toEqual([]);
    // Every earlier format should be completely undisturbed.
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

  it('addFormat appends after an existing empty file (only the global record)', () => {
    let dds = new DisplayFile();
    dds.parse([]);

    const update = dds.addFormat(`FIRSTFMT`);
    expect(update.range).toEqual({ start: 0, end: 0 });

    const reparsed = new DisplayFile();
    reparsed.parse(update.newLines);
    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `FIRSTFMT`]);
  });

  it('getRangeForFormat spans a whole record, from its R line through its last content line', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.getRangeForFormat(`DONOTEXIST`)).toBeUndefined();
    // The file-level/global record has no R line of its own - it can't be deleted this way.
    expect(dds.getRangeForFormat(GLOBAL_RECORD_NAME)).toBeUndefined();

    expect(dds.getRangeForFormat(`FMT1`)).toEqual({ start: 3, end: 8 });
    // Last format in the file - its range runs to the file's last line.
    expect(dds.getRangeForFormat(`FORM1`)).toEqual({ start: 12, end: 17 });
  });

  it('deleting a format via getRangeForFormat removes exactly that record and leaves the rest intact', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const range = dds.getRangeForFormat(`FMT1`)!;
    const newDoc = [...dspf1];
    newDoc.splice(range.start, (range.end - range.start) + 1);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `GLOBAL`, `FORM1`]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`vscode-displayfile`);
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

  it('renameFormat regenerates only the R line, leaving fields/keywords below it untouched', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.renameFormat(`DONOTEXIST`, `WHATEVER`)).toBeUndefined();
    // The file-level/global record has no R line of its own - it can't be renamed this way.
    expect(dds.renameFormat(GLOBAL_RECORD_NAME, `WHATEVER`)).toBeUndefined();

    const update = dds.renameFormat(`FMT1`, `RENAMED`)!;
    expect(update.newLines).toEqual([`     A          R RENAMED`]);
    expect(update.range).toEqual({ start: 3, end: 3 });

    const newDoc = [...dspf1];
    newDoc.splice(update.range!.start, 1, ...update.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `RENAMED`, `GLOBAL`, `FORM1`]);
    // Its own keywords/fields (and everything after it) must survive untouched.
    const renamed = reparsed.formats.find(f => f.name === `RENAMED`)!;
    expect(renamed.keywords).toEqual([{ name: `SLNO`, value: `03`, conditions: [] }]);
    expect(renamed.fields.map(f => f.value)).toEqual([`Opt`, `Name`]);
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

});

/**
 * Builds a single DDS source line at the exact column positions
 * DisplayFile.parse() reads (verified byte-for-byte against the real
 * fixture lines above): conditionals 6-16, record indicator at 16,
 * name 18-28, len 29-34, type at 34, decimals 35-37, usage at 37, line
 * (Y) 38-41, position (X) 41-44, keywords/literal from 44 on.
 */
function ddsLine(opts: {
  recordIndicator?: string, cond?: string, name?: string, len?: string, type?: string,
  dec?: string, inout?: string, y?: string, x?: string, keywords?: string,
}): string {
  const { recordIndicator = ` `, cond = ``, name = ``, len = ``, type = ``, dec = ``, inout = ` `, y = ``, x = ``, keywords = `` } = opts;
  const chars: string[] = [];
  const put = (start: number, str: string) => { for (let i = 0; i < str.length; i++) { chars[start + i] = str[i]; } };

  put(0, `     A`);
  put(6, cond.padEnd(10));
  chars[16] = recordIndicator;
  put(18, name.padEnd(10));
  put(29, len.padStart(5));
  chars[34] = type;
  put(35, dec.padStart(2));
  chars[37] = inout;
  put(38, y.padStart(3));
  put(41, x.padStart(3));
  put(44, keywords);

  let line = ``;
  for (let i = 0; i < Math.max(chars.length, 80); i++) { line += chars[i] || ` `; }
  return line;
}

describe(`printer file line layout (assignPrinterLines)`, () => {
  const record = (name: string) => ddsLine({ recordIndicator: `R`, name });
  const field = (name: string, x: string, y = ``) =>
    ddsLine({ name, type: `A`, len: `5`, inout: `O`, x, y });
  const keyword = (value: string) => ddsLine({ keywords: value });

  it(`a blank-Y field with no spacing keyword continues on the current line`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F1`, `10`), // no Y, no keywords -> line 1
      field(`F2`, `20`), // no Y, no keywords -> stays on line 1
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const fields = dds.formats.find(f => f.name === `DETAIL`)!.fields;
    expect(fields.map(f => f.position.y)).toEqual([1, 1]);
  });

  it(`SPACEB advances the cursor before printing, SKIPB jumps to an absolute line`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F1`, `10`), // line 1
      field(`F3`, `5`), keyword(`SPACEB(2)`), // 1 + 2 = 3
      field(`F4`, `5`), keyword(`SKIPB(10)`), // absolute 10
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const fields = dds.formats.find(f => f.name === `DETAIL`)!.fields;
    expect(fields.map(f => f.position.y)).toEqual([1, 3, 10]);
  });

  it(`SPACEA/SKIPA adjust the cursor after printing, so the *next* blank-Y field moves`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F4`, `5`), keyword(`SKIPB(10)`), // absolute 10
      field(`F5`, `5`), keyword(`SPACEA(1)`), // stays on 10, then cursor -> 11
      field(`F6`, `5`), // 11
      field(`F8`, `5`), keyword(`SKIPA(99)`), // stays on 11, then cursor -> 99
      field(`F9`, `5`), // 99
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const fields = dds.formats.find(f => f.name === `DETAIL`)!.fields;
    expect(fields.map(f => f.position.y)).toEqual([10, 10, 11, 11, 99]);
  });

  it(`an explicit-Y field resyncs the cursor for later blank-Y fields`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F1`, `10`), // 1
      field(`F7`, `5`, `50`), // explicit Y=50
      field(`F8`, `5`), // continues at 50
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const fields = dds.formats.find(f => f.name === `DETAIL`)!.fields;
    expect(fields.map(f => f.position.y)).toEqual([1, 50, 50]);
  });

  it(`the cursor resets to line 1 at the start of the next record format`, () => {
    const lines = [
      record(`DETAIL1`),
      field(`F1`, `5`), keyword(`SKIPB(40)`), // 40
      record(`DETAIL2`),
      field(`F2`, `5`), // resets to 1, not 40
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    expect(dds.formats.find(f => f.name === `DETAIL1`)!.fields[0].position.y).toBe(40);
    expect(dds.formats.find(f => f.name === `DETAIL2`)!.fields[0].position.y).toBe(1);
  });

  it(`SKIPB wins over a simultaneous (technically illegal) SPACEB on the same field`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F1`, `5`), keyword(`SKIPB(7)`), keyword(`SPACEB(2)`),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    expect(dds.formats.find(f => f.name === `DETAIL`)!.fields[0].position.y).toBe(7);
  });

  it(`a non-numeric spacing argument (a field reference) is ignored rather than guessed`, () => {
    const lines = [
      record(`DETAIL`),
      field(`F1`, `5`), keyword(`SPACEB(VARFLD)`),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    // Unresolvable at design time - cursor left unchanged, so the field
    // just behaves as if it had no spacing keyword at all.
    expect(dds.formats.find(f => f.name === `DETAIL`)!.fields[0].position.y).toBe(1);
  });

  it(`a record-level SPACEB/SKIPB seeds the cursor before the first field`, () => {
    const spacedLines = [
      record(`DETAIL`),
      keyword(`SPACEB(5)`),
      field(`F1`, `5`),
    ];
    const spaced = new DisplayFile();
    spaced.parse(spacedLines);
    expect(spaced.formats.find(f => f.name === `DETAIL`)!.fields[0].position.y).toBe(6);

    const skippedLines = [
      record(`DETAIL`),
      keyword(`SKIPB(20)`),
      field(`F1`, `5`),
    ];
    const skipped = new DisplayFile();
    skipped.parse(skippedLines);
    expect(skipped.formats.find(f => f.name === `DETAIL`)!.fields[0].position.y).toBe(20);
  });
});

describe(`planLineInsertion - new content always starts on its own line`, () => {
  it(`inserts at the given line when it's still within the document`, () => {
    const plan = planLineInsertion(10, true, false, 5, [`     A            NEWFLD1       10A  I  1  1`]);
    expect(plan.useAtLine).toBe(true);
    expect(plan.text).toBe(`     A            NEWFLD1       10A  I  1  1\n`);
  });

  it(`falls back to appending at the document's end when the target line is at or past the document's real end`, () => {
    const plan = planLineInsertion(10, true, false, 10, [`     A          R NEWFMT`]);
    expect(plan.useAtLine).toBe(false);
  });

  it(`appends at the document's end even when the target line is somehow past the document's end`, () => {
    // dspf.ts's own line math (content.split(/\r?\n/).length) can land past
    // a live document's real lineCount - this must still land safely at the
    // true end, not just when the two happen to match exactly.
    const plan = planLineInsertion(10, true, false, 999, [`     A          R NEWFMT`]);
    expect(plan.useAtLine).toBe(false);
  });

  it(`prepends a newline when appending to a document that doesn't already end with one - the actual bug this exists to prevent`, () => {
    // Without this, a plain insert at the end of "...LASTLINE" (no trailing
    // \n) glues the new content onto LASTLINE instead of starting fresh.
    const plan = planLineInsertion(5, false, false, 5, [`     A            NEWFLD1       10A  I  1  1`]);
    expect(plan.useAtLine).toBe(false);
    expect(plan.text).toBe(`\n     A            NEWFLD1       10A  I  1  1\n`);
  });

  it(`doesn't prepend a newline when the document already ends with one`, () => {
    const plan = planLineInsertion(5, true, false, 5, [`     A            NEWFLD1       10A  I  1  1`]);
    expect(plan.text).toBe(`     A            NEWFLD1       10A  I  1  1\n`);
  });

  it(`doesn't prepend a newline for a brand-new empty document, even though it doesn't end with one`, () => {
    const plan = planLineInsertion(0, false, true, 0, [`     A          R FIRSTFMT`]);
    expect(plan.text).toBe(`     A          R FIRSTFMT\n`);
  });

  it(`joins multiple new lines with exactly one trailing newline, not one per line plus an extra`, () => {
    const plan = planLineInsertion(5, true, false, 5, [`     A            FLD1          10A  I  1  1`, `     A                                      COLOR(BLU)`]);
    expect(plan.text).toBe(`     A            FLD1          10A  I  1  1\n     A                                      COLOR(BLU)\n`);
  });
});

/** Builds a 10-char conditioning-indicator columns string (1 relator + up to 3 "[N]nn" slots). */
function condCols(relator: `A` | `O` | ` `, indicators: { num: number, negate?: boolean }[]): string {
  let s = relator;
  for (let i = 0; i < 3; i++) {
    const ind = indicators[i];
    s += ind ? `${ind.negate ? `N` : ` `}${String(ind.num).padStart(2, `0`)}` : `   `;
  }
  return s;
}

describe(`conditioning indicators (AND/OR groups)`, () => {
  it(`parses a single line's 1-3 indicators (no relator) as one AND-group - the pre-existing common case`, () => {
    const lines = [
      ddsLine({ recordIndicator: `R`, name: `FMT1` }),
      ddsLine({ name: `FLD1`, type: `A`, len: `5`, inout: `O`, x: `1`, y: `1` }),
      ddsLine({ cond: condCols(` `, [{ num: 20 }]), keywords: `DSPATR(HI)` }),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const field = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    expect(field.keywords[0].conditions).toEqual([{ indicators: [{ indicator: 20, negate: false }] }]);
  });

  it(`a field's own conditioning is always a single line (up to 3 indicators) - unlike a keyword, it has no continuation`, () => {
    // A conditioning-only line right after a field's definition line is
    // structurally indistinguishable from a leading continuation for the
    // field's first keyword (both sit in the exact same place), so DDS
    // resolves it by convention: it always belongs to the upcoming keyword,
    // never the field itself.
    const lines = [
      ddsLine({ recordIndicator: `R`, name: `FMT1` }),
      ddsLine({ cond: condCols(` `, [{ num: 5 }, { num: 6 }]), name: `FLD1`, type: `A`, len: `5`, inout: `O`, x: `1`, y: `1` }),
      ddsLine({ cond: condCols(`O`, [{ num: 7 }]) }), // NOT a field-condition continuation
      ddsLine({ keywords: `COLOR(BLU)` }),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const field = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    expect(field.conditions).toEqual([{ indicators: [{ indicator: 5, negate: false }, { indicator: 6, negate: false }] }]);
    expect(field.keywords[0].conditions).toEqual([{ indicators: [{ indicator: 7, negate: false }] }]);
  });

  it(`treats a conditioning-only line as belonging to the NEXT keyword once the field already has one, not the field itself`, () => {
    const lines = [
      ddsLine({ recordIndicator: `R`, name: `FMT1` }),
      ddsLine({ name: `FLD1`, type: `A`, len: `5`, inout: `O`, x: `1`, y: `1` }),
      ddsLine({ keywords: `COLOR(BLU)` }),
      ddsLine({ cond: condCols(`O`, [{ num: 9 }]) }), // leading continuation for the NEXT keyword
      ddsLine({ keywords: `DSPATR(HI)` }),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const field = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    expect(field.conditions).toEqual([]); // untouched by the later conditioning-only line
    expect(field.keywords[0].conditions).toEqual([]); // COLOR
    expect(field.keywords[1].conditions).toEqual([{ indicators: [{ indicator: 9, negate: false }] }]); // DSPATR
  });

  it(`folds multiple indicator-only lines (>3 indicators via a continuation within the same AND-group) into one keyword`, () => {
    const lines = [
      ddsLine({ recordIndicator: `R`, name: `FMT1` }),
      ddsLine({ name: `FLD1`, type: `A`, len: `5`, inout: `O`, x: `1`, y: `1` }),
      ddsLine({ keywords: `COLOR(BLU)` }),
      ddsLine({ cond: condCols(` `, [{ num: 10 }, { num: 11 }, { num: 12 }]) }),
      ddsLine({ cond: condCols(` `, [{ num: 13 }]) }), // blank relator - still the same AND-group, not a new OR'd one
      ddsLine({ keywords: `DSPATR(HI)` }),
    ];

    const dds = new DisplayFile();
    dds.parse(lines);

    const field = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    expect(field.keywords[1].conditions).toEqual([
      { indicators: [
        { indicator: 10, negate: false }, { indicator: 11, negate: false },
        { indicator: 12, negate: false }, { indicator: 13, negate: false },
      ] },
    ]);
  });

  it(`round-trips a field's own single-group condition`, () => {
    const field = new FieldInfo(0, `FLD1`);
    field.type = `A`;
    field.length = 5;
    field.decimals = 0;
    field.displayType = `output`;
    field.position = { x: 1, y: 1 };
    field.conditions = [
      { indicators: [{ indicator: 1, negate: false }, { indicator: 2, negate: false }, { indicator: 3, negate: true }] },
    ];

    const lines = DisplayFile.getLinesForField(field);

    const dds = new DisplayFile();
    dds.parse([`     A          R FMT1`, ...lines]);

    const reparsed = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    expect(reparsed.conditions).toEqual(field.conditions);
  });

  it(`wraps a keyword too long for column 80 onto continuation lines, and round-trips it`, () => {
    const keyword = {
      name: `WDWTITLE`,
      // Comfortably past column 80 on one line, and with a quoted literal
      // that the split has to fall inside of.
      value: `*TEXT 'Please confirm that you really want to delete this record' *COLOR WHT *TOP *CENTER`,
      conditions: [],
    };

    const lines = DisplayFile.getLinesForKeyword(keyword);

    expect(lines.length).toBeGreaterThan(1);
    lines.forEach(line => expect(line.length).toBeLessThanOrEqual(80));
    // Every line but the last is continued with a trailing '-', and every
    // continuation resumes at column 45 (0-indexed 44).
    lines.slice(0, -1).forEach(line => expect(line.endsWith(`-`)).toBe(true));
    lines.slice(1).forEach(line => expect(line.substring(0, 44).trim()).toBe(`A`));

    const dds = new DisplayFile();
    dds.parse([
      `     A          R FMT1`,
      `     A            FLD1           5A  O  1  1`,
      ...lines,
    ]);

    const reparsed = dds.formats.find(f => f.name === `FMT1`)!.fields[0].keywords;
    expect(reparsed.filter(k => k.name === `WDWTITLE`)).toHaveLength(1);
    expect(reparsed.find(k => k.name === `WDWTITLE`)?.value).toBe(keyword.value);
  });

  it(`keeps a wrapped keyword's conditioning indicators`, () => {
    const keyword = {
      name: `WDWTITLE`,
      value: `*TEXT 'Please confirm that you really want to delete this record' *COLOR WHT`,
      conditions: [{ indicators: [{ indicator: 30, negate: false }, { indicator: 31, negate: true }] }],
    };

    const lines = DisplayFile.getLinesForKeyword(keyword);

    const dds = new DisplayFile();
    dds.parse([
      `     A          R FMT1`,
      `     A            FLD1           5A  O  1  1`,
      ...lines,
    ]);

    const reparsed = dds.formats.find(f => f.name === `FMT1`)!.fields[0].keywords.find(k => k.name === `WDWTITLE`);
    expect(reparsed?.value).toBe(keyword.value);
    expect(reparsed?.conditions).toEqual(keyword.conditions);
  });

  it(`leaves a keyword that already fits on one line alone`, () => {
    const lines = DisplayFile.getLinesForKeyword({ name: `DSPATR`, value: `HI`, conditions: [] });

    expect(lines).toEqual([`     A                                      DSPATR(HI)`]);
  });

  it(`round-trips a multi-group (AND then OR) keyword condition`, () => {
    const keyword = {
      name: `DSPATR`,
      value: `HI`,
      conditions: [
        { indicators: [{ indicator: 10, negate: false }, { indicator: 11, negate: true }] },
        { indicators: [{ indicator: 12, negate: false }] },
      ],
    };

    const lines = DisplayFile.getLinesForKeyword(keyword);

    const dds = new DisplayFile();
    dds.parse([
      `     A          R FMT1`,
      `     A            FLD1           5A  O  1  1`,
      ...lines,
    ]);

    const reparsedField = dds.formats.find(f => f.name === `FMT1`)!.fields[0];
    const reparsedKeyword = reparsedField.keywords.find(k => k.name === `DSPATR`);
    expect(reparsedKeyword?.conditions).toEqual(keyword.conditions);
    expect(reparsedKeyword?.value).toBe(`HI`);
  });
});
