import {readFileSync, existsSync} from "fs";
import {join} from 'path';
import {parse} from 'acorn';
import {
    applyAstParent,
    computedToDot,
    evalConstantExpressions,
    evalObfuscatedString,
    flattenHashedMember,
    simplify
} from "../../src/traverse";
import {generate} from "../../src/astring";
import {EsNode} from "../../src/global";
import {expect, use} from "chai";
// @ts-ignore
import chaiDiff from 'chai-diff';

use(chaiDiff);
globalThis.logDebug = () => {
};

export function runTest(name: string) {
    const inputFile = join(__dirname, `${name}.input.txt`);
    const extraFile = join(__dirname, `${name}.extra.txt`);
    const expectedFile = join(__dirname, `${name}.expected.txt`);
    const input = readFileSync(inputFile, {encoding: 'utf-8'});
    const expected = readFileSync(expectedFile, {encoding: 'utf-8'}).replace(/\r\n/g, '\n').trim();
    let extra: string | null;
    if (existsSync(extraFile)) {
        extra = readFileSync(extraFile, {encoding: 'utf-8'})
    }
    let ast = parse(input, {ecmaVersion: 'latest'}) as EsNode;
    applyAstParent(ast);
    if (extra != null) {
        evalObfuscatedString(extra, ast);
    }
    const generateOptions = {
        indent: '    '
    };
    let code: string = generate(ast, generateOptions).trim();
    for (let i = 0; i < 10; i++) {
        flattenHashedMember(ast);
        let newCode = generate(ast, generateOptions).trim();
        if (newCode === code) {
            break;
        }
        code = newCode;
    }
    for (let i = 0; i < 10; i++) {
        evalConstantExpressions(ast);
        let newCode = generate(ast, generateOptions).trim();
        if (newCode === code) {
            break;
        }
        code = newCode;
    }
    for (let i = 0; i < 10; i++) {
        simplify(ast);
        let newCode = generate(ast, generateOptions).trim();
        if (newCode === code) {
            break;
        }
        code = newCode;
    }
    computedToDot(ast);
    code = generate(ast, generateOptions).trim();
    expect(code).to.not.differentFrom(expected);
}
