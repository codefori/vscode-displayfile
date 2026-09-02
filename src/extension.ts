// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RendererWebview, DSPF_VIEW_TYPE, PREVIEW_VIEW_TYPE } from './ui';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "dspf-editor" is now active!');

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			DSPF_VIEW_TYPE,
			{
				async resolveCustomTextEditor(document, webviewPanel) {
					const renderer = new RendererWebview(context, document, webviewPanel, `design`);
					await renderer.load();
				}
			},
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	// A separate, read-only view of the same document type - lets composing
	// several record formats together live entirely outside the editable
	// Design view, instead of a mode toggle buried inside it.
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			PREVIEW_VIEW_TYPE,
			{
				async resolveCustomTextEditor(document, webviewPanel) {
					const renderer = new RendererWebview(context, document, webviewPanel, `preview`);
					await renderer.load();
				}
			},
			{ webviewOptions: { retainContextWhenHidden: true } }
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('dspf-editor.launchRenderer', (uri?: vscode.Uri) => {
			const target = uri || vscode.window.activeTextEditor?.document.uri;
			if (target) {
				vscode.commands.executeCommand('vscode.openWith', target, DSPF_VIEW_TYPE, vscode.ViewColumn.Beside);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('dspf-editor.launchPreview', (uri?: vscode.Uri) => {
			const target = uri || vscode.window.activeTextEditor?.document.uri;
			if (target) {
				vscode.commands.executeCommand('vscode.openWith', target, PREVIEW_VIEW_TYPE, vscode.ViewColumn.Beside);
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
