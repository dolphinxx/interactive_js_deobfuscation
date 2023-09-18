import {runTransformerTest} from "../test-util";
import {controlFlowFlattening} from "../../src/transform";

describe('ControlFlowFlatten', () => {
    it('control flow flatten', () => {
        runTransformerTest('control-flow-flatten/control-flow-flatten', controlFlowFlattening);
    });
})
