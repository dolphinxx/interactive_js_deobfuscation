import {prepareAst} from "../../test-util";
import {findStringArrayDecodeFunction} from "../../../src/string-array-helper";
import {Statement} from "estree";
import {expect} from "chai";
import {readFileSync} from "fs";
import {join} from "path";

describe('FindStringArrayDecodeFunction', () => {
    it('01', () => {
        const stringArrayFnId = 'QQ$$QQ';
        const ast = prepareAst(readFileSync(join(__dirname, '01.input.txt'), {encoding: 'utf-8'}));
        const fn = findStringArrayDecodeFunction(stringArrayFnId, ast.body as Statement[]);
        expect(fn?.id?.name).to.equal('OOQ0OOO');
    });
});
