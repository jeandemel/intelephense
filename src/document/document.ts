/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Phrase, PhraseKind, } from '../parser/phrase';
import { TokenKind, Token } from '../parser/lexer';
import { Parser } from '../parser/parser';
import { TextDocument } from './textDocument';
import * as lsp from 'vscode-languageserver-types';
import {
    TreeVisitor, TreeTraverser, Event, Debounce, Unsubscribe,
    Predicate, Traversable, PackedLocation, PackedRange, PackedPosition, BinarySearch
} from '../types';
import * as util from '../util';
import { UriMap, UriMapDto } from './uriMap';
import { Cache } from '../cache';
import { ParseTree } from './parseTree';
import {SymbolTable} from '../symbol/symbolStore';

const textDocumentChangeDebounceWait = 250;

export interface DocumentDto {
    
}

export class Document {

    private static readonly WORD_REGEX = /[$a-zA-Z_\x80-\xff][\\a-zA-Z0-9_\x80-\xff]*$/;

    private _uri:string;
    private _text: string;
    private _parseTree: ParseTree;
    private _symbolTable: SymbolTable;
    private _lineOffsets:number[];
    private _changeEvent: Event<DocumentChangeEventArgs>;
    private _debounce: Debounce<null>;
    
    private _reparse = (x) => {
        this.parse();
        this._changeEvent.trigger({ doc: this });
    };

    constructor(uri: string, text: string, public version = 0) {
        this._uri = uri;
        this.text = text;
        this._debounce = new Debounce<null>(this._reparse, textDocumentChangeDebounceWait);
        this._changeEvent = new Event<DocumentChangeEventArgs>();
    }

    get parseTree() {
        return this._parseTree;
    }

    get symbolTable() {
        return this._symbolTable;
    }

    get uri() {
        return this._uri;
    }

    get text() {
        return this._text;
    }

    set text(text: string) {
        this._text = text;
        this._lineOffsets = this._textLineOffsets(text, 0);
    }

    get changeEvent() {
        return this._changeEvent;
    }

    get lineOffsets() {
        return this._lineOffsets;
    }

    parse() {
        this._parseTree = new ParseTree(Parser.parse(this._text), this);
    }

    /**
     * Parses text but does not resolve types or run diagnostics.
     */
    discover() {

    }

    hasText() {
        return this._text !== undefined;
    }

    flush() {
        this._debounce.flush();
    }

    applyChanges(contentChanges: lsp.TextDocumentContentChangeEvent[]) {

        let change: lsp.TextDocumentContentChangeEvent;

        for (let n = 0, l = contentChanges.length; n < l; ++n) {
            change = contentChanges[n];
            if (!change.range) {
                this.text = change.text;
            } else {
                this._applyEdit(change.range.start, change.range.end, change.text);
            }
        }

        this._debounce.handle(null);

    }

    wordAtOffset(offset: number) {
        let lineText = this.lineSubstring(offset);
        let match = lineText.match(Document.WORD_REGEX);
        return match ? match[0] : '';
    }

    textBeforeOffset(offset:number, length:number){
        let start = Math.min(offset - (length - 1), 0);
        return this._text.slice(start, offset + 1);
    }

    lineText(line:number){
        let endOffset = line + 1 < this._lineOffsets.length ? 
            this._lineOffsets[line + 1] : this._text.length;
        return this._text.slice(this._lineOffsets[line], endOffset);
    }

    lineAtOffset(offset:number){
        let search = new BinarySearch<number>(this._lineOffsets);
        let compareFn = (x) => {
            return x - offset;
        };
        let result = search.search(compareFn);
        return result.isExactMatch ? result.rank : Math.max(result.rank - 1, 0);
    }

    lineSubstring(offset:number){
        let lineNumber = this.lineAtOffset(offset);
        return this._text.slice(this._lineOffsets[lineNumber], offset);
    }

    offsetAtLine(line: number) {

        if (line <= 0 || this._lineOffsets.length < 1) {
            return 0;
        } else if (line > this._lineOffsets.length - 1) {
            return this._lineOffsets[this._lineOffsets.length - 1];
        } else {
            return this._lineOffsets[line];
        }
    }

    textAtOffset(offset: number, length: number) {
        return this._text.substr(offset, length);
    }

    positionAtOffset(offset: number) {

        let index = this.lineAtOffset(offset);

        return <lsp.Position>{
            line: index,
            character: offset - this._lineOffsets[index]
        };

    }

    offsetAtPosition(pos: lsp.Position) {
        let offset = this.offsetAtLine(pos.line) + pos.character;
        return Math.max(0, Math.min(offset, this._text.length));
    }

    toJSON() {
        return <DocumentDto> {

        }
    }

    restore(dto:DocumentDto) {

    }

    private _applyEdit(start: lsp.Position, end: lsp.Position, text: string) {

        let startOffset = this.offsetAtPosition(start);
        let endOffset = this.offsetAtPosition(end);
        this._text = this._text.slice(0, startOffset) + text + this._text.slice(endOffset);
        let newLineOffsets = this._lineOffsets.slice(0, start.line + 1);
        let lengthDiff = text.length - (endOffset - startOffset);
        Array.prototype.push.apply(newLineOffsets, this._textLineOffsets(text, startOffset).slice(1));
        let endLineOffsets = this._lineOffsets.slice(end.line + 1);
        
        for(let n = 0, l = endLineOffsets.length; n < l; ++n){
            newLineOffsets.push(endLineOffsets[n] + lengthDiff);
        }

        this._lineOffsets = newLineOffsets;
    }

    private _textLineOffsets(text: string, offset: number) {

        let n = 0;
        let length = text.length;
        let isLineStart = true;
        let offsets = [];
        let c: string;

        while (n < length) {

            c = text[n];

            if (isLineStart) {
                offsets.push(n + offset);
                isLineStart = false;
            }

            if (c === '\r') {
                if (++n < length && text[n] === '\n') {
                    ++n;
                }
                isLineStart = true;
                continue;
            } else if (c === '\n') {
                isLineStart = true;
            }

            ++n;

        }

        if (isLineStart) {
            offsets.push(n + offset);
        }

        return offsets;

    }

}

export interface DocumentStoreDto {
    uriMap: UriMapDto;
}

export interface DocumentChangeEventArgs {
    doc: Document;
    oldDoc:Document;
}

export interface DocumentLoadEventArgs {
    doc:Document;
}

export interface DocumentAddEventArgs {
    doc:Document;
    cachedDoc?:Document;
}

export interface DocumentRemoveEventArgs {
    doc:Document;
}

export class DocumentStore {

    private _documentChangeEvent: Event<DocumentChangeEventArgs>;
    private _documentLoadedEvent:Event<DocumentLoadEventArgs>;
    private _documentAddEvent:Event<DocumentAddEventArgs>;
    private _documentRemoveEvent: Event<DocumentRemoveEventArgs>;
    private _openDocuments: { [index: string]: Document };
    private _unsubscribeMap: { [index: string]: Unsubscribe };
    private _bubbleEvent = (args: DocumentChangeEventArgs) => {
        this._documentChangeEvent.trigger(args);
    }

    constructor(private cache: Cache) {
        this._openDocuments = {};
        this._documentChangeEvent = new Event<DocumentChangeEventArgs>();
        this._documentLoadedEvent= new Event<DocumentLoadEventArgs>();
        this._documentAddEvent = new Event<DocumentAddEventArgs>();
        this._documentRemoveEvent = new Event<DocumentRemoveEventArgs>();
        this._unsubscribeMap = {};
    }

    get documentChangeEvent() {
        return this._documentChangeEvent;
    }

    get documentLoadEvent() {
        return this._documentLoadedEvent;
    }

    get documentAddEvent() {
        return this._documentAddEvent;
    }

    get documentRemoveEvent() {
        return this._documentRemoveEvent;
    }

    get count() {
        return Object.keys(this._openDocuments).length;
    }

    get documents() {
        return Object.keys(this._openDocuments).map((v) => {
            return this._openDocuments[v];
        });
    }

    has(uri: string) {
        return UriMap.id(uri) !== undefined;
    }

    add(parsedDocument: Document) {
        UriMap.add(parsedDocument.uri);
        this._openDocuments[parsedDocument.uri] = parsedDocument;
        this._unsubscribeMap[parsedDocument.uri] = parsedDocument.changeEvent.subscribe(this._bubbleEvent);
    }

    close(uri: string) {
        const doc = this._openDocuments[uri];
        if (!doc) {
            return;
        }

        const unsubscribe = this._unsubscribeMap[uri];
        unsubscribe();
        delete this._openDocuments[uri];
        return this._toCache(doc);
    }

    remove(uri: string) {
        if (!this.has(uri)) {
            return Promise.resolve();
        }

        if (this._openDocuments[uri]) {
            const unsubscribe = this._unsubscribeMap[uri];
            unsubscribe();
            delete this._openDocuments[uri];
        }

        UriMap.remove(uri);

        return this.cache.delete(uri);

    }

    /**
     * Open documents only
     * @param uri 
     */
    find(uri: string) {
        return this._openDocuments[uri];
    }

    private _fromCacheSync(uri:string) {

        const dto = this.cache.readSync(uri) as DocumentDto;
        const doc = new Document(uri, undefined);
        doc.restore(dto);
        return doc;

    }

    private _toCache(doc:Document) {

    }

}


