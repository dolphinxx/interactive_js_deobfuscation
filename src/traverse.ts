import * as ESTree from 'estree';
import {MemberExpression} from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import * as acorn from "acorn";
import {
    applyAstParent,
    arithmetic,
    cloneNode,
    closestBlock, getRemovableParentNode,
    isEmptyBlockOrStatement,
    isIdentifierIdentical,
    isLiteral,
    isLiteralEquals,
    isNameEquals,
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

// export function evalObfuscatedString(evalCode: string | null, root: EsNode) {
//     // @ts-ignore
//     const fn = ((acorn.parse(evalCode, {ecmaVersion: 'latest'}) as ESTree.Program).body.find(_ => _.type === esprima.Syntax.FunctionDeclaration) as ESTree.FunctionDeclaration).id!.name;
//     if (!fn) {
//         globalThis.logDebug(`evalObfuscatedString fn not found`);
//         return;
//     }
//     globalThis.logDebug(`evalObfuscatedString fn=${fn}`);
//     const func = eval(`(function () {
//         ${evalCode};
//         return ${fn}
//     }())`);
//
//     // collect refers to fn
//     const alias: string[] = [fn];
//     const aliasNodes: EsNode[] = [];
//     traverse(root, {
//         enter(n: EsNode) {
//             if (n.type === esprima.Syntax.AssignmentExpression) {
//                 const ass = n as ESTree.AssignmentExpression;
//                 if (ass.right.type === esprima.Syntax.Identifier && ass.left.type === esprima.Syntax.Identifier) {
//                     const assRight = ass.right as ESTree.Identifier;
//                     const assLeft = ass.left as ESTree.Identifier;
//                     if (alias.indexOf(assRight.name) !== -1) {
//                         alias.push(assLeft.name);
//                         aliasNodes.push(getRemovableParentNode(assLeft));
//                     }
//                 }
//                 return;
//             }
//             if (n.type === esprima.Syntax.VariableDeclarator) {
//                 const dec = n as ESTree.VariableDeclarator;
//                 if (dec.id.type === esprima.Syntax.Identifier && dec.init?.type === esprima.Syntax.Identifier) {
//                     const decLeft = dec.id as ESTree.Identifier;
//                     const decRight = dec.init as ESTree.Identifier;
//                     if (alias.indexOf(decRight.name) !== -1) {
//                         alias.push(decLeft.name);
//                         aliasNodes.push(getRemovableParentNode(decLeft));
//                     }
//                 }
//             }
//         }
//     });
//
//     replace(root, {
//         leave(n: EsNode) {
//             if (n.type === esprima.Syntax.CallExpression) {
//                 const c = n as ESTree.CallExpression;
//                 if (c.callee.type === esprima.Syntax.Identifier && c.arguments.length === 2 && c.arguments[0].type === esprima.Syntax.Literal && c.arguments[1].type === esprima.Syntax.Literal) {
//                     const callee = c.callee as ESTree.Identifier;
//                     if (alias.indexOf(callee.name) !== -1) {
//                         const val = func((c.arguments[0] as ESTree.Literal).value, (c.arguments[1] as ESTree.Literal).value);
//                         globalThis.logDebug('evalObfuscatedString', n, val);
//                         return newLiteral(val, n.parent);
//                     }
//                 }
//             }
//         }
//     });
//     replace(root, {
//         enter(n: EsNode) {
//             if (aliasNodes.indexOf(n) !== -1) {
//                 (this as Controller).remove();
//                 globalThis.logDebug('evalObfuscatedString remove variable', n);
//             }
//         }
//     });
// }

export function flattenHashedMember(root: EsNode) {
    const objs: ESTree.Identifier[] = [];
    traverse(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && n.parent?.type === esprima.Syntax.VariableDeclarator && (n.parent as ESTree.VariableDeclarator).init?.type === esprima.Syntax.ObjectExpression) {
                const obj = (n.parent as ESTree.VariableDeclarator).init as ESTree.ObjectExpression;
                // All the property keys are string literals and property values are literals or functions
                if (obj.properties.every(p => p.type === esprima.Syntax.Property && isStringLiteral((p as ESTree.Property).key) && ((p as ESTree.Property).value.type === esprima.Syntax.Literal || ((p as ESTree.Property).value.type === esprima.Syntax.FunctionExpression && ((p as ESTree.Property).value as ESTree.FunctionExpression).body.body.length === 1 && ((p as ESTree.Property).value as ESTree.FunctionExpression).body.body[0].type === esprima.Syntax.ReturnStatement)))) {
                    objs.push(n as ESTree.Identifier);
                }
            }
        }
    });
    if (objs.length === 0) {
        return;
    }
    for (let objId of objs) {
        const objName = objId.name;
        const props: { [key: string]: EsNode } = {};
        ((objId.parent as ESTree.VariableDeclarator).init as ESTree.ObjectExpression).properties.forEach(p => {
            props[((p as ESTree.Property).key as ESTree.Literal).value as string] = (p as ESTree.Property).value;
        });
        const rt = closestBlock(objId);
        replace(rt!, {
            leave(n: EsNode) {
                // function with single line operation
                if (n.type === esprima.Syntax.CallExpression && (n as ESTree.CallExpression).callee.type === esprima.Syntax.MemberExpression) {
                    const callExpr = n as ESTree.CallExpression;
                    const callee = callExpr.callee as ESTree.MemberExpression;
                    // is a computed member expression, and object name equals to objName, and property is a string literal
                    if (callee.computed && isIdentifierIdentical(callee.object, objName) && isStringLiteral(callee.property)) {
                        const propVal = (props[(callee.property as ESTree.Literal).value as string] as ESTree.FunctionExpression);
                        const paramsMap: { [key: string]: EsNode } = {};
                        propVal.params.forEach((p, i) => {
                            paramsMap[(p as ESTree.Identifier).name] = callExpr.arguments[i];
                        });
                        // replace with the returning argument
                        const funcBodyExpr = cloneNode((propVal.body.body[0] as ESTree.ReturnStatement).argument!, n.parent);
                        replaceIdentifiers(funcBodyExpr, paramsMap);
                        globalThis.logDebug('flattenHashedMember Call', objName, n);
                        return funcBodyExpr;
                    }
                    return;
                }
                if (n.type === esprima.Syntax.MemberExpression) {
                    const memberExpr = n as ESTree.MemberExpression;
                    // is a computed member expression, and the object name equals to objName, and the property is a string literal
                    if (memberExpr.computed && isIdentifierIdentical(memberExpr.object, objName) && isStringLiteral(memberExpr.property)) {
                        const propVal = props[(memberExpr.property as ESTree.Literal).value as string];
                        if (propVal === undefined) {// missing prop value
                            return;
                        }
                        if (propVal.type === esprima.Syntax.FunctionExpression) {
                            // function expression should be handled by CallExpression handler
                            return;
                        }
                        // replace with the prop value literal
                        const value = cloneNode(propVal, n.parent);
                        globalThis.logDebug('flattenHashedMember', objName, n);
                        return value;
                    }
                }
            }
        });
    }
    // remove obj declaration if unused
    for (const objId of objs) {
        removeIdentifierIfUnused(objId);
    }
}

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

/**
 * unshuffle a block that is shuffled by a while(true) and a switch/case block, and a string(ie "0|2|5|3|4|1") hold the order.
 * @param root
 */
export function unshuffleWhileSwitch(root: EsNode) {
    // collect
    const nodes: EsNode[] = [];
    traverse(root, {
        enter(n: EsNode) {
            // find the while statement
            if (n.type === esprima.Syntax.WhileStatement) {
                const whileStmt = n as ESTree.WhileStatement;
                // ensure the test of the while statement is true, and the body of the while statement is a block
                if (whileStmt.test.type !== esprima.Syntax.Literal || (whileStmt.test as ESTree.Literal).value !== true || whileStmt.body.type !== esprima.Syntax.BlockStatement) {
                    return;
                }
                if (whileStmt.parent?.type !== esprima.Syntax.BlockStatement) {
                    return;
                }
                const parent = whileStmt.parent as ESTree.BlockStatement;
                if (parent.body.length != 2) {
                    return;
                }
                if (parent.body[0].type !== esprima.Syntax.VariableDeclaration) {
                    return;
                }
                const dec = parent.body[0] as ESTree.VariableDeclaration;
                if (dec.declarations.length != 2) {
                    return;
                }
                if (dec.declarations[0].init?.type !== esprima.Syntax.CallExpression) {
                    return;
                }
                const callee = (dec.declarations[0].init as ESTree.CallExpression).callee;
                if (callee.type !== esprima.Syntax.MemberExpression) {
                    return;
                }
                // ensure order-holding string
                if (!isStringLiteral(callee.object) || !/^\d[\d|]+\d$/.test((callee.object as ESTree.Literal).value as string)) {
                    return;
                }
                // a split call
                if (!isNameEquals('split', callee.property)) {
                    return false;
                }
                // with an init of 0
                if (!isLiteralEquals(0, dec.declarations[1].init)) {
                    return false;
                }

                const block = whileStmt.body as ESTree.BlockStatement;
                if (block.body.length !== 2 || block.body[0].type !== esprima.Syntax.SwitchStatement || block.body[1].type !== esprima.Syntax.BreakStatement) {
                    return;
                }
                const switchStmt = block.body[0] as ESTree.SwitchStatement;
                // ensure the type of each case test is numeric string
                if (!switchStmt.cases.every(c => c.test?.type === esprima.Syntax.Literal && typeof (c.test as ESTree.Literal).value === 'string' && /^\d+$/.test((c.test as ESTree.Literal).value as string))) {
                    return;
                }
                // confirmed
                nodes.push(parent);
            }
        }
    });

    replace(root, {
        leave(n: EsNode) {
            if (!nodes.includes(n)) {
                return;
            }
            const dec0 = ((n as ESTree.BlockStatement).body[0] as ESTree.VariableDeclaration).declarations[0];
            const whileStmt = (n as ESTree.BlockStatement).body[1] as ESTree.WhileStatement;
            const orderStr = (((dec0.init as ESTree.CallExpression).callee as MemberExpression).object as ESTree.Literal).value as string;
            const orders = orderStr.split('|');
            const map: { [key: string]: ESTree.SwitchCase } = {};
            ((whileStmt.body as ESTree.BlockStatement).body[0] as ESTree.SwitchStatement).cases.forEach(_ => map[(_.test as ESTree.Literal).value as string] = _);
            (n as ESTree.BlockStatement).body = orders.map(o => {
                return map[o].consequent.filter(c => c.type !== esprima.Syntax.ContinueStatement).map(c => {
                    c.parent = n;
                    return c;
                });
            }).flat();
            (this as Controller).skip();
        }
    })
}
