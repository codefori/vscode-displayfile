
export interface DdsLineRange { start: number, endHeader?: number, end: number };
export interface DdsUpdate { newLines: string[], range?: DdsLineRange };

export const GLOBAL_RECORD_NAME = `_GLOBAL`;

export interface LineInsertion { text: string; useAtLine: boolean; }

/**
 * Decides how to insert freshly generated DDS lines into a document.
 * `atLine` comes from this module's own line-based math (e.g.
 * `RecordInfo.range.end` when appending after everything else in a record
 * or file) - it's derived from a plain `content.split(/\r?\n/).length`,
 * which doesn't always match a live editor document's own line count.
 * Inserting directly at that line number when it's at or past the
 * document's real end can silently land past the last line and glue the
 * new content onto it instead of starting a fresh one, so callers should
 * fall back to appending at the document's true end (`useAtLine: false`,
 * text already includes a leading newline if the document doesn't already
 * end with one) whenever `atLine` reaches `documentLineCount`.
 */
export function planLineInsertion(
  documentLineCount: number,
  documentEndsWithNewline: boolean,
  documentIsEmpty: boolean,
  atLine: number,
  lines: string[]
): LineInsertion {
  const body = lines.join('\n') + '\n';

  if (atLine < documentLineCount) {
    return { text: body, useAtLine: true };
  }

  const needsLeadingNewline = !documentIsEmpty && !documentEndsWithNewline;
  return { text: (needsLeadingNewline ? '\n' : '') + body, useAtLine: false };
}

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

    // The initial (file-level/global) record never gets a range.start from
    // an 'R' line the way every other record does - its content starts at
    // the very top of the file.
    if (this.currentRecord) {
      this.currentRecord.range.start = 0;
    }

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
          if (this.currentRecord) {
            this.currentRecord.handleKeywords();
          }
          if (this.currentRecord && this.currentFields) {
            DisplayFile.assignPrinterLines(this.currentFields, this.currentRecord.keywords);
            this.currentRecord.fields = this.currentFields;
          }
          if (this.currentRecord) {
            this.currentRecord.range.end = index;
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
            this.currentField.needsPrinterLine = true;
            this.currentField.position = {
              x: totalX,
              y: 0
            };
          } else if (name !== undefined && type !== "") {
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

              DisplayFile.appendConditionLine(this.currentField.conditions, conditionals);
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

                DisplayFile.appendConditionLine(this.currentField.conditions, conditionals);
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
      this.currentRecord.handleKeywords();

      if (this.currentFields) {
        DisplayFile.assignPrinterLines(this.currentFields, this.currentRecord.keywords);
        this.currentRecord.fields = this.currentFields;
      }

      this.currentRecord.range.end = lines.length;
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

  /**
   * Computes the printed line for every field flagged `needsPrinterLine`
   * (a printer-file field with no Y coded) by walking them in order with a
   * running "print cursor", the same way a real printer file lays them out:
   * a field with no SPACEB/SKIPB continues on the current line, SPACEB(n)
   * spaces the cursor forward n lines first, SKIPB(n) jumps the cursor
   * straight to line n, and SPACEA(n)/SKIPA(n) do the equivalent *after*
   * printing, so they affect where the next blank-Y field lands. An
   * explicit Y (DSPF-shaped, or a PRTF field that did code a line) resyncs
   * the cursor. `recordKeywords` seeds the cursor from the record's own
   * SPACEB/SKIPB, since that's coded on the format, not any one field.
   *
   * A SPACEB/SKIPB/SPACEA/SKIPA value that isn't a literal number (a
   * reference to a runtime field) can't be resolved here, so it's treated
   * as absent rather than guessed.
   */
  static assignPrinterLines(fields: FieldInfo[], recordKeywords: Keyword[] = []): void {
    const numericValue = (keywords: Keyword[], name: string): number | undefined => {
      const value = keywords.find(k => k.name === name)?.value;
      if (value === undefined) { return undefined; }
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    };

    let currentLine = 1;

    const recordSkipB = numericValue(recordKeywords, `SKIPB`);
    const recordSpaceB = numericValue(recordKeywords, `SPACEB`);
    if (recordSkipB !== undefined) {
      currentLine = recordSkipB;
    } else if (recordSpaceB !== undefined) {
      currentLine += recordSpaceB;
    }

    for (const field of fields) {
      if (field.needsPrinterLine) {
        const skipB = numericValue(field.keywords, `SKIPB`);
        const spaceB = numericValue(field.keywords, `SPACEB`);
        if (skipB !== undefined) {
          currentLine = skipB;
        } else if (spaceB !== undefined) {
          currentLine += spaceB;
        }

        field.position.y = currentLine;
      } else if (field.position.y > 0) {
        currentLine = field.position.y;
      }

      const skipA = numericValue(field.keywords, `SKIPA`);
      const spaceA = numericValue(field.keywords, `SPACEA`);
      if (skipA !== undefined) {
        currentLine = skipA;
      } else if (spaceA !== undefined) {
        currentLine += spaceA;
      }
    }
  }

  static parseConditionals(conditionColumns: string): Conditional[] {
    if (conditionColumns.trim() === "") {return [];}

    let conditionals: Conditional[] = [];

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

  /**
   * Column 1 of the conditioning-indicator columns is the AND/OR relator
   * between this line's indicator group and whatever group came before it
   * (blank/'A' continues the current AND-group, 'O' starts a new OR'd
   * group) - real DDS, up to 9 indicators per field/keyword via up to 3
   * physical lines of up to 3 indicators each.
   */
  static parseConditionalLine(conditionColumns: string): { relator: `A` | `O`, indicators: Conditional[] } {
    return {
      relator: conditionColumns[0] === `O` ? `O` : `A`,
      indicators: DisplayFile.parseConditionals(conditionColumns),
    };
  }

  /**
   * Folds one physical line's conditioning columns into an in-progress
   * ConditionGroup[] - a fresh group on 'O' (or if there's no group yet,
   * since a leading 'O' is illegal DDS and is treated as blank), otherwise
   * extended onto the current (AND'd) group. A line with no indicators at
   * all contributes nothing (covers blank continuation lines cleanly).
   */
  static appendConditionLine(groups: ConditionGroup[], conditionColumns: string): void {
    const { relator, indicators } = DisplayFile.parseConditionalLine(conditionColumns);
    if (indicators.length === 0) { return; }

    if (relator === `O` || groups.length === 0) {
      groups.push({ indicators });
    } else {
      groups[groups.length - 1].indicators.push(...indicators);
    }
  }

  /** Line breaks are threaded through the keyword scanner as characters,
   * so they have to be ones that can never turn up in real DDS source -
   * a printable marker (a '~' in a constant, say) would be swallowed as a
   * line break and shift every conditioning line after it. */
  private static readonly NEW_LINE_MARK = `\u0000`;
  private static readonly CONTINUED_MARK = `\u0001`;

  /**
   * Joins one field's (or record's) functions-area lines into the single
   * string parseKeywords scans, resolving DDS continuations as it goes.
   *
   * A `+` or `-` as the last character of the functions area continues the
   * entry on the next line rather than ending it:
   *
   *   `-`  resumes at position 45 exactly, blanks included - so the split
   *        can fall anywhere at all, mid-word or inside a quoted literal,
   *        and the two halves rejoin exactly as written.
   *   `+`  resumes at the next line's first NON-blank character, which is
   *        how a multi-value keyword is usually coded (the continuation is
   *        indented to line up under the value above it).
   *
   * Either way the entry runs straight on across the break, so the break is
   * emitted as CONTINUED_MARK - the scanner keeps building the same word or
   * literal through it, where a NEW_LINE_MARK would have ended it. A
   * trailing `+`/`-` on the very last line has nothing to continue onto, so
   * it's ordinary text.
   */
  static joinKeywordLines(keywordStrings: string[]): string {
    let joined = ``;
    let resumeAtFirstNonBlank = false;

    keywordStrings.forEach((keywordString, index) => {
      let text = keywordString.replace(/\s+$/, ``);
      if (resumeAtFirstNonBlank) { text = text.replace(/^\s+/, ``); }

      const lastCharacter = text[text.length - 1];
      const isContinued = index < keywordStrings.length - 1 && (lastCharacter === `+` || lastCharacter === `-`);

      joined += isContinued
        ? text.substring(0, text.length - 1) + DisplayFile.CONTINUED_MARK
        : text + DisplayFile.NEW_LINE_MARK;

      resumeAtFirstNonBlank = isContinued && lastCharacter === `+`;
    });

    return joined;
  }

  /**
   * @param firstConditionalLine The first conditioningStrings line a
   *   keyword is allowed to claim - for a FIELD's keywords this is 2, since
   *   line 1 is always the field's own definition line and its conditioning
   *   columns belong to the field itself (see FieldInfo.handleKeywords),
   *   never to a keyword. A record has no such reserved line, so its
   *   keywords (see RecordInfo.handleKeywords) start at 1.
   */
  static parseKeywords(keywordStrings: string[], conditionalStrings?: { [line: number]: string }, firstConditionalLine: number = 1) {
    let result: { value: string, keywords: Keyword[], conditions: Conditional[] } = {
      value: ``,
      keywords: [],
      conditions: []
    };

    const newLineMark = DisplayFile.NEW_LINE_MARK;
    const continuedMark = DisplayFile.CONTINUED_MARK;

    let value = DisplayFile.joinKeywordLines(keywordStrings);
    let conditionalLine = 1;

    if (value.length > 0) {
      value += ` `;

      let inBrackets = 0;
      let word = ``;
      let innerValue = ``;
      let inString = false;

      // A keyword's conditioning can span multiple physical lines - unlike
      // a field's own conditioning (coded after its definition line), a
      // keyword's indicator-only continuation lines come BEFORE the line
      // that finally carries its name/value, so they're accumulated here
      // and attached whenever a keyword name completes. Not reset on every
      // keyword - several short keywords coded on the very same physical
      // line all share that one line's conditioning columns, matching real
      // DDS (only reset when a newline is actually crossed).
      let pendingConditions: ConditionGroup[] = [];
      let lastFoldedLine = firstConditionalLine - 1;

      for (let i = 0; i < value.length; i++) {
        switch (value[i]) {
          // A continued line break is invisible to everything below: the
          // word/literal being built carries straight on across it (its
          // continuation character has already been stripped by
          // joinKeywordLines). Only the physical-line counter moves, so
          // conditioning columns keep lining up with their real lines.
          case continuedMark:
            conditionalLine += 1;
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
                // Fold in every conditioning line since the last keyword
                // completed (including this one) - covers any indicator-
                // only continuation lines that preceded this keyword's own.
                for (let ln = lastFoldedLine + 1; ln <= conditionalLine; ln++) {
                  const line = conditionalStrings ? conditionalStrings[ln] : undefined;
                  if (line) { DisplayFile.appendConditionLine(pendingConditions, line); }
                }
                lastFoldedLine = conditionalLine;

                result.keywords.push({
                  name: word.toUpperCase(),
                  value: innerValue.length > 0 ? innerValue : undefined,
                  // Independent copy per keyword - several keywords coded on
                  // the same line all read from the same pendingConditions,
                  // and it's reused (not replaced) until the next newline.
                  conditions: pendingConditions.map(group => ({ indicators: group.indicators.slice() })),
                });

                word = ``;
                innerValue = ``;
              }
            }

            if (value[i] === newLineMark) {
              conditionalLine += 1;
              pendingConditions = [];
            }
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

  /** DDS is fixed-column: a line's functions area (where keywords are
   * coded) is positions 45-80, i.e. 0-indexed 44 up to the 80-character
   * line length - the same slice parse() reads keywords back out of. */
  private static readonly FUNCTIONS_COLUMN = 44;
  private static readonly FUNCTIONS_WIDTH = 80 - DisplayFile.FUNCTIONS_COLUMN;

  /**
   * Renders a ConditionGroup[] into DDS conditioning-indicator column
   * strings (10 chars each: 1 relator + up to 3 indicators of 3 chars) -
   * one per physical line needed. A group with more than 3 indicators
   * chunks onto several lines; only a group's own FIRST physical line
   * carries the 'O' relator (a group's own continuation is still the same
   * AND'd group). The first returned string is meant to sit inline with
   * the field/keyword's own text (its relator is always blank - the first
   * group is never itself OR'd to anything); every string after that
   * becomes its own continuation line.
   */
  private static conditionLines(groups: ConditionGroup[]): string[] {
    const lines: string[] = [];

    groups.forEach((group, groupIndex) => {
      for (let i = 0; i < group.indicators.length; i += 3) {
        const chunk = group.indicators.slice(i, i + 3);
        const relator = (groupIndex > 0 && i === 0) ? `O` : ` `;
        const indicatorColumns = chunk.map(c => `${c.negate ? `N` : ` `}${String(c.indicator).padStart(2, `0`)}`).join(``).padEnd(9);
        lines.push(`${relator}${indicatorColumns}`);
      }
    });

    return lines.length > 0 ? lines : [``.padEnd(10)];
  }

  public static getLinesForKeyword(keyword: Keyword): string[] {
    const lines: string[] = [];

    const conditions = DisplayFile.conditionLines(keyword.conditions);

    // Unlike a field's own conditioning (coded after its definition line),
    // a keyword's indicator-only continuation lines come BEFORE the line
    // that finally carries its name/value - real DDS convention, and what
    // parseKeywords' pendingConditions accumulator expects when reading it
    // back. Only the LAST condition line sits inline with the keyword text.
    for (let i = 0; i < conditions.length - 1; i++) {
      lines.push(`     A${conditions[i]}`);
    }

    const lastCondition = conditions[conditions.length - 1];
    const text = `${keyword.name}${keyword.value ? `(${keyword.value})` : ``}`;

    // Positions 45-80: everything before the functions area (the sequence
    // number, the 'A', the conditioning columns, the name/length/position
    // columns a keyword line leaves blank) padded out to column 44, so the
    // keyword itself starts at 45 - where parse() slices it back out from.
    const firstPrefix = `     A${lastCondition}                            `;

    lines.push(...DisplayFile.wrapFunctions(text, firstPrefix));

    return lines;
  }

  /**
   * Lays one entry - a keyword, or a constant's quoted literal - out across
   * the functions area (positions 45-80), continuing onto as many lines as
   * it takes rather than running past column 80, where DDS would truncate
   * it.
   *
   * Every continued line ends in a `-` in column 80, which resumes at
   * position 45 of the next line with nothing inserted between the two
   * halves: the split can fall anywhere - mid-word, between a keyword's
   * name and its `(`, or inside a quoted literal - and joinKeywordLines
   * puts it back together exactly as it was. `+` would be prettier for a
   * multi-value keyword, but it swallows the continuation's leading blanks,
   * so it can't carry a literal that happens to break on one.
   *
   * A continuation line carries no conditioning of its own: blank columns
   * fold in as nothing (see appendConditionLine), so the entry keeps
   * exactly the indicators coded on the line(s) before it.
   */
  private static wrapFunctions(text: string, firstPrefix: string): string[] {
    const lines: string[] = [];
    const continuationPrefix = `     A`.padEnd(DisplayFile.FUNCTIONS_COLUMN);

    let remaining = text;
    let prefix = firstPrefix;

    while (remaining.length > DisplayFile.FUNCTIONS_WIDTH) {
      lines.push(`${prefix}${remaining.substring(0, DisplayFile.FUNCTIONS_WIDTH - 1)}-`);
      remaining = remaining.substring(DisplayFile.FUNCTIONS_WIDTH - 1);
      prefix = continuationPrefix;
    }

    lines.push(prefix + remaining);

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

    // A field's own conditioning (as opposed to a keyword's) is always a
    // single line, up to 3 indicators, one AND-group - unlike keywords, a
    // field has no unambiguous way to distinguish "a continuation of the
    // field's own conditions" from "a leading continuation for its first
    // keyword's conditions", since both would sit in the exact same place
    // (right after the field's definition line, before any keyword). So
    // parse() never recognizes more than this one line for a field, and
    // this only ever needs to emit that one line back.
    const conditionColumns = DisplayFile.conditionLines(field.conditions)[0];

    if (field.displayType === `const`) {
      // Positions 45-80 again: the literal starts at 45, right after the
      // line/position columns, and wraps onto continuation lines when it's
      // longer than the functions area can hold.
      const prefix = `     A${conditionColumns}                      ${y}${x}`;
      newLines.push(...DisplayFile.wrapFunctions(`'${field.value ?? ``}'`, prefix));
    } else if (displayType && field.name) {
      const definitionType = field.type;
      const length = String(field.length).padStart(5);
      const decimals = (field.type !== `A` ? String(field.decimals) : ``).padStart(2);
      newLines.push(
        `     A${conditionColumns}  ${field.name.padEnd(10)} ${length}${definitionType}${decimals}${displayType}${y}${x}`,
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
    if (currentFormatI >= 0) {
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
      lines.push(...DisplayFile.getLinesForKeyword(keyword));
    }

    return lines;
  }

  public getHeaderRangeForFormat(recordFormat: string): DdsLineRange|undefined {
    let range: DdsLineRange|undefined = undefined;
    const currentFormatI = this.formats.findIndex(format => format.name === recordFormat);
    if (currentFormatI >= 0) {
      range = { start: this.formats[currentFormatI].range.start, end: this.formats[currentFormatI].range.end };

      const currentFormat = this.formats[currentFormatI];
      const firstField = currentFormat.fields[0];

      if (firstField) {
        range.endHeader = firstField.startRange - 1;
      } else {
        // No fields at all, so the header (keywords only) runs through the
        // record's whole span. range.end is the index one past this record's
        // content (the next 'R' line, or EOF), so back up one to land on the
        // record's own last line.
        range.endHeader = range.end - 1;
      }
    }

    return range;
  }

  /** Appends a brand-new, empty record format to the end of the file. */
  public addFormat(name: string): DdsUpdate {
    const newLines = DisplayFile.getHeaderLinesForFormat(name, []);
    const insertAt = this.formats[this.formats.length - 1].range.end;

    return { newLines, range: { start: insertAt, end: insertAt } };
  }

  /**
   * The full line range of a record format, from its 'R' line through its
   * last field/keyword line (inclusive) - i.e. everything that needs to be
   * removed to delete the format entirely. The file-level/global record has
   * no 'R' line of its own and can't be deleted this way.
   */
  public getRangeForFormat(recordFormat: string): DdsLineRange|undefined {
    if (recordFormat === GLOBAL_RECORD_NAME) { return undefined; }

    const format = this.formats.find(f => f.name === recordFormat);
    return format ? { start: format.range.start, end: format.range.end - 1 } : undefined;
  }

  /**
   * Renames a record format by regenerating just its own 'R <name>' line -
   * every field/keyword line below it is untouched. The file-level/global
   * record has no 'R' line of its own and can't be renamed this way.
   */
  public renameFormat(originalFormatName: string, newFormatName: string): DdsUpdate|undefined {
    if (originalFormatName === GLOBAL_RECORD_NAME) { return undefined; }

    const format = this.formats.find(f => f.name === originalFormatName);
    if (!format) { return undefined; }

    const newLines = DisplayFile.getHeaderLinesForFormat(newFormatName, []);
    return { newLines, range: { start: format.range.start, end: format.range.start } };
  }

  // TODO: test cases
  public updateFormatHeader(originalFormatName: string, keywords: Keyword[]): DdsUpdate|undefined {
    // The file-level/global record has no 'R' line of its own to regenerate -
    // its keywords are just whatever comes before the first real record.
    const isFileLevel = originalFormatName === GLOBAL_RECORD_NAME;
    const newLines = DisplayFile.getHeaderLinesForFormat(isFileLevel ? `` : originalFormatName, keywords);
    let range = this.getHeaderRangeForFormat(originalFormatName);

    if (range) {
      range = {
        start: range.start,
        // endHeader can legitimately be 0, which `||` would treat as falsy
        // and wrongly fall through to range.end.
        end: range.endHeader ?? range.end,
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

export interface Keyword { name: string, value?: string, conditions: ConditionGroup[] };

export type DisplayType = "input" | "output" | "both" | "const" | "hidden";

export class FieldInfo {
  public value: string | undefined;
  public type: string | undefined;
  public primitiveType: "char" | "decimal" | undefined;
  public displayType: DisplayType | undefined;
  public length: number = 0;
  public decimals: number = 0;
  public position: { x: number, y: number } = { x: 0, y: 0 };
  /** Set only for a printer-file field with no Y coded - tells
   * DisplayFile.assignPrinterLines() it may compute this field's line. */
  public needsPrinterLine: boolean = false;
  public keywordStrings: { keywordLines: string[], conditionalLines: { [lineIndex: number]: string } } = { keywordLines: [], conditionalLines: {} };
  public conditions: ConditionGroup[] = [];
  public keywords: Keyword[] = [];

  constructor(public startRange: number, public name?: string) {}

  handleKeywords() {
    // Line 1 is always this field's own definition line - its conditioning
    // columns belong to the field (see DisplayFile.parse's appendConditionLine
    // call for the field itself), not to whatever keyword comes first.
    const data = DisplayFile.parseKeywords(this.keywordStrings.keywordLines, this.keywordStrings.conditionalLines, 2);

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

/** One AND-group of indicators - real DDS ORs these together, up to 3
 * groups (via continuation lines), 3 indicators AND'd within each. */
export interface ConditionGroup {
  indicators: Conditional[]
}