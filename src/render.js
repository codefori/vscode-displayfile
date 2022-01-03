
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

    /** @type {{x: number, y: number, width: number, height: number, color?: string}} */
    let window;

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
          x: x * 11,
          y: y * 20,
          width: width * 11,
          height: height * 20
        };

        const borderInfo = topMostFormat.keywords.find(keyword => keyword.name === `WDWBORDER`);
        if (borderInfo) {
          const parts = borderInfo.value.split(` `);

          parts.forEach((part, index) => {
            switch (part.toUpperCase()) {
            case `*COLOR`:
              window.color = parts[index + 1];
              break;
            }
          });
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
          // TODO: handle rows...
          const low = Math.min(...subfileRecord.fields.map(field => field.position.y));
          const high = Math.max(...subfileRecord.fields.map(field => field.position.y));
          const linesPerItem = (high - low) + 1
          
          for (let row = 0; row < rows; row++) {
            subfileRecord.fields.forEach(field => {
              field.name = `${field.name}_${row}`;
              const content = Render.getContent(field);
              css += content.css;
              body += content.html;
              
              field.position.y += linesPerItem;
            });
          }


        } else {
          throw new Error(`Unable to find SFLCTL format ${subfileFormat} from ${recordFormat}`);
        }
      }

      format.fields.forEach(field => {
        const content = Render.getContent(field);
        css += content.css;
        body += content.html;
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
      const name = field.name
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
        .replace(new RegExp(`_`, `g`), `US`)

      let css = `#${name} {`;

      const keywords = field.keywords;

      let seperator = ``;

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

      const length = field.length > 0 ? field.length : field.value.length;
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

      let body = `<div id="${name}">${value.padEnd(length, padString)}</div>`

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

      return {
        css,
        html: body
      };

    } else {
      return {
        css: ``,
        html: ``
      }
    }
  }
}