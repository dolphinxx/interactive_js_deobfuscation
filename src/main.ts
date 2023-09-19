// @ts-ignore
import {replace, traverse} from 'estraverse';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
// import * as escodegen from 'escodegen';
import * as astring from './astring';
import * as ESTree from 'estree';
// @ts-ignore
import escapeHtml from 'escape-html';
import * as acorn from "acorn";

import './main.scss';
import {EsNode} from "./global";
import * as diff from 'diff';
import {
    inlineExpression,
    inlineFunction,
    inlineIdentifier,
    inlineIdentifierReference,
    inlineReference,
} from "./traverse";
import {applyAstParent, closestBlock, findIdentifierUsage, isIdOfParent, removeIdentifierIfUnused} from "./util";
import {
    computedToDotAll,
    controlFlowFlatteningAll,
    evalConstantExpressionsAll,
    hexadecimal,
    inlineConstantsAll,
    simplifyAll,
    stringArrayTransformations
} from "./transform";

globalThis.logDebug = (...msg: any[]) => console.log(...msg);

const nodeCssClasses = {
    keyword: 'ͼb',
    boolean: 'ͼc',
    number: 'ͼd',
    bigint: 'ͼd',
    string: 'ͼe',
    regex: 'ͼf',
    template: 'ͼf',
    identity: 'ͼg',
    // never reach
    object: '',
    undefined: '',
    symbol: '',
    function: '',
}

class NodeIdHolder {
    _list: EsNode[];

    constructor() {
        this._list = [];
    }

    nid(node: EsNode): string {
        let id = this._list.indexOf(node);
        if (id !== -1) {
            return id.toString();
        }
        id = this._list.length;
        this._list.push(node);
        return id.toString();
    }

    reset() {
        this._list.splice(0, this._list.length);
    }

    node(id: string) {
        return this._list[parseInt(id)];
    }

    getId(node: EsNode): string | undefined {
        const id = this._list.indexOf(node);
        if (id === -1) {
            return undefined;
        }
        return id.toString();
    }
}

// function overwriteAstringWrite(renderer: (code: string, node?: EstreeNode) => string) {
//     astring.generate({
//         type: esprima.Syntax.Program
//     } as ESTree.Program, {
//         generator: Object.assign({}, astring.GENERATOR, {
//             [esprima.Syntax.Program]: function (node: EstreeNode, state: State) {
//                 // console.log(state);
//                 // console.log(state.constructor);
//                 // console.log(state.writeAndMap);
//                 state.constructor.prototype.writeAndMap = function (code: string, node?: EstreeNode) {
//                     this.output += renderer(code, node);
//                     this.map(code, node);
//                 };
//                 state.write('noop');
//             },
//         })
//     });
// }

class Editor {
    _renderBuffer: string[];
    root: HTMLElement;
    editorEl: HTMLElement;
    selectionEl: HTMLElement;
    historyEl: HTMLElement;
    sourceDiffEl: HTMLElement;
    sourceInput: HTMLTextAreaElement;
    _active?: HTMLElement;
    _nodeIdHolder: NodeIdHolder;
    _code?: string;
    // _history: string[];
    program?: EsNode;
    _history: { [key: string]: string };

    constructor(root: HTMLElement) {
        this.root = root;
        this._renderBuffer = [];
        // this._history = [];
        this._history = {};
        this._nodeIdHolder = new NodeIdHolder();
        this.editorEl = this.root.querySelector('#editor') as HTMLElement;
        this.selectionEl = this.root.querySelector('#selection') as HTMLElement;
        this.historyEl = this.root.querySelector('#history') as HTMLElement;
        this.sourceDiffEl = this.root.querySelector('#sourceDiff') as HTMLElement;
        this.sourceInput = this.root.querySelector('#source') as HTMLTextAreaElement;
        this.init();
    }

    init() {
        const inlineBtn = this.root.querySelector('#inlineBtn') as HTMLButtonElement;
        inlineBtn.disabled = true;
        const removeBtn = this.root.querySelector('#removeBtn') as HTMLButtonElement;
        removeBtn.disabled = true;
        this.editorEl.setAttribute('spellcheck', 'false');
        this.editorEl.setAttribute('autocorrect', 'off');
        this.editorEl.setAttribute('autocapitalize', 'off');
        this.editorEl.setAttribute('translate', 'no');
        this.editorEl.setAttribute('aria-multiline', 'true');
        this.editorEl.setAttribute('aria-autocomplete', 'list');
        this.editorEl.addEventListener('click', (event) => {
            Array.from(this.editorEl.querySelectorAll('.selected')).forEach(el => el.classList.remove('selected'));
            this.selectionEl.innerHTML = '';
            inlineBtn.disabled = true;
            removeBtn.disabled = true;
            if (event.target instanceof HTMLElement && (event.target as HTMLElement).hasAttribute('data-nid')) {
                const nid = event.target.getAttribute('data-nid')!;
                const node = this._nodeIdHolder.node(nid);
                console.log(node);
                this.selectionEl.innerHTML = `<div><span class="label">${node.type}</span><span>${node.type === esprima.Syntax.Identifier ? (node as ESTree.Identifier).name : ''}</span></div>`;
                if (this._active) {
                    this._active.classList.remove('active');
                }
                this._active = event.target;
                this._active.classList.add('active');
                this._active.classList.add('selected');
                if (node.type === esprima.Syntax.Identifier) {
                    removeBtn.disabled = false;
                    if (node.parent /*&& (node.parent.type !== esprima.Syntax.VariableDeclarator || (node.parent as ESTree.VariableDeclarator).id !== node)*/) {
                        inlineBtn.disabled = false;
                    }
                    findIdentifierUsage(node as ESTree.Identifier).forEach(n => {
                        const nnid = this._nodeIdHolder.getId(n);
                        if (nnid) {
                            const nel = this.editorEl.querySelector(`[data-nid="${nnid}"]`);
                            if (nel) {
                                nel.classList.add('selected');
                            }
                        }
                    });
                }
            }
        });
        this.editorEl.addEventListener('blur', () => {
            if (this.editorEl.innerText !== this._code) {
                this.refresh();
            }
        });
        // this.editorEl.addEventListener('keyup', (event) => {
        //     if (event.ctrlKey && event.key === 'z') {
        //         if (this._history.length > 0) {
        //             this._code = this._history.pop()!;
        //             this.editorEl.innerText = this._code;
        //             this.refresh();
        //         }
        //     }
        // })
        this.historyEl.addEventListener('click', (e) => {
            if((e.target as Node).nodeName === 'BUTTON' && (e.target as HTMLButtonElement).getAttribute('data-role') === 'apply') {
                (e.target as HTMLButtonElement).closest('div[data-role="history-item"]').remove();
                this.applyHistory((e.target as HTMLButtonElement).getAttribute('data-id'));
            }
        });
        this.root.querySelector('#refreshBtn')?.addEventListener('click', () => {
            this.refresh();
        });
        this.root.querySelector('#diffSourceBtn')?.addEventListener('click', () => {
            this.diffSource();
        });
        removeBtn.addEventListener('click', () => {
            const node = this._nodeIdHolder.node(this._active?.getAttribute('data-nid')!) as ESTree.Identifier;
            if (isIdOfParent(node)) {
                removeIdentifierIfUnused((node.parent as ESTree.VariableDeclarator).id);
            } else {
                return;
            }
            this.renderAst(this.program!);
        });
        inlineBtn.addEventListener('click', () => {// TODO: 带参数方法
            const node = this._nodeIdHolder.node(this._active?.getAttribute('data-nid')!) as ESTree.Identifier;
            if (node.parent?.type === esprima.Syntax.FunctionDeclaration) {
                inlineFunction(node, this.program!);
            } else if (node.parent?.type === esprima.Syntax.CallExpression) {
                inlineExpression(node, this.program!);
            } else if (node.parent?.type === esprima.Syntax.AssignmentExpression) {
                if ((node.parent as ESTree.AssignmentExpression).right === node) {
                    inlineReference(node, (node.parent as ESTree.AssignmentExpression).left, closestBlock(node)!);
                } else {
                    inlineIdentifierReference(node);
                }
            } else if (node.parent?.type === esprima.Syntax.VariableDeclarator) {
                if ((node.parent as ESTree.VariableDeclarator).init === node) {
                    inlineReference(node, (node.parent as ESTree.VariableDeclarator).id!, closestBlock(node)!);
                } else {
                    inlineIdentifierReference(node);
                }
            } else {
                inlineIdentifier(node, this.program!);
            }
            this.renderAst(this.program!);
        });
        this.root.querySelector('#hexadecimalBtn')?.addEventListener('click', () => {
            hexadecimal(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#evalConstantBtn')?.addEventListener('click', () => {
            evalConstantExpressionsAll(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#stringArrayTransformBtn')?.addEventListener('click', () => {
            stringArrayTransformations(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#simplifyBtn')?.addEventListener('click', () => {
            simplifyAll(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#computedToDotBtn')?.addEventListener('click', () => {
            computedToDotAll(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#controlFlowFlatteningBtn')?.addEventListener('click', () => {
            controlFlowFlatteningAll(this.program!);
            this.renderAst(this.program!);
        });
        this.root.querySelector('#inlineConstantsBtn')?.addEventListener('click', () => {
            inlineConstantsAll(this.program!);
            this.renderAst(this.program!);
        });
    }

    wrapNode(code: string, clazz: string, node: EsNode) {
        return `<span class="${clazz}" data-nid="${this._nodeIdHolder.nid(node)}">${escapeHtml(code)}</span>`;
    }

    writeRaw(code: string): string {
        if (code === '`') {
            return `<span class="${nodeCssClasses.template}">${code}</span>`
        }
        return escapeHtml(code);
    }

    writeKeyword(code: string): string {
        return `<span class="${nodeCssClasses.keyword}">${code}</span>`
    }

    writeLineEnd(): string {
        return '</div><div class="ͼline">'
    }

    writeNode(code: string, node: EsNode): string {
        switch (node.type) {
            case esprima.Syntax.TemplateElement: {
                return this.wrapNode(code, nodeCssClasses.template, node);
            }
            case esprima.Syntax.FunctionExpression:
            case esprima.Syntax.FunctionDeclaration: {
                return this.wrapNode(code, nodeCssClasses.keyword, node);
            }
            case esprima.Syntax.Identifier: {
                if ((node as ESTree.Identifier).name === 'undefined') {
                    return `undefined`;
                }
                const highlight = node.parent && (
                    (node.parent.type === esprima.Syntax.VariableDeclarator && (node.parent as ESTree.VariableDeclarator).id === node)
                    || ((node.parent.type === esprima.Syntax.FunctionExpression || node.parent.type === esprima.Syntax.FunctionDeclaration || node.parent.type === esprima.Syntax.ArrowFunctionExpression) && (node.parent as ESTree.Function).params.indexOf(node as ESTree.Pattern) !== -1)
                    || (node.parent.type === esprima.Syntax.FunctionDeclaration && (node.parent as ESTree.FunctionDeclaration).id === node)
                );
                return this.wrapNode(code, highlight ? nodeCssClasses.identity : '', node);
            }
            case esprima.Syntax.ThisExpression:
            case esprima.Syntax.Super:
            case esprima.Syntax.ClassDeclaration:
            case esprima.Syntax.DebuggerStatement: {
                return this.wrapNode(code, nodeCssClasses.keyword, node);
            }
            case esprima.Syntax.Literal: {
                const val = (node as ESTree.Literal).value;
                const type = typeof val;
                if (type === 'object') {
                    if (val instanceof RegExp) {
                        return this.wrapNode(code, nodeCssClasses.regex, node);
                    }
                    if (val === null) {
                        return this.wrapNode(code, nodeCssClasses.keyword, node);
                    }
                }
                return this.wrapNode(code, nodeCssClasses[typeof (node as ESTree.Literal).value], node);
            }
            default:
                console.log('unknown type', node.type);
                return this.wrapNode(code, `ͼunknown`, node);
        }
    }

    refresh() {
        const code = this.editorEl.innerText;
        // this.program = esprima.parseScript(code);
        // @ts-ignore
        this.program = acorn.parse(code, {ecmaVersion: 'latest'}) as EsNode;
        applyAstParent(this.program);
        console.log(this.program);
        this.renderAst(this.program);
    }

    renderAst(program: ESTree.Node) {
        this._nodeIdHolder.reset();
        const lineSeparator = '</div><div class="ͼline">';
        const astCode = astring.generate(program, {
            // sourceMap: new sourceMap.SourceMapGenerator({
            //     // Source file name must be set and will be used for mappings
            //     file: 'script.js',
            // }),
            indent: '    ',
            write: this.writeRaw.bind(this),
            writeNode: this.writeNode.bind(this),
            writeKeyword: this.writeKeyword.bind(this),
            writeLineEnd: this.writeLineEnd.bind(this),
        });
        const result = '<div class="ͼline">' + (astCode.endsWith(lineSeparator) ? astCode.substring(0, astCode.length - lineSeparator.length) : astCode) + '</div>';
        // console.log(result);
        this.editorEl.innerHTML = result;
        const newCode = this.editorEl.innerText.trim();
        if (newCode !== this._code) {
            if (this._code) {
                // this._history.push(this._code);
                this.addHistory(this._code, newCode);
            }
            this._code = newCode;
        }
    }

    diffSource() {
        if (this.sourceInput.value.trim().length > 0) {
            const newCode = astring.generate(acorn.parse(this.sourceInput.value.trim(), {ecmaVersion: 'latest'}) as ESTree.Node, {indent: '    ',}).trim();
            this.diffAndRender(newCode, this.editorEl.innerText.trim(), this.sourceDiffEl);
        }
    }

    addHistory(oldCode: string, newCode: string) {
        const id = new Date().getTime() + '' + Math.trunc(Math.random() * 1000);
        this._history[id] = oldCode;
        const item = this.diffAndRender(oldCode, newCode, this.historyEl);
        item.setAttribute('data-id', id);
        const footerEl = document.createElement('footer');
        footerEl.className = 'card-footer';
        const applyBtn = document.createElement('button');
        applyBtn.classList.add('card-footer-item');
        applyBtn.setAttribute('data-role', 'apply');
        applyBtn.setAttribute('data-id', id);
        applyBtn.innerText = 'Apply';
        footerEl.appendChild(applyBtn);
        item.appendChild(footerEl);
    }

    applyHistory(id:string) {
        const code = this._history[id];
        delete this._history[id];
        if(code) {
            this.setValue(code);
        }
    }

    diffAndRender(oldCode: string, newCode: string, container: HTMLElement): HTMLDivElement {
        const diffResult = diff.diffLines(oldCode, newCode);
        const fragment = document.createDocumentFragment();
        let span: HTMLSpanElement;
        diffResult.forEach(part => {
            const color = part.added ? 'green' :
                part.removed ? 'red' : 'grey';
            span = document.createElement('span');
            span.style.color = color;
            span.appendChild(document
                .createTextNode(part.value));
            fragment.appendChild(span);
        });
        const item = document.createElement('div');
        item.setAttribute('data-role', 'history-item');
        item.classList.add('card');
        const contentEl = document.createElement('div');
        contentEl.className = 'card-content';
        contentEl.append(fragment);
        item.appendChild(contentEl);
        container.appendChild(item);
        return item;
    }

    setValue(code: string) {
        this.editorEl.innerText = code;
        this.refresh();
    }
}

const editor = new Editor(document.getElementById('root')!);
