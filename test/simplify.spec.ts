import {simplify} from "../src/traverse";
import {runTest} from "./test-util";

const run = (input: string, expected: string, msg?: string) => runTest(input, expected, simplify, msg);

describe('Simplify', () => {
    describe('if', () => {
        it('always true', () => {
            const input = `var a = 1;
if(true) {console.log(123)}
var b = 2;`;
            const expected = `var a = 1;
{
    console.log(123);
}
var b = 2;`;
            run(input, expected, 'should keep only body statement');
        });
        it('always false', () => {
            const input = `var a = 1;
if(false) {console.log(123)}
var b = 2;`;
            const expected = `var a = 1;
var b = 2;`;
            run(input, expected, 'should remove always-false if statement');
        });
        it('always false with alternative', () => {
            const input = `var a = 1;
if(false) {console.log(123)} else {console.log(456)}
var b = 2;`;
            const expected = `var a = 1;
{
    console.log(456);
}
var b = 2;`;
            run(input, expected, 'should remove always-false if statement and trailing else keyword');
        });
        it('always false with else if', () => {
            const input = `var a = 1;
if(false) {console.log(123)} else if(1===1) {console.log(456)}
var b = 2;`;
            const expected = `var a = 1;
if (1 === 1) {
    console.log(456);
}
var b = 2;`;
            run(input, expected, 'should remove always-false if statement and trailing else keyword');
        });
        it('always false with else if and alternative', () => {
            const input = `var a = 1;
if(false) {
    console.log(123);
} else if(1===1) {
    console.log(456);
} else {
    console.log(789);
}
var b = 2;`;
            const expected = `var a = 1;
if (1 === 1) {
    console.log(456);
} else {
    console.log(789);
}
var b = 2;`;
            run(input, expected, 'should remove always-false if statement and trailing else keyword');
        });
        it('complex', () => {
            const input = `var a = 1;
if (false) {
    console.log(1);
} else if (1 === 1) {
    console.log(2);
} else if (false) {
    console.log(3);
} else if (true) {
    console.log(4);
}
if (true) {
    console.log(5);
    if ( true ) {
        console.log(6);
        if ( false ) {
            console.log(7);
    } else {
        console.log(8);
    }
  }
}
var b = 2;`;
            const expected = `var a = 1;
if (1 === 1) {
    console.log(2);
} else {
    console.log(4);
}
{
    console.log(5);
    {
        console.log(6);
        {
            console.log(8);
        }
    }
}
var b = 2;`;
            run(input, expected);
        });
    });
    describe('while', () => {
        it('false', () => {
            const input = `var a = 1;
while (false) {
    console.log(1);
}
var b = 2;`;
            const expected = `var a = 1;
var b = 2;`;
            run(input, expected, 'should remove always-false while statement');
        });
        it('true with empty statement', () => {
            const input = `var a = 1;
while (true);
var b = 2;`;
            const expected = `var a = 1;
throw "infinity loop";
var b = 2;`;
            run(input, expected, 'should replace empty-always-true while statement with a throw statement');
        });
        it('true with empty block', () => {
            const input = `var a = 1;
while (true) {
}
var b = 2;`;
            const expected = `var a = 1;
throw "infinity loop";
var b = 2;`;
            run(input, expected, 'should replace empty-always-true while statement with a throw statement');
        });
        it('true with empty body', () => {
            const input = `var a = 1;
while (true) {
    ;
    {
    }
    {
        {
            {
                ;
                ;
                ;
            }
        }
    }
}
var b = 2;`;
            const expected = `var a = 1;
throw "infinity loop";
var b = 2;`;
            run(input, expected, 'should replace empty-always-true while statement with a throw statement');
        });
        it('complex', () => {
            const input = `var a = 1;
while (false) {
    console.log(1);
}
while (true) {
    console.log(2);
    while (false) {
        console.log(3);
        while (true) {
            console.log(4);
        }
    }
    while (true) {
        ;
        ;
    }
    while (true) {
        ;
        console.log(5);
        ;
    }
}
var b = 2;`;
            const expected = `var a = 1;
while (true) {
    console.log(2);
    throw "infinity loop";
    while (true) {
        ;
        console.log(5);
        ;
    }
}
var b = 2;`;
            run(input, expected);
        });
    });
    describe('do while', () => {
        it('false', () => {
            const input = `var a = 1;
do {console.log(1)} while (false)
do {
    console.log(2);
} while (false);
do {
    console.log(3);
} while (true);
var b = 2;`;
            const expected = `var a = 1;
{
    console.log(1);
}
{
    console.log(2);
}
do {
    console.log(3);
} while (true);
var b = 2;`;
            run(input, expected, 'should run only once for always-false do-while statement');
        });
        it('false with empty body', () => {
            const input = `var a = 1;
do {;} while (false)
do {} while (false)
do {
    ;
    ;
    {
        ;
        {
            ;
        }
        ;
    }
} while (false)
var b = 2;`;
            const expected = `var a = 1;
var b = 2;`;
            run(input, expected, 'should remove empty-always-false do-while statement');
        });
        it('true with empty body', () => {
            const input = `var a = 1;
do {;} while (true)
do {} while (true)
do {
    ;
    ;
    {
        ;
        {
            ;
        }
        ;
    }
} while (true)
var b = 2;`;
            const expected = `var a = 1;
throw "infinity loop";
throw "infinity loop";
throw "infinity loop";
var b = 2;`;
            run(input, expected, 'should replace empty-always-true do-while statement with a throw statement');
        });
    });
    describe('conditional', () => {
        it('true', () => {
            const input = `var a = 1;
var c = true ? 1 : 2;
var b = 2;`;
            const expected = `var a = 1;
var c = 1;
var b = 2;`;
            run(input, expected, 'should keep only the consequent statement for always-true conditional expression')
        });
        it('false', () => {
            const input = `var a = 1;
var c = false ? 1 : 2;
var b = 2;`;
            const expected = `var a = 1;
var c = 2;
var b = 2;`;
            run(input, expected, 'should keep only the alternative statement for always-false conditional expression')
        });
        it('complex', () => {
            const input = `var a = 1;
var c = false ? true ? 3 : 4 : true ? false ? 7 : 8 : 6;
var d = true ? (console.log(1),2) : false;
false ? function() {
  console.log(1);
} : (function() {
  console.log(2);
  return true ? 1 : 2;
})();
var b = 2;`;
            const expected = `var a = 1;
var c = 8;
var d = (console.log(1), 2);
(function() {
    console.log(2);
    return 1;
})();
var b = 2;`;
            run(input, expected)
        });
    });
});
