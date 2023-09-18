import {runTest} from "./test-util";
import {stringArrayCallsTransform} from "../src/transform";

describe('FlattenHashedMember', () => {
    it('simple', () => {
        const input = `var a = 1;
const shouldSkip = {
    "a": 1,
    "b": function(a, b) {
        const c = a + b;
        return c;
    }
};
const ss = shouldSkip["b"](1, 2);
const hash = {
    "c": "aa",
    "d": 1,
    "e": function (a, b) {
        return a + b;
    },
    "f": function (a, b) {
        return b != a;
    },
    "g": function (a, b) {
        return a(b);
    }
};
const c = hash["c"];
const d = hash["d"];
const e = hash["e"](1, 2);
const f = hash["f"](3, 4);
function foo(a) {
    console.log(a);
}
const g = hash["g"](foo, "msg");
var b = 2;`;
        const expected = `var a = 1;
const shouldSkip = {
    "a": 1,
    "b": function(a, b) {
        const c = a + b;
        return c;
    }
};
const ss = shouldSkip["b"](1, 2);
const c = "aa";
const d = 1;
const e = 3;
const f = true;
function foo(a) {
    console.log(a);
}
const g = foo("msg");
var b = 2;`;
        runTest(input, expected, stringArrayCallsTransform);
    });
    it('chained', () => {
        const input = `var a = 1;
const hash1 = {
    "c": "aa",
    "d": function (a, b) {
        return a + b;
    }
};
const c = hash1["c"];
const d = hash1["d"](1, 2);
const hash2 = {
    "c": "aaa",
    "d": function (a, b) {
        return hash1["d"](a, b + hash1["c"]);
    }
};
const e = hash2["d"]("Hello", hash2["c"]);
const hash3 = {
    "a": 1,
    "b": "ff"
};
const hh = hash3["c"];
var b = 2;`;
        const expected = `var a = 1;
const c = "aa";
const d = 3;
const e = "Helloaaaaa";
const hash3 = {
    "a": 1,
    "b": "ff"
};
const hh = hash3["c"];
var b = 2;`;
        runTest(input, expected, stringArrayCallsTransform);
    });
})
