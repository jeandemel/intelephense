/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { Phrase, PhraseType } from '../parser/phrase';
import { Token, TokenType } from '../parser/lexer';
import { NodeTransformer, ReferencePhrase } from './transformers';
import { SymbolKind, PhpSymbol, SymbolModifier } from '../symbol';
import { SymbolStore, SymbolTable } from '../symbolStore';
import { ParsedDocument, NodeUtils } from '../parsedDocument';
import { NameResolver } from '../nameResolver';
import { Predicate, BinarySearch, BinarySearchResult, PackedLocation, TreeVisitor, TreeTraverser } from '../types';
import * as lsp from 'vscode-languageserver-types';
import { TypeString } from '../typeString';
import { TypeAggregate, MemberMergeStrategy } from '../typeAggregate';
import * as util from '../util';
import { PhpDocParser, Tag } from '../phpDoc';
import { Reference, Scope, ReferenceTable } from '../reference';
import * as uriMap from '../uriMap';

interface TypeTransformer extends NodeTransformer {
    type: string;
}

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
    private _scopeStack: Scope[];
    private _symbols: PhpSymbol[];
    private _symbolFilter: Predicate<PhpSymbol> = (x) => {
        const mask = SymbolKind.Namespace | SymbolKind.Class | SymbolKind.Interface | SymbolKind.Trait | SymbolKind.Method | SymbolKind.Function | SymbolKind.File;
        return (x.kind & mask) > 0 && !(x.modifiers & SymbolModifier.Magic);
    };
    private _lastVarTypehints: Tag[];
    private _symbolTable: SymbolTable;
    private _lastCallableDefinition: PhpSymbol;

    constructor(
        public doc: ParsedDocument,
        public nameResolver: NameResolver,
        public symbolStore: SymbolStore,
    ) {
        this._transformerStack = [];
        this._variableTable = new VariableTable();
        this._classTypeAggregateStack = [];
        this._symbolTable = this.symbolStore.getSymbolTable(this.doc.uri);
        this._symbols = this._symbolTable.filter(this._symbolFilter);
        this._scopeStack = [Scope.create(HashedLocation.create(uriMap.id(this.doc.uri), util.cloneRange(this._symbols.shift().location.range)))]; //file/root node
    }

    get refTable() {
        return new ReferenceTable(this.doc.uri, this._scopeStack[0]);
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        let parent = spine.length ? spine[spine.length - 1] : undefined;
        let parentTransformer = this._transformerStack.length ? this._transformerStack[this._transformerStack.length - 1] : null;

        switch ((<Phrase>node).phraseType) {

            case PhraseType.Error:
                return false;

            case PhraseType.NamespaceName:
                if (parent && (<Phrase>parent).phraseType === PhraseType.NamespaceDefinitionHeader && (<ReferencePhrase>node).reference) {
                    this.nameResolver.namespaceName = (<ReferencePhrase>node).reference.name;
                }
                this._transformerStack.push(new NamespaceNameTransformer(<Phrase>node, this._referenceSymbols));
                break;

            case PhraseType.ClassDeclarationHeader:
            case PhraseType.InterfaceDeclarationHeader:
            case PhraseType.TraitDeclarationHeader:
            case PhraseType.AnonymousClassDeclarationHeader:
                if ((<ReferencePhrase>node).reference && (<ReferencePhrase>node).reference.name) {
                    const typeAggregate = TypeAggregate.create(this.symbolStore, (<ReferencePhrase>node).reference.name);
                    this.nameResolver.pushClass((<ReferencePhrase>node).reference.name, typeAggregate.baseClassName());
                    this._classTypeAggregateStack.push(typeAggregate);
                    this._variableTable.pushScope();
                    this._variableTable.setVariable({
                        name: '$this',
                        type: (<ReferencePhrase>node).reference.name
                    });
                }
                break;

            case PhraseType.FunctionCallExpression:
                this._transformerStack.push(new FunctionCallExpressionTransformer(node, this._referenceSymbols));
                break;

            case PhraseType.ConstElement:
                this._transformerStack.push(new HeaderTransform(this.nameResolver, SymbolKind.Constant));
                break;

            case PhraseType.ClassConstElement:
                this._transformerStack.push(new MemberDeclarationTransform(SymbolKind.ClassConstant, this._currentClassName()));
                break;

            case PhraseType.ParameterDeclaration:
                this._parameterDeclaration(<Phrase>node, spine);
                break;

            case PhraseType.AnonymousFunctionUseVariable:
                if ((<ReferencePhrase>node).reference) {
                    this._variableTable.carry((<ReferencePhrase>node).reference.name);
                    (<ReferencePhrase>node).reference.type = this._variableTable.getType((<ReferencePhrase>node).reference.name);
                }
                break;

            case PhraseType.FunctionDeclaration:
                this._variableTable.pushScope();
                break;

            case PhraseType.MethodDeclaration:
                this._variableTable.pushScope(['$this']);
                break;

            case PhraseType.AnonymousFunctionCreationExpression:
                this._anonymousFunctionCreationExpression(<Phrase>node);
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
                        this._lastVarTypehints
                    ));
                break;

            case PhraseType.InstanceOfExpression:
                this._transformerStack.push(
                    new InstanceOfExpressionTransformer(node, this.symbolStore, this._variableTable)
                );
                break;

            case PhraseType.ForeachStatement:
                this._transformerStack.push(
                    new ForeachStatementTransformer(node, this.symbolStore, this._variableTable)
                );
                break;

            case PhraseType.ForeachCollection:
                this._transformerStack.push(new DefaultTransformer(node));
                break;

            case PhraseType.CatchClause:
                this._transformerStack.push(new CatchClauseTransformer());
                break;

            case PhraseType.CatchNameList:
                this._transformerStack.push(new CatchNameListTransform());
                break;

            case PhraseType.QualifiedName:
                this._transformerStack.push(
                    new QualifiedNameTransform(this._nameSymbolType(<Phrase>parent), this.doc.nodeHashedLocation(node), this.nameResolver)
                );
                break;

            case PhraseType.FullyQualifiedName:
                this._transformerStack.push(
                    new FullyQualifiedNameTransform(this._nameSymbolType(<Phrase>parent), this.doc.nodeHashedLocation(node))
                );
                break;

            case PhraseType.RelativeQualifiedName:
                this._transformerStack.push(
                    new RelativeQualifiedNameTransform(this._nameSymbolType(<Phrase>parent), this.doc.nodeHashedLocation(node), this.nameResolver)
                );
                break;

            case PhraseType.SimpleVariable:
                this._transformerStack.push(
                    new SimpleVariableTransformer(node, this._variableTable)
                );
                break;

            case PhraseType.ArrayInitialiserList:
                this._transformerStack.push(new ArrayInititialiserListTransformer());
                break;

            case PhraseType.ArrayElement:
                if (parentTransformer) {
                    this._transformerStack.push(new ArrayElementTransformer());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.ArrayValue:
                if (parentTransformer) {
                    this._transformerStack.push(new ArrayValueTransformer());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.SubscriptExpression:
                if (parentTransformer) {
                    this._transformerStack.push(new SubscriptExpressionTransformer());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.ScopedCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(PhraseType.ScopedCallExpression, SymbolKind.Method, this._referenceSymbols)
                );
                break;

            case PhraseType.ScopedPropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(PhraseType.ScopedPropertyAccessExpression, SymbolKind.Property, this._referenceSymbols)
                );
                break;

            case PhraseType.ClassConstantAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(PhraseType.ClassConstantAccessExpression, SymbolKind.ClassConstant, this._referenceSymbols)
                );
                break;

            case PhraseType.ScopedMemberName:
                this._transformerStack.push(new ScopedMemberNameTransform(this.doc.nodeHashedLocation(node)));
                break;

            case PhraseType.Identifier:
                if (parentTransformer) {
                    this._transformerStack.push(new IdentifierTransform());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.PropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(PhraseType.PropertyAccessExpression, SymbolKind.Property, this._referenceSymbols)
                );
                break;

            case PhraseType.MethodCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(PhraseType.MethodCallExpression, SymbolKind.Method, this._referenceSymbols)
                );
                break;

            case PhraseType.MemberName:
                this._transformerStack.push(new MemberNameTransform(this.doc.nodeHashedLocation(node)));
                break;

            case PhraseType.AnonymousFunctionUseVariable:
                this._transformerStack.push(new AnonymousFunctionUseVariableTransformer());
                break;

            case PhraseType.ObjectCreationExpression:
                if (parentTransformer) {
                    this._transformerStack.push(new ObjectCreationExpressionTransformer());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.ClassTypeDesignator:
            case PhraseType.InstanceofTypeDesignator:
                if (parentTransformer) {
                    this._transformerStack.push(new TypeDesignatorTransformer((<Phrase>node).phraseType));
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case PhraseType.RelativeScope:
                let context = this._classTypeAggregateStack.length ? this._classTypeAggregateStack[this._classTypeAggregateStack.length - 1] : null;
                let name = context ? context.name : '';
                this._transformerStack.push(new RelativeScopeTransform(name, this.doc.nodeHashedLocation(node)));
                break;

            case PhraseType.TernaryExpression:
                this._transformerStack.push(new TernaryExpressionTransformer(node));
                break;

            case PhraseType.CoalesceExpression:
                this._transformerStack.push(new CoalesceExpressionTransformer(node));
                break;

            case PhraseType.EncapsulatedExpression:
                if (parentTransformer) {
                    this._transformerStack.push(new EncapsulatedExpressionTransform());
                } else {
                    this._transformerStack.push(null);
                }
                break;

            case undefined:
                //tokens
                if (parentTransformer && (<Token>node).tokenType > TokenType.EndOfFile && (<Token>node).tokenType < TokenType.Equals) {
                    parentTransformer.push(new TokenTransformer(<Token>node, this.doc));
                    if (parentTransformer.phraseType === PhraseType.CatchClause && (<Token>node).tokenType === TokenType.VariableName) {
                        this._variableTable.setVariable((<CatchClauseTransformer>parentTransformer).variable);
                    }
                } else if ((<Token>node).tokenType === TokenType.DocumentComment) {
                    let phpDoc = PhpDocParser.parse(this.doc.tokenText(<Token>node));
                    if (phpDoc) {
                        this._lastVarTypehints = phpDoc.varTags;
                        let varTag: Tag;
                        for (let n = 0, l = this._lastVarTypehints.length; n < l; ++n) {
                            varTag = this._lastVarTypehints[n];
                            varTag.typeString = TypeString.nameResolve(varTag.typeString, this.nameResolver);
                            this._variableTable.setVariable(Variable.create(varTag.name, varTag.typeString));
                        }
                    }
                } else if ((<Token>node).tokenType === TokenType.OpenBrace || (<Token>node).tokenType === TokenType.CloseBrace || (<Token>node).tokenType === TokenType.Semicolon) {
                    this._lastVarTypehints = undefined;
                }
                break;

            default:
                this._transformerStack.push(null);
                break;
        }

        return true;

    }

    postorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        if (!(<Phrase>node).phraseType) {
            return;
        }

        let transform = this._transformerStack.pop();
        let parentTransform = this._transformerStack.length ? this._transformerStack[this._transformerStack.length - 1] : null;
        let scope = this._scopeStack.length ? this._scopeStack[this._scopeStack.length - 1] : null;

        if (parentTransform && transform) {
            parentTransform.push(transform);
        }

        switch ((<Phrase>node).phraseType) {

            case PhraseType.FullyQualifiedName:
            case PhraseType.QualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.SimpleVariable:
            case PhraseType.ScopedCallExpression:
            case PhraseType.ClassConstantAccessExpression:
            case PhraseType.ScopedPropertyAccessExpression:
            case PhraseType.PropertyAccessExpression:
            case PhraseType.MethodCallExpression:
            case PhraseType.NamespaceUseClause:
            case PhraseType.NamespaceUseGroupClause:
            case PhraseType.ClassDeclarationHeader:
            case PhraseType.InterfaceDeclarationHeader:
            case PhraseType.TraitDeclarationHeader:
            case PhraseType.FunctionDeclarationHeader:
            case PhraseType.ConstElement:
            case PhraseType.PropertyElement:
            case PhraseType.ClassConstElement:
            case PhraseType.MethodDeclarationHeader:
            case PhraseType.NamespaceDefinition:
            case PhraseType.ParameterDeclaration:
            case PhraseType.AnonymousFunctionUseVariable:
            case PhraseType.RelativeScope:
                if (scope && transform) {
                    let ref = (<ReferenceNodeTransform>transform).reference;

                    if (ref) {
                        scope.children.push(ref);
                    }
                }

                if ((<Phrase>node).phraseType === PhraseType.NamespaceDefinition) {
                    this._scopeStack.pop();
                }
                break;

            case PhraseType.SimpleAssignmentExpression:
            case PhraseType.ByRefAssignmentExpression:
                this._variableTable.setVariables((<SimpleAssignmentExpressionTransformer>transform).variables);
                break;

            case PhraseType.InstanceOfExpression:
                this._variableTable.setVariable((<InstanceOfExpressionTransformer>transform).variable);
                break;

            case PhraseType.ForeachValue:
                this._variableTable.setVariables((<ForeachStatementTransforme>parentTransform).variables);
                break;

            case PhraseType.IfStatement:
            case PhraseType.SwitchStatement:
                this._variableTable.popBranch();
                this._variableTable.pruneBranches();
                break;

            case PhraseType.ClassDeclaration:
            case PhraseType.TraitDeclaration:
            case PhraseType.InterfaceDeclaration:
            case PhraseType.AnonymousClassDeclaration:
                this.nameResolver.popClass();
                this._classTypeAggregateStack.pop();
                this._scopeStack.pop();
                this._variableTable.popScope();
                break;

            case PhraseType.FunctionDeclaration:
            case PhraseType.MethodDeclaration:
            case PhraseType.AnonymousFunctionCreationExpression:
                this._scopeStack.pop();
                this._variableTable.popScope();
                break;

            default:
                break;
        }

    }

    private _parameterDeclaration(node: Phrase, spine: (Phrase | Token)[]) {

        const ref = (<ReferencePhrase>node).reference;
        if (!ref) {
            return;
        }

        if (ref.type) {
            this._variableTable.setVariable({
                name: ref.name,
                type: ref.type
            });
            return;
        }

        //search for a base method that has param types defined
        if (spine.length < 2) {
            return;
        }

        const methodRef = (<ReferencePhrase>spine[spine.length - 2]).reference;
        const classAggregate = this._currentClass();
        if (!classAggregate || !methodRef || methodRef.kind !== SymbolKind.Method) {
            return;
        }

        const lcName = ref.name.toLowerCase();
        const hasTypedParam = (p: PhpSymbol) => {
            return p.kind === SymbolKind.Parameter && p.name === ref.name && p.type !== undefined && p.type !== '';
        }
        let type: string;
        const member = classAggregate.firstMember(s => {
            if (s.kind === SymbolKind.Method && lcName === s.name.toLowerCase()) {
                const p = PhpSymbol.findChild(s, hasTypedParam);
                if (p) {
                    type = p.type;
                    return true;
                }
            }
            return false;
        });

        if (type) {
            this._variableTable.setVariable({
                name: ref.name,
                type: type
            });
        }

    }

    private _currentClassName() {
        const c = this._currentClass();
        return c ? c.name : '';
    }

    private _currentClass() {
        return this._classTypeAggregateStack.length ? this._classTypeAggregateStack[this._classTypeAggregateStack.length - 1] : undefined;
    }

    private _scopeStackPush(scope: Scope) {
        if (this._scopeStack.length) {
            this._scopeStack[this._scopeStack.length - 1].children.push(scope);
        }
        this._scopeStack.push(scope);
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

    private _anonymousFunctionCreationExpression(node: Phrase) {

        const carry: string[] = ['$this'];
        const header =


            let children = symbol && symbol.children ? symbol.children : [];
        let s: PhpSymbol;

        for (let n = 0, l = children.length; n < l; ++n) {
            s = children[n];
            if (s.kind === SymbolKind.Variable && (s.modifiers & SymbolModifier.Use) > 0) {
                carry.push(s.name);
            }
        }

        this._variableTable.pushScope(carry);

        for (let n = 0, l = children.length; n < l; ++n) {
            s = children[n];
            if (s.kind === SymbolKind.Parameter) {
                this._variableTable.setVariable(Variable.create(s.name, PhpSymbol.type(s)));
            }
        }

    }

    private _referenceSymbols: ReferenceSymbolDelegate = (ref) => {
        return this.symbolStore.findSymbolsByReference(ref, MemberMergeStrategy.Documented);
    }

}

class TokenTransformer implements TypeTransformer {

    constructor(public node: Phrase | Token, private utils: NodeUtils) { }

    get type() {
        switch ((<Token>this.node).tokenType) {
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
            case TokenType.Name:
                {
                    const lcName = this.utils.nodeText(this.node).toLowerCase();
                    if (lcName === 'null') {
                        return 'null';
                    } else if (lcName === 'true' || lcName === 'false') {
                        return 'bool';
                    } else {
                        return '';
                    }
                }
            default:
                return '';
        }
    }

    push(transformer: NodeTransformer) { }

}

class NamespaceNameTransformer implements NodeTransformer {

    type = '';

    constructor(public node: Phrase, public referenceSymbolDelegate: ReferenceSymbolDelegate) {
        if ((<ReferencePhrase>this.node).reference) {
            this.type = this.referenceSymbolDelegate((<ReferencePhrase>this.node).reference).reduce(symbolsToTypeReduceFn, '');
        }
    }
    push(transformer: NodeTransformer) { }

}

class FunctionDeclarationHeaderTransformer implements NodeTransformer {

    constructor(public node: Phrase | Token, public variableTable: VariableTable) { }

    push(transformer: NodeTransformer) {

        if (transformer.phraseType === PhraseType.ParameterDeclaration) {



        }

    }

}

type ReferenceSymbolDelegate = (ref: Reference) => PhpSymbol[];

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

    phraseType = PhraseType.CatchClause;
    private _type = '';
    private _varName = '';

    constructor(public node: Phrase | Token, private variableTable: VariableTable) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.NamespaceName) {
            this._type = TypeString.merge(this._type, (<NamespaceNameTransformer>transformer).type);
            const ref = (<ReferencePhrase>this.node).reference;
            if (ref) {
                ref.type = this._type;
                this.variableTable.setVariable({
                    name: ref.name,
                    type: ref.type
                });
            }
        }
    }

}

class CatchNameListTransform implements TypeTransformer {

    phraseType = PhraseType.CatchNameList;
    type = '';

    push(transform: NodeTransform) {
        let ref = (<ReferenceNodeTransform>transform).reference;
        if (ref) {
            this.type = TypeString.merge(this.type, ref.name);
        }
    }

}

class ForeachStatementTransformer implements NodeTransformer {

    constructor(
        public node: Phrase | Token,
        public symbolStore: SymbolStore,
        public variableTable: VariableTable
    ) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseType.ForeachCollection) {
            const type = TypeString.arrayDereference((<TypeTransformer>transformer).type);
            const foreachValue = ParsedDocument.findChild(<Phrase>this.node, this._isForeachValue);
            if (foreachValue && type) {
                const assignVisitor = new TypeAssignVisitor(this.symbolStore, this.variableTable, type);
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
        if ((<Phrase>transformer.node).phraseType === PhraseType.ArrayValue) {
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
        return TypeString.count(merged) < 4 ? TypeString.arrayReference(merged) : 'mixed[]';
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

    phraseType = PhraseType.FunctionCallExpression;
    type = '';

    constructor(public node: Phrase | Token, public referenceSymbolDelegate: ReferenceSymbolDelegate) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            const ref = (<ReferencePhrase>transformer.node).reference;
            this.type = this.referenceSymbolDelegate(ref).reduce(symbolsToTypeReduceFn, '');
        }

    }

}

class RelativeScopeTransform implements TypeTransformer, ReferenceNodeTransform {

    phraseType = PhraseType.RelativeScope;
    reference: Reference;
    constructor(public type: string, loc: PackedLocation) {
        this.reference = Reference.create(SymbolKind.Class, type, loc);
        this.reference.unresolvedName = 'static';
    }
    push(transform: NodeTransform) { }
}

class TypeDesignatorTransformer implements TypeTransformer {

    type = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        //name phrases have been skipped
        //pushing grandchild namespace name instead
        if (
            (<Phrase>transformer.node).phraseType === PhraseType.NamespaceName ||
            (<Phrase>transformer.node).phraseType === PhraseType.SimpleVariable ||
            (<Phrase>transformer.node).phraseType === PhraseType.RelativeScope
        ) {

            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class AnonymousClassDeclarationTransform implements TypeTransformer {
    phraseType = PhraseType.AnonymousClassDeclaration;
    constructor(public type: string) { }
    push(transform: NodeTransform) { }

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

class FullyQualifiedNameTransform implements TypeTransformer, ReferenceNodeTransform {

    phraseType = PhraseType.FullyQualifiedName;
    reference: Reference;

    constructor(symbolKind: SymbolKind, loc: PackedLocation) {
        this.reference = Reference.create(symbolKind, '', loc);
    }

    push(transform: NodeTransform) {

        if (transform.phraseType === PhraseType.NamespaceName) {
            this.reference.name = (<NamespaceNameTransformer>transform).text;
        }

    }

    get type() {
        return this.reference.name;
    }

}

class QualifiedNameTransform implements TypeTransformer, ReferenceNodeTransform {

    phraseType = PhraseType.QualifiedName;
    reference: Reference;
    private _nameResolver: NameResolver;

    constructor(symbolKind: SymbolKind, loc: PackedLocation, nameResolver: NameResolver) {
        this.reference = Reference.create(symbolKind, '', loc);
        this._nameResolver = nameResolver;
    }

    push(transform: NodeTransform) {

        if (transform.phraseType === PhraseType.NamespaceName) {
            let name = (<NamespaceNameTransformer>transform).text;
            let lcName = name.toLowerCase();
            this.reference.name = this._nameResolver.resolveNotFullyQualified(name, this.reference.kind);
            if (
                ((this.reference.kind === SymbolKind.Function || this.reference.kind === SymbolKind.Constant) &&
                    name !== this.reference.name && name.indexOf('\\') < 0) || (lcName === 'parent' || lcName === 'self')
            ) {
                this.reference.unresolvedName = name;
            }
        }

    }

    get type() {
        return this.reference.name;
    }

}

class RelativeQualifiedNameTransform implements TypeTransformer, ReferenceNodeTransform {

    phraseType = PhraseType.RelativeQualifiedName;
    reference: Reference;
    private _nameResolver: NameResolver;

    constructor(symbolKind: SymbolKind, loc: PackedLocation, nameResolver: NameResolver) {
        this.reference = Reference.create(symbolKind, '', loc);
        this._nameResolver = nameResolver;
    }

    push(transform: NodeTransform) {

        if (transform.phraseType === PhraseType.NamespaceName) {
            this.reference.name = this._nameResolver.resolveRelative((<NamespaceNameTransformer>transform).text);
        }

    }

    get type() {
        return this.reference.name;
    }

}

class DefaultTransformer implements TypeTransformer {

    type = '';
    constructor(public node: Phrase | Token) { }
    push(transformer: NodeTransformer) {
        if ((<TypeTransformer>transformer).type) {
            this.type = (<TypeTransformer>transformer).type;
        }
    }

}

class MemberNameTransform implements ReferenceNodeTransform {

    phraseType = PhraseType.MemberName;
    reference: Reference;

    constructor(loc: PackedLocation) {
        this.reference = Reference.create(SymbolKind.None, '', loc);
    }

    push(transform: NodeTransform) {
        if (transform.tokenType === TokenType.Name) {
            this.reference.name = (<TokenTransformer>transform).text;
        }
    }

}

class ScopedMemberNameTransform implements ReferenceNodeTransform {

    phraseType = PhraseType.ScopedMemberName;
    reference: Reference;

    constructor(loc: PackedLocation) {
        this.reference = Reference.create(SymbolKind.None, '', loc);
    }

    push(transform: NodeTransform) {
        if (
            transform.tokenType === TokenType.VariableName ||
            transform.phraseType === PhraseType.Identifier
        ) {
            this.reference.name = (<TextNodeTransform>transform).text;
        }
    }

}

class IdentifierTransform implements TextNodeTransform {
    phraseType = PhraseType.Identifier;
    text = '';
    location: PackedLocation;

    push(transform: NodeTransform) {
        this.text = (<TokenTransformer>transform).text;
        this.location = (<TokenTransformer>transform).location;
    }
}

class MemberAccessExpressionTransformer implements TypeTransformer {

    private _reference: Reference;
    private _scope = '';

    constructor(
        public node: Phrase | Token,
        public referenceSymbolDelegate: ReferenceSymbolDelegate
    ) { }

    push(transformer: NodeTransformer) {

        switch ((<Phrase>transformer.node).phraseType) {
            case PhraseType.ScopedMemberName:
            case PhraseType.MemberName:
                this._reference = (<ReferencePhrase>transformer.node).reference;
                if (this._reference && this._scope) {
                    this._reference.scope = this._scope;
                }
                break;

            case PhraseType.ScopedCallExpression:
            case PhraseType.MethodCallExpression:
            case PhraseType.PropertyAccessExpression:
            case PhraseType.ScopedPropertyAccessExpression:
            case PhraseType.FunctionCallExpression:
            case PhraseType.SubscriptExpression:
            case PhraseType.SimpleVariable:
            case PhraseType.NamespaceName:
            case PhraseType.RelativeScope:
                this._scope = (<TypeTransformer>transformer).type;
                break;

            default:
                break;
        }

    }

    get type() {
        return this.referenceSymbolDelegate(this._reference).reduce(symbolsToTypeReduceFn, '');
    }

}

class HeaderTransform implements ReferenceNodeTransform {

    reference: Reference;
    private _kind: SymbolKind;

    constructor(public nameResolver: NameResolver, kind: SymbolKind) {
        this._kind = kind;
    }

    push(transform: NodeTransform) {
        if (transform.tokenType === TokenType.Name) {
            let name = (<TokenTransformer>transform).text;
            let loc = (<TokenTransformer>transform).location;
            this.reference = Reference.create(this._kind, this.nameResolver.resolveRelative(name), loc);
        }
    }

}

class MemberDeclarationTransform implements ReferenceNodeTransform {

    reference: Reference;
    private _kind: SymbolKind;
    private _scope = '';

    constructor(kind: SymbolKind, scope: string) {
        this._kind = kind;
        this._scope = scope;
    }

    push(transform: NodeTransform) {
        if (transform.phraseType === PhraseType.Identifier) {
            let name = (<IdentifierTransform>transform).text;
            let loc = (<IdentifierTransform>transform).location;
            this.reference = Reference.create(this._kind, name, loc);
            this.reference.scope = this._scope;
        }
    }

}

class ParameterDeclarationTransformer implements NodeTransformer {

    constructor(public node: Phrase | Token, public method: PhpSymbol) { }


    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.VariableName) {
            this.reference = Reference.create(SymbolKind.Parameter, (<TokenTransformer>transformer).text, (<TokenTransformer>transformer).location);
        }
    }

}

class EncapsulatedExpressionTransform implements ReferenceNodeTransform, TypeTransformer {

    phraseType = PhraseType.EncapsulatedExpression;
    private _transform: NodeTransform;

    push(transform: NodeTransform) {
        if (transform.phraseType || (transform.tokenType >= TokenType.DirectoryConstant && transform.tokenType <= TokenType.IntegerLiteral)) {
            this._transform = transform;
        }
    }

    get reference() {
        return this._transform ? (<ReferenceNodeTransform>this._transform).reference : undefined;
    }

    get type() {
        return this._transform ? (<TypeTransformer>this._transform).type : undefined;
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

export namespace ReferenceReader {
    export function discoverReferences(doc: ParsedDocument, symbolStore: SymbolStore) {
        let visitor = new ReferenceReader(doc, new NameResolver(), symbolStore);
        doc.traverse(visitor);
        return visitor.refTable;
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