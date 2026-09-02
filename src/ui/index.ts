import { readFileSync } from "fs";
import { Uri, Webview, WebviewPanel, ExtensionContext, workspace, TextDocument, Range, WorkspaceEdit, Position, Disposable, commands } from "vscode";
import { DisplayFile, FieldInfo, Keyword, planLineInsertion } from "./dspf";

export const DSPF_VIEW_TYPE = `dspf-editor.dspfEditor`;
export const PREVIEW_VIEW_TYPE = `dspf-editor.dspfPreview`;

export type RendererMode = `design` | `preview`;

export class RendererWebview {
  private dds: DisplayFile | undefined;
  private readonly disposables: Disposable[] = [];
  // Set only while our own applyDocumentEdit is in flight, so
  // onDidChangeTextDocument can tell "this change is one of our own edits -
  // whichever case handler triggered it already calls load() itself, with
  // whatever rerender behavior that specific edit needs" apart from "this
  // change came from somewhere else entirely (undo/redo, a direct edit in
  // the text editor, git, ...) - which has no already-rendered client state
  // to rely on, so it always needs a full rerender, not just a sidebar
  // refresh, to actually show what changed.
  private applyingOwnEdit = false;

  private get extensionPath() {
    return this.context.extensionUri;
  }

  // Not derived from the document's languageId - this extension doesn't
  // control what language ID another extension (e.g. Code for IBM i)
  // assigns .prtf files, so that shouldn't be load-bearing here.
  private get fileType(): `dspf` | `prtf` {
    return /\.prtf$/i.test(this.document.fileName) ? `prtf` : `dspf`;
  }

  constructor(
    private readonly context: ExtensionContext,
    private readonly document: TextDocument,
    private readonly view: WebviewPanel,
    private readonly mode: RendererMode
  ) {
    view.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [
        this.extensionPath,
        Uri.joinPath(this.extensionPath, 'webui'),
        Uri.joinPath(this.extensionPath, 'webui', `scripts`),
      ],
    };

    // Keep the render in sync with the source, including edits made directly
    // in the text editor beside it, not just ones made through this webview.
    this.disposables.push(
      workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() !== this.document.uri.toString()) { return; }
        if (this.applyingOwnEdit) { return; }
        this.load(true);
      })
    );
    view.onDidDispose(() => this.disposables.forEach(d => d.dispose()));

    view.webview.onDidReceiveMessage(this.onDidGetMessage.bind(this));
    view.webview.html = this.getBaseHtml(view.webview);
  }

  async load(rerender = true) {
    const content = this.document.getText();

    this.dds = new DisplayFile();
    this.dds.parse(content.split(/\r?\n/));

    this.view.webview.postMessage({
      command: rerender ? "load" : "update",
      dds: this.dds,
      fileType: this.fileType,
    });
  }

  private async onDidGetMessage(message: any) {
    let recordFormat: string|undefined;
    let fieldInfo: FieldInfo|undefined;

    switch (message.command) {
      // Cmd/Ctrl+Z pressed inside the webview - see the keydown listener in
      // webui/main.js for why this can't just be a native keybinding. The
      // document's own undo/redo stack already has every canvas edit, since
      // they're all applied via workspace.applyEdit; this just invokes it.
      case 'undo':
        await commands.executeCommand(`undo`);
        break;

      case 'redo':
        await commands.executeCommand(`redo`);
        break;

      case 'deleteField':
        recordFormat = message.recordFormat;
        const fieldName = message.fieldName;

        if (typeof recordFormat === `string` && typeof fieldName === `string`) {
          const deleteFieldRange = this.dds?.getRangeForField(recordFormat, fieldName);

          if (deleteFieldRange) {
            const workspaceEdit = new WorkspaceEdit();
            workspaceEdit.delete(this.document.uri, new Range(deleteFieldRange.start, 0, deleteFieldRange.end, 1000));

            if (await this.applyDocumentEdit(workspaceEdit)) {
              this.load(true);
            }
          }
        }
        break;

      case 'deleteFormat':
        recordFormat = message.recordFormat;

        if (typeof recordFormat === `string`) {
          const deleteFormatRange = this.dds?.getRangeForFormat(recordFormat);

          if (deleteFormatRange) {
            const workspaceEdit = new WorkspaceEdit();
            workspaceEdit.delete(this.document.uri, new Range(deleteFormatRange.start, 0, deleteFormatRange.end, 1000));

            if (await this.applyDocumentEdit(workspaceEdit)) {
              this.load(true);
            }
          }
        }
        break;

      case 'renameFormat':
        recordFormat = message.recordFormat;
        const newFormatName: string = message.newFormatName;

        if (typeof recordFormat === `string` && typeof newFormatName === `string`) {
          const rename = this.dds?.renameFormat(recordFormat, newFormatName);

          if (rename?.range) {
            const workspaceEdit = new WorkspaceEdit();
            workspaceEdit.replace(
              this.document.uri,
              new Range(rename.range.start, 0, rename.range.end, 1000),
              rename.newLines.join('\n'),
              {label: `Rename DDS Record Format`, needsConfirmation: false}
            );

            if (await this.applyDocumentEdit(workspaceEdit)) {
              this.load(true);
            }
          }
        }
        break;

      case 'newField':
        recordFormat = message.recordFormat;
        fieldInfo = message.fieldInfo;

        if (typeof recordFormat === `string` && typeof fieldInfo === `object`) {
          const newField = this.dds?.updateField(recordFormat, undefined, fieldInfo);

          if (newField) {
            if (newField.range) {
              const workspaceEdit = new WorkspaceEdit();
              this.insertDdsLines(workspaceEdit, newField.range.start, newField.newLines, {label: `Add DDS Field`, needsConfirmation: false});

              if (await this.applyDocumentEdit(workspaceEdit)) {
                this.load(true);
              }
            }
          }
        }

        break;
      case `updateField`:
        recordFormat = message.recordFormat;
        const originalFieldName = message.originalFieldName;
        fieldInfo = message.fieldInfo;

        if (typeof recordFormat === `string` && typeof originalFieldName === `string` && typeof fieldInfo === `object`) {
          const fieldUpdate = this.dds?.updateField(recordFormat, originalFieldName, fieldInfo);

          if (fieldUpdate) {
            if (fieldUpdate.range) {
              const workspaceEdit = new WorkspaceEdit();
              workspaceEdit.replace(
                this.document.uri,
                new Range(fieldUpdate.range.start, 0, fieldUpdate.range.end, 1000),
                fieldUpdate.newLines.join('\n'), // TOOD: use the correct EOL?
                {label: `Update DDS Field`, needsConfirmation: false}
              );

              if (await this.applyDocumentEdit(workspaceEdit)) {
                this.load(false); //Field is updated on the client
              }
            }
          }
        }
        break;

      case `newFormat`:
        const formatName: string = message.formatName;

        if (typeof formatName === `string` && formatName.trim().length > 0) {
          const formatAdd = this.dds?.addFormat(formatName.trim());

          if (formatAdd) {
            const workspaceEdit = new WorkspaceEdit();
            this.insertDdsLines(workspaceEdit, formatAdd.range!.start, formatAdd.newLines, {label: `Add DDS Record Format`, needsConfirmation: false});

            if (await this.applyDocumentEdit(workspaceEdit)) {
              this.load(true);
            }
          }
        }
        break;

      case `updateFormat`:
        // This does not update any of the fields in the record format, only the format header
        recordFormat = message.recordFormat;
        const newKeywords: Keyword[] = message.newKeywords;

        if (typeof recordFormat === `string` && Array.isArray(newKeywords)) {
          const formatUpdate = this.dds?.updateFormatHeader(recordFormat, newKeywords);

          if (formatUpdate) {
            if (formatUpdate.range) {
              const workspaceEdit = new WorkspaceEdit();

              if (formatUpdate.range.end < formatUpdate.range.start) {
                // No existing header content to replace (e.g. a file with no
                // file-level keywords yet, so there's nothing before the
                // first record's line to anchor a replace on) - insert instead.
                workspaceEdit.insert(
                  this.document.uri,
                  new Position(formatUpdate.range.start, 0),
                  formatUpdate.newLines.join('\n') + `\n`, // TOOD: use the correct EOL?
                  {label: `Update DDS Format`, needsConfirmation: false}
                );
              } else {
                workspaceEdit.replace(
                  this.document.uri,
                  new Range(formatUpdate.range.start, 0, formatUpdate.range.end, 1000),
                  formatUpdate.newLines.join('\n'), // TOOD: use the correct EOL?
                  {label: `Update DDS Format`, needsConfirmation: false}
                );
              }

              if (await this.applyDocumentEdit(workspaceEdit)) {
                this.load(true);
              }
            }
          }
        }
        break;
    }
  }

  /**
   * Inserts new DDS lines starting at a given 0-indexed line number, as
   * computed by dspf.ts (e.g. `RecordInfo.range.end` when appending a new
   * field/format after everything else in the file) - see
   * `planLineInsertion`'s own doc comment for why that number can't always
   * be used directly.
   */
  private insertDdsLines(workspaceEdit: WorkspaceEdit, atLine: number, lines: string[], options: { label: string, needsConfirmation: boolean }) {
    const existingText = this.document.getText();
    const plan = planLineInsertion(this.document.lineCount, existingText.endsWith('\n'), existingText.length === 0, atLine, lines);

    const position = plan.useAtLine ? new Position(atLine, 0) : this.document.positionAt(existingText.length);
    workspaceEdit.insert(this.document.uri, position, plan.text, options);
  }

  private async applyDocumentEdit(workspaceEdit: WorkspaceEdit): Promise<boolean> {
    this.applyingOwnEdit = true;
    try {
      return await workspace.applyEdit(workspaceEdit);
    } finally {
      this.applyingOwnEdit = false;
    }
  }

  private getBaseHtml(webview: Webview) {
    const basePath = toUri(webview, this.extensionPath, `webui`, `index.html`);
    // async might be better
    let content = readFileSync(basePath.fsPath, "utf-8");

    // VS Code's webview resource loader can cache local resources by URL, so an
    // unchanged URI can keep serving a stale main.js across panel/window reloads
    // during development. Busting the query string forces a fresh fetch each time.
    const cacheBust = `v=${Date.now()}`;
    const withCacheBust = (uri: Uri) => uri.with({ query: cacheBust }).toString();

    const fileVariables = {
      '{main}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `main.js`)),
      '{elements}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `vscode-elements.js`)),
      '{styles}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `styles.css`)),
      '{codicon}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `codicon.css`)),
      '{konva}': withCacheBust(toUri(webview, this.extensionPath, `webui`, `scripts`, `konva.min.js`)),
      '{mode}': this.mode,
    };

    // Replace all variables in the content
    for (const [key, value] of Object.entries(fileVariables)) {
      const regex = new RegExp(key, 'g');
      content = content.replace(regex, value);
    }

    return content;
  }

  static getCommandHref(command: string, ...args: unknown[]) {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
  }
}

function toUri(
  webview: Webview,
  extensionUri: Uri,
  ...pathList: string[]
) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}
