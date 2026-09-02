import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

// webui/main.js is a plain browser script (no bundler, no module system) that
// expects Konva and a handful of DOM/vscode-elements APIs to exist as globals.
// This harness stubs just enough of that surface to load the real script
// unmodified in Node and exercise its pure-logic functions - indicator
// evaluation, canvas-element id namespacing, padding-character derivation,
// etc. - the same way the mid-session debugging in this project did.
//
// It is NOT a DOM/browser replacement: layout, styling, real event
// dispatch, and the actual vscode-elements component behavior aren't
// modeled. Anything that depends on those still needs manual testing in
// the real extension.

/** Minimal stand-in for both plain elements and vscode-* custom elements. */
class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, ((event?: any) => void)[]> = {};
  parentElement: FakeElement | undefined;
  private _innerHTML = ``;
  private _innerText = ``;

  // vscode-single-select's actual contract (reverse-engineered mid-session):
  // .value only matches something already present in .options - setting it
  // to an unmatched value leaves the selection empty (returns undefined),
  // it does NOT add the value.
  private _options: { label: string, value: string }[] = [];
  private _value: string | undefined;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  setAttribute(name: string, value: any) {
    this.attributes[name] = String(value);
    // vscode-textfield (like a plain <input>) reflects its value attribute
    // into the property, so code that sets one and reads back the other
    // behaves the same here. A vscode-*-select doesn't - its .value is
    // constrained to its .options (see the setter below).
    if (name === `value` && !this.tagName.includes(`SELECT`)) { this._value = String(value); }
  }
  getAttribute(name: string) { return this.attributes[name]; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  toggleAttribute(name: string, force?: boolean) {
    const shouldHave = force !== undefined ? force : this.attributes[name] === undefined;
    if (shouldHave) { this.attributes[name] = ``; } else { delete this.attributes[name]; }
    return shouldHave;
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  replaceChild(child: FakeElement, existing: FakeElement) {
    const index = this.children.indexOf(existing);
    if (index < 0) { throw new Error(`replaceChild: node to replace is not a child`); }
    this.children[index] = child;
    child.parentElement = this;
    existing.parentElement = undefined;
    return existing;
  }

  insertBefore(child: FakeElement, ref: FakeElement | null) {
    const index = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(index < 0 ? 0 : index, 0, child);
    child.parentElement = this;
    return child;
  }

  prepend(child: FakeElement) {
    this.children.unshift(child);
    child.parentElement = this;
    return child;
  }

  get firstChild() { return this.children[0]; }

  focus() { /* no-op - just needs to exist so code calling it doesn't throw */ }

  addEventListener(type: string, handler: (event?: any) => void) {
    (this.listeners[type] ||= []).push(handler);
  }
  removeEventListener() { /* not needed for these tests */ }

  /** Test-only helper (not a real DOM API) to fire registered listeners. */
  trigger(type: string, event: any = {}) {
    (this.listeners[type] || []).forEach(handler => handler(event));
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    const idAttr = selector.startsWith(`[`) ? selector.slice(1, -1).split(`=`)[0] : undefined;
    const visit = (el: FakeElement) => {
      if (selector.startsWith(`#`) && el.attributes.id === selector.slice(1)) { matches.push(el); }
      else if (idAttr && el.dataset[toCamelCase(idAttr.replace(`data-`, ``))] !== undefined) { matches.push(el); }
      el.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0]; }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(value: string) {
    this._innerHTML = value;
    if (value === ``) { this.children = []; }
  }

  get innerText() { return this._innerText; }
  set innerText(value: string) { this._innerText = value; }

  // vscode-single-select's options/value API, per its real accessor pair.
  // Dynamic property (not declared as a class field) - only meaningful on
  // select elements, mirroring how main.js just assigns `select.creatable = true`.
  creatable?: boolean;
  set options(opts: { label: string, value: string }[]) { this._options = opts; }
  get options() { return this._options; }
  set value(val: string) {
    // Only vscode-*-select components constrain .value to something already
    // in .options - a plain vscode-textfield's .value is just a normal
    // reflected property, settable to whatever's typed.
    if (!this.tagName.includes(`SELECT`)) { this._value = val; return; }
    if (this._options.find(o => o.value === val)) { this._value = val; return; }
    // A creatable combobox accepts (and adds) a typed value that isn't
    // already an option, instead of rejecting it - see
    // _createAndSelectSuggestedOption in the real vscode-elements source.
    this._value = this.creatable ? val : undefined;
  }
  get value() { return this._value; }
  get checked() { return this.attributes.checked === `true`; }
}

function toCamelCase(s: string) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class FakeKonvaNode {
  type: string;
  config: any;
  children: FakeKonvaNode[] = [];
  listeners: Record<string, ((event?: any) => void)[]> = {};

  constructor(type: string, config: any = {}) {
    this.type = type;
    this.config = config;
  }
  add(child: FakeKonvaNode) { this.children.push(child); return this; }
  on(type: string, handler: (event?: any) => void) { (this.listeners[type] ||= []).push(handler); }
  /** Test-only helper (not a real Konva API) to fire registered listeners. */
  trigger(type: string, event: any = {}) {
    (this.listeners[type] || []).forEach(handler => handler(event));
  }
  findOne(selector: string): FakeKonvaNode | undefined {
    const id = selector.replace(`#`, ``);
    const visit = (node: FakeKonvaNode): FakeKonvaNode | undefined => {
      if (node.config.id === id) { return node; }
      for (const child of node.children) {
        const found = visit(child);
        if (found) { return found; }
      }
      return undefined;
    };
    for (const child of this.children) {
      const found = visit(child);
      if (found) { return found; }
    }
    return undefined;
  }
  destroy() { /* no-op */ }
  absolutePosition(pos?: { x: number, y: number }) {
    if (pos) { Object.assign(this.config, pos); }
    return { x: this.config.x, y: this.config.y };
  }
  getStage() { return this; }
  getPointerPosition() { return { x: 0, y: 0 }; }
  fill(color?: string) { if (color !== undefined) { this.config.fill = color; } return this.config.fill; }
  /** Only meaningful when called on a stage (getStage() returns the node itself here). */
  container() { return { style: {} as Record<string, string> }; }
  x(value?: number) { if (value !== undefined) { this.config.x = value; } return this.config.x; }
  y(value?: number) { if (value !== undefined) { this.config.y = value; } return this.config.y; }
  width(value?: number) { if (value !== undefined) { this.config.width = value; } return this.config.width; }
  height(value?: number) { if (value !== undefined) { this.config.height = value; } return this.config.height; }
  opacity(value?: number) { if (value !== undefined) { this.config.opacity = value; } return this.config.opacity; }
}

export interface WebuiSandbox {
  [key: string]: any;
}

/**
 * Loads webui/main.js into a fresh sandboxed context and returns it. Each
 * call is fully independent - module-level state (activeDocument,
 * activeIndicators, etc.) isn't shared across calls.
 *
 * @param mode Mirrors the `window.__mode__` the real index.html sets before
 * main.js runs (see RendererWebview's `{mode}` substitution) - drives the
 * module-level `isPreviewMode` constant. Defaults to the Design view.
 */
export function loadWebui(mode: `design` | `preview` = `design`): WebuiSandbox {
  const elementsByFixedId: Record<string, FakeElement> = {};
  const fixedIds = [
    `recordFormatSidebar`, `fieldInfoSidebar`, `keywordEditorArea`,
    `recordFormatSelector`, `container`, `recordFormatTabs`, `dspSizeToggle`,
    `newFormatButton`, `newFormatForm`, `newFormatName`, `newFormatConfirm`,
    `renameFormatButton`, `renameFormatForm`, `renameFormatName`, `renameFormatConfirm`,
    `deleteFormatButton`, `formatToolbarRow`, `selectedFormatRow`,
  ];
  for (const id of fixedIds) {
    const el = new FakeElement(`div`);
    el.attributes.id = id;
    elementsByFixedId[id] = el;
  }

  const fakeCanvasCtx = {
    font: ``,
    measureText(text: string) {
      // Deterministic stand-in for real glyph metrics - just needs to be
      // consistent, not accurate, since these tests check relative behavior
      // (namespacing, floors, branching) not exact pixel values.
      return { width: text.length * 8 };
    },
  };

  const documentListeners: Record<string, ((event?: any) => void)[]> = {};

  const fakeDocument: any = {
    createElement(tag: string) {
      if (tag === `canvas`) {
        return { getContext: () => fakeCanvasCtx };
      }
      return new FakeElement(tag);
    },
    getElementById(id: string) {
      return elementsByFixedId[id] || null;
    },
    body: new FakeElement(`body`),
    createTextNode(text: string) {
      const el = new FakeElement(`#text`);
      el.innerText = text;
      return el;
    },
    addEventListener(type: string, handler: (event?: any) => void) {
      (documentListeners[type] ||= []).push(handler);
    },
    removeEventListener() { /* not needed for these tests */ },
    /** Test-only helper (not a real DOM API) to fire registered listeners. */
    trigger(type: string, event: any = {}) {
      (documentListeners[type] || []).forEach(handler => handler(event));
    },
  };

  const Konva = {
    Stage: class extends FakeKonvaNode { constructor(c: any) { super(`Stage`, c); } },
    Layer: class extends FakeKonvaNode { constructor(c: any) { super(`Layer`, c); } },
    Rect: class extends FakeKonvaNode { constructor(c: any) { super(`Rect`, c); } },
    Group: class extends FakeKonvaNode { constructor(c: any) { super(`Group`, c); } },
    Text: class extends FakeKonvaNode { constructor(c: any) { super(`Text`, c); } },
  };

  // Recorded here (not just swallowed) so tests can assert on what a UI
  // action actually sends to the extension host, e.g. an Add Field button's
  // default field shape.
  const postedMessages: any[] = [];

  const sandbox: any = {
    document: fakeDocument,
    window: { addEventListener() {}, document: fakeDocument, __mode__: mode },
    Konva,
    acquireVsCodeApi: () => ({ postMessage: (message: any) => postedMessages.push(message) }),
    postedMessages,
    console,
  };
  vm.createContext(sandbox);

  const mainJs = readFileSync(join(__dirname, `../../webui/main.js`), `utf-8`);
  vm.runInContext(mainJs, sandbox, { filename: `main.js` });

  return sandbox;
}

export { FakeElement, FakeKonvaNode };
