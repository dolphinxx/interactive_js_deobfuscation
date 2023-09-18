import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import {
    arithmetic, binaryOperate,
    cloneNode,
    closestBlock,
    evaluate,
    getKey,
    getRemovableParentNode, isEmptyBlockOrStatement,
    isFinal,
    isIdentifierIdentical,
    isIdentifierReferenced, isLiteral,
    isLiteralEquals,
    isLiteralLike,
    isNameEquals,
    isNumber,
    isStringLiteral,
    newLiteral, newThrow,
    removeIdentifierIfUnused,
    replaceIdentifiers,
    unary
} from "./util";
import {findStringArrayDecodeFunction, findStringArrayFunction, findStringArrayRotateExpr} from "./string-array-helper";

export function stringArrayTransformations(root: EsNode) {
    if (!(root as { body?: ESTree.Statement[] })?.body || !((root as { body?: ESTree.Statement[] })?.body instanceof Array)) {
        // root is not a Program
        globalThis.logDebug('stringTransformations - root is not a Program');
        return;
    }

    for(let i = 0;i < 10;i++) {
        if(!stringArrayCallsTransform(root)) {
            break;
        }
    }

    const rootBody: ESTree.Statement[] = (root as { body?: ESTree.Statement[] })!.body!;

    const {versionVariableId, stringArrayFn} = findStringArrayFunction(rootBody);

    if (!stringArrayFn) {
        globalThis.logDebug('stringTransformations - stringArrayFn not found');
        return;
    }
    const stringArrayFnId = stringArrayFn.id!.name;

    const decodeFn = findStringArrayDecodeFunction(stringArrayFnId, rootBody);
    if (!decodeFn) {
        globalThis.logDebug('stringTransformations - decodeFn not found');
        return;
    }
    const decodeFnId = decodeFn.id!.name;


    const rotateExpr = findStringArrayRotateExpr(stringArrayFnId, decodeFnId, rootBody);
    const evalNodes: EsNode[] = [stringArrayFn, decodeFn];
    if (rotateExpr) {
        evalNodes.push(rotateExpr);
    }
    if (versionVariableId) {
        const versionVariable = rootBody.find(n => n.type === esprima.Syntax.VariableDeclaration && n.declarations.find(nn => isIdentifierIdentical(nn.id, versionVariableId!)));
        if (versionVariable) {
            evalNodes.unshift(versionVariable);
        }
    }
    const evalCode = astring.generate({
        type: esprima.Syntax.Program,
        body: evalNodes,
    } as ESTree.Program);

    // remove the nodes to eval
    (root as { body: ESTree.Statement[] }).body = (root as { body: ESTree.Statement[] }).body.filter(n => n !== stringArrayFn && n !== decodeFn && n !== rotateExpr);

    const func = eval(`(function () {
        ${evalCode};
        return ${decodeFnId}
    }())`) as Function;

    stringArrayFunctionWrappers(decodeFnId, root);

    // collect refers to the decodeFn
    const alias: string[] = [decodeFnId];
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
                if (c.callee.type === esprima.Syntax.Identifier && alias.includes((c.callee as ESTree.Identifier).name) && c.arguments.every(a => isLiteralLike(a))) {
                    const val = func.apply(null, c.arguments.map(a => evaluate(a)));
                    globalThis.logDebug('evalObfuscatedString', n, val);
                    return newLiteral(val, n.parent);
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
    for(let i = 0;i < 10;i++) {
        if(!stringArrayCallsTransform(root)) {
            break;
        }
    }
}

type ParamsAndReturn = {
    params: string[];
    rt: ESTree.ReturnStatement;
}

/**
 * String Array Calls Transform
 * @param root
 */
export function stringArrayCallsTransform(root: EsNode):boolean {
    // Find the map
    // All the property values should be numeric literals.
    const hashes: { scope: EsNode, node: ESTree.VariableDeclarator, id: string, props: { [key: string]: EsNode | ParamsAndReturn } }[] = [];
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.VariableDeclarator && (n as ESTree.VariableDeclarator).id.type === esprima.Syntax.Identifier && (n as ESTree.VariableDeclarator).init?.type === esprima.Syntax.ObjectExpression) {
                if (!((n as ESTree.VariableDeclarator).init as ESTree.ObjectExpression).properties.every(o => {
                    if (o.type !== esprima.Syntax.Property) {
                        return false;
                    }
                    // key is an identifier or a literal
                    if (o.key.type !== esprima.Syntax.Identifier && !isStringLiteral(o.key)) {
                        return false;
                    }
                    // value is a literal
                    if (isLiteralLike(o.value)) {
                        return true;
                    }
                    // or a simple function
                    if (o.value.type === esprima.Syntax.FunctionExpression && (o.value as ESTree.FunctionExpression).body.body.length === 1 && (o.value as ESTree.FunctionExpression).body.body[0].type === esprima.Syntax.ReturnStatement) {
                        // TODO: ensure that the function body should not contain any identifier that is not present in the param list.
                        return true;
                    }
                    return false;
                })) {
                    return;
                }
                if (!isFinal((n as ESTree.VariableDeclarator).id as ESTree.Identifier, closestBlock(n))) {
                    return;
                }
                // cache the props of the ObjectExpression
                const props: { [key: string]: EsNode | ParamsAndReturn } = {};
                ((n as ESTree.VariableDeclarator).init as ESTree.ObjectExpression).properties.forEach(o => {
                    const p = o as ESTree.Property;
                    const key = getKey(p.key);
                    if (p.value.type === esprima.Syntax.FunctionExpression) {
                        props[key] = {
                            params: p.value.params.map(param => (param as ESTree.Identifier).name),
                            rt: p.value.body.body[0] as ESTree.ReturnStatement,
                        };
                        return;
                    }
                    props[key] = p.value;
                });
                hashes.push({
                    scope: closestBlock(n)!,
                    node: n as ESTree.VariableDeclarator,
                    id: ((n as ESTree.VariableDeclarator).id as ESTree.Identifier).name as string,
                    props,
                });
            }
        }
    });
    if(hashes.length === 0) {
        return false;
    }
    let modified = false;
    for (const h of hashes) {
        replace(h.scope, {
            leave(n: EsNode) {
                // find the call expression
                if (n.type === esprima.Syntax.CallExpression && (n as ESTree.CallExpression).callee.type === esprima.Syntax.MemberExpression && isIdentifierIdentical(((n as ESTree.CallExpression).callee as ESTree.MemberExpression).object, h.id)) {
                    const propName = getKey(((n as ESTree.CallExpression).callee as ESTree.MemberExpression).property);
                    if(typeof propName !== 'string') {
                        return;
                    }
                    if (Object.hasOwnProperty.call(h.props, propName)) {
                        const propVal = h.props[propName] as ParamsAndReturn;
                        let funcBodyExpr = cloneNode(propVal.rt.argument!, n.parent);
                        const paramsMap: { [key: string]: EsNode } = {};
                        (n as ESTree.CallExpression).arguments.forEach((a, i) => {
                            paramsMap[propVal.params[i]] = a;
                        })
                        // replace identifiers in the returning expression with the call arguments.
                        replaceIdentifiers(funcBodyExpr, paramsMap);
                        if(funcBodyExpr.type === esprima.Syntax.BinaryExpression && isLiteralLike(funcBodyExpr)) {
                            funcBodyExpr = newLiteral(binaryOperate((funcBodyExpr as ESTree.BinaryExpression).left, (funcBodyExpr as ESTree.BinaryExpression).right, (funcBodyExpr as ESTree.BinaryExpression).operator), n.parent);
                        }
                        modified = true;
                        return funcBodyExpr;
                    }
                    return;
                }
                // find the member expressions
                if (n.type === esprima.Syntax.MemberExpression && isIdentifierIdentical((n as ESTree.MemberExpression).object, h.id) && ((n as ESTree.MemberExpression).property.type === esprima.Syntax.Identifier || isStringLiteral((n as ESTree.MemberExpression).property))) {
                    if(n.parent?.type === esprima.Syntax.CallExpression && (n.parent as ESTree.CallExpression).callee === n) {
                        // leave to the CallExpression handler.
                        return;
                    }
                    const propName = getKey((n as ESTree.MemberExpression).property);
                    if(typeof propName !== 'string') {
                        return;
                    }
                    if (Object.hasOwnProperty.call(h.props, propName)) {
                        modified = true;
                        return cloneNode(h.props[propName] as EsNode, n.parent);
                    }
                    return;
                }
            }
        });
    }
    // remove unused hash declaration
    for (const h of hashes) {
        if (!isIdentifierReferenced(h.node.id as ESTree.Identifier, h.scope)) {
            const removable = getRemovableParentNode(h.node);
            let done = false;
            replace(h.scope, {
                leave(n: EsNode) {
                    if (done) {
                        (this as Controller).break();
                        return;
                    }
                    if (n === removable) {
                        (this as Controller).remove();
                        modified = true;
                        done = true;
                    }
                }
            })
        }
    }
    return modified;
}

/**
 * String Array Wrappers Type = Function
 * @param decodeFnId the id of the string array decoding function
 * @param root the root node
 */
function stringArrayFunctionWrappers(decodeFnId: string, root: EsNode) {
    // The string array decoding is wrapped by a function call.
    // the callee function contains two parameters.
    // And the function body contains a single ReturnStatement whose argument is a CallExpression, and the callee is the string array decoding function.
    // The arguments of the CallExpression match the parameters of the function.
    // The arguments may have an additional arithmetic operation.

    // Collect the functions
    const functions: ESTree.FunctionDeclaration[] = [];
    traverse(root, {
        enter(n: EsNode) {
            if (n.type !== esprima.Syntax.FunctionDeclaration || (n as ESTree.FunctionDeclaration).id?.type !== esprima.Syntax.Identifier || (n as ESTree.FunctionDeclaration).params.length !== 2 || !(n as ESTree.FunctionDeclaration).params.every(p => p.type === esprima.Syntax.Identifier) || (n as ESTree.FunctionDeclaration).body.body.length !== 1) {
                return;
            }
            const stmt = (n as ESTree.FunctionDeclaration).body.body[0];
            if (stmt.type !== esprima.Syntax.ReturnStatement) {
                return;
            }
            if (stmt.argument?.type !== esprima.Syntax.CallExpression) {
                return;
            }
            if (!isIdentifierIdentical(stmt.argument.callee, decodeFnId)) {
                return;
            }
            if (stmt.argument.arguments.length !== 2) {
                return;
            }
            const params = (n as ESTree.FunctionDeclaration).params.map(p => (p as ESTree.Identifier).name);
            // each argument matches the parameter of the function
            if (!stmt.argument.arguments.every((a) => {
                if (a.type === esprima.Syntax.Identifier) {
                    const pos = params.indexOf(a.name);
                    if (pos === -1) {
                        return false;
                    }
                    // params can only be used once.
                    params.splice(pos, 1);
                    return true;
                }
                // _0x3d7e3a - 0x217, or _0x3d7e3a - -0x217
                if (a.type === esprima.Syntax.BinaryExpression) {
                    if (a.left.type === esprima.Syntax.Identifier) {
                        const pos = params.indexOf(a.left.name);
                        if (pos === -1) {
                            return false;
                        }
                        if (!isNumber(a.right)) {
                            return false;
                        }
                        params.splice(pos, 1);
                        return true;
                    } else if (a.right.type === esprima.Syntax.Identifier) {
                        const pos = params.indexOf(a.right.name);
                        if (pos === -1) {
                            return false;
                        }
                        if (!isNumber(a.left)) {
                            return false;
                        }
                        params.splice(pos, 1);
                        return true;
                    }
                    return false;
                }
                return false;
            })) {
                return;
            }
            functions.push(n as ESTree.FunctionDeclaration);
        }
    });
    for (const fn of functions) {
        const scope = closestBlock(fn)!;
        const fnId = (fn.id as ESTree.Identifier).name;
        const paramNames = fn.params.map(p => (p as ESTree.Identifier).name);
        const replacement = (fn.body.body[0] as ESTree.ReturnStatement).argument!;

        replace(scope, {
            leave(n: EsNode) {
                if (n.type === esprima.Syntax.CallExpression && isIdentifierIdentical((n as ESTree.CallExpression).callee, fnId) && (n as ESTree.CallExpression).arguments.length === 2 && (n as ESTree.CallExpression).arguments.every(a => isNumber(a))) {
                    const params = (n as ESTree.CallExpression).arguments.map(a => evaluate(a) as number);
                    const result = cloneNode(replacement, n.parent) as ESTree.CallExpression;
                    result.arguments = result.arguments.map((a) => {
                        if (a.type === esprima.Syntax.Identifier) {
                            return newLiteral(params[paramNames.indexOf(a.name)], a.parent);
                        }
                        if (a.type === esprima.Syntax.UnaryExpression) {
                            return newLiteral(unary(params[paramNames.indexOf((a.argument as ESTree.Identifier).name)], a.operator), a.parent);
                        }
                        if (a.type === esprima.Syntax.BinaryExpression) {
                            return newLiteral(arithmetic(a.left.type === esprima.Syntax.Identifier ? params[paramNames.indexOf((a.left as ESTree.Identifier).name)] : evaluate(a.left), a.right.type === esprima.Syntax.Identifier ? params[paramNames.indexOf((a.right as ESTree.Identifier).name)] : evaluate(a.right), a.operator), a.parent);
                        }
                        throw 'should never reach: ' + a.type;
                    });
                    return result;
                }
            }
        });
        removeIdentifierIfUnused(fn.id!, scope);
    }
}

/**
 * Write hexadecimal strings and numeric literals in human-readable form.
 * @param root
 */
export function hexadecimal(root: EsNode) {
    replace(root, {
        enter(n: EsNode) {
            if (n.type === esprima.Syntax.Literal) {
                const type = typeof (n as ESTree.Literal).value;
                if (type === 'number') {
                    (n as ESTree.Literal).raw = (n as ESTree.Literal).value.toString();
                    return;
                }
                if (type === 'string') {
                    if ((n as ESTree.Literal).raw !== undefined) {
                        (n as ESTree.Literal).raw = (n as ESTree.Literal).raw!.replace(/(\\x[0-9a-f]{2}|\\u[0-9a-f]{4})/g, (m, n) => String.fromCharCode(parseInt(n.substring(2), 16))).toString();
                    }
                    return;
                }
            }
        }
    });
}

/**
 * reverse the controlFlowFlattening of obfuscator-js
 * <pre>
 *    In a BlockStatement's root, There should be:
 *    A VariableDeclarator(the flow string variable) whose init is an expression splitting a string that matches /^\d+[\d|]+\d+$/.
 *    A VariableDeclarator(the increment variable) whose init is the numeric literal '0'.
 *    A WhileStatement whose test is eventually the boolean value 'true'.
 *    The WhileStatement should contain a single SwitchStatement.
 *    The discriminant of the SwitchStatement is a MemberExpression, whose object is the flow string variable, and the property is the increment variable.
 * </pre>
 * @param root
 */
export function controlFlowFlattening(root: EsNode) {
    // collect
    const scopes: ESTree.BlockStatement[] = [];
    const data: { cases: ESTree.SwitchCase[], flow: string[], removables: EsNode[], whileStmt: ESTree.WhileStatement }[] = [];
    traverse(root, {
        enter(n: EsNode) {
            // find the while statement
            if (n.type === esprima.Syntax.WhileStatement && n.parent?.type === esprima.Syntax.BlockStatement) {
                const whileStmt = n as ESTree.WhileStatement;
                // ensure the test of the while statement is eventually true, and the body of the while statement is a block
                if (evaluate(whileStmt.test) !== true || whileStmt.body.type !== esprima.Syntax.BlockStatement) {
                    return;
                }
                // the while statement body has exactly two statements, the first one is a SwitchStatement, and the second one is a BreakStatement
                if (whileStmt.body.body.length !== 2 || whileStmt.body.body[0].type !== esprima.Syntax.SwitchStatement || whileStmt.body.body[1].type !== esprima.Syntax.BreakStatement) {
                    return;
                }
                const switchStmt = whileStmt.body.body[0] as ESTree.SwitchStatement;
                // ensure that the type of each case test is a numeric string
                if (!switchStmt.cases.every(c => c.test?.type === esprima.Syntax.Literal && typeof (c.test as ESTree.Literal).value === 'string' && /^\d+$/.test((c.test as ESTree.Literal).value as string))) {
                    return;
                }
                // the discriminant of the SwitchStatement is a MemberExpression, the object is the variable id of the flow string, the property is an UpdateExpress.
                if (switchStmt.discriminant.type !== esprima.Syntax.MemberExpression || switchStmt.discriminant.object.type !== esprima.Syntax.Identifier || switchStmt.discriminant.property.type !== esprima.Syntax.UpdateExpression || switchStmt.discriminant.property.argument.type !== esprima.Syntax.Identifier || switchStmt.discriminant.property.operator !== '++') {
                    return;
                }
                const flowStringId = (switchStmt.discriminant.object as ESTree.Identifier).name;
                const incrementId = (switchStmt.discriminant.property.argument as ESTree.Identifier).name;
                const parent = whileStmt.parent as ESTree.BlockStatement;
                // find the splitting VariableDeclarator and the auto increment VariableDeclarator.
                let flow: string[] | null = null;
                let incrementVar: EsNode | null = null;
                let flowVar: EsNode | null = null;
                const removables: EsNode[] = [];
                parent.body.forEach(s => {
                    if (s.type !== esprima.Syntax.VariableDeclaration) {
                        return false;
                    }
                    s.declarations.forEach(dec => {
                        // the splitting
                        if (!flowVar && isIdentifierIdentical(dec.id, flowStringId) && dec.init?.type === esprima.Syntax.CallExpression && dec.init.callee.type === esprima.Syntax.MemberExpression && isNameEquals('split', dec.init.callee.property) && isStringLiteral(dec.init.callee.object) && /^\d[\d|]+\d$/.test((dec.init.callee.object as ESTree.Literal).value as string)) {
                            flow = ((dec.init.callee.object as ESTree.Literal).value as string).split('|');
                            flowVar = dec;
                            return;
                        }
                        if (!incrementVar && isIdentifierIdentical(dec.id, incrementId) && isLiteralEquals(0, dec.init)) {
                            incrementVar = dec;
                            return;
                        }
                    });
                });
                if (flow === null || incrementVar === null) {
                    return;
                }
                if ((flowVar as EsNode)!.parent === (incrementVar as EsNode)!.parent) {
                    if (((flowVar as EsNode).parent as ESTree.VariableDeclaration).declarations.length === 2) {
                        removables.push((flowVar as EsNode).parent!);
                    } else {
                        removables.push(flowVar as EsNode, incrementVar as EsNode);
                    }
                } else {
                    removables.push(getRemovableParentNode(flowVar as EsNode), getRemovableParentNode(incrementVar as EsNode));
                }

                // confirmed
                data.push({
                    cases: switchStmt.cases,
                    flow,
                    removables,
                    whileStmt: whileStmt,
                });
                scopes.push(parent);
            }
        }
    });
    if (scopes.length === 0) {
        return;
    }

    for (let i = 0; i < scopes.length; i++) {
        const scope = scopes[i];
        const {cases, flow, removables, whileStmt} = data[i];
        let replacement = null;

        const map: { [key: string]: ESTree.SwitchCase } = {};
        cases.forEach(_ => map[(_.test as ESTree.Literal).value as string] = _);
        replacement = flow.map(o => {
            return map[o].consequent.filter(c => c.type !== esprima.Syntax.ContinueStatement).map(c => {
                c.parent = scope;
                return c;
            });
        }).flat();
        // // replace the WhileStatement with sorted statements.
        scope.body.splice(scope.body.indexOf(whileStmt), 1, ...replacement);
        // remove the removable variable declarations
        replace(scope, {
            enter(n: EsNode) {
                if (removables.length === 0) {
                    (this as Controller).break();
                    return;
                }
                if (removables.includes(n)) {
                    removables.splice(removables.indexOf(n), 1);
                    (this as Controller).remove();
                }
            }
        });
    }
}

// TODO: simplify apply call
/**
 * Remove constant condition flow.
 *
 * @param root
 */
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
