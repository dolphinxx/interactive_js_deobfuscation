import {runTransformerTest} from "../../test-util";
import {stringArrayCallsTransform} from "../../../src/transform";

const prefix = 'string-transformation/calls/';

describe('StringTransformationCallsTransform', () => {
    it('01', () => {
        runTransformerTest(prefix + '01', stringArrayCallsTransform);
    });
});
