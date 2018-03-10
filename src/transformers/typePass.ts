/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Phrase, PhraseType } from '../parser/phrase';
import { Token, TokenType } from '../parser/lexer';
import { NodeTransformer, ReferencePhrase, PhpDocPhrase } from './transformers';
import { SymbolKind, PhpSymbol, SymbolModifier } from '../symbol';
import { SymbolStore, SymbolTable } from '../symbolStore';
import { ParsedDocument, NodeUtils } from '../parsedDocument';
import { NameResolver } from '../nameResolver';
import { Predicate, BinarySearch, BinarySearchResult, PackedLocation, TreeVisitor, TreeTraverser } from '../types';
import * as lsp from 'vscode-languageserver-types';
import { TypeString } from '../typeString';
import { TypeAggregate, MemberMergeStrategy, ClassAggregate } from '../typeAggregate';
import * as util from '../util';
import { PhpDocParser, Tag } from '../phpDoc';
import { Reference, Scope, ReferenceTable } from '../reference';
import * as uriMap from '../uriMap';

interface TypeTransformer extends NodeTransformer {
    type: string;
}

type FindSymbolsByReferenceDelegate = (ref: Reference) => PhpSymbol[];

function symbolsToTypeReduceFn(prev: string, current: PhpSymbol, index: number, array: PhpSymbol[]) {
    return TypeString.merge(prev, PhpSymbol.type(current));
}

/** 
 * Type pass adds types/scopes to references
 */
export class TypePass implements TreeVisitor<Phrase | Token> {

    private _transformerStack: NodeTransformer[];
    private _variableTable: VariableTable;
    private _classTypeAggregateStack: TypeAggregate[];
    private _lastVarTypeHints: Tag[];
    private _lastCallableDefinition: PhpSymbol;

    constructor(
        public doc: ParsedDocument,
        public symbolStore: SymbolStore,
    ) {
        this._transformerStack = [];
        this._variableTable = new VariableTable();
        this._classTypeAggregateStack = [];
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        const parent = spine.length ? spine[spine.length - 1] : undefined;
        const parentTransformer = this._transformerStack.length ? this._transformerStack[this._transformerStack.length - 1] : undefined;
        const hasParentTransformer = parentTransformer && parent === parentTransformer.node;

        switch ((<Phrase>node).phraseType) {

            case PhraseType.Error:
                return false;

            case PhraseType.NamespaceName:
                this._transformerStack.push(new NamespaceNameTransformer(<Phrase>node, this._findSymbolsByReference));
                break;

            case PhraseType.ClassDeclaration:
            case PhraseType.InterfaceDeclaration:
            case PhraseType.TraitDeclaration:
            case PhraseType.AnonymousClassDeclaration:
                {
                    const ref = (<Phrase>node).children.length ? (<ReferencePhrase>(<Phrase>node).children[0]).reference : undefined;
                    if (!ref || !ref.name) {
                        break;
                    }
                    const typeAggregate = TypeAggregate.create(this.symbolStore, ref.name);
                    let type = '$this';
                    if (ParsedDocument.isPhrase(node, [PhraseType.ClassDeclaration, PhraseType.AnonymousClassDeclaration])) {
                        type = ref.name;
                    }
                    this._classTypeAggregateStack.push(typeAggregate);
                    this._variableTable.pushScope();
                    this._variableTable.setVariable({
                        name: '$this',
                        type: type
                    });
                }

                break;

            case PhraseType.FunctionCallExpression:
                this._transformerStack.push(new FunctionCallExpressionTransformer(node, this._findSymbolsByReference));
                break;

            case PhraseType.ConstElement:
            case PhraseType.ClassConstElement:
                this._transformerStack.push(new ConstElementTransformer(node, this._currentClass()));
                break;

            case PhraseType.ParameterDeclaration:
                {
                    const methodDecl = spine.length > 1 ? spine[spine.length - 2] : undefined;
                    if (!methodDecl || !(<ReferencePhrase>methodDecl).reference || !(<ReferencePhrase>methodDecl).reference.name) {
                        break;
                    }
                    this._transformerStack.push(
                        new ParameterDeclarationTransformer(node, this._variableTable, this._currentClass(), (<ReferencePhrase>methodDecl).reference.name)
                    );
                }
                break;

            case PhraseType.AnonymousFunctionUseVariable:
                if ((<ReferencePhrase>node).reference) {
                    this._variableTable.carry((<ReferencePhrase>node).reference.name);
                    (<ReferencePhrase>node).reference.type = this._variableTable.getType((<ReferencePhrase>node).reference.name);
                }
                break;

            case PhraseType.FunctionDeclaration:
            case PhraseType.MethodDeclaration:
            case PhraseType.AnonymousFunctionCreationExpression:
                {
                    if((<Phrase>node).phraseType === PhraseType.FunctionDeclaration) {
                        this._variableTable.pushScope()
                    } else {
                        this._variableTable.pushScope(['$this']);
                    }

                    const ref = (<Phrase>node).children.length ? (<ReferencePhrase>(<Phrase>node).children[0]).reference : undefined;
                    if(!ref || !ref.name) {
                        break;
                    }
                    const def = this._findFileSymbolsByReference(ref).shift();
                    if(def) {
                        this._transformerStack.push(new CallableDeclarationTransformer(node, def));
                    }
                }
                break;

            case PhraseType.IfStatement:
            case PhraseType.SwitchStatement:
                this._variableTable.pushBranch();
                break;

            case PhraseType.CaseStatement:
            case PhraseType.DefaultStatement:
            case PhraseType.ElseIfClause:
            case PhraseType.ElseClause:
                this._variableTable.popBranch();
                this._variableTable.pushBranch();
                break;

            case PhraseType.SimpleAssignmentExpression:
            case PhraseType.ByRefAssignmentExpression:
                this._transformerStack.push(
                    new SimpleAssignmentExpressionTransformer(
                        node,
                        this.symbolStore,
                        this._variableTable,
                        this._lastVarTypeHints
                    ));
                break;

            case PhraseType.InstanceOfExpression:
                this._transformerStack.push(
                    new InstanceOfExpressionTransformer(node, this.symbolStore, this._variableTable)
                );
                break;

            case PhraseType.ForeachStatement:
                this._transformerStack.push(
                    new ForeachStatementTransformer(node, this.symbolStore, this._variableTable, this._lastVarTypeHints)
                );
                break;

            case PhraseType.CatchClause:
                this._transformerStack.push(new CatchClauseTransformer(node, this._variableTable));
                break;

            case PhraseType.CatchNameList:
                this._transformerStack.push(new CatchNameListTransformer(node));
                break;

            case PhraseType.FunctionDeclarationBody:
            case PhraseType.MethodDeclarationBody:
                this._transformerStack.push(new CallableDeclarationBodyTransformer(node));
                break;

            case PhraseType.QualifiedName:
            case PhraseType.FullyQualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.ArrayCreationExpression:
            case PhraseType.ArrayValue:
            case PhraseType.EncapsulatedExpression:
            case PhraseType.ArrayElement:
            case PhraseType.ForeachCollection:
            case PhraseType.CloneExpression:
            case PhraseType.ErrorControlExpression:
            case PhraseType.ConstantAccessExpression:
            case PhraseType.DefaultArgumentSpecifier:
                this._transformerStack.push(new DefaultTransformer(node));
                break;

            case PhraseType.ReturnStatement:
                this._transformerStack.push(new ReturnStatementTransformer(node));
                break;

            case PhraseType.UnaryOpExpression:
                this._transformerStack.push(
                    new UnaryOpExpressionTransformer(node)
                );
                break;
            case PhraseType.SimpleVariable:
                this._transformerStack.push(
                    new SimpleVariableTransformer(node, this._variableTable)
                );
                break;

            case PhraseType.ArrayInitialiserList:
                this._transformerStack.push(new ArrayInititialiserListTransformer(node));
                break;

            case PhraseType.SubscriptExpression:
                this._transformerStack.push(new SubscriptExpressionTransformer(node));
                break;

            case PhraseType.ScopedCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, this._findSymbolsByReference)
                );
                break;

            case PhraseType.ScopedPropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, this._findSymbolsByReference)
                );
                break;

            case PhraseType.ClassConstantAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, this._findSymbolsByReference)
                );
                break;

            case PhraseType.PropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, this._findSymbolsByReference)
                );
                break;

            case PhraseType.MethodCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, this._findSymbolsByReference)
                );
                break;

            case PhraseType.ObjectCreationExpression:
                this._transformerStack.push(new ObjectCreationExpressionTransformer(node));
                break;

            case PhraseType.ClassTypeDesignator:
            case PhraseType.InstanceofTypeDesignator:
                this._transformerStack.push(new TypeDesignatorTransformer(node));
                break;

            case PhraseType.RelativeScope:
                this._transformerStack.push(new RelativeScopeTransformer(node, this._currentClassName()));
                break;

            case PhraseType.TernaryExpression:
                this._transformerStack.push(new TernaryExpressionTransformer(node));
                break;

            case PhraseType.CoalesceExpression:
                this._transformerStack.push(new CoalesceExpressionTransformer(node));
                break;

            case PhraseType.MultiplicativeExpression:
                this._transformerStack.push(new MultiplicativeExpressionTransformer(node));
                break;

            case PhraseType.RelationalExpression:
            case PhraseType.LogicalExpression:
                this._transformerStack.push(new PlaceholderTransformer(node, 'bool'));
                break;

            case PhraseType.BitwiseExpression:
            case PhraseType.ShiftExpression:
                this._transformerStack.push(new PlaceholderTransformer(node, 'int'));
                break;

            case PhraseType.CastExpression:
                this._transformerStack.push(new CastExpressionTransformer(node));
                break;

            case PhraseType.DoubleQuotedStringLiteral:
            case PhraseType.HeredocStringLiteral:
            case PhraseType.ShellCommandExpression:
                this._transformerStack.push(new PlaceholderTransformer(node, 'string'));
                break;

            case PhraseType.IssetIntrinsic:
                this._transformerStack.push(new PlaceholderTransformer(node, 'bool'));
                break;

            case PhraseType.DocBlock:
                {
                    const doc = (<PhpDocPhrase>node).doc;
                    if (doc) {
                        this._lastVarTypeHints = doc.varTags;
                        let varTag: Tag;
                        for (let n = 0, l = this._lastVarTypeHints.length; n < l; ++n) {
                            varTag = this._lastVarTypeHints[n];
                            this._variableTable.setVariable({
                                name: varTag.name,
                                type: varTag.typeString
                            });
                        }
                    }
                }
                break;

            case undefined:
                //tokens
                if (hasParentTransformer && TokenTransformer.shouldTransform((<Token>node).tokenType)) {
                    parentTransformer.push(new TokenTransformer(node));
                } else if (
                    (<Token>node).tokenType === TokenType.OpenBrace ||
                    (<Token>node).tokenType === TokenType.CloseBrace ||
                    (<Token>node).tokenType === TokenType.Semicolon
                ) {
                    this._lastVarTypeHints = undefined;
                }
                break;

            default:
                break;
        }

        return true;

    }

    postorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        if (!(<Phrase>node).phraseType) {
            return;
        }

        const transformer = this._transformerStack[this._transformerStack.length - 1];
        if (transformer.node === node) {
            const transform = this._transformerStack.pop();
            const parentTransform = this._transformerStack.length ? this._transformerStack[this._transformerStack.length - 1] : undefined;

            if (parentTransform && transform) {
                parentTransform.push(transform);
            }
        }

        switch ((<Phrase>node).phraseType) {

            case PhraseType.IfStatement:
            case PhraseType.SwitchStatement:
                this._variableTable.popBranch();
                this._variableTable.pruneBranches();
                break;

            case PhraseType.ClassDeclaration:
            case PhraseType.TraitDeclaration:
            case PhraseType.InterfaceDeclaration:
            case PhraseType.AnonymousClassDeclaration:
                this._classTypeAggregateStack.pop();
                this._variableTable.popScope();
                break;

            case PhraseType.FunctionDeclaration:
            case PhraseType.MethodDeclaration:
            case PhraseType.AnonymousFunctionCreationExpression:
                this._variableTable.popScope();
                break;

            default:
                break;
        }

    }

    private _currentClassName() {
        const c = this._currentClass();
        return c ? c.name : '';
    }

    private _currentClass() {
        return this._classTypeAggregateStack.length ? this._classTypeAggregateStack[this._classTypeAggregateStack.length - 1] : undefined;
    }

    private _nameSymbolType(parent: Phrase) {
        if (!parent) {
            return SymbolKind.Class;
        }

        switch (parent.phraseType) {
            case PhraseType.ConstantAccessExpression:
                return SymbolKind.Constant;
            case PhraseType.FunctionCallExpression:
                return SymbolKind.Function;
            case PhraseType.ClassTypeDesignator:
                return SymbolKind.Constructor;
            default:
                return SymbolKind.Class;
        }
    }

    private _findFileSymbolsByReference = (ref: Reference) => {
        const table = this.symbolStore.getSymbolTable(this.doc.uri);
        const fn = (s: PhpSymbol) => {
            return s.kind === ref.kind && ref.name === s.name;
        }
        const s = table.find(fn);
        return s ? [s] : [];
    }

    private _findSymbolsByReference: FindSymbolsByReferenceDelegate = (ref) => {
        return this.symbolStore.findSymbolsByReference(ref, MemberMergeStrategy.Documented);
    }

}

class CallableDeclarationTransformer implements TypeTransformer {

    type = 'callable';
    constructor(public node: Phrase | Token, public definition: PhpSymbol) { }
    push(transformer: NodeTransformer) {
        if (
            (<Phrase>transformer.node).phraseType === PhraseType.FunctionDeclarationBody ||
            (<Phrase>transformer.node).phraseType === PhraseType.MethodDeclarationBody
        ) {
            const type = (<TypeTransformer>transformer).type;
            if(type && !this.definition.type) {
                this.definition.type = type;
            }
        }
    }
}

class CallableDeclarationBodyTransformer implements TypeTransformer {

    type = 'void';

    constructor(public node: Phrase | Token) { }
    push(transformer: NodeTransformer) {
        //aggregate return or yield types
        const type = (<TypeTransformer>transformer).type;
        if (!type) {
            return;
        }

        if (
            (<Phrase>transformer.node).phraseType === PhraseType.ReturnStatement ||
            (<Phrase>transformer.node).phraseType === PhraseType.YieldFromExpression
        ) {
            if (type && this.type === 'void') {
                this.type = type;
            } else if (type) {
                this.type = TypeString.merge(this.type, type);
            }
        } else if ((<Phrase>transformer.node).phraseType === PhraseType.YieldExpression) {
            if (type && this.type === 'void') {
                this.type = TypeString.arrayReference(type);
            } else if (type) {
                this.type = TypeString.merge(this.type, TypeString.arrayReference(type));
            }
        }
    }

}

class CastExpressionTransformer implements TypeTransformer {

    private _op: TokenType;
    type = '';

    constructor(public node: Phrase | Token) {
        if ((<Phrase>node).children.length > 1) {
            this._op = (<Token>(<Phrase>node).children[0]).tokenType;
            this.type = this._opToType(this._op);
        }
    }

    push(transformer: NodeTransformer) { }

    private _opToType(op: TokenType) {
        switch (op) {
            case TokenType.ObjectCast:
                return 'object';
            case TokenType.StringCast:
                return 'string';
            case TokenType.ArrayCast:
                return 'array';
            case TokenType.BooleanCast:
                return 'bool';
            case TokenType.FloatCast:
                return 'float';
            case TokenType.IntegerCast:
                return 'int';
            case TokenType.UnsetCast:
                return 'void';
            default:
                return '';
        }
    }

}

class UnaryOpExpressionTransformer implements TypeTransformer {

    private _op: TokenType;
    type = '';

    constructor(public node: Phrase | Token) {
        if ((<Phrase>node).children.length > 1) {
            this._op = (<Token>(<Phrase>node).children[0]).tokenType;
        }
    }

    push(transformer: NodeTransformer) {
        //op should not get pushed
        const t = (<TypeTransformer>transformer).type;
        switch (this._op) {
            case TokenType.Exclamation:
                this.type = 'bool';
                break;
            case TokenType.Plus:
            case TokenType.Minus:
                if (t === 'float') {
                    this.type = 'float';
                } else {
                    this.type = 'int';
                }
                break;
            case TokenType.Tilde:
                if (t === 'string') {
                    this.type = 'string';
                } else {
                    this.type = 'int';
                }
                break;
            default:
                break;
        }
    }
}

class PlaceholderTransformer implements TypeTransformer {

    constructor(public node: Phrase | Token, public type: string) { }
    push(transformer: NodeTransformer) { }
}

class TokenTransformer implements TypeTransformer {

    type = '';
    constructor(public node: Phrase | Token) {
        this.type = this._tokenTypeToType((<Token>node).tokenType);
    }

    private _tokenTypeToType(t: TokenType) {
        switch (t) {
            case TokenType.FloatingLiteral:
                return 'float';
            case TokenType.StringLiteral:
            case TokenType.EncapsulatedAndWhitespace:
            case TokenType.DirectoryConstant:
            case TokenType.FileConstant:
            case TokenType.FunctionConstant:
            case TokenType.MethodConstant:
            case TokenType.NamespaceConstant:
            case TokenType.TraitConstant:
            case TokenType.ClassConstant:
                return 'string';
            case TokenType.IntegerLiteral:
            case TokenType.LineConstant:
                return 'int';
            default:
                return '';
        }
    }

    push(transformer: NodeTransformer) { }

    static shouldTransform(type: TokenType) {
        switch (type) {
            case TokenType.FloatingLiteral:
            case TokenType.StringLiteral:
            case TokenType.EncapsulatedAndWhitespace:
            case TokenType.DirectoryConstant:
            case TokenType.FileConstant:
            case TokenType.FunctionConstant:
            case TokenType.MethodConstant:
            case TokenType.NamespaceConstant:
            case TokenType.TraitConstant:
            case TokenType.ClassConstant:
            case TokenType.IntegerLiteral:
            case TokenType.LineConstant:
                return true;
            default:
                return false;
        }
    }

}

class NamespaceNameTransformer implements NodeTransformer {

    type = '';

    constructor(public node: Phrase, public referenceSymbolDelegate: FindSymbolsByReferenceDelegate) {
        if ((<ReferencePhrase>this.node).reference) {
            this.type = this.referenceSymbolDelegate((<ReferencePhrase>this.node).reference).reduce(symbolsToTypeReduceFn, '');
        }
    }
    push(transformer: NodeTransformer) { }

}



class ReturnStatementTransformer implements TypeTransformer {

    type = 'void';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if (
            (<Phrase>this.node).children.length > 2 &&
            (<Phrase>this.node).children[1] === transformer.node &&
            (<TypeTransformer>transformer).type
        ) {
            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class CatchClauseTransformer implements NodeTransformer {

    constructor(public node: Phrase | Token, private variableTable: VariableTable) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.CatchNameList) {
            const type = (<CatchNameListTransformer>transformer).type;
            const ref = (<ReferencePhrase>this.node).reference;
            if (ref && type) {
                ref.type = type;
                this.variableTable.setVariable({
                    name: ref.name,
                    type: ref.type
                });
            }
        }
    }

}

class CatchNameListTransformer implements TypeTransformer {

    type = '';
    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {

        if (
            (<Phrase>transformer.node).phraseType === PhraseType.QualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseType.FullyQualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseType.RelativeQualifiedName
        ) {
            this.type = TypeString.merge(this.type, (<TypeTransformer>transformer).type);
        }

    }

}

class ForeachStatementTransformer implements NodeTransformer {

    constructor(
        public node: Phrase | Token,
        public symbolStore: SymbolStore,
        public variableTable: VariableTable,
        private varTypeOverrides: Tag[]
    ) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.ForeachCollection) {
            const type = TypeString.arrayDereference((<TypeTransformer>transformer).type);
            const foreachValue = ParsedDocument.findChild(<Phrase>this.node, this._isForeachValue);
            if (foreachValue && type) {
                const assignVisitor = new TypeAssignVisitor(this.symbolStore, this.variableTable, type, this.varTypeOverrides);
                const traverser = new TreeTraverser([foreachValue]);
                traverser.traverse(assignVisitor);
            }
        }
    }

    private _isForeachValue(node: Phrase | Token) {
        return (<Phrase>node).phraseType === PhraseType.ForeachValue;
    }

}

interface Variable {
    name: string;
    type: string;
}

class ForeachCollectionTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.type = (<TypeTransformer>transformer).type || '';
    }
}

class SimpleAssignmentExpressionTransformer implements TypeTransformer {

    type = '';

    constructor(
        public node: Phrase | Token,
        public symbolStore: SymbolStore,
        public variableTable: VariableTable,
        private varTypeOverrides: Tag[]
    ) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>this.node).children.length > 2 && (<Phrase>this.node).children[2] === transformer.node) {
            this.type = (<TypeTransformer>transformer).type || '';
            const lhs = (<Phrase>this.node).children[0];
            if (lhs && this.type) {
                const assignVisitor = new TypeAssignVisitor(this.symbolStore, this.variableTable, this.type, this.varTypeOverrides);
                const traverser = new TreeTraverser([lhs]);
                traverser.traverse(assignVisitor);
            }
        }
    }

}

class ArrayInititialiserListTransformer implements TypeTransformer {

    private _types: string[];

    constructor(public node: Phrase | Token) {
        this._types = [];
    }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.ArrayElement) {
            this._types.push((<TypeTransformer>transformer).type || '');
        }
    }

    get type() {
        let merged: string;
        let types: string[];
        if (this._types.length < 4) {
            types = this._types;
        } else {
            types = [this._types[0], this._types[Math.floor(this._types.length / 2)], this._types[this._types.length - 1]];
        }
        merged = TypeString.mergeMany(types);
        return TypeString.count(merged) < 4 ? TypeString.arrayReference(merged) : 'array';
    }

}

class CoalesceExpressionTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.type = TypeString.merge(this.type, (<TypeTransformer>transformer).type);
    }

}

class TernaryExpressionTransformer implements TypeTransformer {

    private _types: string[];

    constructor(public node: Phrase | Token) {
        this._types = [];
    }

    push(transformer: NodeTransformer) {
        this._types.push((<TypeTransformer>transformer).type);
    }

    get type() {
        return TypeString.mergeMany(this._types.slice(-2));
    }

}

class SubscriptExpressionTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if (transformer.node === (<Phrase>this.node).children[0]) {
            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class MultiplicativeExpressionTransformer implements TypeTransformer {

    type = 'int';
    private _op: TokenType = 0;

    constructor(public node: Phrase | Token) {
        if ((<Phrase>node).children && (<Phrase>node).children.length > 1) {
            this._op = (<Token>(<Phrase>node).children[1]).tokenType;
        }
    }

    push(transformer: NodeTransformer) {

        if (this._op === TokenType.Percent) {
            //modulus is always int
            return;
        }

        const operandType = (<TypeTransformer>transformer).type;
        if (operandType && operandType.toLowerCase() === 'float') {
            this.type = 'float';
        }
    }

}

class AdditiveExpressionTransformer implements TypeTransformer {

    private _op: TokenType = 0;
    private _operandTypes: string[]

    constructor(public node: Phrase | Token) {
        if ((<Phrase>node).children.length > 2) {
            this._op = (<Token>(<Phrase>node).children[1]).tokenType;
        }
        this._operandTypes = [];
    }

    push(transformer: NodeTransformer) {

        if (
            (<Phrase>this.node).children.length < 3 &&
            (transformer.node === (<Phrase>this.node).children[0] ||
                transformer.node === (<Phrase>this.node).children[2])
        ) {
            this._operandTypes.push((<TypeTransformer>transformer).type || '');
        }

    }

    get type() {
        switch (this._op) {
            case TokenType.Dot:
                return 'string';
            case TokenType.Plus:
                if (this._operandTypes.findIndex(this._isFloat) > -1) {
                    return 'float';
                } else if (
                    this._operandTypes.length > 1 &&
                    TypeString.isArray(this._operandTypes[0]) &&
                    TypeString.isArray(this._operandTypes[1])
                ) {
                    return TypeString.arrayReference(TypeString.merge(
                        TypeString.arrayDereference(this._operandTypes[0]),
                        TypeString.arrayDereference(this._operandTypes[1])
                    ));
                } else {
                    return 'int';
                }
            case TokenType.Minus:
                return this._operandTypes.findIndex(this._isFloat) > -1 ? 'float' : 'int';
            default:
                return '';
        }
    }

    private _isFloat(t: string) {
        return t === 'float';
    }

}

class InstanceOfExpressionTransformer implements TypeTransformer {

    type = 'bool';

    constructor(
        public node: Phrase | Token,
        public symbolStore: SymbolStore,
        public variableTable: VariableTable
    ) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.InstanceofTypeDesignator) {
            const instanceOfType = (<TypeTransformer>transformer).type;
            const lhs = (<Phrase>this.node).children && (<Phrase>this.node).children.length > 0 ?
                (<Phrase>this.node).children[0] : undefined;
            if (lhs && this.type) {
                const visitor = new TypeAssignVisitor(this.symbolStore, this.variableTable, instanceOfType);
                const traverser = new TreeTraverser([lhs]);
                traverser.traverse(visitor);
            }
        }
    }

}

class FunctionCallExpressionTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token, public findSymbolsFn: FindSymbolsByReferenceDelegate) { }

    push(transformer: NodeTransformer) {

        if ((<Phrase>this.node).children.length < 1) {
            return;
        }

        if (
            (<Phrase>this.node).children[0] === transformer.node &&
            ((<Phrase>transformer.node).phraseType === PhraseType.QualifiedName ||
                (<Phrase>transformer.node).phraseType === PhraseType.QualifiedName ||
                (<Phrase>transformer.node).phraseType === PhraseType.RelativeQualifiedName)
        ) {
            const ref = (<ReferencePhrase>transformer.node).reference;
            this.type = this.findSymbolsFn(ref).reduce(symbolsToTypeReduceFn, '');
        }

    }

}

class RelativeScopeTransformer implements TypeTransformer {

    type = 'static';

    constructor(public node: Phrase | Token, private className: string) {
        this.type = TypeString.merge(this.type, className);
    }
    push(transformer: NodeTransformer) { }
}

class TypeDesignatorTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if (
            (<Phrase>transformer.node).phraseType === PhraseType.FullyQualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseType.QualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseType.RelativeQualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseType.SimpleVariable ||
            (<Phrase>transformer.node).phraseType === PhraseType.RelativeScope
        ) {
            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class AnonymousClassDeclarationTransformer implements TypeTransformer {
    constructor(public node: Phrase | Token, public type: string) { }
    push(transformer: NodeTransformer) { }
}

class ObjectCreationExpressionTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if (
            (<Phrase>transformer.node).phraseType === PhraseType.ClassTypeDesignator ||
            (<Phrase>transformer.node).phraseType === PhraseType.AnonymousClassDeclaration
        ) {
            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class SimpleVariableTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token, public variableTable: VariableTable) {
        if ((<ReferencePhrase>node).reference) {
            this.type = variableTable.getType((<ReferencePhrase>node).reference.name);
            (<ReferencePhrase>node).reference.type = this.type;
        }
    }

    push(transformer: NodeTransformer) { }

}

class DefaultTransformer implements TypeTransformer {

    type = '';
    constructor(public node: Phrase | Token) { }
    push(transformer: NodeTransformer) {
        const t = (<TypeTransformer>transformer).type;
        if (t) {
            this.type = t;
        }
    }

}

class MemberAccessExpressionTransformer implements TypeTransformer {

    private _reference: Reference;
    private _scope = '';

    constructor(
        public node: Phrase | Token,
        public referenceSymbolDelegate: FindSymbolsByReferenceDelegate
    ) { }

    push(transformer: NodeTransformer) {

        if ((<Phrase>this.node).children.length < 3) {
            return;
        }

        if (transformer.node === (<Phrase>this.node).children[0]) {
            this._scope = (<TypeTransformer>transformer).type;
        } else if (transformer.node === (<Phrase>this.node).children[2]) {
            //member name
            this._reference = (<ReferencePhrase>transformer.node).reference;
            if (this._reference && this._scope) {
                this._reference.scope = this._scope;
            }
        }
    }

    get type() {
        return this.referenceSymbolDelegate(this._reference).reduce(symbolsToTypeReduceFn, '');
    }

}

class ConstElementTransformer implements NodeTransformer {


    constructor(public node: Phrase | Token, private classAggregate: TypeAggregate) { }

    push(transformer: NodeTransformer) {
        const ref = (<ReferencePhrase>this.node).reference;
        if (!ref || ref.type || (<Phrase>this.node).children.length < 3 || (<Phrase>this.node).children[2] === transformer.node) {
            return;
        }

        //infer type from initialiser
        const t = (<TypeTransformer>transformer).type;
        const s = this.classAggregate.firstMember((s) => {
            return s.name === ref.name && s.kind === ref.kind;
        });
        if (t && s) {
            ref.type = t;
            s.type = t;
        }

    }

}

class PropertyElementTransformer implements NodeTransformer {

    private _ref: Reference;

    constructor(public node: Phrase | Token, private classAggregate: TypeAggregate) {

        this._ref = (<ReferencePhrase>this.node).reference;

    }

    push(transformer: NodeTransformer) {

        if (
            (<Phrase>transformer.node).phraseType === PhraseType.PropertyInitialiser &&
            this._ref &&
            !this._ref.type
        ) {
            //infer type from initialiser
            const t = (<TypeTransformer>transformer).type;
            const s = this.classAggregate.firstMember((s) => {
                return s.name === this._ref.name && s.kind === SymbolKind.Property;
            });
            if (t && s) {
                this._ref.type = t;
                s.type = t;
            }
        }

    }

}

class ParameterDeclarationTransformer implements NodeTransformer {

    private _ref: Reference;

    constructor(
        public node: Phrase | Token,
        public variableTable: VariableTable,
        private classAggregate: ClassAggregate,
        private methodName: string
    ) {

        this._ref = (<ReferencePhrase>node).reference;
        if (!this._ref || !this.classAggregate) {
            return;
        }

        if (this._ref.type) {
            this.variableTable.setVariable({
                name: this._ref.name,
                type: this._ref.type
            });
            return;
        }

        //find a base method declaratoin that may have type info
        const lcMethodName = this.methodName.toLowerCase();
        const paramName = this._ref.name;
        const hasTypedParam = (p: PhpSymbol) => {
            return p.kind === SymbolKind.Parameter && p.name === paramName && !!p.type;
        }
        let type: string;
        const member = classAggregate.firstMember(s => {
            if (s.kind === SymbolKind.Method && lcMethodName === s.name.toLowerCase()) {
                const p = PhpSymbol.findChild(s, hasTypedParam);
                if (p) {
                    type = p.type;
                    return true;
                }
            }
            return false;
        });

        if (type) {
            this.variableTable.setVariable({
                name: this._ref.name,
                type: type
            });
        }

    }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.DefaultArgumentSpecifier && this._ref && !this._ref.type) {
            const lcMethodName = this.methodName.toLowerCase();
            const type = (<TypeTransformer>transformer).type;
            if (!type) {
                return;
            }
            const fn = (s: PhpSymbol) => {
                return s.kind === SymbolKind.Method && lcMethodName === s.name.toLowerCase();
            }
            const member = this.classAggregate.firstMember(fn);
            if (!member) {
                return;
            }
            const paramName = this._ref.name;
            const paramDecl = PhpSymbol.findChild(member, p => {
                return p.kind === SymbolKind.Parameter && p.name === paramName;
            });
            if (paramDecl) {
                paramDecl.type = type;
                this.variableTable.setVariable({
                    name: this._ref.name,
                    type: type
                });
            }
        }
    }

}

class VariableTable {

    private _typeVariableSetStack: VariableSet[];

    constructor() {
        this._typeVariableSetStack = [VariableSet.create(VariableSetKind.Scope)];
    }

    setVariable(v: Variable) {
        if (!v || !v.name || !v.type) {
            return;
        }
        this._typeVariableSetStack[this._typeVariableSetStack.length - 1].variables[v.name] = v;
    }

    setVariables(vars: Variable[]) {
        if (!vars) {
            return;
        }
        for (let n = 0; n < vars.length; ++n) {
            this.setVariable(vars[n]);
        }
    }

    pushScope(carry?: string[]) {

        let scope = VariableSet.create(VariableSetKind.Scope);

        if (carry) {
            let type: string;
            let name: string
            for (let n = 0; n < carry.length; ++n) {
                name = carry[n];
                type = this.getType(name);
                if (type && name) {
                    scope.variables[name] = {
                        name: name,
                        type: type
                    };
                }
            }
        }

        this._typeVariableSetStack.push(scope);

    }

    popScope() {
        this._typeVariableSetStack.pop();
    }

    pushBranch() {
        let b = VariableSet.create(VariableSetKind.Branch);
        this._typeVariableSetStack[this._typeVariableSetStack.length - 1].branches.push(b);
        this._typeVariableSetStack.push(b);
    }

    popBranch() {
        this._typeVariableSetStack.pop();
    }

    /**
     * consolidates variables. 
     * each variable can be any of types discovered in branches after this.
     */
    pruneBranches() {

        let node = this._typeVariableSetStack[this._typeVariableSetStack.length - 1];
        let branches = node.branches;
        node.branches = [];
        for (let n = 0, l = branches.length; n < l; ++n) {
            this._mergeSets(node, branches[n]);
        }

    }

    getType(varName: string) {
        return this._getType(this._typeVariableSetStack, varName);
    }

    carry(varName: string) {
        if (!varName) {
            return;
        }
        let lastScopeIndex = -1;

        for (let n = this._typeVariableSetStack.length - 1; n >= 0; --n) {
            if (this._typeVariableSetStack[n].kind === VariableSetKind.Scope) {
                lastScopeIndex = n;
                break;
            }
        }

        if (lastScopeIndex < 0) {
            return;
        }

        const type = this._getType(this._typeVariableSetStack.slice(0, lastScopeIndex), varName);
        if (type) {
            this.setVariable({
                name: varName,
                type: type
            });
        }
    }

    private _getType(stack: VariableSet[], varName: string) {
        let typeSet: VariableSet;

        for (let n = stack.length - 1; n >= 0; --n) {
            typeSet = stack[n];
            if (typeSet.variables[varName]) {
                return typeSet.variables[varName].type;
            }

            if (typeSet.kind === VariableSetKind.Scope) {
                break;
            }
        }

        return '';
    }

    private _mergeSets(a: VariableSet, b: VariableSet) {

        let keys = Object.keys(b.variables);
        let v: Variable;
        for (let n = 0, l = keys.length; n < l; ++n) {
            v = b.variables[keys[n]];
            if (a.variables[v.name]) {
                a.variables[v.name].type = TypeString.merge(a.variables[v.name].type, v.type);
            } else {
                a.variables[v.name] = v;
            }
        }

    }

}

const enum VariableSetKind {
    None, Scope, BranchGroup, Branch
}

interface VariableSet {
    kind: VariableSetKind;
    variables: { [index: string]: Variable };
    branches: VariableSet[];
}

namespace VariableSet {
    export function create(kind: VariableSetKind) {
        return <VariableSet>{
            kind: kind,
            variables: {},
            branches: []
        };
    }
}

class TypeAssignVisitor implements TreeVisitor<Phrase | Token> {

    private _stack: string[];
    private _skipStack: (Phrase | Token)[];

    constructor(
        public symbolStore: SymbolStore,
        public variableTable: VariableTable,
        type: string,
        private tags?: Tag[]
    ) {
        this._stack = [type];
        this._skipStack = [];
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        const skip = this._skip();
        if (skip === node) {
            return false;
        }

        switch ((<Phrase>node).phraseType) {

            case PhraseType.Error:
                return false;

            case PhraseType.SimpleVariable:
                {
                    const ref = (<ReferencePhrase>node).reference;
                    if (ref) {
                        ref.type = this._type(ref.name);
                    }
                }
                return false;

            case PhraseType.SubscriptExpression:
                this._stack.push(TypeString.arrayReference(this._type()));
                //only interested in lhs of expression
                if ((<Phrase>node).children) {
                    Array.prototype.push.apply(this._skipStack, (<Phrase>node).children.slice(1).reverse());
                }

                return true;

            case PhraseType.PropertyAccessExpression:
            case PhraseType.ScopedPropertyAccessExpression:
                //only interested in member name which will be child index 2
                if ((<Phrase>node).children) {
                    const skip = (<Phrase>node).children.slice(0);
                    skip.splice(2, 1);
                    Array.prototype.push.apply(this._skipStack, skip.reverse());
                }
                return true;

            case PhraseType.MemberName:
            case PhraseType.ScopedMemberName:
                if (
                    (<ReferencePhrase>node).reference &&
                    (<ReferencePhrase>node).reference.kind === SymbolKind.Property
                ) {
                    //if the symbol definition does not have a type then set it here
                    const symbols = this.symbolStore.findSymbolsByReference((<ReferencePhrase>node).reference);
                    let s: PhpSymbol;
                    for (let n = 0; n < symbols.length; ++n) {
                        s = symbols[n];
                        if (!s.type) {
                            s.type = this._type();
                        }
                    }
                }
                return false;

            case PhraseType.ArrayInitialiserList:
                this._stack.push(TypeString.arrayDereference(this._type()));
                return true;

            case PhraseType.ArrayKey:
                return false;

            default:
                return true;

        }

    }

    postorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        const skip = this._skip();
        if (skip === node) {
            this._skipStack.pop();
            return;
        }

        switch ((<Phrase>node).phraseType) {
            case PhraseType.ArrayInitialiserList:
            case PhraseType.SubscriptExpression:
                this._stack.pop();
                break;
            default:
                break;
        }

    }

    private _typeOverride(name: string, tags: Tag[]) {
        if (!tags || !name) {
            return undefined;
        }
        let t: Tag;
        for (let n = 0; n < tags.length; ++n) {
            t = tags[n];
            if (name === t.name) {
                return t.typeString;
            }
        }
        return undefined;
    }

    private _type(varName?: string) {
        const type = this._stack[this._stack.length - 1];
        if (!varName || !this.tags) {
            return type;
        }

        const varDocType = this._typeOverride(varName, this.tags);
        return varDocType || type;
    }

    private _skip() {
        return this._skipStack.length > 0 ? this._skipStack[this._skipStack.length - 1] : undefined;
    }

}