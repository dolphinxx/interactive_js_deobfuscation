import {EsNode} from "./global";
import * as esprima from "esprima";
import * as ESTree from "estree";
import {Controller, replace, traverse} from "estraverse";
import {copy} from "./copy";
import * as acorn from "acorn";

type LiteralTypes = 'string' | 'boolean' | 'number' | 'null' | 'RegExp' | 'undefined' | 'bigint';

const fakeWindow = {

};

export function evaluate(node: EsNode | null | undefined):any {
    if (node == null) {
        throw 'node is null or undefined';
    }
    if (node.type === esprima.Syntax.Literal) {
        return (node as ESTree.Literal).value;
    }
    if (node.type === esprima.Syntax.UnaryExpression) {
        return unaryOperate((node as ESTree.UnaryExpression).argument, (node as ESTree.UnaryExpression).operator);
    }
    if(node.type === esprima.Syntax.BinaryExpression) {
        return binaryOperate((node as ESTree.BinaryExpression).left, (node as ESTree.BinaryExpression).right, (node as ESTree.BinaryExpression).operator);
    }
    // []
    if(node.type === esprima.Syntax.ArrayExpression && (node as ESTree.ArrayExpression).elements.length === 0) {
        return [];
    }
    // window
    if (node.type === esprima.Syntax.Identifier && (node as ESTree.Identifier).name === 'window') {
        return fakeWindow;
    }
    // undefined
    if (node.type === esprima.Syntax.Identifier && (node as ESTree.Identifier).name === 'undefined') {
        return undefined;
    }
    throw 'can not evaluate a ' + node.type;
}

/**
 * Get the value of a property key
 * @param node
 */
export function getKey(node: EsNode) {
    if (node.type === esprima.Syntax.Literal) {
        return (node as ESTree.Literal).value;
    }
    if (node.type === esprima.Syntax.Identifier) {
        return (node as ESTree.Identifier).name;
    }
    throw 'not a valid key type: ' + node.type;
}

/**
 * Whether node is a numeric literal or a unary expression whose argument is a numeric literal.
 * @param node
 */
export function isNumber(node: EsNode | null | undefined): boolean {
    if (node == null) {
        return false;
    }
    if (node.type === esprima.Syntax.Literal) {
        return typeof (node as ESTree.Literal).value === 'number';
    }
    if (node.type === esprima.Syntax.UnaryExpression) {
        return isNumber((node as ESTree.UnaryExpression).argument);
    }
    return false;
}

/**
 * Whether node is a literal or a unary expression whose argument is a literal
 * @param node
 */
export function isLiteralLike(node: EsNode | null | undefined): boolean {
    if (node == null) {
        return false;
    }
    if (node.type === esprima.Syntax.Literal) {
        return true;
    }
    if (node.type === esprima.Syntax.UnaryExpression) {
        return (node as ESTree.UnaryExpression).argument.type === esprima.Syntax.Literal;
    }
    return false;
}

export function isLiteral(node: EsNode | null | undefined): boolean {
    return node != null && node.type === esprima.Syntax.Literal;
}

export function isLiteralOfType(node: EsNode | null, type: LiteralTypes): boolean {
    if (node == null) {
        return false;
    }
    if (node.type !== esprima.Syntax.Literal) {
        return false;
    }
    const value = (node as ESTree.Literal).value;
    const t = typeof value;
    if (t === 'object') {
        if (type === 'null') {
            return value === null;
        }
        if (type === 'RegExp') {
            return value instanceof RegExp;
        }
        return false;
    }
    return t === type;
}

export function isStringLiteral(node: EsNode | null | undefined): boolean {
    return node != null && node.type === esprima.Syntax.Literal && typeof (node as ESTree.Literal).value === 'string';
}

export function isIdentifierIdentical(node: EsNode | null | undefined, name: string): boolean {
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


export function binaryOperate(left: EsNode, right: EsNode, operator: ESTree.BinaryOperator): any {
    const leftVal = evaluate(left);
    const rightVal = evaluate(right);
    return arithmetic(leftVal, rightVal, operator);
}

export function unaryOperate(arg: EsNode, operator: ESTree.UnaryOperator): any {
    const argVal = evaluate(arg);
    return unary(argVal, operator);
}

export function unary(argVal: any, operator: ESTree.UnaryOperator): any {
    switch (operator) {
        case '-':
            return -argVal;
        case '+':
            return +argVal;
        case '!':
            return !argVal;
        case '~':
            return ~argVal;
        case 'typeof':
            return typeof argVal;
        case 'void':
            return void argVal;
        case 'delete':
            throw 'unary operator not supported: delete';
    }
}

export function arithmetic(left: any, right: any, operator: ESTree.BinaryOperator): any {
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

export function replaceIdentifiers(root: EsNode, map: { [key: string]: EsNode }) {
    replace(root, {
        leave(n: EsNode) {
            if (n.type === esprima.Syntax.Identifier && map.hasOwnProperty((n as ESTree.Identifier).name)) {
                return cloneNode(map[(n as ESTree.Identifier).name], n.parent);
            }
        }
    })
}

export function cloneNode(node: EsNode, parent: EsNode | null): EsNode {
    const result = copy(node, {excludes: ['parent']});
    applyAstParent(result);
    result.parent = parent;
    return result;
}

/**
 * checks whether the name of an Identifier or the value of a Literal is equal to `name`
 * @param name
 * @param node
 */
export function isNameEquals(name: string, node?: EsNode | null): boolean {
    if (!node) {
        return false;
    }
    if (node.type === esprima.Syntax.Identifier) {
        return (node as ESTree.Identifier).name === name;
    }
    if (node.type === esprima.Syntax.Literal) {
        return (node as ESTree.Literal).value === name;
    }
    return false;
}

export function isLiteralEquals(value: any, node?: EsNode | null): boolean {
    if (!node) {
        return false;
    }
    if (node.type !== esprima.Syntax.Literal) {
        return false;
    }
    return (node as ESTree.Literal).value === value;
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

/**
 * check whether the identifier has been reassigned
 * @param id
 * @param root
 */
export function isFinal(id: ESTree.Identifier, root: ESTree.Node | null): boolean {
    if (root == null) {
        return true;
    }
    const name = id.name;
    let reassigned = false;
    traverse(root, {
        enter(n: EsNode) {
            if (reassigned) {
                (this as Controller).break();
                return;
            }
            if (n.type === esprima.Syntax.AssignmentExpression) {
                if (isIdentifierIdentical((n as ESTree.AssignmentExpression).left, name)) {
                    reassigned = true;
                }
                return;
            }
        }
    });
    return !reassigned;
}

export function getRemovableParentNode(node: EsNode): EsNode {
    let result = node;

    if (result.parent?.type === esprima.Syntax.FunctionDeclaration && (result.parent as ESTree.FunctionDeclaration).id === result) {
        result = result.parent as ESTree.FunctionDeclaration;
    }
    if (result.parent?.type === esprima.Syntax.VariableDeclarator) {
        result = node.parent as ESTree.VariableDeclarator;
    }
    if (result.parent?.type === esprima.Syntax.VariableDeclaration && (result.parent as ESTree.VariableDeclaration).declarations.length === 1) {
        result = result.parent as ESTree.VariableDeclaration;
    }
    if (result.parent?.type === esprima.Syntax.ClassDeclaration && (result.parent as ESTree.ClassDeclaration).id === result) {
        result = result.parent as ESTree.ClassDeclaration;
    }
    return result;
}

export function removeIdentifierIfUnused(node: EsNode, scope?: EsNode | null) {
    if (!scope) {
        scope = closestBlock(node);
    }
    if (isIdentifierReferenced(node, scope!)) {
        globalThis.logDebug('removeVariableIfUnused failed');
        return;
    }
    const toRemove = getRemovableParentNode(node);
    let done = false;
    replace(scope!, {
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

export function findOneByType<T>(type: (typeof esprima.Syntax[keyof typeof esprima.Syntax]), root: EsNode): T | null {
    let found: T | null = null;
    traverse(root, {
        enter(n: EsNode) {
            if (n.type === type) {
                found = n as T;
                (this as Controller).break();
                return;
            }
        }
    });
    return found;
}

/**
 * Whether node is the id of a VariableDeclarator or a FunctionDeclaration
 */
export function isIdOfParent(node: ESTree.Identifier): boolean {
    // if(node.parent?.type === esprima.Syntax.VariableDeclarator && (node.parent as ESTree.VariableDeclarator).id === node) {
    //     return true;
    // }
    // if(node.parent?.type === esprima.Syntax.FunctionDeclaration && (node.parent as ESTree.FunctionDeclaration).id === node) {
    //     return true;
    // }
    // if(node.parent?.type === esprima.Syntax.ClassDeclaration && (node.parent as ESTree.ClassDeclaration).id === node) {
    //     return true;
    // }
    // return false;
    return (node as { id?: any }).id === node;
}
