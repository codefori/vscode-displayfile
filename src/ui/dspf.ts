
export interface DdsLineRange { start: number, endHeader?: number, end: number };
export interface DdsUpdate { newLines: string[], range?: DdsLineRange };

const GLOBAL_RECORD_NAME = `_GLOBAL`;

export class DisplayFile {
  public formats: RecordInfo[] = [];
  public currentField: FieldInfo | undefined;
  public currentFields: FieldInfo[] = [];
  public currentRecord: RecordInfo|undefined = new RecordInfo(GLOBAL_RECORD_NAME);

  constructor() { }

  /**
  * @param {string[]} lines 
  */
  parse(lines: string[]) {
    let textCounter = 0;

    let conditionals: string, name: string, len: string, type: string, dec: string, inout: string, x: string, y: string, keywords: string;

    lines.forEach((line, index) => {
      line = line.padEnd(80);

      if (line[6] === `*`) {
        return;
      }

      conditionals = line.substring(6, 16).padEnd(10);
      name = line.substring(18, 28).trim();
      len = line.substring(29, 34).trim();
      type = line[34].toUpperCase().trim();
      dec = line.substring(35, 37).trim();
      inout = line[37].toUpperCase();
      y = line.substring(38, 41).trim();
      x = line.substring(41, 44).trim();
      keywords = line.substring(44).trimEnd();

      switch (line[16]) {
        case 'R':
          if (this.currentField) {
            this.currentField.handleKeywords();
            this.currentFields.push(this.currentField);
          };
          if (this.currentRecord && this.currentFields) {
            this.currentRecord.fields = this.currentFields;
          }
          if (this.currentRecord) {
            this.currentRecord.range.end = index;
            this.currentRecord.handleKeywords();
            this.formats.push(this.currentRecord);
          }

          this.currentRecord = new RecordInfo(name);
          this.currentRecord.range.start = index;

          this.currentFields = [];
          this.currentField = undefined;

          this.HandleKeywords(keywords);
          break;

        case ' ':
          if ((x !== "" && y !== "") || inout === `H`) {
            // From a regular display file
            if (this.currentField) {
              this.currentField.handleKeywords();
              this.currentFields.push(this.currentField);
            }

            this.currentField = new FieldInfo(index);
            this.currentField.position = {
              x: Number(x),
              y: Number(y)
            };
          } else if (x !== "" && y === "") {
            // From a printer file with no Y position
            if (this.currentField) {
              this.currentField.handleKeywords();
              this.currentFields.push(this.currentField);
            }

            let totalX = Number(x);
            if (x.startsWith(`+`)) {
              totalX = this.currentFields[this.currentFields.length - 1].position.x + Number(x.substring(1));

              if (this.currentFields[this.currentFields.length - 1] && this.currentFields[this.currentFields.length - 1].value) {
                totalX += this.currentFields[this.currentFields.length - 1].value!.length;
              }
            }

            this.currentField = new FieldInfo(index);
            this.currentField.position = {
              x: totalX,
              y: 0
            };
          } else if (name!=="" && name !== undefined) { // start a new field if a field name exists
            // Some fields have no positions
            if (this.currentField) {
              this.currentField.handleKeywords();
              this.currentFields.push(this.currentField);
            }

            this.currentField = new FieldInfo(index, name);
            this.currentField.position = {
              x: -1,
              y: -1
            };
          }

          if (name !== "") {
            if (this.currentField) {
              this.currentField.name = name;
              this.currentField.value = "";
              this.currentField.length = Number(len);
              switch (inout) {
                case "I":
                  this.currentField.displayType = `input`;
                  break;
                case "B":
                  this.currentField.displayType = `both`;
                  break;
                case "H":
                  this.currentField.displayType = `hidden`;
                  break;
                case " ":
                case "O":
                  this.currentField.displayType = `output`;
                  break;
              }

              this.currentField.type = type;

              this.currentField.decimals = 0;
              switch (type) {
                case "D":
                case "Z":
                case "Y":
                  this.currentField.primitiveType = `decimal`;
                  if (dec !== "") { this.currentField.decimals = Number(dec); }
                  break;
                case `L`: //Date
                  this.currentField.length = 8;
                  this.currentField.primitiveType = `char`;
                  this.currentField.keywords.push({
                    name: `DATE`,
                    value: undefined,
                    conditions: []
                  });
                  break;
                case `T`: //Time
                  this.currentField.length = 8;
                  this.currentField.primitiveType = `char`;
                  this.currentField.keywords.push({
                    name: `TIME`,
                    value: undefined,
                    conditions: []
                  });
                  break;
                default:
                  this.currentField.primitiveType = `char`;
                  break;
              }

              this.currentField.conditions.push(
                ...DisplayFile.parseConditionals(conditionals)
              );
            }
            this.HandleKeywords(keywords, conditionals);
          }
          else {
            if (this.currentField) {
              if (!this.currentField.name) {
                textCounter++;
                this.currentField.name = `TEXT${textCounter}`;
                if (!this.currentField.value) {this.currentField.value = "";}
                this.currentField.length = this.currentField.value.length;
                this.currentField.displayType = `const`;

                this.currentField.conditions.push(
                  ...DisplayFile.parseConditionals(conditionals)
                );
              }
            }
            this.HandleKeywords(keywords, conditionals);
          }
          break;
      }
    });

    if (this.currentField) {
      this.currentField.handleKeywords();
      this.currentFields.push(this.currentField);
    };
    if (this.currentRecord) {
      if (this.currentFields) {
        this.currentRecord.fields = this.currentFields;
      }

      this.currentRecord.range.end = lines.length;
      this.currentRecord.handleKeywords();
      this.formats.push(this.currentRecord);
    }

    this.currentField = undefined;
    this.currentFields = [];
    this.currentRecord = undefined;
  }

  /**
  * @param {string} keywords 
  * @param {string} [conditionals]
  * @returns 
  */
  HandleKeywords(keywords: string, conditionals = ``) {
    let insertIndex;

    if (this.currentField) {
      insertIndex = this.currentField.keywordStrings.keywordLines.push(keywords);
      this.currentField.keywordStrings.conditionalLines[insertIndex] = conditionals;
    } else if (this.currentRecord) {
      insertIndex = this.currentRecord.keywordStrings.keywordLines.push(keywords);
      this.currentRecord.keywordStrings.conditionalLines[insertIndex] = conditionals;
    }


  }

  static parseConditionals(conditionColumns: string): Conditional[] {
    if (conditionColumns.trim() === "") {return [];}

    let conditionals: Conditional[] = [];

    //TODO: something with condition
    //const condition = conditionColumns.substring(0, 1); //A (and) or O (or)

    let current = "";
    let negate = false;
    let indicator = 0;

    let cIndex = 1;

    while (cIndex <= 7) {
      current = conditionColumns.substring(cIndex, cIndex + 3);

      if (current.trim() !== "") {
        negate = (conditionColumns.substring(cIndex, cIndex + 1) === "N");
        indicator = Number(conditionColumns.substring(cIndex + 1, cIndex + 3));

        conditionals.push({indicator, negate});
      }

      cIndex += 3;
    }

    return conditionals;
  }

  static parseKeywords(keywordStrings: string[], conditionalStrings?: { [line: number]: string }) {
    let result: { value: string, keywords: Keyword[], conditions: Conditional[] } = {
      value: ``,
      keywords: [],
      conditions: []
    };

    const newLineMark = `~`;

    let value = keywordStrings.join(newLineMark) + newLineMark;
    let conditionalLine = 1;

    if (value.length > 0) {
      value += ` `;

      let inBrackets = 0;
      let word = ``;
      let innerValue = ``;
      let inString = false;

      for (let i = 0; i < value.length; i++) {
        switch (value[i]) {
          case `+`:
          case `-`:
            if (value[i + 1] !== newLineMark) {
              innerValue += value[i];
            }
            break;

          case `'`:
            if (inBrackets > 0) {
              innerValue += value[i];
            } else {
              if (inString) {
                inString = false;

                result.value = innerValue;
                innerValue = ``;
              } else {
                inString = true;
              }
            }
            break;

          case `(`:
            if (inString) {
              innerValue += value[i];
            } else {
              inBrackets++;
            }
            break;
          case `)`:
            if (inString) {
              innerValue += value[i];
            } else {
              inBrackets--;
            }
            break;

          case newLineMark:
          case ` `:
            if (inBrackets > 0 || inString) {
              if (value[i] !== newLineMark) {
                innerValue += value[i];
              }
            } else {
              if (word.length > 0) {
                let conditionals = conditionalStrings ? conditionalStrings[conditionalLine] : undefined;

                result.keywords.push({
                  name: word.toUpperCase(),
                  value: innerValue.length > 0 ? innerValue : undefined,
                  conditions: conditionals ? DisplayFile.parseConditionals(conditionals) : []
                });

                word = ``;
                innerValue = ``;
              }
            }

            if (value[i] === newLineMark) { conditionalLine += 1; }
            break;
          default:
            if (inBrackets > 0 || inString) { innerValue += value[i]; }
            else { word += value[i]; }
            break;
        }
      }
    }

    return result;
  }

  private static conditionalGroups(conditions: Conditional[]) {
    return conditions.reduce((acc, curr, index) => {
      if (index % 3 === 0) {
        acc.push([curr]);
      } else {
        acc[acc.length - 1].push(curr);
      }
      return acc;
    }, [] as Conditional[][]);
  }

  public static getLinesForKeyword(keyword: Keyword): string[] {
    const lines: string[] = [];

    // Convert array into groups of three
    const condition = this.conditionalGroups(keyword.conditions);

    const firstConditions = condition[0] || [];
    const conditionStrings = firstConditions.map(c => `${c.negate ? 'N' : ' '}${c.indicator}`).join('').padEnd(9);

    lines.push(`     A ${conditionStrings}                            ${keyword.name}${keyword.value ? `(${keyword.value})` : ``}`);

    for (let g = 1; g < condition.length; g++) {
      const group = condition[g];
      const conditionStrings = group.map(c => `${c.negate ? 'N' : ' '}${c.indicator}`).join('');
      lines.push(`     A ${conditionStrings}`);
    }

    return lines;
  }

  public static getLinesForField(field: FieldInfo): string[] {
    const newLines: string[] = [];

    const FIELD_TYPE: { [name in DisplayType]: string } = {
      both: 'B',
      input: "I",
      output: "O",
      const: "",
      hidden: "H"
    };

    const x = String(field.position.x).padStart(3, ` `);
    const y = String(field.position.y).padStart(3, ` `);
    const displayType = FIELD_TYPE[field.displayType!];

    // Convert array into groups of three
    const condition = this.conditionalGroups(field.conditions);
    const firstConditions = condition[0] || [];
    const conditionStrings = firstConditions.map(c => `${c.negate ? 'N' : ' '}${c.indicator}`).join('').padEnd(9);

    if (field.displayType === `const`) {
      const value = field.value;
      newLines.push(
        `     A ${conditionStrings}                      ${y}${x}'${value}'`,
      );
    } else if (displayType && field.name) {
      const definitionType = field.type;
      const length = String(field.length).padStart(5);
      const decimals = (field.type !== `A` ? String(field.decimals) : ``).padStart(2);
      newLines.push(
        `     A ${conditionStrings}  ${field.name.padEnd(10)} ${length}${definitionType}${decimals}${displayType}${y}${x}`,
      );
    }

    for (const keyword of field.keywords) {
      newLines.push(...DisplayFile.getLinesForKeyword(keyword));
    }

    return newLines;
  }

  public getRangeForField(recordFormat: string, fieldName: string): DdsLineRange|undefined {
    let range: DdsLineRange|undefined = undefined;
    const currentFormatI = this.formats.findIndex(format => format.name === recordFormat);
    if (currentFormatI > 0) {
      const currentFormat = this.formats[currentFormatI];
      const index = currentFormat.fields.findIndex(field => field.name === fieldName);
      
      if (index >= 0) {
        // Update existing field
        const fieldStart = currentFormat.fields[index].startRange;
        let fieldEnd: number|undefined = undefined;

        if (currentFormat.fields[index+1]) {
          fieldEnd = currentFormat.fields[index+1].startRange;
        } else {
          fieldEnd = currentFormat.range.end;
        }

        if (fieldEnd) {
          fieldEnd--;

          range = { start: fieldStart, end: fieldEnd };
        }

      }
    }

    return range;
  }

  // TODO: test cases
  public updateField(recordFormat: string, originalFieldName: string|undefined, fieldInfo: FieldInfo): DdsUpdate|undefined {
    const newLines = DisplayFile.getLinesForField(fieldInfo);

    let range = this.getRangeForField(recordFormat, originalFieldName!);

    if (!range) {
      const recordFormatDetail = this.formats.find(format => format.name === recordFormat);
      if (recordFormatDetail) {
        range = { start: recordFormatDetail?.range.end, end: recordFormatDetail.range.end };
      }
    }

    return { newLines, range };
  }

  // TODO: test cases
  static getHeaderLinesForFormat(recordFormat: string, keywords: Keyword[]): string[] {
    const lines: string[] = [];

    if (recordFormat) {
      lines.push(`     A          R ${recordFormat}`);
    }

    for (const keyword of keywords) {
      // TODO: support conditions
      lines.push(...DisplayFile.getLinesForKeyword(keyword));
    }

    return lines;
  }

  public getHeaderRangeForFormat(recordFormat: string): DdsLineRange|undefined {
    let range: DdsLineRange|undefined = undefined;
    const currentFormatI = this.formats.findIndex(format => format.name === recordFormat);
    if (currentFormatI > 0) {
      range = { start: this.formats[currentFormatI].range.start, end: this.formats[currentFormatI].range.end };

      const currentFormat = this.formats[currentFormatI];
      const firstField = currentFormat.fields[0];

      if (firstField) {
        range.endHeader = firstField.startRange-1;
      } else {
        range.endHeader = range.start;
      }
    }

    return range;
  }

  // TODO: test cases
  public updateFormatHeader(originalFormatName: string, keywords: Keyword[]): DdsUpdate|undefined {
    const newLines = DisplayFile.getHeaderLinesForFormat(originalFormatName, keywords);
    let range = this.getHeaderRangeForFormat(originalFormatName);

    if (range) {
      range = {
        start: range.start,
        end: range.endHeader || range.end,
      };
    }

    return {
      newLines,
      range
    };
  }
}

export class RecordInfo {
  public fields: FieldInfo[] = [];
  public range: DdsLineRange = { start: -1, end: -1 };
  public isWindow: boolean = false;
  public windowReference: string | undefined = undefined;
  public windowSize: { y: number, x: number, width: number, height: number } = { y: 0, x: 0, width: 80, height: 24 };
  public keywordStrings: { keywordLines: string[], conditionalLines: { [lineIndex: number]: string } } = { keywordLines: [], conditionalLines: {} };
  public keywords: Keyword[] = [];

  constructor(public name: string) { }

  handleKeywords() {
    const data = DisplayFile.parseKeywords(this.keywordStrings.keywordLines, this.keywordStrings.conditionalLines);

    this.keywords.push(...data.keywords);

    this.keywords.forEach(keyword => {
      switch (keyword.name) {
        case "WINDOW":
          this.isWindow = true;
          if (keyword.value) {
            let points = keyword.value.split(' ');

            if (points.length >= 3 && points[0].toUpperCase() === `*DFT`) {
              // WINDOW (*DFT Y X)
              this.windowSize = {
                y: 2,
                x: 2,
                width: Number(points[2]),
                height: Number(points[1])
              };
            } else {
              if (points.length === 1) {
                // WINDOW (REF)
                this.windowReference = points[0];

              } else if (points.length >= 4) {
                // WINDOW (*DFT SY SX Y X)
                this.windowSize = {
                  y: Number(points[0]) || 2,
                  x: Number(points[1]) || 2,
                  width: Number(points[3]),
                  height: Number(points[2])
                };
              }
            }

            switch (points[0]) {
              case `*DFT`:
                break;
            }

            switch (points.length) {
              case 4:
                //WINDOW (STARTY STARTX SIZEY SIZEX)

                break;
              case 1:
                //WINDOW (REF)
                this.windowReference = points[0];
                break;
            }
          }

          break;
      }
    });
  }
}

export interface Keyword { name: string, value?: string, conditions: Conditional[] };

export type DisplayType = "input" | "output" | "both" | "const" | "hidden";

export class FieldInfo {
  public value: string | undefined;
  public type: string | undefined;
  public primitiveType: "char" | "decimal" | undefined;
  public displayType: DisplayType | undefined;
  public length: number = 0;
  public decimals: number = 0;
  public position: { x: number, y: number } = { x: 0, y: 0 };
  public keywordStrings: { keywordLines: string[], conditionalLines: { [lineIndex: number]: string } } = { keywordLines: [], conditionalLines: {} };
  public conditions: Conditional[] = [];
  public keywords: Keyword[] = [];

  constructor(public startRange: number, public name?: string) {}

  handleKeywords() {
    const data = DisplayFile.parseKeywords(this.keywordStrings.keywordLines, this.keywordStrings.conditionalLines);

    this.keywords.push(...data.keywords);

    if (data.value.length > 0) {
      this.value = data.value;
    }
  }
}

export interface Conditional {
  indicator: number,
  negate: boolean  
}