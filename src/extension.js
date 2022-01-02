// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

const lensProvider = require(`./lensProvider`);

const DisplayFile = require(`./dspf`);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vscode-displayfile" is now active!');

  const lens = new lensProvider();

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-displayfile.render', function (sourceLines, format) {
      // The code you place here will be executed every time your command is executed

      try {
        const dspf = new DisplayFile();
        dspf.parse(sourceLines);

        console.log(dspf);

      } catch (e) {
        console.log(e);
      }

      // TODO: parse
      // TODO: render
    }),

    vscode.languages.registerCodeLensProvider(
      {
        language: `dds.dspf`,
      },
      lens
    ),
  );
}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
}
