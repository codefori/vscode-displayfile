const assert = require("assert");
const { DisplayFile } = require("../src/dspf");

const depts = require("./file/depts");
const replloadfm = require("./file/replloadfm");
const issue1149 = require(`./file/issue1149`);
const newcases = require(`./file/new_cases`);

exports.simple = () => {
  const file = new DisplayFile();
  file.parse(depts.lines);

  assert.strictEqual(file.formats.length, 4);

  // Testing: window size, keywords

  const globalFormat = file.formats[0];
  assert.strictEqual(globalFormat.name, `GLOBAL`);
  assert.deepStrictEqual(globalFormat.windowSize, {
    height: 24, width: 80, x: 0, y: 0
  });
  assert.strictEqual(globalFormat.keywords.length, 2);
  assert.deepStrictEqual(globalFormat.keywords[0], {
    name: `INDARA`, value: undefined, conditions: []
  });
  assert.deepStrictEqual(globalFormat.keywords[1], {
    name: `CA03`, value: `03`, conditions: []
  });

  // Field type tests:

  const subfileData = file.formats[1];
  assert.strictEqual(subfileData.name, `SFLDTA`);
  assert.deepStrictEqual(subfileData.keywords[0], {
    name: `SFL`, value: undefined, conditions: []
  });

  const rrnField = subfileData.fields[0];
  assert.strictEqual(rrnField.type, `decimal`);
  assert.strictEqual(rrnField.length, 4);
  assert.strictEqual(rrnField.decimals, 0);
  assert.strictEqual(rrnField.displayType, `hidden`);
  assert.strictEqual(rrnField.name, `RRN`);
  assert.deepStrictEqual(rrnField.position, {x: 0, y: 0});

  const xselField = subfileData.fields[1];
  assert.strictEqual(xselField.type, `char`);
  assert.strictEqual(xselField.length, 1);
  assert.strictEqual(xselField.decimals, 0);
  assert.strictEqual(xselField.displayType, `both`);
  assert.strictEqual(xselField.name, `XSEL`);
  assert.deepStrictEqual(xselField.position, {x: 8, y: 7});

  const xidField = subfileData.fields[2];
  assert.strictEqual(xidField.type, `char`);
  assert.strictEqual(xidField.length, 3);
  assert.strictEqual(xidField.decimals, 0);
  assert.strictEqual(xidField.displayType, `output`);
  assert.strictEqual(xidField.name, `XID`);
  assert.deepStrictEqual(xidField.position, {x: 12, y: 7});

  const xnameField = subfileData.fields[3];
  assert.strictEqual(xnameField.type, `char`);
  assert.strictEqual(xnameField.length, 38);
  assert.strictEqual(xnameField.decimals, 0);
  assert.strictEqual(xnameField.displayType, `output`);
  assert.strictEqual(xnameField.name, `XNAME`);
  assert.deepStrictEqual(xnameField.position, {x: 16, y: 7});

  // Const (text field) tests

  const subfileControl = file.formats[2];
  assert.strictEqual(subfileControl.fields.length, 4);
  assert.strictEqual(subfileControl.keywords.length, 7);

  const text1 = subfileControl.fields[1];
  assert.strictEqual(text1.name, `TEXT1`);
  assert.strictEqual(text1.displayType, `const`);
  assert.strictEqual(text1.value, `Opt`);
  assert.deepStrictEqual(text1.position, {x: 6, y: 6});
  assert.deepStrictEqual(text1.keywords, [
    { name: `DSPATR`, value: `HI`, conditions: [] },
    { name: `DSPATR`, value: `UL`, conditions: [] }
  ]);

  // Keywords on same line tests
  const footer = file.formats[3];
  assert.strictEqual(footer.fields.length, 3);
  assert.strictEqual(footer.keywords.length, 1);

  const sameLineField = footer.fields[2];
  assert.strictEqual(sameLineField.name, `TEXT6`);
  assert.strictEqual(sameLineField.displayType, `const`);
  assert.strictEqual(sameLineField.value, `5=View`);
  assert.deepStrictEqual(sameLineField.position, {x: 6, y: 4});
  assert.deepStrictEqual(sameLineField.keywords, [
    { name: `COLOR`, value: `BLU`, conditions: [] },
  ]);
}

exports.strings = () => {
  const file = new DisplayFile();
  file.parse(replloadfm.lines);

  assert.strictEqual(file.formats.length, 7);

  // Verify parsing keywords with strings in
  const snippetsFormat = file.formats[3];
  assert.strictEqual(snippetsFormat.name, `SNIPPETS`);

  const CF03 = snippetsFormat.keywords.find(keyword => keyword.name === `CF03`);
  assert.notStrictEqual(CF03, undefined);
  assert.strictEqual(CF03.value, `03 'Exit'`);

  // Verify strings over many lines

  const noRecordsFormat = file.formats[4];
  assert.strictEqual(noRecordsFormat.name, `NORECORDS`);
  const textField = noRecordsFormat.fields[0];
  assert.strictEqual(textField.name, `TEXT4`);
  assert.deepStrictEqual(textField.position, {x: 5, y: 4});
  assert.strictEqual(textField.value, `no snippets found for the current search criteria`);

  // Second verification, with space at the start

  const confirmWindowFormat = file.formats[6];
  assert.strictEqual(confirmWindowFormat.name, `CONFIRM`);
  const longTextField = confirmWindowFormat.fields[2];
  assert.strictEqual(longTextField.value, `F10=Confirm                             F12=Cancel`)
}

exports.window = () => {
  const file = new DisplayFile();
  file.parse(replloadfm.lines);

  const confirmWindowFormat = file.formats[6];
  assert.strictEqual(confirmWindowFormat.name, `CONFIRM`);
  assert.deepStrictEqual(confirmWindowFormat.windowSize, {
    height: 6, width: 54, x: 6, y: 6
  });
}

exports.issue1149 = () => {
  const file = new DisplayFile();
  file.parse(issue1149.lines);

  const windowFormat = file.formats[1];
  assert.strictEqual(windowFormat.name, `HELP`);
  assert.deepStrictEqual(windowFormat.windowSize, {
    height: 10, width: 70, x: 2, y: 10
  });

  const windowTitle = windowFormat.keywords.find(keyword => keyword.name === `WDWTITLE`);
  assert.strictEqual(windowTitle.value, `*TEXT 'Print accounts by store number for status type - Help' *COLOR WHT`);
}

exports.additional_cases = () => {
  const file = new DisplayFile();
  file.parse(newcases.lines);

  assert.strictEqual(file.formats.length, 2);

  const record = file.formats[1];
  assert.strictEqual(record.fields.length, 7);
  assert.strictEqual(record.name, `TEST_REC`);

  // Verify parsing character constants with brackets
  const fieldWithBrackets = record.fields[0];
  assert.strictEqual(fieldWithBrackets.displayType, `const`);
  assert.strictEqual(fieldWithBrackets.value, `some text (detail)`);
}
