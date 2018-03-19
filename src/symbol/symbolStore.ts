/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Definition, SymbolKind, SymbolModifier, SymbolIdentifier } from './symbol';
import { Reference } from './reference';
import {
    TreeTraverser, Predicate, TreeVisitor, Traversable, BinarySearch, NameIndex, PackedLocation, FindByStartPositionTraverser,
    NameIndexNode,
    Unsubscribe
} from '../types';
import { Position, Location, Range } from 'vscode-languageserver-types';
import { TypeString } from './typeString';
import * as builtInSymbols from './builtInSymbols.json';
import { ParsedDocument, ParsedDocumentChangeEventArgs } from './parsedDocument';
import { SymbolReader } from './symbolReader';
import { NameResolver } from './nameResolver';
import * as util from './util';
import { TypeAggregate, MemberMergeStrategy } from './typeAggregate';
import { ReferenceReader } from './referenceReader';
import * as uriMap from './uriMap';
import { DocumentStore, DocumentChangeEventArgs, DocumentAddEventArgs, DocumentLoadEventArgs, DocumentRemoveEventArgs, Document } from '../document/document';
import { Phrase, PhraseKind } from '../parser/phrase';
import { Token } from '../parser/lexer';
import { ReferencePhrase } from '../transformers/transformers';

const builtInsymbolsUri = 'php';

export class SymbolTable implements Traversable<Definition> {

    private _uri: string;
    private _root: Definition;

    constructor(uri: string, root: Definition) {
        this._uri = uri;
        this._root = root;
    }

    get uri() {
        return this._uri;
    }

    get root() {
        return this._root;
    }

    get symbols() {
        let traverser = new TreeTraverser([this.root]);
        let symbols = traverser.toArray();
        //remove root
        symbols.shift();
        return symbols;
    }

    get symbolCount() {
        let traverser = new TreeTraverser([this.root]);
        //subtract 1 for root
        return traverser.count() - 1;
    }

    pruneScopedVars() {
        let visitor = new ScopedVariablePruneVisitor();
        this.traverse(visitor);
    }

    parent(s: Definition) {
        let traverser = new TreeTraverser([this.root]);
        let fn = (x: Definition) => {
            return x === s;
        };
        if (!traverser.find(fn)) {
            return null;
        }

        return traverser.parent();
    }

    traverse<T extends TreeVisitor<Definition>>(visitor: T) {
        let traverser = new TreeTraverser([this.root]);
        traverser.traverse(visitor);
        return visitor;
    }

    createTraverser() {
        return new TreeTraverser([this.root]);
    }

    filter(predicate: Predicate<Definition>) {
        let traverser = new TreeTraverser([this.root]);
        return traverser.filter(predicate)
    }

    find(predicate: Predicate<Definition>) {
        let traverser = new TreeTraverser([this.root]);
        return traverser.find(predicate);
    }

    nameResolver(pos: Position) {
        let nameResolver = new NameResolver();
        let traverser = new TreeTraverser([this.root]);
        let visitor = new NameResolverVisitor(pos, nameResolver);
        traverser.traverse(visitor);
        return nameResolver;
    }

    scope(pos: Position) {
        let traverser = new TreeTraverser([this.root]);
        let visitor = new ScopeVisitor(pos, false);
        traverser.traverse(visitor);
        return visitor.scope;
    }

    absoluteScope(pos: Position) {
        let traverser = new TreeTraverser([this.root]);
        let visitor = new ScopeVisitor(pos, true);
        traverser.traverse(visitor);
        return visitor.scope;
    }

    scopeSymbols() {
        return this.filter(this._isScopeSymbol);
    }

    symbolAtPosition(position: Position) {

        let pred = (x: Definition) => {
            return x.location && util.positionEquality(x.location.range.start, position);
        };

        return this.filter(pred).pop();
    }

    contains(s: Definition) {
        let traverser = new TreeTraverser([this.root]);
        let visitor = new ContainsVisitor(s);
        traverser.traverse(visitor);
        return visitor.found;
    }

    private _isScopeSymbol(s: Definition) {
        const mask = SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait | SymbolKind.None | SymbolKind.Function | SymbolKind.Method;
        return (s.kind & mask) > 0;
    }

    static fromData(data: any) {
        return new SymbolTable(data._uri, data._root);
    }

    static create(parsedDocument: ParsedDocument, externalOnly?: boolean) {

        let symbolReader = new SymbolReader(parsedDocument, new NameResolver());

        parsedDocument.traverse(symbolReader);
        return new SymbolTable(
            parsedDocument.uri,
            symbolReader.symbol
        );

    }

    static readBuiltInSymbols() {

        return new SymbolTable(builtInsymbolsUri, {
            kind: SymbolKind.None,
            name: '',
            location: HashedLocation.create(0, Range.create(0, 0, 1000000, 1000000)),
            children: <any>builtInSymbols
        });

    }

}

class ScopedVariablePruneVisitor implements TreeVisitor<Definition> {

    preorder(node: Definition, spine: Definition[]) {

        if ((node.kind === SymbolKind.Function || node.kind === SymbolKind.Method) && node.children) {
            node.children = node.children.filter(this._isNotVar);
        }

        return true;
    }

    private _isNotVar(s: Definition) {
        return s.kind !== SymbolKind.Variable;
    }


}

export interface PackedStartLocation {
    uriId: number;
    start: Position;
}

export class SymbolStore {

    private _definitionIndex: NameIndex<Definition>;
    private _referenceIndex:NameIndex<number>; //just keep a name -> uriId record here
    private _symbolCount: number;
    private _unsubscribe:Unsubscribe[];

    private _onDocChange = (args:DocumentChangeEventArgs) => {
        this._remove(args.oldDoc);
        this._add(args.doc);
    }

    private _onDocAdd = (args:DocumentAddEventArgs) => {
        //if doc already exists replace it
        if(args.cachedDoc) {
            this._remove(args.cachedDoc);
        }

        this._add(args.doc);
    }

    private _onDocLoad = (args:DocumentLoadEventArgs) => {
        //make sure defintions in index 
        this._remove(args.doc);
        this._add(args.doc);
    }

    private _onDocRemove = (args:DocumentRemoveEventArgs) => {
        this._remove(args.doc);
    }

    constructor(private docStore:DocumentStore) {
        this._referenceIndex = new NameIndex<number>();
        this._definitionIndex = new NameIndex<Definition>(Definition.isEqual);
        this._symbolCount = 0;
        this._unsubscribe = [];
        this._unsubscribe.push(this.docStore.documentAddEvent.subscribe(this._onDocAdd));
        this._unsubscribe.push(this.docStore.documentChangeEvent.subscribe(this._onDocChange));
        this._unsubscribe.push(this.docStore.documentRemoveEvent.subscribe(this._onDocRemove));
        this._unsubscribe.push(this.docStore.documentLoadEvent.subscribe(this._onDocLoad));
    }

    onParsedDocumentChange = (args: ParsedDocumentChangeEventArgs) => {
        this.remove(args.parsedDocument.uri);
        let table = SymbolTable.create(args.parsedDocument);
        this.add(table);
    };

    getSymbolTable(uri: string) {
        const doc = this.docStore.find(uri);
        return doc ? doc.symbolTable : undefined;
    }

    getSymbolTableById(id:number) {
        return this._tableIndex[id];
    }

    get tableCount() {
        return Object.keys(this._tableIndex).length;
    }

    get symbolCount() {
        return this._symbolCount;
    }

    private _add(doc:Document) {
        const indexItems = doc.symbolTable.filter(this._indexFilter);
        for (let n = 0, l = indexItems.length; n < l; ++n) {
            this._definitionIndex.add(indexItems[n], Definition.keys(indexItems[n]));
        }
        this._symbolCount += doc.symbolTable.symbolCount;
    }

    private _remove(doc:Document) {
        const indexItems = doc.symbolTable.filter(this._indexFilter);
        for (let n = 0, l = indexItems.length; n < l; ++n) {
            this._definitionIndex.remove(indexItems[n], Definition.keys(indexItems[n]));
        }
        this._symbolCount -= doc.symbolTable.symbolCount;
    }

    toJSON() {
        return {
            _tableIndex: this._tableIndex,
            _symbolCount: this._symbolCount,
            _symbolIndex: this._definitionIndex.toJSON()
        }
    }

    restore(data: any) {
        this._symbolCount = data._symbolCount;
        this._tableIndex = {};
        let tableKeys = Object.keys(data._tableIndex);
        let table: SymbolTable;
        for (let n = 0, l = tableKeys.length; n < l; ++n) {
            this._tableIndex[tableKeys[n]] = SymbolTable.fromData(data._tableIndex[tableKeys[n]]);
        }
        this._definitionIndex.restore(data._symbolIndex);
    }

    /**
     * Finds all indexed symbols that match text exactly.
     * Case sensitive for constants and variables and insensitive for 
     * classes, traits, interfaces, functions, methods
     * @param text 
     * @param filter 
     */
    find(text: string, filter?: Predicate<Definition>) {

        if (!text) {
            return [];
        }

        let lcText = text.toLowerCase();
        let kindMask = SymbolKind.Constant | SymbolKind.Variable;
        let result = this._definitionIndex.find(text);
        let symbols: Definition[] = [];
        let s: Definition;

        for (let n = 0, l = result.length; n < l; ++n) {
            s = result[n];
            if ((!filter || filter(s)) &&
                (((s.kind & kindMask) > 0 && s.name === text) ||
                    (!(s.kind & kindMask) && s.name.toLowerCase() === lcText))) {
                symbols.push(s);
            }
        }

        return symbols;
    }

    /**
     * matches indexed symbols where symbol keys begin with text.
     * Case insensitive
     */
    match(text: string, filter?: Predicate<Definition>) {

        if (!text) {
            return [];
        }

        const matches: Definition[] = this._definitionIndex.match(text);

        if (!filter) {
            return matches;
        }

        const filtered: Definition[] = [];
        let s: Definition;

        for (let n = 0, l = matches.length; n < l; ++n) {
            s = matches[n];
            if (filter(s)) {
                filtered.push(s);
            }
        }

        return filtered;
    }

    *matchIterator(text:string, filter?: Predicate<Definition>) {

        if (!text) {
            return;
        }

        const matches: Definition[] = this._definitionIndex.match(text);
        let s: Definition;

        for (let n = 0, l = matches.length; n < l; ++n) {
            s = matches[n];
            if (!filter || filter(s)) {
                yield s;
            }
        }

    }

    findSymbolsByReference(ref: Reference, memberMergeStrategy?: MemberMergeStrategy): Definition[] {
        if (!ref) {
            return [];
        }

        let symbols: Definition[];
        let fn: Predicate<Definition>;
        let lcName: string;
        let table: SymbolTable;

        switch (ref.kind) {
            case SymbolKind.Class:
            case SymbolKind.Interface:
            case SymbolKind.Trait:
                fn = (x) => {
                    return (x.kind & (SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait)) > 0;
                };
                symbols = this.find(ref.name, fn);
                break;

            case SymbolKind.Function:
            case SymbolKind.Constant:
                fn = (x) => {
                    return x.kind === ref.kind;
                };
                symbols = this.find(ref.name, fn);
                if (symbols.length < 1 && ref.unresolvedName) {
                    symbols = this.find(ref.unresolvedName, fn);
                }
                break;

            case SymbolKind.Method:
                lcName = ref.name.toLowerCase();
                fn = (x) => {
                    return x.kind === SymbolKind.Method && x.name.toLowerCase() === lcName;
                };
                symbols = this.findMembers(ref.scope, memberMergeStrategy || MemberMergeStrategy.None, fn);
                break;

            case SymbolKind.Property:
                {
                    let name = ref.name;
                    fn = (x) => {
                        return x.kind === SymbolKind.Property && name === x.name;
                    };
                    symbols = this.findMembers(ref.scope, memberMergeStrategy || MemberMergeStrategy.None, fn);
                    break;
                }

            case SymbolKind.ClassConstant:
                fn = (x) => {
                    return x.kind === SymbolKind.ClassConstant && x.name === ref.name;
                };
                symbols = this.findMembers(ref.scope, memberMergeStrategy || MemberMergeStrategy.None, fn);
                break;

            case SymbolKind.Variable:
            case SymbolKind.Parameter:
                //@todo global vars?
                table = this._tableIndex[ref.location.uriHash];
                if (table) {
                    let scope = table.scope(ref.location.range.start);

                    fn = (x) => {
                        return (x.kind & (SymbolKind.Parameter | SymbolKind.Variable)) > 0 &&
                            x.name === ref.name;
                    }
                    let s = scope.children ? scope.children.find(fn) : null;
                    if (s) {
                        symbols = [s];
                    }
                }
                break;

            case SymbolKind.Constructor:
                fn = (x) => {
                    return x.kind === SymbolKind.Method && x.name.toLowerCase() === '__construct';
                };
                symbols = this.findMembers(ref.name, memberMergeStrategy || MemberMergeStrategy.None, fn);
                break;

            default:
                break;

        }

        return symbols || [];
    }

    findMembers(scope: string, memberMergeStrategy: MemberMergeStrategy, predicate?: Predicate<Definition>) {

        let fqnArray = TypeString.atomicClassArray(scope);
        let type: TypeAggregate;
        let members: Definition[] = [];
        for (let n = 0; n < fqnArray.length; ++n) {
            type = TypeAggregate.create(this, fqnArray[n]);
            if (type) {
                Array.prototype.push.apply(members, type.members(memberMergeStrategy, predicate));
            }
        }
        return Array.from(new Set<Definition>(members));
    }

    findBaseMember(symbol: Definition) {

        if (
            !symbol || !symbol.scope ||
            !(symbol.kind & (SymbolKind.Property | SymbolKind.Method | SymbolKind.ClassConstant)) ||
            (symbol.modifiers & SymbolModifier.Private) > 0
        ) {
            return symbol;
        }

        let fn: Predicate<Definition>;

        if (symbol.kind === SymbolKind.Method) {
            let name = symbol.name.toLowerCase();
            fn = (s: Definition) => {
                return s.kind === symbol.kind && s.modifiers === symbol.modifiers && name === s.name.toLowerCase();
            };
        } else {
            fn = (s: Definition) => {
                return s.kind === symbol.kind && s.modifiers === symbol.modifiers && symbol.name === s.name;
            };
        }

        return this.findMembers(symbol.scope, MemberMergeStrategy.Last, fn).shift() || symbol;

    }

    /*
    findOverrides(baseSymbol: PhpSymbol): PhpSymbol[] {

        if (
            !baseSymbol ||
            !(baseSymbol.kind & (SymbolKind.Property | SymbolKind.Method | SymbolKind.ClassConstant)) ||
            (baseSymbol.modifiers & SymbolModifier.Private) > 0
        ) {
            return [];
        }

        let baseTypeName = baseSymbol.scope ? baseSymbol.scope : '';
        let baseType = this.find(baseTypeName, PhpSymbol.isClassLike).shift();
        if (!baseType || baseType.kind === SymbolKind.Trait) {
            return [];
        }
        let store = this;
        let filterFn = (s: PhpSymbol) => {

            if (s.kind !== baseSymbol.kind || s.modifiers !== baseSymbol.modifiers || s === baseSymbol) {
                return false;
            }

            let type = store.find(s.scope).shift();
            if (!type) {
                return false;
            }

            if (PhpSymbol.isAssociated(type, baseTypeName)) {
                return true;
            }

            let aggregate = new TypeAggregate(store, type);
            return aggregate.isAssociated(baseTypeName);

        };
        return this.find(baseSymbol.name, filterFn);

    }
    */

    symbolLocation(symbol: Definition): Location {
        let table = this._tableIndex[symbol.location.uriId];
        return table ? Location.create(table.uri, symbol.location.range) : undefined;
    }

    referenceToTypeString(ref: Reference) {

        if (!ref) {
            return '';
        }

        switch (ref.kind) {
            case SymbolKind.Class:
            case SymbolKind.Interface:
            case SymbolKind.Trait:
            case SymbolKind.Constructor:
                return ref.name;

            case SymbolKind.Function:
            case SymbolKind.Method:
            case SymbolKind.Property:
                return this.findSymbolsByReference(ref, MemberMergeStrategy.Documented).reduce<string>((carry, val) => {
                    return TypeString.merge(carry, PhpSymbol.type(val));
                }, '');

            case SymbolKind.Variable:
                return ref.type || '';

            default:
                return '';


        }
    }

    private _classOrInterfaceFilter(s: Definition) {
        return (s.kind & (SymbolKind.Class | SymbolKind.Interface)) > 0;
    }

    private _classInterfaceTraitFilter(s: Definition) {
        return (s.kind & (SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait)) > 0;
    }

    /**
     * No vars, params or symbols with use modifier
     * @param s 
     */
    private _indexFilter(s: Definition) {
        return !(s.kind & (SymbolKind.Parameter | SymbolKind.File)) && //no params or files
            !(s.modifiers & (SymbolModifier.Use | SymbolModifier.TraitInsteadOf)) && //no use or trait insteadof
            !(s.kind === SymbolKind.Variable && s.location) && //no variables that have a location (in built globals have no loc)
            s.name.length > 0;
    }

}

class NameResolverVisitor implements TreeVisitor<Definition> {

    haltTraverse = false;
    private _kindMask = SymbolKind.Class | SymbolKind.Function | SymbolKind.Constant;

    constructor(public pos: Position, public nameResolver: NameResolver) { }

    preorder(node: Definition, spine: Definition[]) {

        if (node.location && node.location.range.start.line > this.pos.line) {
            this.haltTraverse = true;
            return false;
        }

        if ((node.modifiers & SymbolModifier.Use) > 0 && (node.kind & this._kindMask) > 0) {
            this.nameResolver.rules.push(node);
        } else if (node.kind === SymbolKind.Namespace) {
            this.nameResolver.namespace = node;
        } else if (node.kind === SymbolKind.Class) {
            this.nameResolver.pushClass(node);
        }

        return true;

    }

    postorder(node: Definition, spine: Definition[]) {

        if (this.haltTraverse || (node.location && node.location.range.end.line > this.pos.line)) {
            this.haltTraverse = true;
            return;
        }

        if (node.kind === SymbolKind.Class) {
            this.nameResolver.popClass();
        }

    }
}

class ScopeVisitor implements TreeVisitor<Definition> {

    haltTraverse = false;
    private _scopeStack: Definition[];
    private _kindMask = SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait | SymbolKind.Function | SymbolKind.Method | SymbolKind.File;
    private _absolute = false;

    constructor(public pos: Position, absolute: boolean) {
        this._scopeStack = [];
        this._absolute = absolute;
    }

    get scope() {
        return this._scopeStack[this._scopeStack.length - 1];
    }

    preorder(node: Definition, spine: Definition[]) {

        if (node.location && node.location.range.start.line > this.pos.line) {
            this.haltTraverse = true;
            return false;
        }

        if (!node.location || util.isInRange(this.pos, node.location.range) !== 0) {
            return false;
        }

        if (
            (node.kind & this._kindMask) > 0 &&
            !(node.modifiers & SymbolModifier.Use) &&
            (!this._absolute || node.kind !== SymbolKind.Function || !(node.modifiers & SymbolModifier.Anonymous))
        ) {
            this._scopeStack.push(node);
        }

        return true;
    }

}

class ContainsVisitor implements TreeVisitor<Definition> {

    haltTraverse = false;
    found = false;
    private _symbol: Definition;

    constructor(symbol: Definition) {
        this._symbol = symbol;
        if (!symbol.location) {
            throw new Error('Invalid Argument');
        }
    }

    preorder(node: Definition, spine: Definition[]) {

        if (node === this._symbol) {
            this.found = true;
            this.haltTraverse = true;
            return false;
        }

        if (node.location && util.isInRange(this._symbol.location.range.start, node.location.range) !== 0) {
            return false;
        }

        return true;

    }

}

interface KeyedHashedStartLocation {
    keys: string[];
    start: PackedStartLocation;
}

namespace KeyedHashedStartLocation {

    function keys(s: Definition) {
        if (s.kind === SymbolKind.Namespace) {
            let lcName = s.name.toLowerCase();
            let keys = new Set<string>();
            keys.add(lcName);
            Set.prototype.add.apply(keys, lcName.split('\\').filter((s) => { return s.length > 0 }));
            return Array.from(keys);
        }

        return PhpSymbol.keys(s);
    }

    export function create(s: Definition) {
        return <KeyedHashedStartLocation>{
            keys: keys(s),
            start: {
                uriId: s.location.uriId,
                start: s.location.range.start
            }
        }
    }
}

class IndexableSymbolVisitor implements TreeVisitor<Definition> {

    private _items: Symbol[];

    constructor(private uriId: number) {
        this._items = [];
    }

    get items() {
        return this._items;
    }

    preorder(node: Definition, spine: Definition[]) {
        if (
            !(node.kind & (SymbolKind.Parameter | SymbolKind.File | SymbolKind.Variable)) && //no params or files
            !(node.modifiers & SymbolModifier.Use) && //no use
            node.name.length > 0
        ) {
            this._items.push(KeyedHashedStartLocation.create(node));
        }
        return true;
    }

}

class ReferenceIndexVisitor implements TreeVisitor<Phrase|Token> {

    private _names: Set<string>;
    private _isScoped = 0;
    private static readonly INDEX_NOT_KIND_MASK = SymbolKind.Parameter | SymbolKind.File | SymbolKind.Variable;

    constructor(){
        this._names = new Set<string>();
    }

    get names() {
        return Array.from(this._names);
    }

    preorder(node:Phrase|Token, spine:(Phrase|Token)[]) {

        if(
            (<Phrase>node).phraseType === PhraseKind.MethodDeclarationBody || 
            (<Phrase>node).phraseType === PhraseKind.FunctionDeclarationBody
        ) {
            ++this._isScoped;
        }

        const ref = (<ReferencePhrase>node).reference;
        if(
            ref && ref.name &&
            (!(ref.kind & ReferenceIndexVisitor.INDEX_NOT_KIND_MASK) || 
            (ref.kind & SymbolKind.Variable) > 0 && this._isScoped < 1) //allow global scoped vars
        ) {
            this._names.add(ref.name);
        }

        return true;
    }

    postorder(node:Phrase|Token, spine:(Phrase|Token)[]) {
        if(
            (<Phrase>node).phraseType === PhraseKind.MethodDeclarationBody || 
            (<Phrase>node).phraseType === PhraseKind.FunctionDeclarationBody
        ) {
            --this._isScoped;
        }
    }

}

/*
export class SymbolTableIndex {

    private _tables: SymbolTableIndexNode[];
    private _search: BinarySearch<SymbolTableIndexNode>;
    private _count = 0;

    constructor() {
        this._tables = [];
        this._search = new BinarySearch<SymbolTableIndexNode>(this._tables);
    }

    count() {
        return this._count;
    }

    *tables() {
        let node: SymbolTableIndexNode;
        for (let n = 0, nl = this._tables.length; n < nl; ++n) {
            node = this._tables[n];
            for (let k = 0, tl = node.tables.length; k < tl; ++k) {
                yield node.tables[k];
            }
        }
    }

    add(table: SymbolTable) {
        let fn = this._createCompareFn(table.uri);
        let search = this._search.search(fn);
        if (search.isExactMatch) {
            let node = this._tables[search.rank];
            if (node.tables.find(this._createUriFindFn(table.uri))) {
                --this._count;
                throw new Error(`Duplicate key ${table.uri}`);
            }
            node.tables.push(table);
        } else {
            let node = <SymbolTableIndexNode>{ hash: table.hash, tables: [table] };
            this._tables.splice(search.rank, 0, node);
        }
        ++this._count;
    }

    remove(uri: string) {
        let fn = this._createCompareFn(uri);
        let node = this._search.find(fn);
        if (node) {
            let i = node.tables.findIndex(this._createUriFindFn(uri));
            if (i > -1) {
                --this._count;
                return node.tables.splice(i, 1).pop();
            }
        }
    }

    find(uri: string) {
        let fn = this._createCompareFn(uri);
        let node = this._search.find(fn);
        return node ? node.tables.find(this._createUriFindFn(uri)) : null;
    }

    findBySymbol(s: PhpSymbol) {
        if (!s.location) {
            return undefined;
        }

        let node = this._search.find((x) => {
            return x.hash - s.location.uriHash;
        });

        if (!node || !node.tables.length) {
            return undefined;
        } else if (node.tables.length === 1) {
            return node.tables[0];
        } else {
            let table: SymbolTable;
            for (let n = 0; n < node.tables.length; ++n) {
                table = node.tables[n];
                if (table.contains(s)) {
                    return table;
                }
            }
        }

        return undefined;
    }

    toJSON() {
        return {
            _tables: this._tables,
            _count: this._count
        }
    }

    fromJSON(data: any) {
        this._count = data._count;
        this._tables = [];
        let node: any;
        let newNode: SymbolTableIndexNode;
        for (let n = 0; n < data._tables.length; ++n) {
            node = data._tables[n];
            newNode = {
                hash: node.hash,
                tables: []
            }
            for (let k = 0; k < node.tables.length; ++k) {
                newNode.tables.push(SymbolTable.fromJSON(node.tables[k]));
            }
            this._tables.push(newNode);
        }
        this._search = new BinarySearch<SymbolTableIndexNode>(this._tables);
    }

    private _createCompareFn(uri: string) {
        let hash = Math.abs(util.hash32(uri));
        return (x: SymbolTableIndexNode) => {
            return x.hash - hash;
        };
    }

    private _createUriFindFn(uri: string) {
        return (x: SymbolTable) => {
            return x.uri === uri;
        };
    }

}

export interface SymbolTableIndexNode {
    hash: number;
    tables: SymbolTable[];
}
*/