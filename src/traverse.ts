import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import {copy} from "./copy";
import * as acorn from "acorn";

/**
 * find the closest parent that matches type
 * @param node
 * @param type
 */
export function closest<T extends ESTree.Node>(node: ESTree.Node, type: string | string[]): T | null {
    if (!node.parent) {
        return null;
    }
    if (type instanceof Array && type.indexOf(node.parent.type) !== -1) {
        return node.parent as T;
    }
    if (node.parent.type === type) {
        return node.parent as T;
    }
    return closest(node.parent, type);
}

export function closestBlock(node: EsNode): EsNode | null {
    return closest(node, [esprima.Syntax.Program, esprima.Syntax.BlockStatement, esprima.Syntax.SwitchCase]);
}

export function applyAstParent(node: ESTree.Node) {
    traverse(node, {
        enter(node: EsNode, parent) {
            node.parent = parent;
        }
    });
}

export function findIdentifierUsage(id: ESTree.Identifier): ESTree.Identifier[] {
    const root = closest(id, [esprima.Syntax.BlockStatement, esprima.Syntax.Program]);
    if (!root) {
        throw new Error(`closest block not found for ${id}`);
    }
    const idName = id.name;
    const found: ESTree.Identifier[] = [];
    let start = false;
    traverse(root, {
        enter(n: EsNode) {
            if (n === id) {
                start = true;
                return;
            }
            if (n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === idName) {
                found.push(n as ESTree.Identifier);
            }
        }
    });
    return found;
}

export function cloneNode(node: EsNode, parent: EsNode | null): EsNode {
    const result = copy(node, {excludes: ['parent']});
    applyAstParent(result);
    result.parent = parent;
    return result;
}

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

export function isIdentifierReferenced(node: EsNode, root: EsNode): boolean {
    const name = (node as ESTree.Identifier).name;
    let found = false;
    traverse(root, {
        enter(n: EsNode) {
            if (n !== node && n.type === esprima.Syntax.Identifier && (n as ESTree.Identifier).name === name) {
                found = true;
                (this as Controller).break();
            }
        }
    });
    return found;
}

export function getRemovableParentNode(node: EsNode): EsNode {
    if (node.parent?.type === esprima.Syntax.VariableDeclarator) {
        if (node.parent.parent?.type === esprima.Syntax.VariableDeclaration && (node.parent.parent as ESTree.VariableDeclaration).declarations.length === 1) {
            return node.parent.parent;
        }
        return node.parent;
    }
    return node;
}

export function removeVariableIfUnused(node: EsNode) {
    const root = closestBlock(node);
    if (isIdentifierReferenced(node, root!)) {
        globalThis.logDebug('removeVariableIfUnused failed');
        return;
    }
    const toRemove = getRemovableParentNode(node);
    let done = false;
    replace(root!, {
        enter(n: EsNode) {
            if (done) {
                (this as Controller).break();
                return;
            }
            if (n === toRemove) {
                done = true;
                (this as Controller).remove();
                globalThis.logDebug('removeVariableIfUnused', n);
            }
        }
    });
}

export function removeFunctionIfUnused(node: EsNode) {
    // TODO
}

export function newLiteral(val: any, parent: EsNode | null): ESTree.Literal {
    // @ts-ignore
    let result: EsNode = (acorn.parse(JSON.stringify(val), {ecmaVersion: 'latest'}) as ESTree.Program).body[0];
    if (result.type === esprima.Syntax.ExpressionStatement) {
        result = (result as ESTree.ExpressionStatement).expression as ESTree.Literal;
    }
    result.parent = parent;
    return result as ESTree.Literal;
}

export function newIdentifier(name: string, parent: EsNode | null): ESTree.Identifier {
    return {
        type: esprima.Syntax.Identifier,
        name,
        parent,
    };
}

export function newThrow(msg: string, parent: EsNode | null): ESTree.ThrowStatement {
    const arg = newLiteral(msg, null);
    const result: ESTree.ThrowStatement = {
        type: esprima.Syntax.ThrowStatement,
        parent,
        argument: arg
    };
    arg.parent = result;
    return result;
}

export function evalConstantExpressions(root: EsNode) {
    replace(root, {
        enter(n: EsNode) {
            // write hexadecimal format to decimal format
            if(n.type === esprima.Syntax.Literal && typeof (n as ESTree.Literal).value === 'number') {
                (n as ESTree.Literal).raw = (n as ESTree.Literal).value.toString();
                return;
            }
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
                if (['==', '===', '!=', '!=='].indexOf(operator) !== -1 && b.left.type === esprima.Syntax.Identifier && b.right.type === esprima.Syntax.Identifier && (b.left as ESTree.Identifier).name === (b.right as ESTree.Identifier).name) {
                    const value = newLiteral(operator === '==' || operator === '===', n.parent);
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

export function arithmetic(left: any, right: any, operator: ESTree.BinaryOperator) {
    switch (operator) {
        case "==":
            return left == right;
        case "!=":
            return left != right;
        case "===":
            return left === right;
        case "!==":
            return left !== right;
        case "<":
            return left < right;
        case "<=":
            return left <= right;
        case ">":
            return left > right;
        case ">=":
            return left >= right;
        case "<<":
            return left << right;
        case ">>":
            return left >> right;
        case ">>>":
            return left >>> right;
        case "+":
            return left + right;
        case "-":
            return left - right;
        case "*":
            return left * right;
        case "/":
            return left / right;
        case "%":
            return left % right;
        case "**":
            return left ** right;
        case "|":
            return left | right;
        case "^":
            return left ^ right;
        case "&":
            return left & right;
        case "in":
            return left in right;
        case "instanceof":
            return left instanceof right;
        default:
            throw 'unknown operator:' + operator;
    }
}

export function evalObfuscatedString(evalCode: string, root: EsNode) {
    // @ts-ignore
    const fn = ((acorn.parse(evalCode, {ecmaVersion: 'latest'}) as ESTree.Program).body.find(_ => _.type === esprima.Syntax.FunctionDeclaration) as ESTree.FunctionDeclaration).id!.name;
    if (!fn) {
        globalThis.logDebug(`evalObfuscatedString fn not found`);
        return;
    }
    globalThis.logDebug(`evalObfuscatedString fn=${fn}`);
    const func = eval(`(function () {
        ${evalCode};
        return ${fn}
    }())`);

    // collect refers to fn
    const alias: string[] = [fn];
    const aliasNodes: EsNode[] = [];
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.AssignmentExpression) {
                const ass = n as ESTree.AssignmentExpression;
                if (ass.right.type === esprima.Syntax.Identifier && ass.left.type === esprima.Syntax.Identifier) {
                    const assRight = ass.right as ESTree.Identifier;
                    const assLeft = ass.left as ESTree.Identifier;
                    if (alias.indexOf(assRight.name) !== -1) {
                        alias.push(assLeft.name);
                        aliasNodes.push(getRemovableParentNode(assLeft));
                    }
                }
                return;
            }
            if (n.type === esprima.Syntax.VariableDeclarator) {
                const dec = n as ESTree.VariableDeclarator;
                if (dec.id.type === esprima.Syntax.Identifier && dec.init?.type === esprima.Syntax.Identifier) {
                    const decLeft = dec.id as ESTree.Identifier;
                    const decRight = dec.init as ESTree.Identifier;
                    if (alias.indexOf(decRight.name) !== -1) {
                        alias.push(decLeft.name);
                        aliasNodes.push(getRemovableParentNode(decLeft));
                    }
                }
            }
        }
    });

    replace(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.CallExpression) {
                const c = n as ESTree.CallExpression;
                if (c.callee.type === esprima.Syntax.Identifier && c.arguments.length === 2 && c.arguments[0].type === esprima.Syntax.Literal && c.arguments[1].type === esprima.Syntax.Literal) {
                    const callee = c.callee as ESTree.Identifier;
                    if (alias.indexOf(callee.name) !== -1) {
                        const val = func((c.arguments[0] as ESTree.Literal).value, (c.arguments[1] as ESTree.Literal).value);
                        globalThis.logDebug('evalObfuscatedString', n, val);
                        return newLiteral(val, n.parent);
                    }
                }
            }
        }
    });
    replace(root, {
        enter(n: EsNode) {
            if (aliasNodes.indexOf(n) !== -1) {
                (this as Controller).remove();
                globalThis.logDebug('evalObfuscatedString remove variable', n);
            }
        }
    });
}

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
                        if(propVal === undefined) {// missing prop value
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
        removeVariableIfUnused(objId);
    }
}

export function replaceIdentifiers(root: EsNode, map: { [key: string]: EsNode }) {
    replace(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && map.hasOwnProperty((n as ESTree.Identifier).name)) {
                return cloneNode(map[(n as ESTree.Identifier).name], n.parent);
            }
        }
    })
}

export function isLiteral(node: EsNode|null): boolean {
    return node != null && node.type === esprima.Syntax.Literal;
}

export function isStringLiteral(node: EsNode|null): boolean {
    return node != null && node.type === esprima.Syntax.Literal && typeof (node as ESTree.Literal).value === 'string';
}

export function isIdentifierIdentical(node: EsNode|null, name: string): boolean {
    return node != null && node.type === esprima.Syntax.Identifier && (node as ESTree.Identifier).name === name;
}

export function isEmptyBlockOrStatement(root: EsNode): boolean {
    if (root.type === esprima.Syntax.EmptyStatement) {
        return true;
    }
    if (root.type === esprima.Syntax.BlockStatement) {
        for (const b of (root as ESTree.BlockStatement).body) {
            if (!isEmptyBlockOrStatement(b)) {
                return false;
            }
        }
        return true;
    }
    return false;
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
