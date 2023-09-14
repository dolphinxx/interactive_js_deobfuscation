import './test-util';
import {copy} from "../src/copy";
import {expect} from "chai";

describe('Copy', () => {
    it('copy', () => {
        class Foo {
            prop: string;

            constructor(arg: string) {
                this.prop = arg
            }
        }

        let obj;
        obj = {
            a: 1,
            b: /\w/i,
            c: obj,
            d: 12345n,
            e: Math.PI,
            f: new Foo('foo'),
            g: new (function () {
                return {a: 1}
            }),
            h: Symbol('hello'),
            i: [1, 2, 3],
            j: true,
            k: 'world',
            l: null,
            m: undefined,
            o: {},
            p: new Object(new Object({a: {b: 2}})),
        };
        Object.defineProperty(obj, 'aa', {
            value: 'aa',
            enumerable: false
        });
        Object.defineProperty(obj, 'bb', {
            value: 'bb',
            enumerable: true
        });
        const actual = copy(obj, {excludes: ['c'], nonenumerable: false});
        const expected = {
            a: 1,
            b: /\w/i,
            bb: 'bb',
            d: 12345n,
            e: Math.PI,
            f: {'prop': 'foo'},
            g: {'a': 1},
            h: Symbol('hello'),
            i: [1, 2, 3],
            j: true,
            k: 'world',
            l: null,
            m: undefined,
            o: {},
            p: {a: {b: 2}},
        };
        // deep equal can not pass Symbol comparing
        expect(actual.h).to.not.equal(expected.h);
        expect(actual.h.description).to.equal(expected.h.description);
        delete actual.h;
        delete expected.h;
        expect(actual).to.deep.equal(expected);
    });
});
