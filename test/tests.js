const assert = require("assert");
const { DisplayFile } = require("../src/dspf");
const depts = require("./file/depts");

exports.testa = () => {
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