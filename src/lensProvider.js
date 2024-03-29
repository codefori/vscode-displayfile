
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
      line = line.padEnd(30);
      // Not a comment
      if (line[6] !== `*`) {
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
              arguments: [lines, name, document.languageId]
            }
          ));
        }
      }
    });

    // If codelens exist, that means there is formats
    // Let's add a show all button
    codeLens.push(new vscode.CodeLens(
      new vscode.Range(
        0, 0, 0, 0
      ),
      {
        command: `vscode-displayfile.render`,
        title: `Preview all`,
        arguments: [lines, undefined, document.languageId]
      }
    ));

    return codeLens;
  }
}
