import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import {
    applyAstParent,
    arithmetic,
    cloneNode,
    closestBlock,
    isEmptyBlockOrStatement,
    isIdentifierIdentical,
    isLiteral,
    isStringLiteral, newIdentifier, newLiteral, newThrow, removeIdentifierIfUnused,
    replaceIdentifiers,
} from "./util";

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

export function removeFunctionIfUnused(node: EsNode) {
    // TODO
}

export function evalConstantExpressions(root: EsNode) {
    replace(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.UnaryExpression) {
                const arg = (n as ESTree.UnaryExpression).argument;
                if ((n as ESTree.UnaryExpression).operator === '!') {
                    // !0, !true, !'', ...
                    if (arg.type === esprima.Syntax.Literal) {
                        const value = newLiteral(!Boolean((arg as ESTree.Literal).value), n.parent);
                        globalThis.logDebug('evalConstantExpressions', n, value);
                        return value;
                    }
                    // ![]
                    if (arg.type === esprima.Syntax.ArrayExpression && (arg as ESTree.ArrayExpression).elements.length === 0) {
                        const value = newLiteral(false, n.parent);
                        globalThis.logDebug('evalConstantExpressions', n, value);
                        return value;
                    }
                    return;
                }
                if ((n as ESTree.UnaryExpression).operator === 'typeof') {
                    // typeof 1, typeof true, ...
                    if (arg.type === esprima.Syntax.Literal) {
                        const value = newLiteral(typeof (arg as ESTree.Literal).value, n.parent);
                        globalThis.logDebug('evalConstantExpressions', n, value);
                        return value;
                    }
                    // typeof window
                    if (arg.type === esprima.Syntax.Identifier && ['window'].indexOf((arg as ESTree.Identifier).name) !== -1) {
                        const value = newLiteral('object', n.parent);
                        globalThis.logDebug('evalConstantExpressions', n, value);
                        return value;
                    }
                    // typeof undefined
                    if (arg.type === esprima.Syntax.Identifier && (arg as ESTree.Identifier).name === 'undefined') {
                        const value = newLiteral('undefined', n.parent);
                        globalThis.logDebug('evalConstantExpressions', n, value);
                        return value;
                    }
                }
            }
            if (n.type === esprima.Syntax.BinaryExpression) {
                const b = n as ESTree.BinaryExpression;
                const operator = b.operator;
                // literal operation
                if (b.left.type === esprima.Syntax.Literal && b.right.type === esprima.Syntax.Literal) {
                    const left = (b.left as ESTree.Literal).value;
                    const right = (b.right as ESTree.Literal).value;
                    const value = newLiteral(arithmetic(left, right, operator), n.parent);
                    globalThis.logDebug('evalConstantExpressions', n, value);
                    return value;
                }
                // same variable comparing
                if (['==', '==='].indexOf(operator) !== -1 && b.left.type === esprima.Syntax.Identifier && b.right.type === esprima.Syntax.Identifier && (b.left as ESTree.Identifier).name === (b.right as ESTree.Identifier).name) {
                    const value = newLiteral(true, n.parent);
                    globalThis.logDebug('evalConstantExpressions', n, value);
                    return value;
                }
                return;
            }
            if (n.type === esprima.Syntax.LogicalExpression) {
                const b = n as ESTree.LogicalExpression;
                const operator = b.operator;
                if (b.left.type === esprima.Syntax.Literal && b.right.type === esprima.Syntax.Literal && (operator === '&&' || operator === '||')) {
                    const left = (b.left as ESTree.Literal).value;
                    const right = (b.right as ESTree.Literal).value;
                    const value = newLiteral(operator === '||' ? (left || right) : (left && right), n.parent);
                    globalThis.logDebug('evalConstantExpressions', n, value);
                    return value;
                }
            }
        }
    })
}


// TODO: simplify apply call

export function simplify(root: EsNode) {
    // constant condition
    replace(root, {
        leave(n: EsNode) {
            // if
            if (n.type === esprima.Syntax.IfStatement) {
                const stmt = n as ESTree.IfStatement;
                if (isLiteral(stmt.test)) {
                    const testVal = (stmt.test as ESTree.Literal).value;
                    if (testVal) {// true
                        return cloneNode(stmt.consequent, n.parent);
                    } else {// false
                        if (stmt.alternate) {
                            return cloneNode(stmt.alternate, n.parent);
                        }
                        globalThis.logDebug('simplify', n);
                        (this as Controller).remove();
                        return;
                    }
                }
                return;
            }
            // while
            if (n.type === esprima.Syntax.WhileStatement) {
                const stmt = n as ESTree.WhileStatement;
                if (isLiteral(stmt.test)) {
                    const testVal = (stmt.test as ESTree.Literal).value;
                    if (testVal) {// true
                        // empty body
                        if (isEmptyBlockOrStatement(stmt.body)) {
                            globalThis.logDebug('simplify', n);
                            // should never enter, so throw an exception
                            return newThrow('infinity loop', n.parent);
                        }
                    } else {// always false
                        globalThis.logDebug('simplify', n);
                        (this as Controller).remove();
                    }
                }
                return;
            }
            // do while
            if (n.type === esprima.Syntax.DoWhileStatement) {
                const stmt = n as ESTree.DoWhileStatement;
                if (isLiteral(stmt.test)) {
                    const testVal = (stmt.test as ESTree.Literal).value;
                    if (testVal) {// true
                        // empty body
                        if (isEmptyBlockOrStatement(stmt.body)) {
                            globalThis.logDebug('simplify', n);
                            // should never enter, so throw an exception
                            return newThrow('infinity loop', n.parent);
                        }
                    } else {// always false
                        globalThis.logDebug('simplify', n);
                        // empty body
                        if (isEmptyBlockOrStatement(stmt.body)) {
                            (this as Controller).remove();
                            return;
                        }
                        // run single time
                        return cloneNode(stmt.body, n.parent);
                    }
                }
                return;
            }
            // conditional
            if (n.type === esprima.Syntax.ConditionalExpression) {
                const stmt = n as ESTree.ConditionalExpression;
                if (isLiteral(stmt.test)) {
                    const testVal = (stmt.test as ESTree.Literal).value;
                    globalThis.logDebug('simplify', n);
                    if (testVal) {// true
                        return cloneNode(stmt.consequent, n.parent);
                    } else {// false
                        return cloneNode(stmt.alternate, n.parent);
                    }
                }
                return;
            }
        }
    })
}

/**
 * convert computed string literal member expression to dot expression
 * @param root
 */
export function computedToDot(root: EsNode) {
    replace(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.MemberExpression && (n as ESTree.MemberExpression).computed && isStringLiteral((n as ESTree.MemberExpression).property) && /^[a-zA-Z][a-zA-Z\d]*$/.test(((n as ESTree.MemberExpression).property as ESTree.Literal).value as string)) {
                const m = n as ESTree.MemberExpression;
                m.computed = false;
                m.property = newIdentifier((m.property as ESTree.Literal).value as string, m);
            }
        }
    });
}
