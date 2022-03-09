const vscode = require(`vscode`);

/** @type {vscode.WebviewPanel} */
let panel;

module.exports = class {
  static create() {
    if (panel) {
      panel.reveal();
    } else {
      panel = vscode.window.createWebviewPanel(
        `displayFile`,
        `Preview`,
        vscode.ViewColumn.Active
      );

      panel.onDidDispose(() => {
        panel = undefined;
      });
    }
  }

  static update(html) {
    if (panel) {
      panel.webview.html = html;
    }
  }

  static isActive() {
    return panel !== undefined;
  }
}