import {config, expect} from 'chai';
import * as acorn from "acorn";
import * as astring from "../src/astring";
import {EsNode} from "../src/global";
import {applyAstParent} from "../src/traverse";

// suppress log
globalThis.logDebug = () => {};

config.truncateThreshold = 0;

export function runTest(input:string, expected:string, transformer:(node:EsNode)=>void, msg?:string) {
    const node = acorn.parse(input, {ecmaVersion: 'latest'}) as EsNode;
    applyAstParent(node);
    transformer(node);
    const actual = astring.generate(node, {indent: '    '}).trim();
    expect(actual).to.equal(expected.trim(), msg as any);
}
