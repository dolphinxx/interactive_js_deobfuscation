import {prepareAst} from "../test-util";
import {flattenStringArrayConcat} from "../../src/string-array-helper";
import {expect} from "chai";
import {Syntax} from "esprima";
import {ExpressionStatement} from "estree";

describe('FlattenStringArrayConcat', () => {
    it('flatten string array concat', () => {
        const input = `['a'].concat((function () {
  return ['b'].concat((function () {
    return ['c'].concat((function () {
      return ['d']
    }()))
  }()))
}()))`;
        const node = (prepareAst(input).body[0] as ExpressionStatement).expression;
        const actual = flattenStringArrayConcat(node)?.map(e => e?.type === Syntax.Literal ? e.value : null);
        expect(actual).to.deep.equal(['a', 'b', 'c', 'd']);
    });
});
