import {runTransformerTest} from "../test-util";
import {stringArrayTransformations} from "../../src/transform";

const prefix = 'string-transformation/';

describe('StringTransformation', () => {
    it('array', () => {
        runTransformerTest(prefix + 'array', stringArrayTransformations);
    });
    it('array rotate', () => {
        runTransformerTest(prefix + 'array-rotate', stringArrayTransformations);
    });
    it('array shuffle', () => {
        runTransformerTest(prefix + 'array-shuffle', stringArrayTransformations);
    });
    it('array rotate shuffle', () => {
        runTransformerTest(prefix + 'array-rotate-shuffle', stringArrayTransformations);
    });
    it('array index shift', () => {
        runTransformerTest(prefix + 'array-index-shift', stringArrayTransformations);
    });
    it('array rotate shuffle index shift', () => {
        runTransformerTest(prefix + 'array-rotate-shuffle-index-shift', stringArrayTransformations);
    });
    it('array calls', () => {
        runTransformerTest(prefix + 'array-calls', stringArrayTransformations);
    });
    it('array calls function', () => {
        runTransformerTest(prefix + 'array-calls-function', stringArrayTransformations);
    });
    it('array function wrappers', () => {
        runTransformerTest(prefix + 'array-function-wrappers', stringArrayTransformations);
    });
    it('array function wrappers compact', () => {
        runTransformerTest(prefix + 'array-function-wrappers-compact', stringArrayTransformations);
    });
});
