import {prepareAst} from "../../test-util";
import {findStringArrayRotateExpr} from "../../../src/string-array-helper";
import {CallExpression, FunctionExpression, Identifier, LogicalExpression, SequenceExpression, Statement} from "estree";
import {expect} from "chai";
import {readFileSync} from "fs";
import {join} from "path";

describe('FindStringArrayRotateExpr', () => {
    it('01', () => {
        const stringArrayFnId = 'QQ$$QQ';
        const decodeFnId = 'OOQ0OOO';
        const ast = prepareAst(readFileSync(join(__dirname, '01.input.txt'), {encoding: 'utf-8'}));
        const stmt = findStringArrayRotateExpr(stringArrayFnId, decodeFnId, ast.body as Statement[]);
        expect(stmt != undefined).to.be.true;
        expect((((((stmt?.expression as LogicalExpression)?.left as SequenceExpression)?.expressions[0] as CallExpression)?.callee as FunctionExpression).params[0] as Identifier).name).to.equal('OQ$0$0');
    });
    it('02', () => {
        const stringArrayFnId = '_0x6810';
        const decodeFnId = '_0x24db';
        const ast = prepareAst(readFileSync(join(__dirname, '02.input.txt'), {encoding: 'utf-8'}));
        const stmt = findStringArrayRotateExpr(stringArrayFnId, decodeFnId, ast.body as Statement[]);
        expect(stmt != undefined).to.be.true;
        expect((((stmt!.expression as CallExpression)?.callee as FunctionExpression).params[0] as Identifier).name).to.equal('_0x31b823');
    });
});
