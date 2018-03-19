/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Traversable, Predicate, TreeTraverser, TreeVisitor, PackedLocation, PackedRange } from "../types";
import { Phrase, PhraseKind } from "../parser/phrase";
import { Token, TokenKind } from "../parser/lexer";
import * as lsp from 'vscode-languageserver-types';
import { Document } from "./document";
import { ParseTreeTraverser } from "./parseTreeTraverser";
import { UriMap } from "./uriMap";

export class NodeUtils {

    constructor(private parseTree:ParseTree) { }

    nodePackedLocation(node: Phrase | Token) {
        const location = this.nodeLocation(node);
        return <PackedLocation>{
            uriId: UriMap.id(location.uri),
            range: PackedRange.fromLspRange(location.range)
        }
    }

    nodeLocation(node: Phrase | Token) {
        return this.parseTree.nodeLocation(node);
    }

    nodeRange(node: Phrase | Token) {
        return this.parseTree.nodeRange(node);
    }

    nodeText(node: Phrase | Token) {
        return this.parseTree.nodeText(node);
    }

    anonymousName(node: Phrase) {
        return this.parseTree.createAnonymousName(node);
    }
}

export namespace NodeUtils {

    export function firstToken(node: Phrase | Token) {

        if ((<Token>node).tokenType !== undefined) {
            return node as Token;
        }

        let t: Token;
        for (let n = 0, l = (<Phrase>node).children.length; n < l; ++n) {
            t = NodeUtils.firstToken((<Phrase>node).children[n]);
            if (t !== undefined) {
                return t;
            }
        }

        return undefined;
    }

    export function lastToken(node: Phrase | Token) {
        if ((<Token>node).tokenType !== undefined) {
            return node as Token;
        }

        let t: Token;
        for (let n = (<Phrase>node).children.length - 1; n >= 0; --n) {
            t = this.lastToken((<Phrase>node).children[n]);
            if (t !== undefined) {
                return t;
            }
        }

        return undefined;
    }

    export function isToken(node: Phrase | Token, types?: TokenKind[]) {
        return node && (<Token>node).tokenType !== undefined &&
            (!types || types.indexOf((<Token>node).tokenType) > -1);
    }

    export function isPhrase(node: Phrase | Token, types?: PhraseKind[]) {
        return node && (<Phrase>node).phraseType !== undefined &&
            (!types || types.indexOf((<Phrase>node).phraseType) > -1);
    }

    export function isOffsetInToken(offset: number, t: Token) {
        return offset > -1 && NodeUtils.isToken(t) &&
            t.offset <= offset &&
            t.offset + t.length - 1 >= offset;
    }

    export function isOffsetInNode(offset, node: Phrase | Token) {

        if (!node || offset < 0) {
            return false;
        }

        if ((<Token>node).tokenType !== undefined) {
            return NodeUtils.isOffsetInToken(offset, <Token>node);
        }

        let tFirst = NodeUtils.firstToken(node);
        let tLast = NodeUtils.lastToken(node);

        if (!tFirst || !tLast) {
            return false;
        }

        return tFirst.offset <= offset && tLast.offset + tLast.length - 1 >= offset;

    }

    export function findChild(parent: Phrase, fn: Predicate<Phrase | Token>) {

        if (!parent || !parent.children) {
            return undefined;
        }

        let child: Phrase | Token;
        for (let n = 0, l = parent.children.length; n < l; ++n) {
            child = parent.children[n];
            if (fn(child)) {
                return child;
            }
        }
        return undefined;
    }

    export function filterChildren(parent: Phrase, fn: Predicate<Phrase | Token>) {

        let filtered: (Phrase | Token)[] = [];
        if (!parent || !parent.children) {
            return filtered;
        }

        let child: Phrase | Token;
        for (let n = 0, l = parent.children.length; n < l; ++n) {
            child = parent.children[n];
            if (fn(child)) {
                filtered.push(child);
            }
        }
        return filtered;
    }

    export function isNamePhrase(node: Phrase | Token) {
        if (!node) {
            return false;
        }

        switch ((<Phrase>node).phraseType) {
            case PhraseKind.QualifiedName:
            case PhraseKind.RelativeQualifiedName:
            case PhraseKind.FullyQualifiedName:
                return true;
            default:
                return false;
        }
    }

}

export class ParseTree implements Traversable<Phrase|Token> {

    constructor(private _root:Phrase, private doc:Document) { }

    get root() {
        return this._root;
    }

    find(predicate: Predicate<Phrase | Token>) {
        let traverser = new TreeTraverser([this._root]);
        return traverser.find(predicate);
    }

    traverse<V extends TreeVisitor<Phrase|Token>>(visitor: V) {
        let traverser = new TreeTraverser([this._root]);
        traverser.traverse(visitor);
        return visitor;
    }

    traverser() {
        return new ParseTreeTraverser();
    }

    nodeUtils() {
        return new NodeUtils(this);
    }

    nodeLocation(node: Phrase | Token) {

        if (!node) {
            return undefined;
        }

        let range = this.nodeRange(node);

        if (!range) {
            return undefined;
        }

        return lsp.Location.create(this.doc.uri, range);

    }

    nodeRange(node: Phrase | Token) {

        if (!node) {
            return undefined;
        }

        if ((<Token>node).tokenType !== undefined) {
            return <lsp.Range>{
                start: this.doc.positionAtOffset((<Token>node).offset),
                end: this.doc.positionAtOffset((<Token>node).offset + (<Token>node).length)
            }
        }

        let tFirst = NodeUtils.firstToken(node);
        let tLast = NodeUtils.lastToken(node);

        if (!tFirst || !tLast) {
            return lsp.Range.create(0, 0, 0, 0);
        }

        let range = <lsp.Range>{
            start: this.doc.positionAtOffset(tFirst.offset),
            end: this.doc.positionAtOffset(tLast.offset + tLast.length)
        }

        return range;

    }

    nodeText(node: Phrase | Token) {

        if (!node) {
            return '';
        }

        if ((<Token>node).tokenType !== undefined) {
            return this.doc.textAtOffset((<Token>node).offset, (<Token>node).length);
        }

        let tFirst = NodeUtils.firstToken(node);
        let tLast = NodeUtils.lastToken(node);

        if (!tFirst || !tLast) {
            return '';
        }

        return this.doc.text.slice(tFirst.offset, tLast.offset + tLast.length);

    }

    createAnonymousName(node: Phrase) {
        let tFirst = NodeUtils.firstToken(node);
        let offset = tFirst ? tFirst.offset : 0;
        return `#anon#${this.doc.uri}#${offset}`;
    }

    documentLanguageRanges() {
        const visitor = new DocumentLanguageRangesVisitor(this.nodeUtils());
        this.traverse(visitor);
        return visitor.ranges;
    }

}

export interface LanguageRange {
    range: lsp.Range;
    languageId?: string;
}

const phpLanguageId = 'php';

class DocumentLanguageRangesVisitor implements TreeVisitor<Phrase | Token> {

    private _ranges: LanguageRange[];
    private _phpOpenPosition: lsp.Position;
    private _lastToken: Token;

    constructor(public nodeUtils: NodeUtils) {
        this._ranges = [];
    }

    get ranges() {
        //handle no close tag
        if (this._phpOpenPosition && this._lastToken) {
            this._ranges.push({
                range: lsp.Range.create(this._phpOpenPosition, this.nodeUtils.nodeRange(this._lastToken).end),
                languageId: phpLanguageId
            });
            this._phpOpenPosition = undefined;
        }
        return this._ranges;
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        switch ((<Token>node).tokenType) {
            case TokenKind.Text:
                this._ranges.push({ range: this.nodeUtils.nodeRange(<Token>node) });
                break;
            case TokenKind.OpenTag:
            case TokenKind.OpenTagEcho:
                this._phpOpenPosition = this.nodeUtils.nodeRange(<Token>node).start;
                break;
            case TokenKind.CloseTag:
                {
                    let closeTagRange = this.nodeUtils.nodeRange(<Token>node);
                    this._ranges.push({
                        range: lsp.Range.create(this._phpOpenPosition || closeTagRange.start, closeTagRange.end),
                        languageId: phpLanguageId
                    });
                    this._phpOpenPosition = undefined;
                }

                break;
            default:
                break;
        }

        if ((<Token>node).tokenType !== undefined) {
            this._lastToken = <Token>node;
        }

        return true;

    }

}