
const vscode = require(`vscode`);

/**
 * @type {vscode.CodeLensProvider}
 */
module.exports = class lensProvider {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this.emitter.event;
  }

  refresh() {
    this.emitter.fire();
  }

  /**
   * 
   * @param {vscode.TextDocument} document
   * @returns {Promise<vscode.CodeLens[]>} 
   */
  async provideCodeLenses(document)  {
    const codeLens = [];

    const eol = document.eol === 1 ? `\n` : `\r\n`;
    const lines = document.getText().split(eol);

    lines.forEach((line, index) => {
      if (line.length >= 28) {
        // Not a comment
        if (line[6] !== `*`) {
          if (line[5].toUpperCase() === `A`) {
            // Is a record format definition
            if (line[16].toUpperCase() === `R`) {
              const name = line.substring(18, 28).trim();

              codeLens.push(new vscode.CodeLens(
                new vscode.Range(
                  index, 0, index, 0
                ),
                {
                  command: `vscode-displayfile.render`,
                  title: `Preview ${name}`,
                  arguments: [lines, name]
                }
              ));
            }
          }
        }
      }
    });

    return codeLens;
  }
}
