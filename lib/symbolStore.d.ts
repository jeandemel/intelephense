import { PhpSymbol } from './symbol';
import { Predicate } from './types';
import { Position } from 'vscode-languageserver-types';
import { ParsedDocument, ParsedDocumentChangeEventArgs } from './parsedDocument';
export declare class SymbolTable {
    uri: string;
    root: PhpSymbol;
    constructor(uri: string, root: PhpSymbol);
    readonly symbols: PhpSymbol[];
    readonly count: number;
    filter(predicate: Predicate<PhpSymbol>): PhpSymbol[];
    find(predicate: Predicate<PhpSymbol>): PhpSymbol;
    symbolAtPosition(position: Position): PhpSymbol;
    static create(parsedDocument: ParsedDocument, externalOnly?: boolean): SymbolTable;
    static readBuiltInSymbols(): SymbolTable;
    static builtInSymbolTypeStrings(symbols: any[]): void;
}
export interface MemberQuery {
    typeName: string;
    memberPredicate: Predicate<PhpSymbol>;
}
export declare class SymbolStore {
    private _map;
    private _index;
    private _symbolCount;
    constructor();
    onParsedDocumentChange: (args: ParsedDocumentChangeEventArgs) => void;
    getSymbolTable(uri: string): SymbolTable;
    readonly tableCount: number;
    readonly symbolCount: number;
    add(symbolTable: SymbolTable): void;
    remove(uri: string): void;
    /**
     * As per match but returns first item in result that matches text exactly
     * @param text
     * @param kindMask
     */
    find(text: string, filter?: Predicate<PhpSymbol>): PhpSymbol;
    /**
     * Matches any indexed symbol by name or partial name with optional additional filter
     * Parameters and variables that are not file scoped are not indexed.
     */
    match(text: string, filter?: Predicate<PhpSymbol>, fuzzy?: boolean): PhpSymbol[];
    private _classOrInterfaceFilter(s);
    lookupTypeMembers(query: MemberQuery): PhpSymbol[];
    lookupTypeMember(query: MemberQuery): PhpSymbol;
    lookupMembersOnTypes(queries: MemberQuery[]): PhpSymbol[];
    lookupMemberOnTypes(queries: MemberQuery[]): PhpSymbol;
    /**
     * This will return duplicate symbols where members are overridden or already implemented
     * @param type
     * @param predicate
     * @param typeHistory
     */
    private _lookupTypeMembers(type, predicate, typeHistory);
    private _indexSymbols(root);
    private _indexFilter(s);
}