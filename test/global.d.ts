declare module Chai {
    type ChaiDiffOptions = {
        /**
         * whether to replace whitespace with unicode dots and arrows, default false.
         */
        showSpace: boolean;
        /**
         *  whether to normalize strings before comparing them. default false.<br/>
         *  This removes empty lines, spaces from the beginning and end of each line
         *  and compresses sequences of whitespace to a single space.
         */
        relaxedSpaces: boolean;
    }

    interface Assertion {
        differentFrom(expected: string, options?: ChaiDiffOptions): void;
    }
}
