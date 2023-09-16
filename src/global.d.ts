import type {Node} from "estree";

declare module 'estree' {
    interface BaseNode {
        parent:Node|null;
    }
    interface Node {
        parent:Node|null;
        type?:string;
    }
}

declare global {
    let logDebug: (...msg:any[]) => void;
}

type EsNode = Node;

type AstTransformer = (node: EsNode) => void;

