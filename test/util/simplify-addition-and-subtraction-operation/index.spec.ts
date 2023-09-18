import {runTest} from "../../test-util";
import {simplifyAdditionAndSubtractionOperation} from "../../../src/util";
import {EsNode} from "../../../src/global";
import {Syntax} from "esprima";
import {BinaryExpression} from "estree";
import {replace} from "estraverse";

describe('SimplifyAdditionAndSubtractionOperation', () => {
    it('simplify addition and subtraction operation', () => {
        const input = `_0x8da0e3 - -0x37d - 0x1d0 - 0x1c6`;
        const expected = `_0x8da0e3 - 25;`;
        runTest(input, expected, (root: EsNode) => {
            replace(root, {
                leave(n: EsNode) {
                    if (n.type === Syntax.BinaryExpression) {
                        return simplifyAdditionAndSubtractionOperation(n as BinaryExpression);
                    }
                }
            })
        });
    });
});
