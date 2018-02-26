/* 
 * Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 * 
 */

'use strict';

import { PhpSymbol, SymbolKind } from './symbol';

export interface ImportRule {
    fqn:string;
    name:string;
    kind:SymbolKind;
}

interface ClassIdentifier {
    className:string;
    baseClassName:string;
}

export class NameResolver {

    private _classStack:ClassIdentifier[];
    rules:ImportRule[];
    namespaceName:string = '';

    constructor() {
        this.rules = [];
        this._classStack = [];
     }

     get className(){
         return this._classStack.length ? this._classStack[this._classStack.length - 1].className : '';
     }

     get baseClassName(){
        return this._classStack.length ? this._classStack[this._classStack.length - 1].baseClassName : '';
     }

     pushClass(className:string, baseClassName:string){
        this._classStack.push({
            className:className,
            baseClassName:baseClassName
        });
     }

     popClass(){
         this._classStack.pop();
     }

    resolveRelative(relativeName: string) {
        return this.concatNamespaceName(this.namespaceName, relativeName);
    }

    resolveNotFullyQualified(notFqn: string, kind?: SymbolKind, resolveStatic?:boolean) {

        if (!notFqn) {
            return '';
        }

        let lcNotFqn = notFqn.toLowerCase();

        switch(lcNotFqn) {
            case 'self':
                return this.className;
            case 'static':
            case '$this':
                return resolveStatic ? this.className : lcNotFqn;
            case 'parent':
                return this.baseClassName;
            default:
                break;
        }

        let pos = notFqn.indexOf('\\');
        return pos < 0 ?
            this._resolveUnqualified(notFqn, kind ? kind : SymbolKind.Class) :
            this._resolveQualified(notFqn, pos);
    }

    concatNamespaceName(prefix: string, suffix: string) {
        if (!suffix || !prefix) {
            return suffix;
        } else {
            return prefix + '\\' + suffix;
        }
    }

    /**
     * 
     * @param text unqualified name
     * @param kind 
     */
    matchImportedSymbol(text: string, kind: SymbolKind) {
        
        if(kind !== SymbolKind.Constant) {
            text = text.toLowerCase();
        }
        let r: ImportRule;

        for (let n = 0, l = this.rules.length; n < l; ++n) {
            r = this.rules[n];
            if (
                r.name && r.kind === kind && 
                ((kind === SymbolKind.Constant && text === r.name) || 
                (kind !== SymbolKind.Constant && text === r.name.toLowerCase()))) {
                return r;
            }
        }
        return undefined;
    }

    private _resolveQualified(name: string, pos: number) {
        const r = this.matchImportedSymbol(name.slice(0, pos), SymbolKind.Class);
        return r ? r.fqn + name.slice(pos) : this.resolveRelative(name);
    }

    private _resolveUnqualified(name: string, kind: SymbolKind) {
        if(kind === SymbolKind.Constructor) {
            kind = SymbolKind.Class;
        }
        const r = this.matchImportedSymbol(name, kind);
        return r ? r.fqn : this.resolveRelative(name);
    }

}