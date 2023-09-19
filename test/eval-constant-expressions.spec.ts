import {runTest} from "./test-util";
import {evalConstantExpressions} from "../src/transform";

describe('EvalConstantExpressions', () => {
    it('eval constant expressions', () => {
        const input = `var a = 1365;
var b = '<div\x20class=\x22pop-msg\x22></div>';
var c = !0;
var d = !true;
var e = ![];
var f = typeof 1;
var g = typeof undefined;
var h = 2 - 1;
var i = 2 > 1;
var j = true && false;
var k = 2 === 1;
var l = aa === aa;
var m = aa === bb;
`;
        const expected = `var a = 1365;
var b = '<div class="pop-msg"></div>';
var c = true;
var d = false;
var e = false;
var f = "number";
var g = "undefined";
var h = 1;
var i = true;
var j = false;
var k = false;
var l = true;
var m = aa === bb;
`;
        runTest(input, expected, evalConstantExpressions);
    });
});
