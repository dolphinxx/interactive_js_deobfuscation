import * as esprima from 'esprima';
import * as ESTree from 'estree'
import * as acorn from "acorn";
import {expect} from "chai";
import {cloneNode} from "../src/util";

describe('CloneNode', () => {
    it('with parent', () => {
        const node = (acorn.parse(`foo(a, b + 1)`, {ecmaVersion: 'latest'}) as ESTree.Program).body[0];
        const parent = {
            type: esprima.Syntax.BlockStatement,
            body: [node],
        } as ESTree.ExpressionStatement;
        const actual = cloneNode(node, parent);
        expect(actual.parent).to.equal(parent);
        expect(actual).to.not.equal(node);
    });
})
