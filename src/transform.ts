import * as ESTree from 'estree';
// @ts-ignore
import * as esprima from 'esprima';
// @ts-ignore
import {Controller, replace, traverse} from 'estraverse';
import {EsNode} from "./global";
import * as astring from './astring';
import {
    arithmetic,
    cloneNode,
    closestBlock,
    getNodeValue,
    getRemovableParentNode,
    isFinal,
    isIdentifierIdentical,
    isIdentifierReferenced, isLiteral,
    isLiteralLike,
    isNumber, isStringLiteral,
    newLiteral,
    removeIdentifierIfUnused, replaceIdentifiers,
    unary
} from "./util";
import {findStringArrayDecodeFunction, findStringArrayFunction, findStringArrayRotateExpr} from "./string-array-helper";

export function stringArrayTransformations(root: EsNode) {
    if (!(root as { body?: ESTree.Statement[] })?.body || !((root as { body?: ESTree.Statement[] })?.body instanceof Array)) {
        // root is not a Program
        globalThis.logDebug('stringTransformations - root is not a Program');
        return;
    }

    stringArrayCallsTransform(root);

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
                    const val = func.apply(null, c.arguments.map(a => getNodeValue(a)));
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
}

type ParamsAndReturn = {
    params: string[];
    rt: EsNode;
}

/**
 * String Array Calls Transform
 * @param root
 */
function stringArrayCallsTransform(root: EsNode) {
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
                    const key = (p.key as ESTree.Identifier).name;
                    if (p.value.type === esprima.Syntax.FunctionExpression) {
                        props[key] = {
                            params: p.value.params.map(param => (param as ESTree.Identifier).name),
                            rt: (p.value.body.body[0] as ESTree.ReturnStatement).argument!,
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
    for (const h of hashes) {
        replace(h.scope, {
            leave(n: EsNode) {
                // find the call expression
                if (n.type === esprima.Syntax.CallExpression && (n as ESTree.CallExpression).callee.type === esprima.Syntax.MemberExpression && isIdentifierIdentical(((n as ESTree.CallExpression).callee as ESTree.MemberExpression).object, h.id)) {
                    const propName = (((n as ESTree.CallExpression).callee as ESTree.MemberExpression).property as ESTree.Identifier).name;
                    if (Object.hasOwnProperty.call(h.props, propName)) {
                        const propVal = h.props[propName] as ParamsAndReturn;
                        const funcBodyExpr = cloneNode(propVal.rt, n.parent);
                        const paramsMap: { [key: string]: EsNode } = {};
                        (n as ESTree.CallExpression).arguments.forEach((a, i) => {
                            paramsMap[propVal.params[i]] = a;
                        })
                        // replace identifiers in the returning expression with the call arguments.
                        replaceIdentifiers(funcBodyExpr, paramsMap);
                        return funcBodyExpr;
                    }
                    return;
                }
                // find the member expressions
                if (n.type === esprima.Syntax.MemberExpression && isIdentifierIdentical((n as ESTree.MemberExpression).object, h.id) && (n as ESTree.MemberExpression).property.type === esprima.Syntax.Identifier) {
                    const propName = ((n as ESTree.MemberExpression).property as ESTree.Identifier).name;
                    if (Object.hasOwnProperty.call(h.props, propName)) {
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
                        done = true;
                    }
                }
            })
        }
    }
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
                    const params = (n as ESTree.CallExpression).arguments.map(a => getNodeValue(a) as number);
                    const result = cloneNode(replacement, n.parent) as ESTree.CallExpression;
                    result.arguments = result.arguments.map((a) => {
                        if (a.type === esprima.Syntax.Identifier) {
                            return newLiteral(params[paramNames.indexOf(a.name)], a.parent);
                        }
                        if (a.type === esprima.Syntax.UnaryExpression) {
                            return newLiteral(unary(params[paramNames.indexOf((a.argument as ESTree.Identifier).name)], a.operator), a.parent);
                        }
                        if (a.type === esprima.Syntax.BinaryExpression) {
                            return newLiteral(arithmetic(a.left.type === esprima.Syntax.Identifier ? params[paramNames.indexOf((a.left as ESTree.Identifier).name)] : getNodeValue(a.left), a.right.type === esprima.Syntax.Identifier ? params[paramNames.indexOf((a.right as ESTree.Identifier).name)] : getNodeValue(a.right), a.operator), a.parent);
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
