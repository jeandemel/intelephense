/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Predicate, TreeVisitor, TreeTraverser, NameIndex, Traversable, SortedList, NameIndexNode, HashedLocation } from './types';
import { SymbolIdentifier, SymbolKind } from './symbol';
import { Range, Location, Position } from 'vscode-languageserver-types';
import * as util from './util';
import { FileCache, Cache } from './cache';
import { Log } from './logger';
import * as uriMap from './uriMap';

export interface Reference extends SymbolIdentifier {
    type?: string;
    altName?: string;
}

export namespace Reference {
    export function create(kind: SymbolKind, name: string, location: HashedLocation): Reference {
        return {
            kind: kind,
            name: name,
            location: location
        };
    }
}

export interface Scope {
    location: Location;
    children: (Scope | Reference)[]
}

export namespace Scope {
    export function create(location: Location): Scope {
        return {
            location: location,
            children: []
        }
    }
}

export class ReferenceTable implements Traversable<Scope | Reference> {

    private _uri: string;
    private _root: Scope;
    private _hash: number;

    constructor(uri: string, root: Scope, hash?: number) {
        this._uri = uri;
        this._root = root;
        if (hash) {
            this._hash = hash;
        } else {
            this._hash = Math.abs(util.hash32(uri));
        }
    }

    get uri() {
        return this._uri;
    }

    get root() {
        return this._root;
    }

    get hash() {
        return this._hash;
    }

    get referenceCount() {
        return this.references().length;
    }

    references(filter?: Predicate<Reference>) {
        let traverser = new TreeTraverser([this.root]);
        let visitor = new ReferencesVisitor(filter);
        traverser.traverse(visitor);
        return visitor.references;
    }

    referenceAtPosition(position: Position) {

        let visitor = new LocateVisitor(position);
        this.traverse(visitor);
        let ref = visitor.node as Reference;
        return ref && ref.kind ? ref : undefined;

    }

    scopeAtPosition(position: Position) {
        let visitor = new LocateVisitor(position);
        this.traverse(visitor);
        let node = visitor.node;
        return node && (<Reference>node).kind === undefined ? <Scope>node : undefined;
    }

    createTraverser():TreeTraverser<Scope|Reference> {
        return new TreeTraverser([this.root]);
    }

    traverse(visitor: TreeVisitor<Scope | Reference>) {
        let traverser = new TreeTraverser([this.root]);
        traverser.traverse(visitor);
        return visitor;
    }

    static fromJSON(data: any) {
        return new ReferenceTable(data._uri, data._root, data._hash);
    }
}

export interface ReferenceTableSummary {
    uri: string;
    identifiers: string[];
}

export class ReferenceStore {

    private _inMemoryTables: {[uri:string]:ReferenceTable};
    private _nameIndex: NameIndex<number>;
    private _cache: Cache;

    constructor(cache: Cache) {
        this._nameIndex = new NameIndex<number>();
        this._inMemoryTables = {};
        this._cache = cache;
    }

    /**
     * Only fetches in memory tables
     * @param uri 
     */
    getInMemoryTable(uri: string) {
        let id = uriMap.id(uri);
        return this._inMemoryTables[id];
    }

    getInMemoryTables() {
        let tables = this._inMemoryTables;
        return Object.keys(tables).map(k => {
            return tables[k];
        });
    }

    add(table: ReferenceTable) {
        let uriId = uriMap.id(table.uri);
        if(this._inMemoryTables[uriId]) {
            throw new Error('Duplicate Key' + table.uri);
        }
        this._inMemoryTables[uriId] = table;
        let identifiers = (<IndexableReferenceIdentifiersVisitor>table.traverse(new IndexableReferenceIdentifiersVisitor())).identifiers;
        this._nameIndex.add(uriId, identifiers);
    }

    remove(table:ReferenceTable, purge?: boolean) {
        let uriId = uriMap.id(table.uri);
        if(uriId === undefined) {
            return;
        }
        delete this._inMemoryTables[uriId];
        let identifiers = (<IndexableReferenceIdentifiersVisitor>table.traverse(new IndexableReferenceIdentifiersVisitor())).identifiers;
        this._nameIndex.remove(uriId, identifiers);
        if (purge) {
            this._cache.delete(uriId.toString());
        }
    }

    open(uri: string) {
        let inMem = this._inMemoryTables;
        let uriId = uriMap.id(uri);
        return this._fetchTable(uriId).then(t => {
            if(t) {
                inMem[uriId] = t;
            }
            return t;
        });
    }

    close(uri: string) {
        let uriId = uriMap.id(uri);
        let table = this._inMemoryTables[uriId];
        if (table) {
            return this._cache.write(uriId.toString(), table).catch((msg) => { Log.error(msg) });
        }
        return Promise.resolve();
    }

    closeAll() {
        let tables = this.getInMemoryTables();
        let cache = this._cache;
        this._inMemoryTables = {};
        let count = tables.length;

        return new Promise<void>((resolve, reject) => {

            let onReject = (msg: string) => {
                --count;
                Log.error(msg);
                writeTableFn();
            }

            let onResolve = () => {
                --count;
                writeTableFn();
            }

            let writeTableFn = () => {
                let table = tables.pop();
                if (table) {
                    cache.write(uriMap.id(table.uri).toString(), table).then(onResolve).catch(onReject);
                } else if (count < 1) {
                    resolve();
                }
            }

            let maxOpenFiles = Math.min(4, tables.length);
            for (let n = 0; n < maxOpenFiles; ++n) {
                writeTableFn();
            }

        });

    }

    find(name: string, filter?: Predicate<Reference>): Promise<Reference[]> {

        if (!name) {
            return Promise.resolve<Reference[]>([]);
        }

        //find uriIds that contain ref matching name
        let ids = this._nameIndex.find(name);
        let count = ids.length;
        if (!count) {
            return Promise.resolve<Reference[]>([]);
        }
        let tables: ReferenceTable[] = [];
        let fetchTableFn = this._fetchTable;
        let findInTablesFn = this._findInTables;

        return new Promise<Reference[]>((resolve, reject) => {

            let onSuccess = (table: ReferenceTable) => {
                tables.push(table);
                onAlways();
            }

            let onFail = (msg: string) => {
                Log.warn(msg);
                onAlways();
            }

            let onAlways = () => {
                count--;
                if (count < 1) {
                    resolve(findInTablesFn(tables, name, filter));
                } else {
                    let id = ids.pop();
                    if (id) {
                        fetchTableFn(id).then(onSuccess).catch(onFail);
                    }
                }
            }

            let maxOpenFiles = Math.min(4, ids.length);
            while (maxOpenFiles--) {
                fetchTableFn(ids.pop()).then(onSuccess).catch(onFail);
            }

        });

    }

    fromJSON(data:NameIndexNode<number>[]) {
        this._nameIndex.restore(data);
    }

    toJSON() {
        return this._nameIndex;
    }

    private _findInTables(tables: ReferenceTable[], name: string, filter?: Predicate<Reference>) {

        const caseSensitiveKindMask = SymbolKind.Property | SymbolKind.Variable | SymbolKind.Constant | SymbolKind.ClassConstant;
        let refs: Reference[] = [];
        let lcName = name.toLowerCase();
        let table: ReferenceTable;

        if (!name || !tables.length) {
            return refs;
        }

        let predicate = (r: Reference) => {
            return (((r.kind & caseSensitiveKindMask) > 0 && name === r.name) ||
                (!(r.kind & caseSensitiveKindMask) && lcName === r.name.toLowerCase())) &&
                (!filter || filter(r));
        }

        for (let n = 0; n < tables.length; ++n) {
            table = tables[n];
            Array.prototype.push.apply(refs, table.references(predicate));
        }

        return refs;

    }

    private _fetchTable = (uriId: number):Promise<ReferenceTable> => {
        let table = this._inMemoryTables[uriId];

        if (table) {
            return Promise.resolve<ReferenceTable>(table);
        } else {
            return this._cache.read(uriId.toString()).then((obj) => {
                return new ReferenceTable(obj._uri, obj._root);
            }).catch(err => {
                Log.error(err);
                return undefined;
            });
        }
    }

}

class ReferencesVisitor implements TreeVisitor<Scope | Reference> {

    private _filter: Predicate<Reference>;
    private _refs: Reference[];

    constructor(filter?: Predicate<Reference>) {
        this._filter = filter;
        this._refs = [];
    }

    get references() {
        return this._refs;
    }

    preorder(node: Scope | Reference, spine: (Scope | Reference)[]) {

        if ((<Reference>node).kind !== undefined && (!this._filter || this._filter(<Reference>node))) {
            this._refs.push(<Reference>node);
        }

        return true;

    }

}

class IndexableReferenceIdentifiersVisitor implements TreeVisitor<Scope | Reference> {

    private _identifiers: Set<string>;

    constructor() {
        this._identifiers = new Set<string>();
    }

    get identifiers() {
        return Array.from(this._identifiers);
    }

    preorder(node: Scope | Reference, spine: (Scope | Reference)[]) {
        if (this._shouldIndex(node)) {
            let lcName = (<Reference>node).name.toLowerCase();
            let altName = (<Reference>node).altName;
            if (lcName && lcName !== 'true' && lcName !== 'false' && lcName !== 'null') {
                this._identifiers.add(lcName);
            }
            if (altName) {
                let lcAltName = altName.toLowerCase();
                if (lcAltName !== lcName && lcAltName !== 'static' && lcAltName !== 'self' && lcAltName !== 'parent') {
                    this._identifiers.add(lcAltName);
                }
            }
        }
        return true;
    }

    private _shouldIndex(node: Scope | Reference) {
        switch ((<Reference>node).kind) {
            case undefined:
            case SymbolKind.Variable:
            case SymbolKind.Parameter:
                return false;
            default:
                return true;
        }
    }

}

interface Locatable {
    location: { range: Range };
}

class LocateVisitor implements TreeVisitor<Locatable> {

    private _node: Locatable;

    constructor(private position: Position) { }

    get node() {
        return this._node;
    }

    preorder(node: Locatable, spine: Locatable[]) {

        if (node.location && node.location.range && util.isInRange(this.position, node.location.range) === 0) {
            this._node = node;
            return true;
        }

        return false;

    }

}