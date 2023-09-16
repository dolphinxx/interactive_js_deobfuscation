import {prepareAst} from "../../test-util";
import {findStringArrayFunction} from "../../../src/string-array-helper";
import {Statement} from "estree";
import {expect} from "chai";
import {readFileSync} from "fs";
import {join} from "path";

describe('FindStringArrayFunction', () => {
    it('01', () => {
        const ast = prepareAst(readFileSync(join(__dirname, '01.input.txt'), {encoding: 'utf-8'}));
        const {stringArrayFn, versionVariableId} = findStringArrayFunction(ast.body as Statement[]);
        expect(stringArrayFn?.id?.name).to.equal('QQ$$QQ');
        expect(versionVariableId).to.equal('version_');
    });
});
