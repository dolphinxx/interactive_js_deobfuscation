import {config, expect} from 'chai';
import * as acorn from "acorn";
import * as astring from "../src/astring";
import {EsNode} from "../src/global";

// suppress log
globalThis.logDebug = () => {};

config.truncateThreshold = 0;

export function runTest(input:string, expected:string, transformer:(node:EsNode)=>void, msg?:string) {
    const node = acorn.parse(input, {ecmaVersion: 'latest'});
    transformer(node);
    const actual = astring.generate(node).trim();
    expect(actual).to.equal(expected, msg as any);
}
