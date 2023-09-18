// extracted from the transform functions to make it easier to run unit test.

import * as ESTree from "estree";
import {
    AssignmentExpression,
    CallExpression,
    Expression,
    FunctionDeclaration,
    ReturnStatement,
    SpreadElement,
    VariableDeclaration
} from "estree";
import * as esprima from "esprima";
import {EsNode} from "./global";
import {
    cloneNode,
    findOne,
    findOneByType,
    isIdentifierIdentical,
    isNumber,
    isStringLiteral,
    replaceIdentifiers, simplifyAdditionAndSubtractionOperation
} from "./util";
import {traverse} from "estraverse";

/**
 * flatten concatenated string arrays
 */
export function flattenStringArrayConcat(node: EsNode | null): Array<Expression | SpreadElement | null> | null {
    if (node == null) {
        return null;
    }
    if (node.type === esprima.Syntax.ArrayExpression) {
        return (node as ESTree.ArrayExpression).elements;
    }
    if (node.type !== esprima.Syntax.CallExpression) {
        return null;
    }
    const result = [];
    let arg: ESTree.CallExpression = node as ESTree.CallExpression;

    // [...].concat((function(){
    //   return [...].concat((function() {
    //     return [...].concat((function() {
    //       return [...]
    //     }()))
    //   }()))
    // }()))

    while (true) {
        if (arg.callee.type !== esprima.Syntax.MemberExpression) {
            return null;
        }
        if (arg.callee.object.type !== esprima.Syntax.ArrayExpression) {
            return null;
        }
        if (!isIdentifierIdentical(arg.callee.property, 'concat')) {
            return null;
        }
        if (arg.arguments.length !== 1) {
            return null;
        }
        result.push(...arg.callee.object.elements);
        let arg2 = arg.arguments[0];
        if (arg2.type !== esprima.Syntax.CallExpression) {
            return null;
        }
        if (arg2.arguments.length !== 0) {
            return null;
        }
        if (arg2.callee.type !== esprima.Syntax.FunctionExpression) {
            return null;
        }
        if (arg2.callee.params.length !== 0) {
            return null;
        }
        if (arg2.callee.body.body.length != 1) {
            return null;
        }
        if (arg2.callee.body.body[0].type !== esprima.Syntax.ReturnStatement) {
            return null;
        }
        if ((arg2.callee.body.body[0] as ESTree.ReturnStatement).argument == null) {
            return null;
        }
        if ((arg2.callee.body.body[0] as ESTree.ReturnStatement).argument!.type === esprima.Syntax.ArrayExpression) {
            result.push(...((arg2.callee.body.body[0] as ESTree.ReturnStatement).argument as ESTree.ArrayExpression).elements);
            return result;
        }
        if ((arg2.callee.body.body[0] as ESTree.ReturnStatement).argument!.type !== esprima.Syntax.CallExpression) {
            return null;
        }
        arg = (arg2.callee.body.body[0] as ESTree.ReturnStatement).argument! as ESTree.CallExpression;
    }
    return result;
}

/**
 * <pre>
 *     Find the string array function.
 *     It should be a function with no params.
 *     The body contains three statements.
 *     The first statement is a VariableDeclaration with an ArrayExpression as its init.(The first statement may be a IIFE which will finally return the string array)
 *     The second statement is an AssignmentStatement with a function as its right. The function should return the first variable.
 *     The third statement is a ReturnStatement that calls the second function.
 * </pre>
 * @param rootBody the root body to search in.
 */
export function findStringArrayFunction(rootBody: ESTree.Statement[]): { stringArrayFn: FunctionDeclaration | undefined, versionVariableId: string | null } {

    // The transformed string array may contain a version variable
    let versionVariableId: string | null = null;

    const stringArrayFn: FunctionDeclaration | undefined = rootBody.find(n => {
        if (n.type !== esprima.Syntax.FunctionDeclaration) {
            return false;
        }
        const fn = n as ESTree.FunctionDeclaration;
        if (fn.params.length !== 0) {
            return false;
        }
        if (fn.body.body.length !== 3) {
            return false;
        }
        if (fn.body.body[0].type !== esprima.Syntax.VariableDeclaration || fn.body.body[1].type !== esprima.Syntax.ExpressionStatement || fn.body.body[2].type !== esprima.Syntax.ReturnStatement) {
            return false;
        }
        const first = fn.body.body[0] as ESTree.VariableDeclaration;
        if (first.declarations.length !== 1) {
            return false;
        }
        let stringArray: Array<ESTree.Expression | ESTree.SpreadElement | null> | null = null;
        // may be a call expression that finally returns the string array.
        if (first.declarations[0].init?.type === esprima.Syntax.CallExpression) {
            let call = first.declarations[0].init as ESTree.CallExpression;
            if (call.arguments.length != 0 || call.callee.type !== esprima.Syntax.FunctionExpression) {
                return false;
            }
            if (call.callee.body.body.length !== 1 || call.callee.body.body[0].type !== esprima.Syntax.ReturnStatement) {
                return false;
            }
            const rt = call.callee.body.body[0] as ESTree.ReturnStatement;
            if (rt.argument == null) {
                return false;
            }
            stringArray = flattenStringArrayConcat(rt.argument);
        } else if (first.declarations[0].init?.type === esprima.Syntax.ArrayExpression) {
            stringArray = (first.declarations[0].init as ESTree.ArrayExpression).elements;
        }
        if (stringArray == null || stringArray.length === 0) {
            return false;
        }
        // The transformed string array may contain a version variable
        for (const e: (Expression | SpreadElement | null) of stringArray) {
            if (e == null) {
                return false;
            }
            if (e.type === esprima.Syntax.Identifier) {
                if (versionVariableId != null) {
                    return false;
                }
                versionVariableId = (e as ESTree.Identifier).name;
                continue;
            }
            if (!isStringLiteral(e)) {
                return false;
            }
        }
        const firstVariable = (first.declarations[0].id as ESTree.Identifier).name;
        const second = fn.body.body[1] as ESTree.ExpressionStatement;
        if (second.expression.type !== esprima.Syntax.AssignmentExpression) {
            return false;
        }
        if ((second.expression as ESTree.AssignmentExpression).left.type !== esprima.Syntax.Identifier || (second.expression as ESTree.AssignmentExpression).right.type !== esprima.Syntax.FunctionExpression) {
            return false;
        }
        const secondFn = (second.expression as ESTree.AssignmentExpression).right as ESTree.FunctionExpression;
        if (secondFn.params.length !== 0 || secondFn.id) {
            return false;
        }
        // the second function should return the first variable
        if (secondFn.body.body.length !== 1 || secondFn.body.body[0].type !== esprima.Syntax.ReturnStatement || !isIdentifierIdentical((secondFn.body.body[0] as ESTree.ReturnStatement).argument, firstVariable)) {
            return false;
        }
        const secondVariable = (second.expression.left as ESTree.Identifier).name;
        const third = fn.body.body[2] as ESTree.ReturnStatement;
        if (third.argument?.type !== esprima.Syntax.CallExpression || !isIdentifierIdentical(third.argument.callee, secondVariable)) {
            return false;
        }
        return true;
    }) as ESTree.FunctionDeclaration | undefined;

    return {
        stringArrayFn,
        versionVariableId,
    }
}

/**
 * <pre>
 *     Find the function that decodes the string array.
 *     The function should contain at least 2 parameters.
 *     The function body should contain only three statements.
 *     The first statement of the function body should be a VariableDeclaration with an init that calls the string array function.
 *     The second statement should be an AssignmentExpression that reassigns the function id.
 *     The third statement should be a CallExpression with the function id as its callee, and the function parameters as its arguments.
 *     The second and third statements can be compacted to a SequenceExpression.
 * </pre>
 * @param stringArrayFnId id of the string array function
 * @param rootBody the root body to search in.
 */
export function findStringArrayDecodeFunction(stringArrayFnId: string, rootBody: ESTree.Statement[]): ESTree.FunctionDeclaration | undefined {
    return rootBody.find(n => {
        if (n.type !== esprima.Syntax.FunctionDeclaration) {
            return false;
        }
        if (n.params.length < 2) {
            return false;
        }
        if (n.body.body.length !== 2 && n.body.body.length !== 3) {
            return false;
        }
        if (n.body.body[0].type !== esprima.Syntax.VariableDeclaration) {
            return false;
        }
        const fnId = n.id!.name;
        const first = n.body.body[0] as VariableDeclaration;
        if (first.declarations.length !== 1 || first.declarations[0].init?.type !== esprima.Syntax.CallExpression) {
            return false;
        }
        if (!isIdentifierIdentical((first.declarations[0].init as ESTree.CallExpression).callee, stringArrayFnId)) {
            return false;
        }
        let reassignStmt: ESTree.AssignmentExpression;
        let callStmt: ESTree.CallExpression;
        if (n.body.body.length === 2) {
            if (n.body.body[1].type !== esprima.Syntax.ReturnStatement) {
                return false;
            }
            const second = n.body.body[1] as ReturnStatement;
            if (second.argument?.type !== esprima.Syntax.SequenceExpression || second.argument.expressions.length !== 2) {
                return false;
            }
            if (second.argument.expressions[0].type !== esprima.Syntax.AssignmentExpression) {
                return false;
            }
            if (second.argument.expressions[1].type !== esprima.Syntax.CallExpression) {
                return false;
            }
            reassignStmt = second.argument.expressions[0] as AssignmentExpression;
            callStmt = second.argument.expressions[1] as CallExpression;
        } else {
            if (n.body.body[1].type !== esprima.Syntax.ExpressionStatement) {
                return false;
            }
            if ((n.body.body[1] as ESTree.ExpressionStatement).expression.type !== esprima.Syntax.AssignmentExpression) {
                return false;
            }
            reassignStmt = (n.body.body[1] as ESTree.ExpressionStatement).expression as ESTree.AssignmentExpression;
            if (n.body.body[2].type !== esprima.Syntax.ReturnStatement || (n.body.body[2] as ReturnStatement).argument?.type !== esprima.Syntax.CallExpression) {
                return false;
            }
            callStmt = (n.body.body[2] as ReturnStatement).argument as ESTree.CallExpression;
        }
        if (!isIdentifierIdentical(reassignStmt.left, fnId)) {
            return false;
        }
        if (reassignStmt.right.type !== esprima.Syntax.FunctionExpression) {
            return false;
        }
        const firstExprVariable = (reassignStmt.left as ESTree.Identifier).name;
        if (!isIdentifierIdentical(callStmt.callee, firstExprVariable)) {
            return false;
        }
        return true;
    }) as ESTree.FunctionDeclaration | undefined;
}

/**
 * Find the rotation CallExpression.
 * @param stringArrayFnId id of the string array function
 * @param decodeFnId id of the string array decoding function
 * @param rootBody the root body to search in.
 */
export function findStringArrayRotateExpr(stringArrayFnId: string, decodeFnId: string, rootBody: ESTree.Statement[]): ESTree.ExpressionStatement | undefined {
    /**
     * <pre>
     *      Find the CallExpression whose arguments include the id of the string array function, and the remaining arguments are numeric literals.
     *      The callee is a FunctionExpression.
     *      The decode function id should present in the FunctionExpression body.
     *      A WhileStatement should present in the FunctionExpression body.
     *      A TryStatement should present in the WhileStatement body.
     * </pre>
     */
    function testNode(n: ESTree.Statement): boolean {
        if (n.type !== esprima.Syntax.ExpressionStatement) {
            return false;
        }
        let call = n.expression;
        while (call.type !== esprima.Syntax.CallExpression) {
            if (call.type === esprima.Syntax.LogicalExpression) {
                call = call.left;
                continue;
            }
            if (call.type === esprima.Syntax.SequenceExpression) {
                if (call.expressions.length === 0) {
                    return false;
                }
                call = call.expressions[0];
                continue;
            }
            return false;
        }
        if (call.callee.type !== esprima.Syntax.FunctionExpression) {
            return false;
        }
        // The call arguments should include the stringArrayFnId, and the remaining arguments are numeric literals.
        let stringArrayFnIdPresent = false;
        if (!call.arguments.every(a => {
            if (a.type === esprima.Syntax.Identifier) {
                if (stringArrayFnIdPresent) {
                    return false;
                }
                if (a.name === stringArrayFnId) {
                    stringArrayFnIdPresent = true;
                    return true;
                }
                return false;
            }
            return isNumber(a);
        })) {
            return false;
        }
        const body = call.callee.body;
        const whileStmt = findOneByType<ESTree.WhileStatement>(esprima.Syntax.WhileStatement, body);
        if (whileStmt == null) {
            return false;
        }
        const tryStmt = findOneByType<ESTree.TryStatement>(esprima.Syntax.TryStatement, whileStmt.body);
        if (tryStmt == null) {
            return false;
        }
        return findOne(nn => nn.type === esprima.Syntax.Identifier && (nn as ESTree.Identifier).name === decodeFnId && ((nn.parent?.type === esprima.Syntax.VariableDeclarator && (nn.parent as ESTree.VariableDeclarator).init === nn as ESTree.Identifier) || (nn.parent?.type === esprima.Syntax.CallExpression && (nn.parent as ESTree.CallExpression).callee === nn)), body) != null;
    }

    let result = rootBody.find(n => testNode(n)) as EsNode | undefined;
    if (result == undefined) {
        return undefined;
    }
    if (result.type === esprima.Syntax.ExpressionStatement) {
        return result as ESTree.ExpressionStatement;
    }
    while (result.parent != null && result.parent.type !== esprima.Syntax.Program) {
        result = result.parent;
    }
    return result as ESTree.ExpressionStatement;
}

/**
 * Find the string array function wrappers.
 * <pre>
 *     The string array decoding is wrapped by a function call.
 *     the callee function contains two parameters.
 *     And the function body contains a single ReturnStatement whose argument is a CallExpression.
 *     The callee is the string array decoding function id, and alias to the id.
 *     The arguments of the CallExpression match the parameters of the function.
 *     The arguments may have an additional arithmetic operation.
 * </pre>
 */
export function findStringArrayFunctionWrappers(decodeFnId:string, root:EsNode):ESTree.FunctionDeclaration[] {
    let possibleFunctions:ESTree.FunctionDeclaration[] = [];
    traverse(root, {
        enter(n:EsNode) {
            if (n.type !== esprima.Syntax.FunctionDeclaration || (n as ESTree.FunctionDeclaration).id?.type !== esprima.Syntax.Identifier || (n as ESTree.FunctionDeclaration).params.length !== 2 || !(n as ESTree.FunctionDeclaration).params.every(p => p.type === esprima.Syntax.Identifier) || (n as ESTree.FunctionDeclaration).body.body.length !== 1) {
                return;
            }
            const stmt = (n as ESTree.FunctionDeclaration).body.body[0];
            if (stmt.type !== esprima.Syntax.ReturnStatement) {
                return;
            }
            if (stmt.argument?.type !== esprima.Syntax.CallExpression || stmt.argument.callee.type !== esprima.Syntax.Identifier) {
                return;
            }
            if (stmt.argument.arguments.length !== 2 || !(n as ESTree.FunctionDeclaration).params.every(_ => _.type === esprima.Syntax.Identifier)) {
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
            possibleFunctions.push(n as ESTree.FunctionDeclaration);
        }
    });
    const result: ESTree.FunctionDeclaration[] = [];
    const alias:{[key:string]:{fn:ESTree.FunctionDeclaration, params:string[], rt:ESTree.ReturnStatement}} = {};
    while(possibleFunctions.length > 0) {
        const length = possibleFunctions.length;
        possibleFunctions = possibleFunctions.filter(f => {
            const fnId = f.id!.name;
            const rt = f.body.body[0] as ESTree.ReturnStatement;
            const params = f.params.map(_ => (_ as ESTree.Identifier).name);
            const callExpr = rt.argument as ESTree.CallExpression;
            const calleeId = (callExpr.callee as ESTree.Identifier).name!;
            if(calleeId === decodeFnId) {// directly call the decode function
                alias[fnId] = {fn: f, params, rt};
                result.push(f);
                return false;
            }
            if(Object.hasOwnProperty.call(alias, calleeId)) {
                const aliasFn = alias[calleeId];
                const actualRt = cloneNode(aliasFn.rt.argument as ESTree.CallExpression, rt);
                const identifiersMap:{[key:string]:EsNode} = {};
                callExpr.arguments.forEach((a, i) => identifiersMap[aliasFn.params[i]] = a);
                replaceIdentifiers(actualRt, identifiersMap);
                for(let i = 0;i < actualRt.arguments.length;i++) {
                    if(actualRt.arguments[i].type === esprima.Syntax.BinaryExpression) {
                        actualRt.arguments[i] = simplifyAdditionAndSubtractionOperation(actualRt.arguments[i] as ESTree.BinaryExpression);
                    }
                }
                rt.argument = actualRt;
                alias[fnId] = {fn: f, params, rt};
                result.push(f);
                return false;
            }
            return true;
        });
        if(length === possibleFunctions.length) {
            break;
        }
    }
    return result;
}
