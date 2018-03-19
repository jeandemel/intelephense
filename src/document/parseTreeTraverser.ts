/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { PhpSymbol, SymbolKind, SymbolModifier } from '../symbol';
import { Reference, ReferenceTable } from '../reference';
import { SymbolStore, SymbolTable } from '../symbolStore';
import { NameResolver } from '../nameResolver';
import { TreeVisitor, TreeTraverser, Predicate } from '../types';
import { TypeString } from '../typeString';
import { Document } from './document';
import { Position, TextEdit, Range } from 'vscode-languageserver-types';
import { Phrase, PhraseKind } from '../parser/phrase';
import {Token, TokenKind} from '../parser/lexer';
import * as util from '../util';
import { ParseTree } from './parseTree';

export class ParseTreeTraverser extends TreeTraverser<Phrase | Token> {

    private _symbolTable: SymbolTable;

    constructor(private parseTree: ParseTree, symbolTable: SymbolTable) {
        super(<(Phrase|Token)[]>[parseTree.root]);
        this._symbolTable = symbolTable;
    }

    get symbolTable() {
        return this._symbolTable;
    }

    get text() {
        return this.parseTree.nodeText(this.node);
    }

    get range() {
        return this.parseTree.nodeRange(this.node);
    }

    get reference() {
        let range = this.range;
        return this._refTable.referenceAtPosition(range.start);
    }

    get scope() {
        let range = this.range;
        if (!range) {
            return null;
        }
        return this._symbolTable.scope(range.start);
    }

    get nameResolver() {
        let firstToken = Document.firstToken(this.node);
        let pos = this.document.positionAtOffset(firstToken.offset);
        return this._symbolTable.nameResolver(pos);
    }

    /**
     * Traverses to the token to the left of position
     * @param pos 
     */
    position(pos: Position) {
        let offset = this._doc.offsetAtPosition(pos) - 1;
        let fn = (x: Phrase | Token) => {
            return (<Token>x).tokenType !== undefined &&
                offset < (<Token>x).offset + (<Token>x).length &&
                offset >= (<Token>x).offset;
        };

        return this.find(fn) as Token;
    }

    clone() {
        let spine = this.spine;
        let traverser = new ParseTreeTraverser(this._doc, this._symbolTable, this._refTable);
        traverser._spine = spine;
        return traverser;
    }

    prevToken(skipTrivia?:boolean) {

        const spine = this._spine.slice(0);
        let current:Phrase|Token;
        let parent:Phrase|Token;
        let prevSiblingIndex:number;

        while(spine.length > 1) {

            current = spine.pop();
            parent = spine[spine.length - 1] as Phrase;
            prevSiblingIndex = parent.children.indexOf(current) - 1;

            if(prevSiblingIndex > -1) {
                spine.push(parent.children[prevSiblingIndex]);
                if(this._lastToken(spine, skipTrivia)) {
                    //token found
                    this._spine = spine;
                    return this.node;
                }
            }

            //go up

        }

        return undefined;

    }

    private _lastToken(spine:(Phrase|Token)[], skipTrivia?:boolean) {

        let node = spine[spine.length - 1];
        if((<Token>node).tokenType !== undefined && (!skipTrivia || (<Token>node).tokenType < TokenKind.Comment)) {
            return spine;
        }

        if(!(<Phrase>node).children) {
            return undefined;
        }

        for(let n = (<Phrase>node).children.length - 1; n >= 0; --n) {
            spine.push((<Phrase>node).children[n]);
            if(this._lastToken(spine)) {
                return spine;
            } else {
                spine.pop();
            }
        }

        return undefined;

    }

    /**
     * True if current node is the name part of a declaration
     */
    get isDeclarationName() {

        let traverser = this.clone();
        let t = traverser.node as Token;
        let parent = traverser.parent() as Phrase;

        if (!t || !parent) {
            return false;
        }

        return ((t.tokenType === TokenKind.Name || t.tokenType === TokenKind.VariableName) && this._isDeclarationPhrase(parent)) ||
            (parent.phraseType === PhraseKind.Identifier && this._isDeclarationPhrase(<Phrase>traverser.parent()));

    }

    private _isDeclarationPhrase(node: Phrase) {

        if (!node) {
            return false;
        }

        switch (node.phraseType) {
            case PhraseKind.ClassDeclarationHeader:
            case PhraseKind.TraitDeclarationHeader:
            case PhraseKind.InterfaceDeclarationHeader:
            case PhraseKind.PropertyElement:
            case PhraseKind.ConstElement:
            case PhraseKind.ParameterDeclaration:
            case PhraseKind.FunctionDeclarationHeader:
            case PhraseKind.MethodDeclarationHeader:
            case PhraseKind.ClassConstElement:
                return true;
            default:
                return false;
        }
    }

}
