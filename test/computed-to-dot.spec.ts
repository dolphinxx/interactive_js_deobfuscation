import {runTest} from "./test-util";
import {computedToDot} from "../src/traverse";

describe('ComputedToDot', () => {
    it('computed to dot', () => {
        const input = `var a = 1;
var c = window['location']['ancestorOrigins']['length'].toString();
var d = globalThis['a1']['2b']['-c']['dd']();
var b = 2;`;
        const expected = `var a = 1;
var c = window.location.ancestorOrigins.length.toString();
var d = globalThis.a1['2b']['-c'].dd();
var b = 2;`;
        runTest(input, expected, computedToDot);
    });
});
