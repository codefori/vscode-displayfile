
const { DisplayFile, FieldInfo, RecordInfo } = require(`./dspf`);

const colors = {
  RED: `red`,
  BLU: `#4287f5`,
  WHT: `#FFFFFF`,
  GRN: `green`,
  TRQ: `turquoise`,
  YLW: `yellow`,
  PNK: `pink`
};

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

module.exports = class Render {
  constructor(display) {
    /** @type {DisplayFile} */
    this.display = display;
  }

  /**
   * @param {string} format 
   */
  getHTML(format) {
    let size = {
      width: 880,
      height: 480
    };

    /** @type {{baseX: number, baseY: number, baseWidth: number, baseHeight: number, x: number, y: number, width: number, height: number, color?: string}} */
    let window;

    /** @type {FieldInfo} */
    let windowTitle;

    /** @type {RecordInfo} */
    let topMostFormat;
    if (format) {
      topMostFormat = this.display.formats.find(currentFormat => currentFormat.name === format);
    } else {
      topMostFormat = this.display.formats.find(currentFormat => currentFormat.name === `GLOBAL`);
    }

    if (topMostFormat) {
      if (topMostFormat.isWindow) {
        const { x, y, width, height } = topMostFormat.windowSize;
        window = {
          baseX: x,
          baseY: y,
          baseWidth: width,
          baseHeight: height, 
          x: x * 11,
          y: y * 20,
          width: width * 11,
          height: (height-1) * 20
        };

        let parts;

        const borderInfo = topMostFormat.keywords.find(keyword => keyword.name === `WDWBORDER`);
        if (borderInfo) {
          parts = Render.parseParms(borderInfo.value);

          parts.forEach((part, index) => {
            switch (part.toUpperCase()) {
            case `*COLOR`:
              window.color = parts[index + 1];
              break;
            }
          });
        }

        const windowInfo = topMostFormat.keywords.find(keyword => keyword.name === `WDWTITLE`);
        if (windowInfo) {
          windowTitle = new FieldInfo(`WINDOWTITLE`);
          windowTitle.type = `char`;
          windowTitle.displayType = `const`;

          let xPositionValue = `center`;
          let yPositionValue = `top`;

          parts = Render.parseParms(windowInfo.value);

          parts.forEach((part, index) => {
            switch (part.toUpperCase()) {
            case `*TEXT`:
              windowTitle.value = parts[index + 1];
              break;
            case `*COLOR`:
              windowTitle.keywords.push({
                name: `COLOR`,
                value: parts[index + 1]
              });
            case `*DSPATR`:
              windowTitle.keywords.push({
                name: `DSPATR`,
                value: parts[index + 1]
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

          // If no color is found, the default is blue.
          if (!windowTitle.keywords.find(keyword => keyword.name === `COLOR`)) {
            windowTitle.keywords.push({
              name: `COLOR`,
              value: `BLU`
            });
          }

          const txtLength = windowTitle.value.length;

          const yPosition = (window.baseY) + (yPositionValue === `top` ? 0 : window.baseHeight);
          let xPosition = (window.baseX + 1);

          switch (xPositionValue) {
          case `center`:
            xPosition = (window.baseX + 1) + Math.floor((window.baseWidth / 2) - (txtLength / 2));
            break;
          case `right`:
            xPosition = (window.baseX + 1) + window.baseWidth - txtLength;
            break;
          case `left`:
            xPosition = (window.baseX + 1);
            break;
          }

          windowTitle.position = {
            x: xPosition,
            y: yPosition
          };

        }

      }
    }

    let css = [
      `#container {`,
      `  font-family: monospace;`,
      `  font-size: 18px;`,
      `  border: solid black 1px;`,
      `  width: ${size.width}px;`,
      `  height: ${size.height}px;`,
      `  position: absolute;`,
      `  --g: transparent calc(100% - 1px), #ebebeb 0;`,
      `  letter-spacing: 0.15px;`,
      `  color: ${colors.GRN};`,
      `  background:`,
      // `    linear-gradient(to right, var(--g)),`,
      // `    linear-gradient(to bottom, var(--g)), `,
      `    black;`,
      `  background-size:`,
      `    11px 100%,`,
      `    100% 20px;`,
      `}`,
      `@keyframes blinker {`,
      `  50% {`,
      `    opacity: 0;`,
      `  }`,
      `}`,
    ].join(` `);

    // If this is a window, add the window CSS
    if (window) {
      const windowColor = colors[window.color] || colors.BLU;
      css += [
        `#window {`,
        `  position: absolute;`,
        `  width: ${window.width}px;`,
        `  height: ${window.height}px;`,
        `  top: ${window.y}px;`,
        `  left: ${window.x}px;`,
        `  border: solid ${windowColor} 2px;`,
        `}`,
      ].join(` `);
    }

    let body = `<div id="container">`;

    if (windowTitle) {
      const windowContent = Render.getContent(windowTitle);

      css += windowContent.css;
      body += windowContent.body;
    }

    if (window) {
      body += `<div id="window">`;
    }

    if (format) {
      const content = this.getFormatContent(format);

      css += content.css;
      body += content.body;

    } else {
      this.display.formats.forEach(currentFormat => {
        if (currentFormat.keywords.find(key => key.name === `SFL`)) {
          // All but subfiles
          return;
        }

        const content = this.getFormatContent(currentFormat.name);

        css += content.css;
        body += content.body;
      });
    }

    if (window) {
      body += `</div>`;
    }

    body += `</div>`;

    return [
      `<html>`,
      `<style>${css}</style>`,
      `<body>${body}</body>`,
      `</html>`
    ].join(``);
  }

  /**
   * @param {string} recordFormat 
   */
  getFormatContent(recordFormat) {
    let css = ``;
    let body = ``;

    const formats = this.display.formats;

    const format = formats.find(format => format.name === recordFormat);
    if (format) {
      const subfileFormat = format.keywords.find(keyword => keyword.name === `SFLCTL`);

      // If there is a subfile format, render that first
      if (subfileFormat) {
        const subfilePage = format.keywords.find(keyword => keyword.name === `SFLPAG`)
        const rows = Number(subfilePage ? subfilePage.value : 1);

        const subfileRecord = formats.find(format => format.name === subfileFormat.value);

        if (subfileRecord) {
          const subfileFields = subfileRecord.fields.filter(field => field.displayType !== `hidden`);
          
          const low = Math.min(...subfileFields.map(field => field.position.y));
          const high = Math.max(...subfileFields.map(field => field.position.y));
          const linesPerItem = (high - low) + 1
          
          for (let row = 0; row < rows; row++) {
            subfileFields.forEach(field => {
              field.name = `${field.name}_${row}`;
              const content = Render.getContent(field);
              css += content.css;
              body += content.body;
              
              field.position.y += linesPerItem;
            });
          }


        } else {
          throw new Error(`Unable to find SFLCTL format ${subfileFormat} from ${recordFormat}`);
        }
      }

      const fields = format.fields.filter(field => field.displayType !== `hidden`);
      fields.forEach(field => {
        const content = Render.getContent(field);
        css += content.css;
        body += content.body;
      });

    } else {
      throw new Error(`Record format does not exist.`);
    }

    return {
      css,
      body
    }
  }

  /**
   * @param {FieldInfo} field 
   */
  static getContent(field) {
    if (field.displayType !== `hidden`) {
      // Hacky way to make names valid IDs
      const htmlName = field.name
        .replace(new RegExp(`1`, `g`), `ONE`)
        .replace(new RegExp(`2`, `g`), `TWO`)
        .replace(new RegExp(`3`, `g`), `THREE`)
        .replace(new RegExp(`4`, `g`), `FOUR`)
        .replace(new RegExp(`5`, `g`), `FIVE`)
        .replace(new RegExp(`6`, `g`), `SIX`)
        .replace(new RegExp(`7`, `g`), `SEVEN`)
        .replace(new RegExp(`8`, `g`), `EIGHT`)
        .replace(new RegExp(`9`, `g`), `NINE`)
        .replace(new RegExp(`0`, `g`), `ZERO`)
        .replace(new RegExp(`#`, `g`), `HASH`)
        .replace(new RegExp(`@`, `g`), `HASH`)
        .replace(new RegExp(`\\$`, `g`), `DOLLAR`)
        .replace(new RegExp(`_`, `g`), `US`)

      let css = `#${htmlName} {`;

      const keywords = field.keywords;

      keywords.forEach(keyword => {
        const key = keyword.name;
        switch (key) {
        case `COLOR`:
          css += `color: ${colors[keyword.value]};`
          break;
        case `SYSNAME`:
          field.value = `SYSNAME_`
          break;
        case `USER`:
          field.value = `USERNAME__`
          break;
        case `DATE`:
          const dateSep = keywords.find(keyword => keyword.name === `DATSEP`);
          
          const dateFormat = keywords.find(keyword => keyword.name === `DATFMT`);
          if (dateFormat) {
            field.value = dateFormats[dateFormat.value] || `?FORMAT?`;

            if (dateSep && dateSep.value.toUpperCase() !== `*JOB`) {
              field.value = field.value.replace(new RegExp(`[./-:]`, `g`), dateSep.value);
            }
          }
          break;
        case `TIME`:
          const sep = keywords.find(keyword => keyword.name === `TIMSEP`);
          
          const format = keywords.find(keyword => keyword.name === `TIMFMT`);
          if (format) {
            field.value = timeFormats[format.value] || `?FORMAT?`;

            if (sep && sep.value.toUpperCase() !== `*JOB`) {
              field.value = field.value.replace(new RegExp(`[./-:]`, `g`), sep.value);
            }
          }
          break;
        case `DSPATR`:
          keyword.value.split(` `).forEach(value => {
            switch (value) {
            case `UL`:
              css += `text-decoration: underline;`;
              break;
            case `HI`:
              css += `font-weight: 900;`;
              break;
            case `BL`:
              css += `animation: blinker 1s step-start infinite;`;
              break;
            }
          })
          break;
        }
      });

      const length = field.length > 0 && field.value.length < field.length ? field.length : field.value.length;
      const value = field.value
        .replace(/ /g, `&nbsp;`)
        .replace(new RegExp(`''`, `g`), `'`);

      let padString = `-`;

      switch (field.type) {
      case `char`:
        switch (field.displayType) {
        case `input`: padString = `I`; break;
        case `output`: padString = `O`; break;
        case `both`: padString = `B`; break;
        }
        break;
      case `decimal`:
        switch (field.displayType) {
        case `input`: padString = `3`; break;
        case `output`: padString = `6`; break;
        case `both`: padString = `9`; break;
        }
        break;
      }

      let hoverText;

      if (field.displayType !== `const`) {
        // Remove unique subfield names
        const displayName = field.name.includes(`_0`) ? field.name.substring(0, field.name.indexOf(`_0`)) : field.name;

        const textKeyword = keywords.find(keyword => keyword.name === `TEXT`);
        hoverText = `${displayName} ${textKeyword ? textKeyword.value : ``}`.trim();
      }

      let body = `<div id="${htmlName}">${hoverText ? `<div id="${htmlName}_tooltip">${hoverText}</div>` : ``}${value.padEnd(length, padString)}</div>`

      css += [
        `position: absolute`,
        `width: ${length * 11}px`,
        `height: 19px`,
        `top: ${(field.position.y - 1) * 20}px`,
        `left: ${(field.position.x - 1) * 11}px`,
      ].join(`;`) + `;`;

      if ([`input`, `both`].includes(field.displayType)) {
        css += `text-decoration: underline;`;
      }

      css += `} `;

      if (hoverText) {
        css += `` + 
        [
          `#${htmlName} #${htmlName}_tooltip {`,
          `  font-size: 12px;`,
          `  visibility: hidden;`,
          `  width: 120px;`,
          `  background-color: #121212;`,
          `  color: #fff;`,
          `  text-align: center;`,
          `  border-radius: 6px;`,
          `  padding: 5px 0;`,
          `  `,
          `  /* Position the tooltip */`,
          `  position: absolute;`,
          `  z-index: 1;`,
          `  top: 100%;`,
          `  left: 50%;`,
          `  margin-left: -60px;`,
          `  margin-top: 10px;`,
          `}`
        ].join(``);
        
        css += [
          `#${htmlName}:hover #${htmlName}_tooltip {`,
          `  visibility: visible;`,
          `}`,
        ].join(``) + ` `;

        css += [
          `#${htmlName} #${htmlName}_tooltip::after {`,
          `  content: "";`,
          `  position: absolute;`,
          `  bottom: 100%;  /* At the top of the tooltip */`,
          `  left: 50%;`,
          `  margin-left: -5px;`,
          `  border-width: 5px;`,
          `  border-style: solid;`,
          `  border-color: transparent transparent #121212 transparent;`,
          `}`,
        ].join(``) + ` `;
      }

      return {
        css,
        body
      };

    } else {
      return {
        css: ``,
        body: ``
      }
    }
  }

  /**
   * @param {string} string 
   * @returns {string[]}
   */
  static parseParms(string) {
    let items = [];
    let inString = false;
    let current = ``;

    for (let i = 0; i < string.length; i++) {
      switch (string[i]) {
      case `'`:
        inString = !inString;
        break;
      case ` `:
        if (inString) current += string[i];
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
}