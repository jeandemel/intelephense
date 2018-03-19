/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Location, Range } from 'vscode-languageserver-types';
import { Predicate, PackedLocation, PackedRange } from '../types';
import * as util from '../util';

export const enum SymbolKind {
    None = 0,
    Class = 1 << 0,
    Interface = 1 << 1,
    Trait = 1 << 2,
    Constant = 1 << 3,
    Property = 1 << 4,
    Method = 1 << 5,
    Function = 1 << 6,
    Parameter = 1 << 7,
    Variable = 1 << 8,
    Namespace = 1 << 9,
    ClassConstant = 1 << 10,
    Constructor = 1 << 11,
    File = 1 << 12
}

export const enum SymbolModifier {
    None = 0,
    Public = 1 << 0,
    Protected = 1 << 1,
    Private = 1 << 2,
    Final = 1 << 3,
    Abstract = 1 << 4,
    Static = 1 << 5,
    ReadOnly = 1 << 6,
    WriteOnly = 1 << 7,
    Magic = 1 << 8,
    Anonymous = 1 << 9,
    Reference = 1 << 10,
    Variadic = 1 << 11,
    Use = 1 << 12,
    TypeDeclared = 1 << 13,
    TypeDocumented = 1 << 14,
    TypeInferred = 1 << 15,
    Documented = 1 << 16,
    Optional = 1 << 17,
    TraitInsteadOf = 1 << 18,
    TraitAs = 1 << 19
}

export interface Reference extends SymbolIdentifier {
    scope?:string;
    type?: string;
    unresolvedName?: string;
}

export namespace Reference {
    export function create(kind: SymbolKind, name: string, loc:PackedLocation): Reference {
        return { kind: kind, name: name, location: loc };
    }
}

export interface Definition extends SymbolIdentifier {
    scope?: string;
    modifiers?: SymbolModifier;
    type?: string;
    associated?: Reference[];
    children?: Definition[];
    value?: string;
}

export interface SymbolIdentifier {
    kind: SymbolKind;
    name: string;
    location:PackedLocation;
}

export namespace Definition {

    export function keys(s: Definition) {
        if (!s.name) {
            return [];
        }

        if (s.kind === SymbolKind.Namespace) {
            return [s.name.toLowerCase()];
        }

        let text = notFqn(s.name);
        let lcText = text.toLowerCase();
        let suffixes = [s.name.toLowerCase()];
        if (text !== s.name) {
            suffixes.push(lcText);
        }
        let n = 0;
        let c: string;
        let l = text.length;

        while (n < l) {

            c = text[n];

            if ((c === '$' || c === '_') && n + 1 < l && text[n + 1] !== '_') {
                ++n;
                suffixes.push(lcText.slice(n));
            } else if (n > 0 && c !== lcText[n] && text[n - 1] === lcText[n - 1]) {
                //uppercase
                suffixes.push(lcText.slice(n));
            }

            ++n;

        }

        return suffixes;
    }

    function isParameter(s: Definition) {
        return s.kind === SymbolKind.Parameter;
    }

    export function isClassLike(s: Definition) {
        return (s.kind & (SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait)) > 0;
    }

    export function signatureString(s: Definition, excludeTypeInfo?: boolean) {

        if (!s || !(s.kind & (SymbolKind.Function | SymbolKind.Method))) {
            return '';
        }

        const params = s.children ? s.children.filter(isParameter) : [];
        const paramStrings: String[] = [];
        let param: Definition;
        let parts: string[];
        let paramType: string;
        let closeBrackets = '';

        for (let n = 0, l = params.length; n < l; ++n) {
            param = params[n];
            parts = [];

            if (n) {
                parts.push(',');
            }

            if (!excludeTypeInfo) {
                if (param.type) {
                    parts.push(param.type);
                }
            }

            parts.push(param.name);

            if (param.value) {
                const space = n ? ' ' : '';
                paramStrings.push(`${space}[${parts.join(' ')}`);
                closeBrackets += ']';
            } else {
                paramStrings.push(parts.join(' '));
            }

        }

        let sig = `(${paramStrings.join('')}${closeBrackets})`;

        if (!excludeTypeInfo) {
            if (s.type) {
                sig += `: ${s.type}`;
            }
        }

        return sig;

    }

    export function hasParameters(s: Definition) {
        return s.children && s.children.find(isParameter) !== undefined;
    }

    export function notFqn(text: string) {
        if (!text) {
            return text;
        }
        let pos = text.lastIndexOf('\\') + 1;
        return text.slice(pos);
    }

    export function namespace(fqn: string) {
        if (!fqn) {
            return '';
        }

        let pos = fqn.lastIndexOf('\\');
        return pos < 0 ? '' : fqn.slice(0, pos);
    }

    /**
     * Shallow clone
     * @param s 
     */
    export function clone(s: Definition): Definition {
        return {
            kind: s.kind,
            name: s.name,
            children: s.children,
            location: s.location,
            modifiers: s.modifiers,
            associated: s.associated,
            type: s.type,
            scope: s.scope,
            value: s.value
        };
    }

    export function setScope(symbols: Definition[], scope: string) {
        if (!symbols) {
            return symbols;
        }
        for (let n = 0; n < symbols.length; ++n) {
            symbols[n].scope = scope;
        }
        return symbols;
    }

    export function create(kind: SymbolKind, name: string, location?: PackedLocation): Definition {
        return {
            kind: kind,
            name: name,
            location: location
        };
    }

    export function filterChildren(parent: Definition, fn: Predicate<Definition>) {
        if (!parent || !parent.children) {
            return [];
        }

        return util.filter<Definition>(parent.children, fn);
    }

    export function findChild(parent: Definition, fn: Predicate<Definition>) {
        if (!parent || !parent.children) {
            return undefined;
        }

        return util.find<Definition>(parent.children, fn);
    }

    export function isAssociated(symbol: Definition, name: string) {
        let lcName = name.toLowerCase();
        let fn = (x: Reference) => {
            return lcName === x.name.toLowerCase();
        }
        return util.find(symbol.associated, fn);
    }

    /**
     * uniqueness determined by name and symbol kind
     * @param symbol 
     */
    export function unique(symbols: Definition[]) {

        let uniqueSymbols: Definition[] = [];
        if (!symbols) {
            return uniqueSymbols;
        }

        let map: { [index: string]: SymbolKind } = {};
        let s: Definition;

        for (let n = 0, l = symbols.length; n < l; ++n) {
            s = symbols[n];
            if (!(map[s.name] & s.kind)) {
                uniqueSymbols.push(s);
                map[s.name] |= s.kind;
            }
        }

        return uniqueSymbols;
    }

    export function isEqual(a:Definition, b:Definition) {
        return a.kind === b.kind && a.name === b.name;
    }

}

/**
 * uniqueness determined by name and symbol kind
 */
export class UniqueSymbolSet {

    private _symbols: Definition[];
    private _map: { [index: string]: SymbolKind } = {};

    constructor() {
        this._symbols = [];
    }

    add(s: Definition) {
        if (!this.has(s)) {
            this._symbols.push(s);
            this._map[s.name] |= s.kind;
        }
    }

    has(s: Definition) {
        return (this._map[s.name] & s.kind) === s.kind;
    }

    toArray() {
        return this._symbols.slice(0);
    }

}
