'use strict';

import { Range, CodeActionContext, TextDocumentIdentifier, Command } from 'vscode-languageserver-types';
import { ParsedDocumentStore, ParsedDocument } from './parsedDocument';
import { ParseTreeTraverser } from './parseTreeTraverser';
import { SymbolStore, SymbolTable } from './symbolStore';
import { PhpSymbol, SymbolKind, SymbolModifier, SymbolIdentifier } from './symbol';
import { MemberMergeStrategy, TypeAggregate } from './typeAggregate';
import { Reference, ReferenceStore, ReferenceTable, Scope } from './reference';
import { Predicate, TreeVisitor, TreeTraverser } from './types';
import * as util from './util';

export class CodeActionProvider {

    constructor(public documentStore: ParsedDocumentStore, public symbolStore: SymbolStore, public refStore: ReferenceStore) {

    }

    provideCodeAction(uri:string, range:Range, context: CodeActionContext): Command[]{
        if(context.diagnostics.length < 1) {
            return [];
        }

        let implement:Command = {
            title: 'Implements abstract methods',
            command: ''
        };

        return [implement];
    }


}