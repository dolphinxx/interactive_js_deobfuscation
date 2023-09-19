import {config, expect, use} from 'chai';
// @ts-ignore
import chaiDiff from 'chai-diff';
import {AstTransformer, EsNode} from "../src/global";
import {computedToDot, evalConstantExpressions,} from "../src/traverse";
import {applyAstParent} from "../src/util";
import {join} from "path";
import {readFileSync} from "fs";
import {parse} from "acorn";
import {generate} from "../src/astring";
import {
    controlFlowFlatteningAll,
    hexadecimal,
    inlineConstantsAll,
    simplifyAll,
    stringArrayTransformations
} from "../src/transform";
import {Program} from 'estree';

use(chaiDiff);

// globalThis.logDebug = (...msg:string[]) => console.log(...msg);
// suppress log
globalThis.logDebug = () => {
};

config.truncateThreshold = 0;

const generateOptions = {
    indent: '    '
};

export function runTest(input: string, expected: string, transformer: (node: EsNode) => void, msg?: string) {
    const node = parse(input, {ecmaVersion: 'latest'}) as EsNode;
    applyAstParent(node);
    transformer(node);
    const actual = generate(node, generateOptions).trim();
    // console.log(actual);
    expect(actual).to.equal(expected.trim(), msg as any);
}

export function prepareAst(code: string): Program {
    let ast = parse(code, {ecmaVersion: 'latest'}) as EsNode;
    applyAstParent(ast);
    return ast as Program;
}

const expectedLabel = '// @@expected';

export function cleanExpected(raw: string): string {
    const pos = raw.indexOf(expectedLabel);
    if (pos !== -1) {
        raw = raw.substring(pos + expectedLabel.length);
    }
    return raw.replace(/\r\n/g, '\n').trim();
}

/**
 * Run the transformer(s) and diff the result.
 * Automatically run hexadecimal after transform.
 * @param name
 * @param transformer
 */
export function runTransformerTest(name: string, transformer: AstTransformer | AstTransformer[]) {
    const ast = prepareAst(readFileSync(join(__dirname, `${name}.input.txt`), {encoding: 'utf-8'}));
    const expectedFile = join(__dirname, `${name}.expected.txt`);
    const expected = cleanExpected(readFileSync(expectedFile, {encoding: 'utf-8'}));
    if (transformer instanceof Array) {
        for (const tr of transformer) {
            tr(ast);
        }
    } else {
        (transformer as AstTransformer)(ast);
    }
    hexadecimal(ast);
    const actual: string = generate(ast, generateOptions).trim();
    // console.log(actual);
    expect(actual).to.not.differentFrom(expected);
}

export function runTestFile(name: string) {
    const expectedFile = join(__dirname, `${name}.expected.txt`);
    const expected = cleanExpected(readFileSync(expectedFile, {encoding: 'utf-8'}));
    const ast = prepareAst(readFileSync(join(__dirname, `${name}.input.txt`), {encoding: 'utf-8'}));
    stringArrayTransformations(ast);
    controlFlowFlatteningAll(ast);
    inlineConstantsAll(ast);
    let actual: string = generate(ast, generateOptions).trim();
    for (let i = 0; i < 10; i++) {
        evalConstantExpressions(ast);
        let newCode = generate(ast, generateOptions).trim();
        if (newCode === actual) {
            break;
        }
        actual = newCode;
    }
    simplifyAll(ast);
    computedToDot(ast);
    hexadecimal(ast);
    actual = generate(ast, generateOptions).trim();
    // console.log(actual);
    expect(actual).to.not.differentFrom(expected);
}
