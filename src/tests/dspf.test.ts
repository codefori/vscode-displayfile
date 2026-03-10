import { expect, describe, it } from "vitest";
import { DdsLineRange, DisplayFile, FieldInfo } from "../ui/dspf";
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

    const cond = DSPATR?.conditions[0];
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

  it("should parse field with type and attach keywords", () => {
    const lines = [
      "     A            FIELD1        10A",
      "     A                                      TEXT('Customer Name')",
      "     A                                      COLHDG('Cust' 'Name')"
    ];

    const file = new DisplayFile();
    file.parse(lines);

    const record = file.formats[0];
    const field = record.fields[0];

    expect(record.fields.length).toBe(1);
    expect(field.name).toBe("FIELD1");
    expect(field.type).toBe("A");
    expect(field.length).toBe(10);
    expect(field.keywords.length).toBe(2);
    expect(field.keywords[0].name).toBe("TEXT");
    expect(field.keywords[0].value).toBe("'Customer Name'");
    expect(field.keywords[1].name).toBe("COLHDG");
    expect(field.keywords[1].value).toBe("'Cust' 'Name'");
  });

  it("should parse field without type (REFFLD) and attach keywords", () => {
    const lines = [
      "     A            FIELD2",
      "     A                                      REFFLD(ADRNO)",
      "     A                                      TEXT('Address Number')"
    ];

    const file = new DisplayFile();
    file.parse(lines);

    const record = file.formats[0];
    const field = record.fields[0];

    expect(record.fields.length).toBe(1);
    expect(field.name).toBe("FIELD2");
    expect(field.type).toBe("");
    expect(field.keywords.length).toBe(2);
    expect(field.keywords[0].name).toBe("REFFLD");
    expect(field.keywords[0].value).toBe("ADRNO");
    expect(field.keywords[1].name).toBe("TEXT");
    expect(field.keywords[1].value).toBe("'Address Number'");
  });
});
