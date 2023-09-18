import {cleanExpected, prepareAst} from "../../test-util";
import {expect} from "chai";
import {readFileSync} from "fs";
import {join} from "path";
import * as esprima from "esprima";
import {findStringArrayFunctionWrappers} from "../../../src/string-array-helper";
import {generate} from "../../../src/astring";
import {Program} from "estree";

describe('FindStringArrayFunctionWrappers', () => {
    it('01', () => {
        const decodeFnId = '_0x24db';
        const ast = prepareAst(readFileSync(join(__dirname, '01.input.txt'), {encoding: 'utf-8'}));
        const actual = findStringArrayFunctionWrappers(decodeFnId, ast);
        expect(actual).to.have.length(1);
        expect((actual[0].id)?.name).to.equal('_0x3f485b');
    });
    it('chained', () => {
        const decodeFnId = '_0x24db';
        const ast = prepareAst(readFileSync(join(__dirname, 'chained.input.txt'), {encoding: 'utf-8'}));
        const functions = findStringArrayFunctionWrappers(decodeFnId, ast);
        expect(functions).to.have.length(3);
        functions.sort((a, b) => a.id!.name.localeCompare(b.id!.name));
        const actual = generate({
            type: esprima.Syntax.Program,
            body: functions,
        } as Program, {indent: '    '}).trim();
        const expected = cleanExpected(readFileSync(join(__dirname, 'chained.expected.txt'), {encoding: 'utf-8'}));
        expect(actual).to.not.differentFrom(expected);
    });
});
