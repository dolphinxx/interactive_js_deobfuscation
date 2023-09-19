import {runTest} from "./test-util";
import {inlineConstants, inlineConstantsAll} from "../src/transform";

describe('InlineConstants', () => {
    it('inlineConstants', () => {
        const input = `{
    const a = 'he';
    const b = a + 'llo';
    const c = ' ';
    const d = 'wor';
    const e = d + 'ld';
    let f = '!';
    let g = '.';
    g = '..';
    const h = b + c + e + f + g;
    f = '!!';
    console.log(h);
}`;
        const expected = `{
    const b = 'he' + 'llo';
    const e = 'wor' + 'ld';
    let f = '!';
    let g = '.';
    g = '..';
    const h = b + ' ' + e + '!' + g;
    f = '!!';
    console.log(h);
}`;
        runTest(input, expected, inlineConstants);
    });
    it('inlineConstantsAll', () => {
        const input = `{
    const a = 'he';
    const b = a + 'llo';
    const c = ' ';
    const d = 'wor';
    const e = d + 'ld';
    let f = '!';
    let g = '.';
    g = '..';
    const h = b + c + e + f + g;
    f = '!!';
    console.log(h);
}`;
        const expected = `{
    let f = '!';
    let g = '.';
    g = '..';
    const h = 'he' + 'llo' + ' ' + ('wor' + 'ld') + '!' + g;
    f = '!!';
    console.log(h);
}`;
        runTest(input, expected, inlineConstantsAll);
    });
});
