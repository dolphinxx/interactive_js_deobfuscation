import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import {applyAstParent, cloneNode, closestBlock} from "./util";

export function evalFunction(node: EsNode): EsNode {
    let code = astring.generate(node);
    code = `(${code}())`;
    globalThis.logDebug(code);
    const val = eval(code);
    globalThis.logDebug(val);
    return esprima.parseScript(JSON.stringify(val)).body[0];
}

export function evalExpression(node: EsNode): EsNode {
    if (node.type === esprima.Syntax.FunctionExpression || node.type === esprima.Syntax.FunctionDeclaration) {
        return evalFunction(node);
    }
    let code = astring.generate(node);
    globalThis.logDebug(code);
    const val = eval(code);
    globalThis.logDebug(val);
    let result: EsNode = esprima.parseScript(JSON.stringify(val)).body[0];
    if (result.type === esprima.Syntax.ExpressionStatement) {
        result = (result as ESTree.ExpressionStatement).expression;
    }
    return result;
}

export function inlineFunction(id: ESTree.Identifier, root: ESTree.Node) {
    const name = id.name;
    let val: EsNode | undefined;
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === name) {
                if (n.parent?.type === esprima.Syntax.FunctionDeclaration) {
                    val = evalFunction((n.parent as ESTree.FunctionDeclaration));
                    return;
                }
                if (n.parent?.type === esprima.Syntax.AssignmentExpression) {
                    if ((n.parent as ESTree.AssignmentExpression).right.type === esprima.Syntax.FunctionExpression) {
                        val = evalFunction((n.parent as ESTree.AssignmentExpression).right as ESTree.FunctionExpression);
                        return;
                    }
                }
            }
            if (n === id) {
                (this as Controller).break();
            }
        }
    });
    if (val === undefined) {
        alert('not found, inlineFunction');
        return;
    }
    applyAstParent(val);
    replace(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.CallExpression) {
                const callee = (n as ESTree.CallExpression).callee;
                if (callee.type === esprima.Syntax.Identifier && (callee as ESTree.Identifier).name === name) {
                    const value = cloneNode(val!, n.parent);
                    globalThis.logDebug('inlineFunction', n);
                    return value;
                }
            }
        }
    })
}

export function inlineIdentifier(id: ESTree.Identifier, root: ESTree.Node) {
    const name = id.name;
    let val: EsNode | undefined;
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === name) {
                if (n.parent?.type === esprima.Syntax.VariableDeclarator) {
                    val = evalExpression((n.parent as ESTree.VariableDeclarator).init!);
                    return;
                }
            }
            if (n === id) {
                (this as Controller).break();
            }
        }
    });
    if (val === undefined) {
        alert('not found, inlineIdentifier');
        return;
    }
    let done = false;
    replace(root, {
        enter(n: EsNode) {
            if (n === id) {
                done = true;
                globalThis.logDebug('inlineIdentifier', n);
                return cloneNode(val!, n.parent);
            }
            if (done) {
                (this as Controller).break();
            }
        }
    })
}

export function inlineIdentifierReference(id: ESTree.Identifier) {
    const name = id.name;
    let val: EsNode | undefined;
    const root = closestBlock(id);
    if (id.parent?.type === esprima.Syntax.VariableDeclarator) {
        val = (id.parent as ESTree.VariableDeclarator).init!;
    } else if (id.parent?.type === esprima.Syntax.AssignmentExpression) {
        val = (id.parent as ESTree.AssignmentExpression).right;
    }
    let start = false;
    replace(root!, {
        enter(n: EsNode) {
            if (n === id) {
                start = true;
                return;
            }
            if (!start) {
                return;
            }
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === name) {
                const value = cloneNode(val!, n.parent);
                globalThis.logDebug('inlineIdentifierReference', n);
                return value;
            }
        },
    });
}

export function inlineExpression(id: ESTree.Identifier, root: ESTree.Node) {
    const name = id.name;
    let val: EsNode | undefined;
    let right: EsNode | undefined;
    let outScope = false;
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === name) {
                if (!outScope && n.parent?.type === esprima.Syntax.AssignmentExpression) {
                    right = (n.parent as ESTree.AssignmentExpression).right!;
                    // val = evalExpression(right!);
                    return;
                }
                if (!outScope && n.parent?.type === esprima.Syntax.VariableDeclarator) {
                    right = (n.parent as ESTree.VariableDeclarator).init!;
                    // val = evalExpression(right!);
                    return;
                }
                if (n.parent?.type === esprima.Syntax.FunctionDeclaration) {
                    right = (n.parent as ESTree.FunctionDeclaration);
                    // val = evalExpression(right!);
                    return;
                }
            }
            if (n === id) {
                outScope = true;
            }
        }
    });
    if (right === undefined) {
        alert('not found, inlineExpression');
        return;
    }
    val = evalExpression(right);
    let done = false;
    replace(root, {
        enter(n: EsNode) {
            if (n === id.parent) {
                done = true;
                const value = cloneNode(val!, n.parent);
                globalThis.logDebug('inlineExpression', n);
                return value;
            }
            if (done) {
                (this as Controller).break();
            }
        }
    });
    if (!done) {
        alert('not found, inlineExpression, replace');
    }
}

/**
 * replace ref with actual under root scope
 * @param actual
 * @param ref
 * @param root
 */
export function inlineReference(actual: EsNode, ref: EsNode, root: EsNode) {
    const refName = (ref as ESTree.Identifier).name;
    let start = false;
    replace(root, {
        enter(n: EsNode) {
            if (n === actual) {
                start = true;
                return;
            }
            if (!start) {
                return;
            }
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === refName) {
                if ((n.parent?.type != esprima.Syntax.AssignmentExpression && n.parent?.type !== esprima.Syntax.AssignmentPattern) || (n.parent as ESTree.AssignmentExpression | ESTree.AssignmentPattern).left !== n) {
                    globalThis.logDebug('inlineReference', n);
                    return cloneNode(actual, n.parent);
                }
            }
        }
    });
}
