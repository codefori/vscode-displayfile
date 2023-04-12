
class DisplayFile { 
  constructor() {
    /** @type {RecordInfo[]} */
    this.formats = [];
    
    /** @type {FieldInfo} */
    this.currentField = null;
    
    /** @type {FieldInfo[]} */
    this.currentFields = [];
    
    /** @type {RecordInfo} */
    this.currentRecord = new RecordInfo(`GLOBAL`);
  }
  
  /**
  * @param {string[]} lines 
  */
  parse(lines) {
    let textCounter = 0;
    
    let conditionals, name, len, type, dec, inout, x, y, keywords;
    
    lines.forEach((line, index) => {
      line = line.padEnd(80);

      if (line[6] === `*`) return;
      
      conditionals = line.substring(6, 16).padEnd(10);
      name = line.substring(18, 28).trim();
      len = line.substring(29, 34).trim();
      type = line[34].toUpperCase();
      dec = line.substring(35, 37).trim();
      inout = line[37].toUpperCase();
      y = line.substring(38, 41).trim();
      x = line.substring(41, 44).trim();
      keywords = line.substring(44).trimEnd();
      
      switch (line[16]) {
      case 'R':
        if (this.currentField !== null) {
          this.currentField.handleKeywords();
          this.currentFields.push(this.currentField);
        };
        if (this.currentFields !== null) this.currentRecord.fields = this.currentFields;
        if (this.currentRecord !== null) {
          this.currentRecord.range.end = index;
          this.currentRecord.handleKeywords();
          this.formats.push(this.currentRecord);
        }
        
        this.currentRecord = new RecordInfo(name);
        this.currentRecord.range.start = index;

        this.currentFields = [];
        this.currentField = null;
        
        this.HandleKeywords(keywords);
        break;
        
      case ' ':
        if ((x !== "" && y !== "") || inout === `H`) {
          // From a regular display file
          if (this.currentField !== null) {
            this.currentField.handleKeywords();
            this.currentFields.push(this.currentField);
          }
          
          this.currentField = new FieldInfo();
          this.currentField.position = {
            x: Number(x),
            y: Number(y)
          };
        } else if (x !== "" && y === "") {
          // From a printer file with no Y position
          if (this.currentField !== null) {
            this.currentField.handleKeywords();
            this.currentFields.push(this.currentField);
          }

          let totalX = Number(x);
          if (x.startsWith(`+`)) {
            totalX = this.currentFields[this.currentFields.length - 1].position.x + Number(x.substring(1));

            if (this.currentFields[this.currentFields.length - 1].value) {
              totalX += this.currentFields[this.currentFields.length - 1].value.length;
            }
          }
          
          this.currentField = new FieldInfo();
          this.currentField.position = {
            x: totalX,
            y: 0
          };
        }
        
        if (name != "")
        {
          if (this.currentField) {
            this.currentField.name = name;
            this.currentField.value = "";
            this.currentField.length = Number(len);
            switch (inout)
            {
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
            
            this.currentField.decimals = 0;
            switch (type)
            {
            case "D":
            case "Z":
            case "Y":
              this.currentField.type = `decimal`;
              if (dec != "") this.currentField.decimals = Number(dec);
              break;
            case `L`: //Date
              this.currentField.length = 8;
              this.currentField.type = `char`;
              this.currentField.keywords.push({
                name: `DATE`,
                value: undefined,
                conditions: []
              });
              break;
            case `T`: //Time
              this.currentField.length = 8;
              this.currentField.type = `char`;
              this.currentField.keywords.push({
                name: `TIME`,
                value: undefined,
                conditions: []
              });
              break;
            default:
              this.currentField.type = `char`;
              break;
            }
            
            this.currentField.conditions.push(
              ...DisplayFile.parseConditionals(conditionals)
            )

            this.HandleKeywords(keywords, conditionals);
          }
        }
        else
        {
          if (this.currentField != null)
          {
            if (this.currentField.name == null)
            {
              textCounter++;
              this.currentField.name = `TEXT${textCounter}`;
              if (this.currentField.value == null) this.currentField.value = "";
              this.currentField.length = this.currentField.value.length;
              this.currentField.displayType = `const`;
            
              this.currentField.conditions.push(
                ...DisplayFile.parseConditionals(conditionals)
              )
            }
          }
          this.HandleKeywords(keywords, conditionals);
        }
        break;
      }
    });
    
    if (this.currentField !== null) {
      this.currentField.handleKeywords();
      this.currentFields.push(this.currentField);
    };
    if (this.currentFields !== null) this.currentRecord.fields = this.currentFields;
    if (this.currentRecord !== null) {
      this.currentRecord.range.end = lines.length;
      this.currentRecord.handleKeywords();
      this.formats.push(this.currentRecord);
    }

    this.currentField = null;
    this.currentFields = null;
    this.currentRecord = null;
  }
  
  /**
  * @param {string} keywords 
  * @param {string} [conditionals]
  * @returns 
  */
  HandleKeywords(keywords, conditionals = ``) {
    let insertIndex;

    if (this.currentField) {
      insertIndex = this.currentField.keywordStrings.keywordLines.push(keywords);
      this.currentField.keywordStrings.conditionalLines[insertIndex] = conditionals;
    } else {
      this.currentRecord.keywordStrings.push(keywords);
    }


  }

  static parseConditionals(conditionColumns) {
    if (conditionColumns.trim() === "") return [];

    /** @type {Conditional[]} */
    let conditionals = [];

    //TODO: something with condition
    //const condition = conditionColumns.substring(0, 1); //A (and) or O (or)

    let current = "";
    let negate = false;
    let indicator = 0;

    let cIndex = 1;

    while (cIndex <= 7) {
      current = conditionColumns.substring(cIndex, cIndex + 3);

      if (current.trim() !== "") {
        negate = (conditionColumns.substring(cIndex, cIndex + 1) == "N");
        indicator = Number(conditionColumns.substring(cIndex+1, cIndex+3));

        conditionals.push(new Conditional(indicator, negate));
      }
        
      cIndex += 3;
    }

    return conditionals;
  }

  /** 
   * @param {string[]} keywordStrings 
   * @param {{[line: number]: string}} [conditionalStrings]
   * */
  static parseKeywords(keywordStrings, conditionalStrings) {
    let result = {
      value: ``,
      keywords: [],
      conditions: []
    };

    const newLineMark = `~`;

    let value = keywordStrings.join(newLineMark) + newLineMark;
    let conditionalLine = 1;
  
    if (value.length > 0) {
      value += ` `;
        
      let inBrakcets = 0;
      let word = ``;
      let innerValue = ``;
      let inString = false;
  
      for (let i = 0; i < value.length; i++) {
        switch (value[i]) {
        case `+`:
        case `-`:
          if (!inString && value[i+1] !== newLineMark) {
            innerValue += value[i];
          }
          break;

        case `'`:
          if (inBrakcets > 0) {
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
          if (inString) 
            innerValue += value[i];
          else
            inBrakcets++;
          break;
        case `)`:
          if (inString) 
            innerValue += value[i];
          else
            inBrakcets--;
          break;

        case newLineMark:
        case ` `:
          if (inBrakcets > 0 || inString) {
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

          if (value[i] === newLineMark) conditionalLine += 1;
          break;
        default:
          if (inBrakcets > 0 || inString) 
            innerValue += value[i];
          else
            word += value[i];
          break;
        }
      }
    }
    
    return result;
  }
}

class RecordInfo {
  constructor(name) {
    this.name = name;
    
    /** @type {FieldInfo[]} */
    this.fields = [];

    this.range = {
      start: -1,
      end: -1
    };
    
    this.isWindow = false;
    /** @type {string} */
    this.windowReference = undefined;
    this.windowSize = {
      y: 0,
      x: 0,
      width: 80,
      height: 24
    };

    /** @type {string[]} */
    this.keywordStrings = [];

    /** @type {{name: string, value: string}[]} */
    this.keywords = [];
  }

  handleKeywords() {
    const data = DisplayFile.parseKeywords(this.keywordStrings);

    this.keywords.push(...data.keywords);

    this.keywords.forEach(keyword => {
      switch (keyword.name) {
      case "WINDOW":
        this.isWindow = true;
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

        break;
      }
    });
  }
}

class FieldInfo {
  constructor(name) {
    /** @type {string} */
    this.name = name;

    /** @type {string} */
    this.value = ``;
    
    /** @type {`char`|`decimal`} */
    this.type = null;
    
    /** @type {`input`|`output`|`both`|`const`|`hidden`} */
    this.displayType = null;
    
    this.length = 0;
    this.decimals = 0;
    
    this.position = {
      x: 0,
      y: 0
    };

    /** @type {{keywordLines: string[], conditionalLines: {[lineIndex: number]: string}}} */
    this.keywordStrings = {
      keywordLines: [],
      conditionalLines: {}
    };

    /** @type {Conditional[]} */
    this.conditions = [];

    /** @type {{name: string, value: string, conditions: Conditional[]}[]} */
    this.keywords = [];
  }

  handleKeywords() {
    const data = DisplayFile.parseKeywords(this.keywordStrings.keywordLines, this.keywordStrings.conditionalLines);

    this.keywords.push(...data.keywords);

    if (data.value.length > 0) this.value = data.value;
  }
}

class Conditional {
  /**
   * @param {number} ind 
   * @param {boolean} [negate]
   */
  constructor(ind, negate = false) {
    this.indicator = ind;
    this.negate = negate;
  }
}

module.exports = {
  DisplayFile,
  FieldInfo,
  RecordInfo
}