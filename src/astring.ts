// Modified from https://github.com/davidbonnet/astring/commit/be1aefb7396c62b8504d15fc21891e4e9317f492
// Add the ability to customize serialization.
//
// Astring is a tiny and fast JavaScript code generator from an ESTree-compliant AST.
//
// Astring was written by David Bonnet and released under an MIT license.
//
// The Git repository for Astring is available at:
// https://github.com/davidbonnet/astring.git
//
// Please use the GitHub bug tracker to report issues:
// https://github.com/davidbonnet/astring/issues

import {
    ArrayExpression,
    ArrowFunctionExpression,
    AssignmentExpression,
    AssignmentPattern,
    AwaitExpression, BigIntLiteral,
    BinaryExpression,
    BreakStatement,
    CallExpression,
    ChainExpression,
    ClassDeclaration,
    ClassExpression, Comment,
    ConditionalExpression,
    ContinueStatement,
    DebuggerStatement,
    DoWhileStatement,
    EmptyStatement,
    ExportAllDeclaration,
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    ExpressionStatement,
    ForInStatement,
    ForStatement,
    FunctionDeclaration,
    Identifier,
    IfStatement,
    ImportDeclaration,
    ImportExpression,
    LabeledStatement,
    Literal,
    MemberExpression,
    MetaProperty,
    MethodDefinition,
    NewExpression,
    Node as EstreeNode,
    ObjectExpression,
    ObjectPattern,
    PrivateIdentifier,
    Property,
    PropertyDefinition,
    RegExpLiteral,
    RestElement,
    ReturnStatement,
    SequenceExpression,
    Super,
    SwitchStatement,
    TaggedTemplateExpression,
    TemplateElement,
    TemplateLiteral,
    ThisExpression,
    ThrowStatement,
    TryStatement,
    UnaryExpression,
    UpdateExpression,
    VariableDeclaration,
    VariableDeclarator,
    WhileStatement,
    WithStatement,
    YieldExpression
} from "estree";

declare module 'estree' {
    interface BaseNode {
        comments?: Comment[] | undefined;
    }
}


/**
 * Code generator for each node type.
 */
export type Generator = {
    [T in EstreeNode['type']]: (
        node: EstreeNode & { type: T },
        state: State,
    ) => void
}

export type ExpressionsPrecedenceOptions = {
    // Definitions
    ArrayExpression: number,
    TaggedTemplateExpression: number,
    ThisExpression: number,
    Identifier: number,
    PrivateIdentifier: number,
    Literal: number,
    TemplateLiteral: number,
    Super: number,
    SequenceExpression: number,
    // Operations
    MemberExpression: number,
    ChainExpression: number,
    CallExpression: number,
    NewExpression: number,
    // Other definitions
    ArrowFunctionExpression: number,
    ClassExpression: number,
    FunctionExpression: number,
    ObjectExpression: number,
    // Other operations
    UpdateExpression: number,
    UnaryExpression: number,
    AwaitExpression: number,
    BinaryExpression: number,
    LogicalExpression: number,
    ConditionalExpression: number,
    AssignmentExpression: number,
    YieldExpression: number,
    RestElement: number,
}

/**
 * Code generator options.
 */
export interface Options {
    /**
     * String to use for indentation, defaults to `"␣␣"`.
     */
    indent?: string
    /**
     * Indent level to start from, defaults to `0`.
     */
    startingIndentLevel?: number
    /**
     * Generate comments if `true`, defaults to `false`.
     */
    comments?: boolean
    /**
     * Custom code generator logic.
     */
    generator?: Generator;
    expressionsPrecedence?: ExpressionsPrecedenceOptions;

    write?(code: string): string;

    writeKeyword?(code: string): string;

    writeNode?(code: string, node?: EstreeNode & { type: string }): string;

    writeLineEnd?(): string;
}

const {stringify} = JSON

/* c8 ignore if */
if (!String.prototype.repeat) {
    /* c8 ignore next */
    throw new Error(
        'String.prototype.repeat is undefined, see https://github.com/davidbonnet/astring#installation',
    )
}

/* c8 ignore if */
if (!String.prototype.endsWith) {
    /* c8 ignore next */
    throw new Error(
        'String.prototype.endsWith is undefined, see https://github.com/davidbonnet/astring#installation',
    )
}

const OPERATOR_PRECEDENCE = {
    '||': 2,
    '??': 3,
    '&&': 4,
    '|': 5,
    '^': 6,
    '&': 7,
    '==': 8,
    '!=': 8,
    '===': 8,
    '!==': 8,
    '<': 9,
    '>': 9,
    '<=': 9,
    '>=': 9,
    in: 9,
    instanceof: 9,
    '<<': 10,
    '>>': 10,
    '>>>': 10,
    '+': 11,
    '-': 11,
    '*': 12,
    '%': 12,
    '/': 12,
    '**': 13,
}

// Enables parenthesis regardless of precedence
export const NEEDS_PARENTHESES = 17

export const EXPRESSIONS_PRECEDENCE: ExpressionsPrecedenceOptions = {
    // Definitions
    ArrayExpression: 20,
    TaggedTemplateExpression: 20,
    ThisExpression: 20,
    Identifier: 20,
    PrivateIdentifier: 20,
    Literal: 18,
    TemplateLiteral: 20,
    Super: 20,
    SequenceExpression: 20,
    // Operations
    MemberExpression: 19,
    ChainExpression: 19,
    CallExpression: 19,
    NewExpression: 19,
    // Other definitions
    ArrowFunctionExpression: NEEDS_PARENTHESES,
    ClassExpression: NEEDS_PARENTHESES,
    FunctionExpression: NEEDS_PARENTHESES,
    ObjectExpression: NEEDS_PARENTHESES,
    // Other operations
    UpdateExpression: 16,
    UnaryExpression: 15,
    AwaitExpression: 15,
    BinaryExpression: 14,
    LogicalExpression: 13,
    ConditionalExpression: 4,
    AssignmentExpression: 3,
    YieldExpression: 2,
    RestElement: 1,
}

function formatSequence(state, nodes) {
    /*
    Writes into `state` a sequence of `nodes`.
    */
    const {generator} = state
    state.write('(')
    if (nodes != null && nodes.length > 0) {
        generator[nodes[0].type](nodes[0], state)
        const {length} = nodes
        for (let i = 1; i < length; i++) {
            const param = nodes[i]
            state.write(', ')
            generator[param.type](param, state)
        }
    }
    state.write(')')
}

function expressionNeedsParenthesis(state, node, parentNode, isRightHand?: boolean) {
    const nodePrecedence = state.expressionsPrecedence![node.type]
    if (nodePrecedence === NEEDS_PARENTHESES) {
        return true
    }
    const parentNodePrecedence = state.expressionsPrecedence![parentNode.type]
    if (nodePrecedence !== parentNodePrecedence) {
        // Different node types
        return (
            (!isRightHand &&
                nodePrecedence === 15 &&
                parentNodePrecedence === 14 &&
                parentNode.operator === '**') ||
            nodePrecedence < parentNodePrecedence
        )
    }
    if (nodePrecedence !== 13 && nodePrecedence !== 14) {
        // Not a `LogicalExpression` or `BinaryExpression`
        return false
    }
    if (node.operator === '**' && parentNode.operator === '**') {
        // Exponentiation operator has right-to-left associativity
        return !isRightHand
    }
    if (
        nodePrecedence === 13 &&
        parentNodePrecedence === 13 &&
        (node.operator === '??' || parentNode.operator === '??')
    ) {
        // Nullish coalescing and boolean operators cannot be combined
        return true
    }
    if (isRightHand) {
        // Parenthesis are used if both operators have the same precedence
        return (
            OPERATOR_PRECEDENCE[node.operator] <=
            OPERATOR_PRECEDENCE[parentNode.operator]
        )
    }
    return (
        OPERATOR_PRECEDENCE[node.operator] <
        OPERATOR_PRECEDENCE[parentNode.operator]
    )
}

function formatExpression(state, node, parentNode, isRightHand?: boolean) {
    /*
    Writes into `state` the provided `node`, adding parenthesis around if the provided `parentNode` needs it. If `node` is a right-hand argument, the provided `isRightHand` parameter should be `true`.
    */
    const {generator} = state
    if (expressionNeedsParenthesis(state, node, parentNode, isRightHand)) {
        state.write('(')
        generator[node.type](node, state)
        state.write(')')
    } else {
        generator[node.type](node, state)
    }
}

function reindent(state, text, indent) {
    /*
    Writes into `state` the `text` string reindented with the provided `indent`.
    */
    const lines = text.split('\n')
    const end = lines.length - 1
    state.write(lines[0].trim())
    if (end > 0) {
        state.writeLineEnd();
        for (let i = 1; i < end; i++) {
            state.write(indent + lines[i].trim())
            state.writeLineEnd();
        }
        state.write(indent + lines[end].trim())
    }
}

function formatComments(state: State, comments: Comment[], indent: string) {
    /*
    Writes into `state` the provided list of `comments`, with the given `indent` and `lineEnd` strings.
    Expects to start on a new unindented line.
    */
    const {length} = comments
    for (let i = 0; i < length; i++) {
        const comment = comments[i]
        state.write(indent)
        if (comment.type[0] === 'L') {
            // Line comment
            state.writeNode('// ' + comment.value.trim(), comment as EstreeNode)
            state.writeLineEnd();
        } else {
            // Block comment
            state.write('/*')
            reindent(state, comment.value, indent)
            state.write('*/')
            state.writeLineEnd();
        }
    }
}

function hasCallExpression(node) {
    /*
    Returns `true` if the provided `node` contains a call expression and `false` otherwise.
    */
    let currentNode = node
    while (currentNode != null) {
        const {type} = currentNode
        if (type[0] === 'C' && type[1] === 'a') {
            // Is CallExpression
            return true
        } else if (type[0] === 'M' && type[1] === 'e' && type[2] === 'm') {
            // Is MemberExpression
            currentNode = currentNode.object
        } else {
            return false
        }
    }
}

function formatVariableDeclaration(state, node) {
    /*
    Writes into `state` a variable declaration.
    */
    const {generator} = state
    const {declarations} = node
    state.writeKeyword(node.kind);
    state.write(' ');
    const {length} = declarations
    if (length > 0) {
        generator.VariableDeclarator(declarations[0], state)
        for (let i = 1; i < length; i++) {
            state.write(', ')
            generator.VariableDeclarator(declarations[i], state)
        }
    }
}

let ForInStatement,
    FunctionDeclaration,
    RestElement,
    BinaryExpression,
    ArrayExpression,
    BlockStatement

export const GENERATOR: Generator = {
    /*
    Default generator.
    */
    Program(node, state: State) {
        const indent = state.indent.repeat(state.indentLevel)
        const {writeComments} = state
        if (writeComments && node.comments != null) {
            formatComments(state, node.comments, indent)
        }
        const statements = node.body
        const {length} = statements
        for (let i = 0; i < length; i++) {
            const statement = statements[i]
            if (writeComments && statement.comments != null) {
                formatComments(state, statement.comments, indent)
            }
            state.write(indent)
            this[statement.type](statement, state)
            state.writeLineEnd();
        }
        if (writeComments && node.trailingComments != null) {
            formatComments(state, node.trailingComments, indent)
        }
    },
    BlockStatement: (BlockStatement = function (node, state: State) {
        const indent = state.indent.repeat(state.indentLevel++)
        const {writeComments} = state
        const statementIndent = indent + state.indent
        state.write('{')
        const statements = node.body
        if (statements != null && statements.length > 0) {
            state.writeLineEnd();
            if (writeComments && node.comments != null) {
                formatComments(state, node.comments, statementIndent)
            }
            const {length} = statements
            for (let i = 0; i < length; i++) {
                const statement = statements[i]
                if (writeComments && statement.comments != null) {
                    formatComments(state, statement.comments, statementIndent)
                }
                state.write(statementIndent)
                this[statement.type](statement, state)
                state.writeLineEnd();
            }
            state.write(indent)
        } else {
            if (writeComments && node.comments != null) {
                state.writeLineEnd();
                formatComments(state, node.comments, statementIndent)
                state.write(indent)
            }
        }
        if (writeComments && node.trailingComments != null) {
            formatComments(state, node.trailingComments, statementIndent)
        }
        state.write('}')
        state.indentLevel--
    }),
    ClassBody: BlockStatement,
    StaticBlock(node, state: State) {
        state.write('static ')
        this.BlockStatement(node, state)
    },
    EmptyStatement(node: EmptyStatement, state: State) {
        state.write(';')
    },
    ExpressionStatement(node: ExpressionStatement, state: State) {
        const precedence = state.expressionsPrecedence![node.expression.type]
        if (
            precedence === NEEDS_PARENTHESES ||
            (precedence === 3 && (node.expression as any).left.type[0] === 'O')
        ) {
            // Should always have parentheses or is an AssignmentExpression to an ObjectPattern
            state.write('(')
            this[node.expression.type](node.expression, state)
            state.write(')')
        } else {
            this[node.expression.type](node.expression, state)
        }
        state.write(';')
    },
    IfStatement(node: IfStatement, state: State) {
        state.writeKeyword('if');
        state.write(' (')
        this[node.test.type](node.test, state)
        state.write(') ')
        this[node.consequent.type](node.consequent, state)
        if (node.alternate != null) {
            state.write(' ')
            state.writeKeyword('else');
            state.write(' ')
            this[node.alternate.type](node.alternate, state)
        }
    },
    LabeledStatement(node: LabeledStatement, state: State) {
        this[node.label.type](node.label, state)
        state.write(': ')
        this[node.body.type](node.body, state)
    },
    BreakStatement(node: BreakStatement, state: State) {
        state.writeKeyword('break')
        if (node.label != null) {
            state.write(' ')
            this[node.label.type](node.label, state)
        }
        state.write(';')
    },
    ContinueStatement(node: ContinueStatement, state: State) {
        state.writeKeyword('continue')
        if (node.label != null) {
            state.write(' ')
            this[node.label.type](node.label, state)
        }
        state.write(';')
    },
    WithStatement(node: WithStatement, state: State) {
        state.writeKeyword('with');
        state.write(' (')
        this[node.object.type](node.object, state)
        state.write(') ')
        this[node.body.type](node.body, state)
    },
    SwitchStatement(node: SwitchStatement, state: State) {
        const indent = state.indent.repeat(state.indentLevel++)
        const {writeComments} = state
        state.indentLevel++
        const caseIndent = indent + state.indent
        const statementIndent = caseIndent + state.indent
        state.writeKeyword('switch');
        state.write(' (')
        this[node.discriminant.type](node.discriminant, state)
        state.write(') {')
        state.writeLineEnd();
        const {cases: occurences} = node
        const {length: occurencesCount} = occurences
        for (let i = 0; i < occurencesCount; i++) {
            const occurence = occurences[i]
            if (writeComments && occurence.comments) {
                formatComments(state, occurence.comments, caseIndent)
            }
            if (occurence.test) {
                state.write(caseIndent)
                state.writeKeyword('case');
                state.write(' ');
                this[occurence.test.type](occurence.test, state)
                state.write(':')
                state.writeLineEnd();
            } else {
                state.write(caseIndent)
                state.writeKeyword('default');
                state.write(':');
                state.writeLineEnd();
            }
            const {consequent} = occurence
            const {length: consequentCount} = consequent
            for (let i = 0; i < consequentCount; i++) {
                const statement = consequent[i]
                if (writeComments && statement.comments) {
                    formatComments(state, statement.comments, statementIndent)
                }
                state.write(statementIndent)
                this[statement.type](statement, state)
                state.writeLineEnd();
            }
        }
        state.indentLevel -= 2
        state.write(indent + '}')
    },
    ReturnStatement(node: ReturnStatement, state: State) {
        state.writeKeyword('return')
        if (node.argument) {
            state.write(' ')
            this[node.argument.type](node.argument, state)
        }
        state.write(';')
    },
    ThrowStatement(node: ThrowStatement, state: State) {
        state.writeKeyword('throw')
        state.write(' ')
        this[node.argument.type](node.argument, state)
        state.write(';')
    },
    TryStatement(node: TryStatement, state: State) {
        state.writeKeyword('try')
        state.write(' ')
        this[node.block.type](node.block, state)
        if (node.handler) {
            const {handler} = node
            if (handler!.param == null) {
                state.write(' ')
                state.writeKeyword('catch');
                state.write(' ')
            } else {
                state.write(' ')
                state.writeKeyword('catch');
                state.write(' (')
                this[handler!.param.type](handler!.param, state)
                state.write(') ')
            }
            this[handler!.body.type](handler!.body, state)
        }
        if (node.finalizer) {
            state.write(' ')
            state.writeKeyword('finally');
            state.write(' ')
            this[node.finalizer.type](node.finalizer, state)
        }
    },
    WhileStatement(node: WhileStatement, state: State) {
        state.writeKeyword('while');
        state.write(' (')
        this[node.test.type](node.test, state)
        state.write(') ')
        this[node.body.type](node.body, state)
    },
    DoWhileStatement(node: DoWhileStatement, state: State) {
        state.writeKeyword('do');
        state.write(' ')
        this[node.body.type](node.body, state)
        state.write(' ')
        state.writeKeyword('while');
        state.write(' (')
        this[node.test.type](node.test, state)
        state.write(');')
    },
    ForStatement(node: ForStatement, state: State) {
        state.writeKeyword('for');
        state.write(' (')
        if (node.init != null) {
            const {init} = node
            if (init!.type[0] === 'V') {
                formatVariableDeclaration(state, init)
            } else {
                this[init!.type](init, state)
            }
        }
        state.write('; ')
        if (node.test) {
            this[node.test.type](node.test, state)
        }
        state.write('; ')
        if (node.update) {
            this[node.update.type](node.update, state)
        }
        state.write(') ')
        this[node.body.type](node.body, state)
    },
    ForInStatement: (ForInStatement = function (node: ForInStatement, state: State) {
        state.writeKeyword('for');
        state.write(` `)
        if ((node as any).await) {
            state.writeKeyword('await');
            state.write(' ');
        }
        state.write(`(`)
        const {left} = node
        if (left.type[0] === 'V') {
            formatVariableDeclaration(state, left)
        } else {
            this[left.type](left, state)
        }
        // Identifying whether node.type is `ForInStatement` or `ForOfStatement`
        state.write(' ');
        state.writeKeyword(node.type[3] === 'I' ? 'in' : 'of')
        state.write(' ');
        this[node.right.type](node.right, state)
        state.write(') ')
        this[node.body.type](node.body, state)
    }),
    ForOfStatement: ForInStatement,
    DebuggerStatement(node: DebuggerStatement, state: State) {
        state.writeNode('debugger', node);
        state.write(';')
    },
    FunctionDeclaration: (FunctionDeclaration = function (node: FunctionDeclaration, state: State) {
        if (node.async) {
            state.writeKeyword('async');
        }
        state.writeNode((node.generator ? 'function*' : 'function'), node);
        if (node.id) {
            state.write(' ');
            state.writeNode(node.id.name, node.id);
        }
        formatSequence(state, node.params)
        state.write(' ')
        this[node.body.type](node.body, state)
    }),
    FunctionExpression: FunctionDeclaration,
    VariableDeclaration(node: VariableDeclaration, state: State) {
        formatVariableDeclaration(state, node)
        state.write(';')
    },
    VariableDeclarator(node: VariableDeclarator, state: State) {
        this[node.id.type](node.id, state)
        if (node.init != null) {
            state.write(' = ')
            this[node.init.type](node.init, state)
        }
    },
    ClassDeclaration(node: ClassDeclaration, state: State) {
        state.writeNode('class', node);
        state.write(' ');
        if (node.id) {
            state.writeNode(node.id.name, node.id);
        }
        if (node.superClass) {
            state.write(' ');
            state.writeKeyword('extends');
            state.write(' ');
            const {superClass} = node
            const {type} = superClass
            const precedence = state.expressionsPrecedence![type]
            if (
                (type[0] !== 'C' || type[1] !== 'l' || type[5] !== 'E') &&
                (precedence === NEEDS_PARENTHESES ||
                    precedence < state.expressionsPrecedence.ClassExpression)
            ) {
                // Not a ClassExpression that needs parentheses
                state.write('(')
                this[node.superClass.type](superClass, state)
                state.write(')')
            } else {
                this[superClass!.type](superClass, state)
            }
            state.write(' ')
        }
        this.ClassBody(node.body, state)
    },
    ImportDeclaration(node: ImportDeclaration, state: State) {
        state.writeKeyword('import');
        state.write(' ');
        const {specifiers} = node
        const {length} = specifiers
        // TODO: Once babili is fixed, put this after condition
        // https://github.com/babel/babili/issues/430
        let i = 0
        if (length > 0) {
            for (; i < length;) {
                if (i > 0) {
                    state.write(', ')
                }
                const specifier = specifiers[i]
                const type = specifier.type[6]
                if (type === 'D') {
                    // ImportDefaultSpecifier
                    state.writeNode(specifier.local.name, specifier)
                    i++
                } else if (type === 'N') {
                    // ImportNamespaceSpecifier
                    state.write("* ");
                    state.writeKeyword('as');
                    state.write(' ')
                    state.writeNode(specifier.local.name, specifier);
                    i++
                } else {
                    // ImportSpecifier
                    break
                }
            }
            if (i < length) {
                state.write('{')
                for (; ;) {
                    const specifier = specifiers[i]
                    const {name} = (specifier as any).imported
                    state.writeNode(name, specifier)
                    if (name !== specifier.local.name) {
                        state.write(' ');
                        state.writeKeyword('as');
                        state.write(' ');
                        state.writeNode(specifier.local.name, specifier.local);
                    }
                    if (++i < length) {
                        state.write(', ')
                    } else {
                        break
                    }
                }
                state.write('}')
            }
            state.write(' ');
            state.writeKeyword('from');
            state.write(' ');
        }
        this.Literal(node.source, state)
        state.write(';')
    },
    ImportExpression(node: ImportExpression, state: State) {
        state.writeKeyword('import');
        state.write('(')
        this[node.source.type](node.source, state)
        state.write(')')
    },
    ExportDefaultDeclaration(node: ExportDefaultDeclaration, state: State) {
        state.writeKeyword('export');
        state.write(' ');
        state.writeKeyword('default');
        state.write(' ');
        this[node.declaration.type](node.declaration, state)
        if (
            state.expressionsPrecedence![node.declaration.type] != null &&
            node.declaration.type[0] !== 'F'
        ) {
            // All expression nodes except `FunctionExpression`
            state.write(';')
        }
    },
    ExportNamedDeclaration(node: ExportNamedDeclaration, state: State) {
        state.writeKeyword('export')
        state.write(' ')
        if (node.declaration) {
            this[node.declaration.type](node.declaration, state)
        } else {
            state.write('{')
            const {specifiers} = node,
                {length} = specifiers
            if (length > 0) {
                for (let i = 0; ;) {
                    const specifier = specifiers[i]
                    const {name} = specifier.local
                    state.writeNode(name, specifier)
                    if (name !== specifier.exported.name) {
                        state.write(' ');
                        state.writeKeyword('as');
                        state.write(' ');
                        state.writeNode(specifier.exported.name, specifier.exported);
                    }
                    if (++i < length) {
                        state.write(', ')
                    } else {
                        break
                    }
                }
            }
            state.write('}')
            if (node.source) {
                state.write(' ')
                state.writeKeyword('from')
                state.write(' ')
                this.Literal(node.source, state)
            }
            state.write(';')
        }
    },
    ExportAllDeclaration(node: ExportAllDeclaration, state: State) {
        state.writeKeyword('export')
        state.write(' * ')
        if (node.exported != null) {
            state.writeKeyword('as')
            state.write(' ')
            state.writeNode(node.exported.name, node.exported);
            state.write(' ')
        }
        state.writeKeyword('from')
        state.write(' ')
        this.Literal(node.source, state)
        state.write(';')
    },
    MethodDefinition(node: MethodDefinition, state: State) {
        if (node.static) {
            state.writeKeyword('static')
            state.write(' ')
        }
        const kind = node.kind[0]
        if (kind === 'g' || kind === 's') {
            // Getter or setter
            state.writeKeyword(node.kind)
            state.write(' ')
        }
        if (node.value.async) {
            state.writeKeyword('async')
            state.write(' ')
        }
        if (node.value.generator) {
            state.write('*')
        }
        if (node.computed) {
            state.write('[')
            this[node.key.type](node.key, state)
            state.write(']')
        } else {
            this[node.key.type](node.key, state)
        }
        formatSequence(state, node.value.params)
        state.write(' ')
        this[node.value.body.type](node.value.body, state)
    },
    ClassExpression(node: ClassExpression, state: State) {
        this.ClassDeclaration(node, state)
    },
    ArrowFunctionExpression(node: ArrowFunctionExpression, state: State) {
        if (node.async) {
            state.writeKeyword('async');
            state.write(' ');
        }
        const {params} = node
        if (params) {
            // Omit parenthesis if only one named parameter
            if (params.length === 1 && params[0].type[0] === 'I') {
                // If params[0].type[0] starts with 'I', it can't be `ImportDeclaration` nor `IfStatement` and thus is `Identifier`
                state.writeNode((params[0] as any).name, params[0]);
            } else {
                formatSequence(state, node.params)
            }
        }
        state.write(' => ')
        if (node.body.type[0] === 'O') {
            // Body is an object expression
            state.write('(')
            this.ObjectExpression(node.body, state)
            state.write(')')
        } else {
            this[node.body.type](node.body, state)
        }
    },
    ThisExpression(node: ThisExpression, state: State) {
        state.writeNode('this', node)
    },
    Super(node: Super, state: State) {
        state.writeNode('super', node)
    },
    RestElement: (RestElement = function (node: RestElement, state: State) {
        state.writeNode('...', node);
        this[node.argument.type](node.argument, state)
    }),
    SpreadElement: RestElement,
    YieldExpression(node: YieldExpression, state: State) {
        state.writeKeyword(node.delegate ? 'yield*' : 'yield')
        if (node.argument) {
            state.write(' ')
            this[node.argument.type](node.argument, state)
        }
    },
    AwaitExpression(node: AwaitExpression, state: State) {
        state.writeNode('await', node)
        state.write(' ')
        formatExpression(state, node.argument, node)
    },
    TemplateLiteral(node: TemplateLiteral, state: State) {
        const {quasis, expressions} = node
        state.write('`')
        const {length} = expressions
        for (let i = 0; i < length; i++) {
            const expression = expressions[i]
            const quasi = quasis[i]
            state.writeNode(quasi.value.raw, quasi)
            state.write('${')
            this[expression.type](expression, state)
            state.write('}')
        }
        const quasi = quasis[quasis.length - 1]
        state.writeNode(quasi.value.raw, quasi)
        state.write('`')
    },
    TemplateElement(node: TemplateElement, state: State) {
        state.writeNode(node.value.raw, node)
    },
    TaggedTemplateExpression(node: TaggedTemplateExpression, state: State) {
        formatExpression(state, node.tag, node)
        this[node.quasi.type](node.quasi, state)
    },
    ArrayExpression: (ArrayExpression = function (node: ArrayExpression, state: State) {
        state.write('[')
        if (node.elements.length > 0) {
            const {elements} = node,
                {length} = elements
            for (let i = 0; ;) {
                const element = elements[i]
                if (element != null) {
                    this[element.type](element, state)
                }
                if (++i < length) {
                    state.write(', ')
                } else {
                    if (element == null) {
                        state.write(', ')
                    }
                    break
                }
            }
        }
        state.write(']')
    }),
    ArrayPattern: ArrayExpression,
    ObjectExpression(node: ObjectExpression, state: State) {
        const indent = state.indent.repeat(state.indentLevel++)
        const {writeComments} = state
        const propertyIndent = indent + state.indent
        state.write('{')
        if (node.properties.length > 0) {
            state.writeLineEnd();
            if (writeComments && node.comments) {
                formatComments(state, node.comments, propertyIndent)
            }
            const comma = ','
            const {properties} = node,
                {length} = properties
            for (let i = 0; ;) {
                const property = properties[i]
                if (writeComments && property.comments) {
                    formatComments(state, property.comments, propertyIndent)
                }
                state.write(propertyIndent)
                this[property.type](property, state)
                if (++i < length) {
                    state.write(comma)
                    state.writeLineEnd();
                } else {
                    break
                }
            }
            state.writeLineEnd();
            if (writeComments && node.trailingComments) {
                formatComments(state, node.trailingComments, propertyIndent)
            }
            state.write(indent + '}')
        } else if (writeComments) {
            if (node.comments) {
                state.writeLineEnd();
                formatComments(state, node.comments, propertyIndent)
                if (node.trailingComments) {
                    formatComments(state, node.trailingComments, propertyIndent)
                }
                state.write(indent + '}')
            } else if (node.trailingComments) {
                state.writeLineEnd();
                formatComments(state, node.trailingComments, propertyIndent)
                state.write(indent + '}')
            } else {
                state.write('}')
            }
        } else {
            state.write('}')
        }
        state.indentLevel--
    },
    Property(node: Property, state: State) {
        if (node.method || node.kind[0] !== 'i') {
            // Either a method or of kind `set` or `get` (not `init`)
            this.MethodDefinition(node, state)
        } else {
            if (!node.shorthand) {
                if (node.computed) {
                    state.write('[')
                    this[node.key.type](node.key, state)
                    state.write(']')
                } else {
                    this[node.key.type](node.key, state)
                }
                state.write(': ')
            }
            this[node.value.type](node.value, state)
        }
    },
    PropertyDefinition(node: PropertyDefinition, state: State) {
        if (node.static) {
            state.writeKeyword('static')
            state.write(' ')
        }
        if (node.computed) {
            state.write('[')
        }
        this[node.key.type](node.key, state)
        if (node.computed) {
            state.write(']')
        }
        if (node.value == null) {
            if (node.key.type[0] !== 'F') {
                state.write(';')
            }
            return
        }
        state.write(' = ')
        this[node.value.type](node.value, state)
        state.write(';')
    },
    ObjectPattern(node: ObjectPattern, state: State) {
        state.write('{')
        if (node.properties.length > 0) {
            const {properties} = node,
                {length} = properties
            for (let i = 0; ;) {
                this[properties[i].type](properties[i], state)
                if (++i < length) {
                    state.write(', ')
                } else {
                    break
                }
            }
        }
        state.write('}')
    },
    SequenceExpression(node: SequenceExpression, state: State) {
        formatSequence(state, node.expressions)
    },
    UnaryExpression(node: UnaryExpression, state: State) {
        if (node.prefix) {
            const {
                operator,
                argument,
                argument: {type},
            } = node
            state.write(operator)
            const needsParentheses = expressionNeedsParenthesis(state, argument, node)
            if (
                !needsParentheses &&
                (operator.length > 1 ||
                    (type[0] === 'U' &&
                        (type[1] === 'n' || type[1] === 'p') &&
                        (argument as any).prefix &&
                        (argument as any).operator[0] === operator &&
                        (operator === '+' || operator === '-')))
            ) {
                // Large operator or argument is UnaryExpression or UpdateExpression node
                state.write(' ')
            }
            if (needsParentheses) {
                state.write(operator.length > 1 ? ' (' : '(')
                this[type](argument, state)
                state.write(')')
            } else {
                this[type](argument, state)
            }
        } else {
            // FIXME: This case never occurs
            this[node.argument.type](node.argument, state)
            state.write(node.operator)
        }
    },
    UpdateExpression(node: UpdateExpression, state: State) {
        // Always applied to identifiers or members, no parenthesis check needed
        if (node.prefix) {
            state.write(node.operator)
            this[node.argument.type](node.argument, state)
        } else {
            this[node.argument.type](node.argument, state)
            state.write(node.operator)
        }
    },
    AssignmentExpression(node: AssignmentExpression, state: State) {
        this[node.left.type](node.left, state)
        state.write(' ' + node.operator + ' ')
        this[node.right.type](node.right, state)
    },
    AssignmentPattern(node: AssignmentPattern, state: State) {
        this[node.left.type](node.left, state)
        state.write(' = ')
        this[node.right.type](node.right, state)
    },
    BinaryExpression: (BinaryExpression = function (node: BinaryExpression, state: State) {
        const isIn = node.operator === 'in'
        if (isIn) {
            // Avoids confusion in `for` loops initializers
            state.write('(')
        }
        formatExpression(state, node.left, node, false)
        state.write(' ' + node.operator + ' ')
        formatExpression(state, node.right, node, true)
        if (isIn) {
            state.write(')')
        }
    }),
    LogicalExpression: BinaryExpression,
    ConditionalExpression(node: ConditionalExpression, state: State) {
        const {test} = node
        const precedence = state.expressionsPrecedence![test.type]
        if (
            precedence === NEEDS_PARENTHESES ||
            precedence <= state.expressionsPrecedence.ConditionalExpression
        ) {
            state.write('(')
            this[test.type](test, state)
            state.write(')')
        } else {
            this[test.type](test, state)
        }
        state.write(' ? ')
        this[node.consequent.type](node.consequent, state)
        state.write(' : ')
        this[node.alternate.type](node.alternate, state)
    },
    NewExpression(node: NewExpression, state: State) {
        state.writeKeyword('new')
        state.write(' ')
        const precedence = state.expressionsPrecedence![node.callee.type]
        if (
            precedence === NEEDS_PARENTHESES ||
            precedence < state.expressionsPrecedence.CallExpression ||
            hasCallExpression(node.callee)
        ) {
            state.write('(')
            this[node.callee.type](node.callee, state)
            state.write(')')
        } else {
            this[node.callee.type](node.callee, state)
        }
        formatSequence(state, node['arguments'])
    },
    CallExpression(node: CallExpression, state: State) {
        const precedence = state.expressionsPrecedence[node.callee.type]
        if (
            precedence === NEEDS_PARENTHESES ||
            precedence < state.expressionsPrecedence.CallExpression
        ) {
            state.write('(')
            this[node.callee.type](node.callee, state)
            state.write(')')
        } else {
            this[node.callee.type](node.callee, state)
        }
        if ((node as any).optional) {
            state.write('?.')
        }
        formatSequence(state, node['arguments'])
    },
    ChainExpression(node: ChainExpression, state: State) {
        this[node.expression.type](node.expression, state)
    },
    MemberExpression(node: MemberExpression, state: State) {
        const precedence = state.expressionsPrecedence![node.object.type]
        if (
            precedence === NEEDS_PARENTHESES ||
            precedence < state.expressionsPrecedence.MemberExpression
        ) {
            state.write('(')
            this[node.object.type](node.object, state)
            state.write(')')
        } else {
            this[node.object.type](node.object, state)
        }
        if (node.computed) {
            if (node.optional) {
                state.write('?.')
            }
            state.write('[')
            this[node.property.type](node.property, state)
            state.write(']')
        } else {
            if (node.optional) {
                state.write('?.')
            } else {
                state.write('.')
            }
            this[node.property.type](node.property, state)
        }
    },
    MetaProperty(node: MetaProperty, state: State) {
        state.writeNode(node.meta.name, node.meta);
        state.write('.');
        state.writeNode(node.property.name, node.property);
    },
    Identifier(node: Identifier, state: State) {
        state.writeNode(node.name, node)
    },
    PrivateIdentifier(node: PrivateIdentifier, state: State) {
        state.writeKeyword('#');
        state.writeNode(`${node.name}`, node);
    },
    Literal(node: Literal, state: State) {
        if (node.raw != null) {
            // Non-standard property
            state.writeNode(node.raw, node)
        } else if ((node as any).regex) {
            this.RegExpLiteral(node, state)
        } else if ((node as any).bigint) {
            state.writeNode((node as BigIntLiteral).bigint + 'n', node)
        } else {
            state.writeNode(stringify(node.value), node)
        }
    },
    RegExpLiteral(node: RegExpLiteral, state: State) {
        const {regex} = node
        state.writeNode(`/${regex.pattern}/${regex.flags}`, node)
    },
}

const EMPTY_OBJECT: Options = {}

/*
DEPRECATED: Alternate export of `GENERATOR`.
*/
export const baseGenerator = GENERATOR

export class State {
    output: string;
    writeComments: boolean;
    indent: string;
    indentLevel: number;
    line?: number;
    column?: number;
    generator: Generator;
    expressionsPrecedence: ExpressionsPrecedenceOptions;

    constructor(options: Options | null) {
        const setup = options == null ? EMPTY_OBJECT : options
        this.output = ''
        this.generator = setup.generator != undefined ? setup.generator : GENERATOR
        this.expressionsPrecedence =
            setup.expressionsPrecedence != undefined
                ? setup.expressionsPrecedence
                : EXPRESSIONS_PRECEDENCE
        // Formating setup
        this.indent = setup.indent != null ? setup.indent : '  '
        this.indentLevel =
            setup.startingIndentLevel != null ? setup.startingIndentLevel : 0
        this.writeComments = setup.comments ? setup.comments : false
        if (setup.write) {
            this.write = (code) => this.output += setup.write!(code);
        }
        if (setup.writeKeyword) {
            this.writeKeyword = (code) => this.output += setup.writeKeyword!(code);
        }
        if (setup.writeNode) {
            this.writeNode = (code, node) => this.output += setup.writeNode!(code, node);
        }
        if (setup.writeLineEnd) {
            this.writeLineEnd = () => this.output += setup.writeLineEnd!();
        }
    }

    write = (code: string): void => {
        this.output += code
    }

    writeKeyword = (code: string): void => {
        this.output += code
    }

    writeNode = (code: string, node?: EstreeNode): void => {
        this.output += code
    }

    writeLineEnd = (): void => {
        this.output += '\n';
    }

    toString() {
        return this.output
    }
}

export function generate(node: EstreeNode, options?: Options) {
    /*
    Returns a string representing the rendered code of the provided AST `node`.
    The `options` are:

    - `indent`: string to use for indentation (defaults to `␣␣`)
    - `startingIndentLevel`: indent level to start from (defaults to `0`)
    - `comments`: generate comments if `true` (defaults to `false`)
    - `output`: output stream to write the rendered code to (defaults to `null`)
    - `generator`: custom code generator (defaults to `GENERATOR`)
    - `expressionsPrecedence`: custom map of node types and their precedence level (defaults to `EXPRESSIONS_PRECEDENCE`)
    */
    const state = new State(options === undefined ? null : options)
    // Travel through the AST node and generate the code
    state.generator[(node as any).type](node, state)
    return state.output
}
