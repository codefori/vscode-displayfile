
const { DisplayFile, FieldInfo } = require(`./dspf`);

const colors = {
  RED: `red`,
  BLU: `#4287f5`,
  WHT: `white`,
  GRN: `green`,
  TRQ: `turquoise`,
  YLW: `yellow`,
  PNK: `pink`
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
    let css = [
      `#container {`,
      `  font-family: monospace;`,
      `  font-size: 18px;`,
      `  border: solid black 1px;`,
      `  width: 880px;`,
      `  height: 480px;`,
      `  position: absolute;`,
      `  --g: transparent calc(100% - 1px), #ebebeb 0;`,
      `  letter-spacing: 0.15px;`,
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

    let body = `<div id="container">`;

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
          
          for (let row = 0; row < rows; row++) {
            subfileRecord.fields.forEach(field => {
              field.name = `${field.name}_${row}`;
              const content = Render.getContent(field);
              css += content.css;
              body += content.html;
              
              field.position.y += 1;
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
        case `DSPATR`:
          keyword.value.split(` `).forEach(value => {
            switch (value) {
            case `UL`:
              css += `text-decoration: underline;`;
              break;
            case `HI`:
              css += `font-weight: bold;`;
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

      let body = `<div id="${name}">${value.padEnd(length, `-`)}</div>`

      css += [
        `position: absolute`,
        `width: ${length * 11}px`,
        `height: 19px`,
        `top: ${(field.position.y - 1) * 20}px`,
        `left: ${(field.position.x - 1) * 11}px`,
      ].join(`;`);

      css += `;`

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