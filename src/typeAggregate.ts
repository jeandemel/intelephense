/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { PhpSymbol, SymbolKind, SymbolModifier } from './symbol';
import { SymbolStore } from './symbolStore';
import { Predicate } from './types';
import * as util from './util';
import { TypeString } from './typeString';
import { Reference } from './reference';

export const enum MemberMergeStrategy {
    None, //returns all symbols
    First, //first matching member encountered is chosen ie prefer overrides
    Documented, //prefer first unless it has no phpdoc and base does
    Last //last matching member encountered ie prefer base
}

class MemberSet {

    private _map: { [name: string]: SymbolKind };
    private _items: PhpSymbol[];

    constructor() {
        this._map = {};
        this._items = [];
    }

    add(member: PhpSymbol) {

        const name = member.kind === SymbolKind.Method ? member.name.toLowerCase() : member.name;
        const item = this._map[name];

        if (item === undefined) {
            this._map[name] = member.kind;
            this._items.push(member);
        } else if ((item & member.kind) === 0) {
            this._map[name] |= member.kind;
            this._items.push(member);
        } else {
            //no op
        }

    }

    addMany(members: PhpSymbol[]) {
        for (let n = 0; n < members.length; ++n) {
            this.add(members[n]);
        }
    }

    toArray() {
        return this._items.slice(0);
    }

}

class TraitMerge {

    private traitSpecificationMap: { [name: string]: boolean };

    constructor(public memberSet: MemberSet) {
        this.traitSpecificationMap = {};
    }

    /**
     * Trait specifications are stored as symbol definitions as 
     * children of the class that consumes them.
     * InsteadOf has 2 associated references representing the preferred and ignored member respectively
     * As has a single associated reference of the trait member with the defintion containing the alias information
     * @param definition 
     */
    addSpecification(definition: PhpSymbol) {

        let key: string;
        let ref: Reference;
        for (let n = 0; n < references.length; ++n) {
            ref = references[n];
            key = this._key(ref.name, ref.scope, ref.kind);
            if (key) {
                this.traitSpecificationMap[key] = true;
            }
        }

    }

    mergeTraits(traits: TraitAggregate[], predicate?: Predicate<PhpSymbol>) {

        let key: string;
        let member: PhpSymbol;
        let members: PhpSymbol[];

        for (let k = 0; k < traits.length; ++k) {

            members = traits[k].members(predicate);
            for (let n = 0, l = members.length; n < l; ++n) {
                member = members[n];
                key = this._key(member.name, member.scope, member.kind);
                if (!this.traitSpecificationMap[key]) {
                    this.memberSet.add(member);
                }
            }

        }

    }

    private _key(name: string, scope: string, kind: SymbolKind) {
        if (kind === SymbolKind.Property) {
            return scope.toLowerCase() + '::' + name;
        } else if (kind === SymbolKind.Method) {
            return scope.toLowerCase() + '::' + name.toLowerCase();
        } else {
            return '';
        }
    }

}

abstract class TypeAggregate {
    abstract members(predicate?: Predicate<PhpSymbol>): PhpSymbol[];
    abstract firstMember(predicate: Predicate<PhpSymbol>): PhpSymbol;
    abstract allMembers(predicate?: Predicate<PhpSymbol>): PhpSymbol[];

    protected *_memberIterator(
        definition: PhpSymbol[],
        traits?: TraitAggregate[],
        interfaces?: InterfaceAggregate[],
        baseClass?: ClassAggregate
    ) {



    }


}

export class ClassAggregate {

    private _baseClass: ClassAggregate;
    private _traits: TraitAggregate[];
    private _interfaces: InterfaceAggregate[];

    /**
     * 
     * @param symbolStore 
     * @param definition   An array is accepted here to enable use of class stubs.
     *                     Only the inherited types from the class with the longest associated list are considered.
     * @param circularReferenceGuard 
     * @param isBaseClass   private members are excluded
     */
    constructor(
        public symbolStore: SymbolStore,
        public definition: PhpSymbol[],
        private circularReferenceGuard: Set<PhpSymbol>,
        private isBaseClass: boolean
    ) {

        this._traits = [];
        this._interfaces = [];

        let assoc: Reference[] = [];
        let def: PhpSymbol;
        let ref: Reference;

        for (let n = 0; n < this.definition.length; ++n) {
            def = this.definition[n];
            this.circularReferenceGuard.add(def);
            if (def.associated && def.associated.length > assoc.length) {
                assoc = def.associated;
            }
        }

        let aggregate: TypeAggregate;

        for (let n = 0; n < assoc.length; ++n) {
            ref = assoc[n];
            if (ref.kind === SymbolKind.Class) {
                this._baseClass = ClassAggregate.create(this.symbolStore, ref.name, this.circularReferenceGuard, true);
            } else if (ref.kind === SymbolKind.Trait) {
                aggregate = TraitAggregate.createFromReference(this.symbolStore, ref);
                if (aggregate) {
                    this._traits.push(<TraitAggregate>aggregate);
                }
            } else if (ref.kind === SymbolKind.Interface) {
                aggregate = InterfaceAggregate.createFromReference(this.symbolStore, ref);
                if (aggregate) {
                    this._interfaces.push(<InterfaceAggregate>aggregate);
                }
            }
        }

    }

    /**
     * Unique members only. Interfaces excluded
     * class -> traits -> interfaces -> base class
     * @param predicate 
     */
    members(predicate?: Predicate<PhpSymbol>) {

        const memberSet = new MemberSet();
        const traitMerge = new TraitMerge(memberSet);

        for (let member of this._classMembersIterator()) {
            if ((member.modifiers & (SymbolModifier.TraitAs | SymbolModifier.TraitInsteadOf)) > 0 && member.associated) {
                traitMerge.addSpecification(member);
            } else if (
                (!predicate || predicate(member)) &&
                (!this.isBaseClass || !(member.modifiers & SymbolModifier.Private))
            ) {
                memberSet.add(member);
            }
        }

        if (this._traits.length > 0) {
            traitMerge.mergeTraits(this._traits, predicate);
        }

        if (this._interfaces.length > 0) {
            for (let n = 0; n < this._interfaces.length; ++n) {
                memberSet.addMany(this._interfaces[n].members(predicate));
            }
        }

        if (this._baseClass) {
            memberSet.addMany(this._baseClass.members(predicate));
        }

        return memberSet.toArray();

    }

    overridableMembers(predicate?: Predicate<PhpSymbol>) {

    }

    unimplementedMembers(predicate?: Predicate<PhpSymbol>) {

    }

    /**
     * Iterates through all member declarations until first matching predicate
     * class -> traits -> interfaces -> base class
     * @param predicate 
     */
    firstMember(predicate: Predicate<PhpSymbol>) {
        let member: PhpSymbol;
        for (member of this._classMembersIterator()) {
            if (predicate(member)) {
                return member;
            }
        }

        for (let n = 0; n < this._traits.length; ++n) {
            member = this._traits[n].firstMember(predicate);
            if (member) {
                return member;
            }
        }

        for (let n = 0; n < this._interfaces.length; ++n) {
            member = this._interfaces[n].firstMember(predicate);
            if (member) {
                return member;
            }
        }

        if (this._baseClass) {
            member = this._baseClass.firstMember(predicate);
            if (member) {
                return member;
            }
        }

        return undefined;
    }

    /**
     * Iterates through all member declarations
     * class -> traits -> interfaces ->base class
     * @param predicate 
     */
    allMembers(predicate: Predicate<PhpSymbol>) {
        const members: PhpSymbol[] = [];
        let member: PhpSymbol;
        for (member of this._classMembersIterator()) {
            if (predicate(member)) {
                members.push(member);
            }
        }

        for (let n = 0; n < this._traits.length; ++n) {
            Array.prototype.push.apply(members, this._traits[n].allMembers(predicate));
        }

        for (let n = 0; n < this._interfaces.length; ++n) {
            Array.prototype.push.apply(members, this._interfaces[n].allMembers(predicate));
        }

        if (this._baseClass) {
            Array.prototype.push.apply(members, this._baseClass.allMembers(predicate));
        }
        return members;
    }

    private *_classMembersIterator() {
        let classDef: PhpSymbol;

        for (let n = 0; n < this.definition.length; ++n) {
            classDef = this.definition[n];

            if (!classDef.children) {
                continue;
            }

            for (let k = 0, l = classDef.children.length; k < l; ++k) {
                yield classDef.children[k];
            }
        }
    }

    static create(symbolStore: SymbolStore, fqn: string, circularReferenceGuard?: Set<PhpSymbol>, isBaseClass?: boolean) {

        if (!fqn) {
            return undefined;
        }

        if (!circularReferenceGuard) {
            circularReferenceGuard = new Set<PhpSymbol>();
        }

        let filterFn = (s: PhpSymbol) => {
            return s.kind === SymbolKind.Class && !circularReferenceGuard.has(s);
        }
        let symbols = symbolStore.find(fqn, filterFn);
        if (!symbols.length) {
            return undefined;
        } else {
            return new ClassAggregate(symbolStore, symbols, circularReferenceGuard, isBaseClass);
        }

    }

}

export class InterfaceAggregate {

    private _interfaces: InterfaceAggregate[];

    constructor(
        public symbolStore: SymbolStore,
        public definition: PhpSymbol,
        private circularReferenceGuard: Set<PhpSymbol>
    ) {
        this.circularReferenceGuard.add(this.definition);
        this._interfaces = [];

        if (!this.definition.associated) {
            return;
        }

        let aggregate: InterfaceAggregate;
        for (let n = 0, l = this.definition.associated.length; n < l; ++n) {
            aggregate = InterfaceAggregate.createFromReference(
                this.symbolStore,
                this.definition.associated[n],
                this.circularReferenceGuard
            );
            if (aggregate) {
                this._interfaces.push(aggregate);
            }
        }

    }

    members(predicate?: Predicate<PhpSymbol>) {

        const members = new MemberSet();
        let member: PhpSymbol;

        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if (!predicate || predicate(member)) {
                members.add(member);
            }
        }

        for (let n = 0; n < this._interfaces.length; ++n) {
            members.addMany(this._interfaces[n].members(predicate));
        }

        return members.toArray();

    }

    firstMember(predicate: Predicate<PhpSymbol>) {
        let member: PhpSymbol;
        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if (predicate(member)) {
                return member;
            }
        }

        for (let n = 0; n < this._interfaces.length; ++n) {
            member = this._interfaces[n].firstMember(predicate);
            if (member) {
                return member;
            }
        }

        return undefined;
    }

    allMembers(predicate?: Predicate<PhpSymbol>) {
        const members: PhpSymbol[] = [];
        let member: PhpSymbol;
        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if (!predicate || predicate(member)) {
                members.push(member);
            }
        }

        for (let n = 0; n < this._interfaces.length; ++n) {
            Array.prototype.push.apply(members, this._interfaces[n].allMembers(predicate));
        }

        return members;
    }

    static createFromReference(symbolStore: SymbolStore, ref: Reference, circularReferenceGuard?: Set<PhpSymbol>) {
        if (!ref || !ref.name) {
            return undefined;
        }

        if (!circularReferenceGuard) {
            circularReferenceGuard = new Set<PhpSymbol>();
        }

        let symbols = symbolStore.find(ref.name, InterfaceAggregate.isInterface);
        if (!symbols.length || circularReferenceGuard.has(symbols[0])) {
            return undefined;
        } else {
            return new InterfaceAggregate(symbolStore, symbols[0], circularReferenceGuard);
        }
    }

    private static isInterface(s: PhpSymbol) {
        return s.kind === SymbolKind.Interface;
    }
}

export class TraitAggregate {

    private _traits: TraitAggregate[];

    constructor(
        public symbolStore: SymbolStore,
        public definition: PhpSymbol,
        private circularReferenceGuard: Set<PhpSymbol>
    ) {
        this._traits = [];
        this.circularReferenceGuard.add(this.definition);
        if (!this.definition.associated) {
            return;
        }

        let aggregate: TraitAggregate;
        for (let n = 0, l = this.definition.associated.length; n < l; ++n) {
            aggregate = TraitAggregate.createFromReference(
                this.symbolStore,
                this.definition.associated[n],
                this.circularReferenceGuard
            );
            if (aggregate) {
                this._traits.push(aggregate);
            }
        }
    }

    members(predicate?: Predicate<PhpSymbol>) {
        const members = new MemberSet();
        const traitMerge = new TraitMerge(members);
        let member: PhpSymbol;
        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if ((member.modifiers & (SymbolModifier.TraitAs | SymbolModifier.TraitInsteadOf)) > 0 && member.associated) {
                traitMerge.addSpecifications(member.associated);
            }
            if (!predicate || predicate(member)) {
                members.add(member);
            }
        }

        if (this._traits.length > 0) {
            traitMerge.mergeTraits(this._traits, predicate);
        }

        return members.toArray();
    }

    firstMember(predicate: Predicate<PhpSymbol>) {

        let member: PhpSymbol;
        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if (predicate(member)) {
                return member;
            }
        }

        for (let n = 0; n < this._traits.length; ++n) {
            member = this._traits[n].firstMember(predicate);
            if (member) {
                return member;
            }
        }

        return undefined;

    }

    allMembers(predicate?: Predicate<PhpSymbol>) {
        const members: PhpSymbol[] = [];
        let member: PhpSymbol;
        for (let n = 0, l = this.definition.children.length; n < l; ++n) {
            member = this.definition.children[n];
            if (!predicate || predicate(member)) {
                members.push(member);
            }
        }

        for (let n = 0; n < this._traits.length; ++n) {
            Array.prototype.push.apply(members, this._traits[n].allMembers(predicate));
        }

        return members;
    }

    static createFromReference(symbolStore: SymbolStore, ref: Reference, circularReferenceGuard?: Set<PhpSymbol>) {
        if (!ref || !ref.name) {
            return undefined;
        }

        if (!circularReferenceGuard) {
            circularReferenceGuard = new Set<PhpSymbol>();
        }

        let symbols = symbolStore.find(ref.name, TraitAggregate.isTrait);
        if (!symbols.length || circularReferenceGuard.has(symbols[0])) {
            return undefined;
        } else {
            return new TraitAggregate(symbolStore, symbols[0], circularReferenceGuard);
        }
    }

    private static isTrait(s: PhpSymbol) {
        return s.kind === SymbolKind.Trait;
    }
}

/*
export class TypeAggregate {

    /**
     * Allowing an array of defintions as it enables the use of class stubs of the same name 
     
    private _definition: PhpSymbol[];
    private _associated: PhpSymbol[];
    private _excludeNonAbstractTraitMembers = false;


    constructor(public symbolStore: SymbolStore, definition: PhpSymbol | PhpSymbol[], excludeNonAbstractTraitMembers?: boolean) {

        if (Array.isArray(definition)) {
            if (definition.length < 1) {
                throw new Error('Invalid Argument');
            }
            this._definition = definition;
        } else {
            if (!definition) {
                throw new Error('Invalid Argument');
            }
            this._definition = [definition];
        }
        this._excludeNonAbstractTraitMembers = excludeNonAbstractTraitMembers;
    }

    typeName() {
        return this._definition[0].name;
    }

    baseClassName() {
        let baseName: string;
        for (let n = 0; n < this._definition.length; ++n) {
            if ((baseName = this._symbolBaseClassName(this._definition[n]))) {
                return baseName;
            }
        }
        return '';
    }

    isAssociated(name: string) {
        if (!name) {
            return false;
        }

        let lcName = name.toLowerCase();
        for (let d of this._inheritedIterator()) {
            if (d.name.toLowerCase() === lcName) {
                return true;
            }
        }

        return false;
    }

    /**
     * Private members are implicitly excluded in inherited classes
     
    firstMember(predicate: Predicate<PhpSymbol>) {
        for (let member of this.memberIterator(predicate)) {
            return member;
        }
        return undefined;
    }

    *memberIterator(predicate?: Predicate<PhpSymbol>) {

        let member: PhpSymbol;
        let type: PhpSymbol;

        //root type
        for (let n = 0; n < this._definition.length; ++n) {
            type = this._definition[n];
            if (!type.children) {
                continue;
            }

            for (let k = 0; k < type.children.length; ++k) {
                member = type.children[k];
                if (!predicate || predicate(member)) {
                    yield member;
                }
            }
        }

        //inherited types
        for (type of this._inheritedIterator()) {

            if (!type.children) {
                continue;
            }

            for (let k = 0; k < type.children.length; ++k) {
                member = type.children[k];
                //exclude private class members and non abstract trait members if appropriate
                if (
                    (!predicate || predicate(member)) &&
                    !(type.kind === SymbolKind.Class && (type.modifiers & SymbolModifier.Private) > 0) &&
                    !(this._excludeNonAbstractTraitMembers && type.kind === SymbolKind.Trait && !(member.modifiers & SymbolModifier.Abstract))
                ) {
                    yield member;
                }
            }

        }

    }

    members(mergeStrategy: MemberMergeStrategy, predicate?: Predicate<PhpSymbol>) {

        const kind = this._definition[0].kind;
        const name = this._definition[0].name;

        let members: PhpSymbol[];

        switch (kind) {
            case SymbolKind.Class:
                members = this._classMembers(associated, mergeStrategy, predicate);
                break;
            case SymbolKind.Interface:
                members = this._interfaceMembers(associated, predicate);
                break;
            case SymbolKind.Trait:
                members = this._traitMembers(associated, predicate);
                break;
            default:
                members = [];
                break;
        }

        //$this and static return types are resolved to fqn at this point as fqn is known
        return this._resolveThisAndStaticReturnType(members, name);

    }

    private _resolveThisAndStaticReturnType(members: PhpSymbol[], name: string) {

        let resolved: PhpSymbol[] = [];
        let s: PhpSymbol;
        let type: string;
        let sClone: PhpSymbol;

        for (let n = 0; n < members.length; ++n) {
            s = members[n];
            if ((s.kind & (SymbolKind.Method | SymbolKind.Property)) > 0 && s.doc && s.doc.type) {
                type = TypeString.resolveThisOrStatic(s.doc.type, name);

                if (type !== s.doc.type) {
                    //clone the symbol to use resolved type
                    sClone = PhpSymbol.clone(s);
                    sClone.doc = { description: s.doc.description, type: type }
                    resolved.push(sClone);
                    continue;
                }
            }
            resolved.push(s);
        }

        return resolved;

    }

    /**
     * root type should be first element of associated array
     * @param associated 
     * @param predicate 
     
    private _classMembers(associated: PhpSymbol[], strategy: MemberMergeStrategy, predicate?: Predicate<PhpSymbol>) {

        let members: PhpSymbol[] = [];
        let s: PhpSymbol;
        let traits: PhpSymbol[] = [];
        let p = predicate;
        let noPrivate = (x: PhpSymbol) => {
            return !(x.modifiers & SymbolModifier.Private) && (!predicate || predicate(x));
        };

        for (let n = 0; n < associated.length; ++n) {
            s = associated[n];
            if (s.kind === SymbolKind.Trait) {
                traits.push(s);
            } else if (s.children) {
                Array.prototype.push.apply(members, p ? s.children.filter(p) : s.children);
            }

            p = noPrivate;
        }

        p = noPrivate;
        members = this._mergeMembers(members, strategy);
        //@todo trait precendence/alias
        Array.prototype.push.apply(members, this._traitMembers(traits, p));
        return members;

    }

    private _symbolBaseClassName(s: PhpSymbol) {
        let base = s.kind === SymbolKind.Class && s.associated ? s.associated.find(this._isClass) : undefined;
        return base ? base.name : '';
    }

    private _interfaceMembers(interfaces: PhpSymbol[], predicate?: Predicate<PhpSymbol>) {
        let members: PhpSymbol[] = [];
        let s: PhpSymbol;
        for (let n = 0; n < interfaces.length; ++n) {
            s = interfaces[n];
            if (s.children) {
                Array.prototype.push.apply(members, predicate ? s.children.filter(predicate) : s.children);
            }
        }
        return members;
    }

    private _traitMembers(traits: PhpSymbol[], predicate?: Predicate<PhpSymbol>) {
        //@todo support trait precendence and alias here
        return this._interfaceMembers(traits, predicate);
    }

    private _mergeMembers(symbols: PhpSymbol[], strategy: MemberMergeStrategy) {

        let map: { [index: string]: PhpSymbol } = {};
        let s: PhpSymbol;
        let mapped: PhpSymbol;

        if (strategy === MemberMergeStrategy.None) {
            return symbols;
        }

        for (let n = 0; n < symbols.length; ++n) {
            s = symbols[n];
            mapped = map[s.name];
            if (
                !mapped ||
                ((mapped.modifiers & SymbolModifier.Magic) > 0 && !(s.modifiers & SymbolModifier.Magic)) || //always prefer non magic
                (strategy === MemberMergeStrategy.Documented && (!mapped.doc || this.hasInheritdoc(mapped.doc.description)) && s.doc) ||
                (strategy === MemberMergeStrategy.Last)
            ) {
                map[s.name] = s;
            }

        }

        return Object.keys(map).map((v: string) => { return map[v]; });
    }

    private hasInheritdoc(description: string) {
        if (!description) {
            return false;
        }

        description = description.toLowerCase().trim();
        return description === '@inheritdoc' || description === '{@inheritdoc}';
    }

    private _getAssociated() {

        if (this._associated) {
            return this._associated;
        }

        return this._associated = Array.from(this._inheritedIterator());

    }

    private _isClass(r: Reference) {
        return r.kind === SymbolKind.Class;
    }

    private _definitionInheritedReduceFn(accum: Reference[], current: PhpSymbol) {
        if (current.associated) {
            Array.prototype.push.apply(accum, current.associated);
        }
        return accum;
    }

    private *_inheritedIterator() {

        const inheritedDefinitions = new Set<PhpSymbol>();
        let definitions: PhpSymbol[];
        const queue: Reference[] = [];
        let ref: Reference;
        let def: PhpSymbol;

        Array.prototype.push.apply(queue, this._definition.reduce(this._definitionInheritedReduceFn, []));

        let filterFn = (x: PhpSymbol) => {
            return PhpSymbol.isClassLike(x) && !inheritedDefinitions.has(x);
        }

        while ((ref = queue.shift())) {

            definitions = this.symbolStore.find(ref.name, filterFn);
            for (let n = 0; n < definitions.length; ++n) {
                def = definitions[n];
                inheritedDefinitions.add(def);
                if (def.associated) {
                    Array.prototype.push.apply(queue, def.associated);
                }
                yield def;
            }
        }

    }

    static create(symbolStore: SymbolStore, fqn: string) {

        if (!fqn) {
            return undefined;
        }

        let symbols = symbolStore.find(fqn, PhpSymbol.isClassLike);
        if (!symbols.length) {
            return undefined;
        } else if (symbols.length === 1) {
            return new TypeAggregate(symbolStore, symbols[0]);
        } else {
            return new TypeAggregate(symbolStore, symbols);
        }

    }

}
*/