
const { DisplayFile, FieldInfo } = require(`./dspf`);

const colors = {
  RED: `red`,
  BLU: `blue`,
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
    const content = this.getFormatContent(format);

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
      content.css,
    ].join(` `);

    let body = [
      `<div id="container">`,
      content.body,
      `</div>`
    ].join(``);

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
      let body = `<div id="${field.name}">${field.value.padEnd(field.length, `-`)}</div>`
      let css = `#${field.name} {`;

      css += [
        `position: absolute`,
        `width: ${field.length * 11}px`,
        `height: 19px`,
        `top: ${field.position.y * 20}px`,
        `left: ${field.position.x * 11}px`,
      ].join(`;`);

      css += `;`

      const keywords = field.keywords;

      keywords.forEach(keyword => {
        const key = keyword.name;
        switch (key) {
        case `COLOR`:
          css += `color: ${colors[keyword.value]};`
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
      })

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