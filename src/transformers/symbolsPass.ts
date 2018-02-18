/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { TreeVisitor, MultiVisitor, PackedLocation } from '../types';
import { ParsedDocument } from '../parsedDocument';
import { Phrase, PhraseType, Token, TokenType } from 'php7parser';
import { PhpDoc, PhpDocParser, Tag, MethodTagParam } from '../phpDoc';
import { PhpSymbol, SymbolKind, SymbolModifier, PhpSymbolDoc } from '../symbol';
import { NameResolver } from '../nameResolver';
import { TypeString } from '../typeString';
import { PackedRange } from '../types';
import { NodeTransformer, NamedPhrase, FqnPhrase, RangedPhrase, ReferencePhrase } from './transformers';
import * as util from '../util';
import { Reference } from '../reference';


/** 
 * First parse tree pass
 * 1. Attach symbol reference objects to relevant nodes in tree
 * 2. Builds symbol definition tree
 */
export class SymbolsPass implements TreeVisitor<Phrase | Token> {

    lastPhpDoc: PhpDoc;
    lastPhpDocLocation: PackedLocation;
    referenceNameSet: Set<string>;

    private _transformStack: NodeTransformer[];
    private _lastTransform

    constructor(
        public document: ParsedDocument,
        public nameResolver: NameResolver
    ) {
        this._transformStack = [new FileTransform(this.document.uri, this.document.nodeHashedLocation(this.document.tree))];
        this.referenceNameSet = new Set<string>();
    }

    get symbol() {
        return (<FileTransform>this._transformStack[0]).symbol;
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        let s: PhpSymbol;
        let parentNode = <Phrase>(spine.length ? spine[spine.length - 1] : { phraseType: PhraseType.Unknown, children: [] });
        let parentTransform = this._transformStack[this._transformStack.length - 1];

        switch ((<Phrase>node).phraseType) {

            case PhraseType.Error:
                this._transformStack.push(null);
                return false;

            case PhraseType.NamespaceDefinition:
                {
                    let t = new NamespaceDefinitionTransform(this.document.nodeHashedLocation(node));
                    this._transformStack.push(t);
                    this.nameResolver.namespace = t.symbol;
                }
                break;

            case PhraseType.NamespaceUseDeclaration:
                this._transformStack.push(new NamespaceUseDeclarationTransform());
                break;

            case PhraseType.NamespaceUseClauseList:
            case PhraseType.NamespaceUseGroupClauseList:
                this._transformStack.push(new NamespaceUseClauseListTransform((<Phrase>node).phraseType));
                break;

            case PhraseType.NamespaceUseClause:
            case PhraseType.NamespaceUseGroupClause:
                {
                    let t = new NamespaceUseClauseTransform((<Phrase>node).phraseType, this.document.nodeHashedLocation(node));
                    this._transformStack.push(t);
                    this.nameResolver.rules.push(t.symbol);
                }
                break;

            case PhraseType.NamespaceAliasingClause:
                this._transformStack.push(new NamespaceAliasingClauseTransformer());
                break;

            case PhraseType.ConstElement:
                this._transformStack.push(
                    new ConstElementTransformer(this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                    ));
                break;

            case PhraseType.FunctionDeclaration:
                this._transformStack.push(new FunctionDeclarationTransform(
                    this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.FunctionDeclarationHeader:
                this._transformStack.push(new FunctionDeclarationHeaderTransform());
                break;

            case PhraseType.ParameterDeclarationList:
                this._transformStack.push(new DelimiteredListTransform(PhraseType.ParameterDeclarationList));
                break;

            case PhraseType.ParameterDeclaration:
                this._transformStack.push(new ParameterDeclarationTransform(
                    this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation, this.nameResolver
                ));
                break;

            case PhraseType.TypeDeclaration:
                this._transformStack.push(new TypeDeclarationTransform());
                break;

            case PhraseType.ReturnType:
                this._transformStack.push(new ReturnTypeTransform());
                break;

            case PhraseType.FunctionDeclarationBody:
            case PhraseType.MethodDeclarationBody:
                this._transformStack.push(new FunctionDeclarationBodyTransform((<Phrase>node).phraseType));
                break;

            case PhraseType.ClassDeclaration:
                {
                    let t = new ClassDeclarationTransform(
                        this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.ClassDeclarationHeader:
                this._transformStack.push(new ClassDeclarationHeaderTransform());
                break;

            case PhraseType.ClassBaseClause:
                this._transformStack.push(new ClassBaseClauseTransform());
                break;

            case PhraseType.ClassInterfaceClause:
                this._transformStack.push(new ClassInterfaceClauseTransformer());
                break;

            case PhraseType.QualifiedNameList:
                if (parentTransform) {
                    this._transformStack.push(new DelimiteredListTransform(PhraseType.QualifiedNameList));
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.ClassDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(PhraseType.ClassDeclarationBody));
                break;

            case PhraseType.InterfaceDeclaration:
                {
                    let t = new InterfaceDeclarationTransform(
                        this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.InterfaceDeclarationHeader:
                this._transformStack.push(new InterfaceDeclarationHeaderTransform());
                break;

            case PhraseType.InterfaceBaseClause:
                this._transformStack.push(new InterfaceBaseClauseTransform());
                break;

            case PhraseType.InterfaceDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(PhraseType.InterfaceDeclarationBody));
                break;

            case PhraseType.TraitDeclaration:
                this._transformStack.push(new TraitDeclarationTransform(
                    this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.TraitDeclarationHeader:
                this._transformStack.push(new TraitDeclarationHeaderTransform());
                break;

            case PhraseType.TraitDeclarationBody:
                this._transformStack.push(new TypeDeclarationBodyTransform(PhraseType.TraitDeclarationBody));
                break;

            case PhraseType.ClassConstDeclaration:
                this._transformStack.push(new FieldDeclarationTransform(PhraseType.ClassConstDeclaration));
                break;

            case PhraseType.ClassConstElementList:
                this._transformStack.push(new DelimiteredListTransform(PhraseType.ClassConstElementList));
                break;

            case PhraseType.ClassConstElement:
                this._transformStack.push(new ClassConstantElementTransform(
                    this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.PropertyDeclaration:
                this._transformStack.push(new FieldDeclarationTransform(PhraseType.PropertyDeclaration));
                break;

            case PhraseType.PropertyElementList:
                this._transformStack.push(new DelimiteredListTransform(PhraseType.PropertyElementList));
                break;

            case PhraseType.PropertyElement:
                this._transformStack.push(new PropertyElementTransformer(
                    this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.PropertyInitialiser:
                this._transformStack.push(new PropertyInitialiserTransformer());
                break;

            case PhraseType.TraitUseClause:
                this._transformStack.push(new TraitUseClauseTransform());
                break;

            case PhraseType.MethodDeclaration:
                this._transformStack.push(new MethodDeclarationTransform(
                    this.nameResolver, this.document.nodeHashedLocation(node), this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.MethodDeclarationHeader:
                this._transformStack.push(new MethodDeclarationHeaderTransform());
                break;

            case PhraseType.Identifier:
                if (parentNode.phraseType === PhraseType.MethodDeclarationHeader || parentNode.phraseType === PhraseType.ClassConstElement) {
                    this._transformStack.push(new IdentifierTransform());
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.MemberModifierList:
                this._transformStack.push(new MemberModifierListTransform());
                break;

            case PhraseType.AnonymousClassDeclaration:
                {
                    let t = new AnonymousClassDeclarationTransform(
                        this.document.nodeHashedLocation(node), this.document.createAnonymousName(<Phrase>node)
                    );
                    this._transformStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.AnonymousClassDeclarationHeader:
                this._transformStack.push(new AnonymousClassDeclarationHeaderTransform());
                break;

            case PhraseType.AnonymousFunctionCreationExpression:
                this._transformStack.push(new AnonymousFunctionCreationExpressionTransform(
                    this.document.nodeHashedLocation(node), this.document.createAnonymousName(<Phrase>node)
                ));
                break;

            case PhraseType.AnonymousFunctionHeader:
                this._transformStack.push(new AnonymousFunctionHeaderTransform());
                break;

            case PhraseType.AnonymousFunctionUseClause:
                this._transformStack.push(new AnonymousFunctionUseClauseTransform());
                break;

            case PhraseType.ClosureUseList:
                this._transformStack.push(new DelimiteredListTransform(PhraseType.ClosureUseList));
                break;

            case PhraseType.AnonymousFunctionUseVariable:
                this._transformStack.push(new AnonymousFunctionUseVariableTransform(this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.SimpleVariable:
                this._transformStack.push(new SimpleVariableTransform(this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.ScopedCallExpression:
                this._transformStack.push(
                    new MemberAccessExpressionTransform(PhraseType.ScopedCallExpression, SymbolKind.Method, this._referenceSymbols)
                );
                break;

            case PhraseType.ScopedPropertyAccessExpression:
                this._transformStack.push(
                    new MemberAccessExpressionTransform(PhraseType.ScopedPropertyAccessExpression, SymbolKind.Property, this._referenceSymbols)
                );
                break;

            case PhraseType.ClassConstantAccessExpression:
                this._transformStack.push(
                    new MemberAccessExpressionTransform(PhraseType.ClassConstantAccessExpression, SymbolKind.ClassConstant, this._referenceSymbols)
                );
                break;

                case PhraseType.PropertyAccessExpression:
                this._transformStack.push(
                    new MemberAccessExpressionTransform(PhraseType.PropertyAccessExpression, SymbolKind.Property, this._referenceSymbols)
                );
                break;

            case PhraseType.MethodCallExpression:
                this._transformStack.push(
                    new MemberAccessExpressionTransform(PhraseType.MethodCallExpression, SymbolKind.Method, this._referenceSymbols)
                );
                break;

            case PhraseType.ScopedMemberName:
                this._transformStack.push(new ScopedMemberNameTransform(<Phrase>node, this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.MemberName:
                this._transformStack.push(new MemberNameTransform(<Phrase>node, this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.FunctionCallExpression:
                //define
                if ((<Phrase>node).children.length) {
                    const name = this.document.nodeText((<Phrase>node).children[0]).toLowerCase();
                    if (name === 'define' || name === '\\define') {
                        this._transformStack.push(new DefineFunctionCallExpressionTransform(this.document.nodeHashedLocation(node)));
                        break;
                    }
                }
                this._transformStack.push(undefined); 
                break;

            case PhraseType.ArgumentExpressionList:
                if (parentNode.phraseType === PhraseType.FunctionCallExpression && parentTransform) {
                    this._transformStack.push(new DelimiteredListTransform(PhraseType.ArgumentExpressionList));
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.FullyQualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new FullyQualifiedNameTransform());
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.RelativeQualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new RelativeQualifiedNameTransform(this.nameResolver));
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.QualifiedName:
                if (parentTransform) {
                    this._transformStack.push(new QualifiedNameTransform(this.nameResolver));
                } else {
                    this._transformStack.push(null);
                }
                break;

            case PhraseType.NamespaceName:
                if (parentTransform) {
                    this._transformStack.push(new NamespaceNameTransformer());
                } else {
                    this._transformStack.push(null);
                }
                break;

            case undefined:
                //tokens
                if ((<Token>node).tokenType === TokenType.DocumentComment) {

                    this.lastPhpDoc = PhpDocParser.parse(this.document.nodeText(node));
                    this.lastPhpDocLocation = this.document.nodeHashedLocation(node);

                } else if ((<Token>node).tokenType === TokenType.CloseBrace) {

                    this.lastPhpDoc = null;
                    this.lastPhpDocLocation = null;

                } else if ((<Token>node).tokenType === TokenType.VariableName && parentNode.phraseType === PhraseType.CatchClause) {
                    //catch clause vars
                    for (let n = this._transformStack.length - 1; n > -1; --n) {
                        if (this._transformStack[n]) {
                            this._transformStack[n].push(new CatchClauseVariableNameTransform(this.document.tokenText(<Token>node), this.document.nodeHashedLocation(node)));
                            break;
                        }
                    }

                } else if (parentTransform && (<Token>node).tokenType > TokenType.EndOfFile && (<Token>node).tokenType < TokenType.Equals) {

                    parentTransform.push(new TokenTransform(<Token>node, this.document));

                }
                break;

            default:

                if (
                    parentNode.phraseType === PhraseType.ConstElement ||
                    parentNode.phraseType === PhraseType.ClassConstElement ||
                    parentNode.phraseType === PhraseType.ParameterDeclaration ||
                    (parentNode.phraseType === PhraseType.ArgumentExpressionList && parentTransform)
                ) {
                    this._transformStack.push(new DefaultNodeTransform((<Phrase>node).phraseType, this.document.nodeText(node)));
                } else {
                    this._transformStack.push(null);
                }
                break;
        }

        return true;

    }

    postorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        if (!(<Phrase>node).phraseType) {
            return;
        }

        let transform = this._transformStack.pop();
        if (!transform) {
            return;
        }

        for (let n = this._transformStack.length - 1; n > -1; --n) {
            if (this._transformStack[n]) {
                this._transformStack[n].push(transform);
                break;
            }
        }

        switch ((<Phrase>node).phraseType) {
            case PhraseType.ClassDeclarationHeader:
            case PhraseType.InterfaceDeclarationHeader:
            case PhraseType.AnonymousClassDeclarationHeader:
            case PhraseType.FunctionDeclarationHeader:
            case PhraseType.MethodDeclarationHeader:
            case PhraseType.TraitDeclarationHeader:
            case PhraseType.AnonymousFunctionHeader:
                this.lastPhpDoc = null;
                this.lastPhpDocLocation = null;
                break;
            default:
                break;
        }

        switch ((<Phrase>node).phraseType) {
            case PhraseType.FullyQualifiedName:
            case PhraseType.QualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.SimpleVariable:
            case PhraseType.MemberName:
            case PhraseType.ScopedMemberName:
            case PhraseType.NamespaceName:
            case PhraseType.ClassDeclarationHeader:
            case PhraseType.InterfaceDeclarationHeader:
            case PhraseType.TraitDeclarationHeader:
            case PhraseType.FunctionDeclarationHeader:
            case PhraseType.ConstElement:
            case PhraseType.PropertyElement:
            case PhraseType.ClassConstElement:
            case PhraseType.MethodDeclarationHeader:
            case PhraseType.ParameterDeclaration:
            case PhraseType.AnonymousFunctionUseVariable:
            case PhraseType.RelativeScope:
                //these nodes will have reference info
                {
                    const ref = (<ReferencePhrase>node).reference;
                    if (Array.isArray(ref)) {
                        for (let n = 0; n < ref.length; ++n) {
                            this.addRefName(ref[n]);
                        }
                    } else {
                        this.addRefName(ref);
                    }

                }
                break;
            default:
                break;
        }

    }

    private addRefName(ref: Reference) {
        if (!ref) {
            return;
        }

        if (ref.name) {
            this.referenceNameSet.add(ref.name);
        }

        if (ref.unresolvedName) {
            this.referenceNameSet.add(ref.unresolvedName);
        }
    }

}

/**
 * Ensures that there are no variable and parameter symbols with same name
 * and excludes inbuilt vars
 */
class UniqueSymbolCollection {

    private _symbols: PhpSymbol[];
    private _varMap: { [index: string]: boolean };
    private static _inbuilt = {
        '$GLOBALS': true,
        '$_SERVER': true,
        '$_GET': true,
        '$_POST': true,
        '$_FILES': true,
        '$_REQUEST': true,
        '$_SESSION': true,
        '$_ENV': true,
        '$_COOKIE': true,
        '$php_errormsg': true,
        '$HTTP_RAW_POST_DATA': true,
        '$http_response_header': true,
        '$argc': true,
        '$argv': true,
        '$this': true
    };

    constructor() {
        this._symbols = [];
        this._varMap = Object.assign({}, UniqueSymbolCollection._inbuilt);
    }

    get length() {
        return this._symbols.length;
    }

    push(s: PhpSymbol) {
        if (s.kind & (SymbolKind.Parameter | SymbolKind.Variable)) {
            if (this._varMap[s.name] === undefined) {
                this._varMap[s.name] = true;
                this._symbols.push(s);
            }
        } else {
            this._symbols.push(s);
        }
    }

    pushMany(symbols: PhpSymbol[]) {
        for (let n = 0, l = symbols.length; n < l; ++n) {
            this.push(symbols[n]);
        }
    }

    toArray() {
        return this._symbols;
    }
}

interface SymbolTransformer extends NodeTransformer {
    symbol: PhpSymbol;
}

interface RangeTransformer extends NodeTransformer {
    range: PackedRange;
}

interface NameTransformer extends NodeTransformer {
    name: string;
    unresolvedName: string;
}

interface TextTransformer extends NodeTransformer {
    text: string;
}

interface SymbolsTransformer extends NodeTransformer {
    symbols: PhpSymbol[];
}

interface ReferenceTransformer extends NodeTransformer {
    reference: Reference;
}

class FileTransform implements SymbolTransformer {

    private _children: UniqueSymbolCollection;
    private _symbol: PhpSymbol;

    constructor(uri: string, location: PackedLocation) {
        this._symbol = PhpSymbol.create(SymbolKind.File, uri, location);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        let s = (<SymbolTransformer>transform).symbol;
        if (s) {
            this._children.push(s);
            return;
        }

        let symbols = (<SymbolsTransformer>transform).symbols;
        if (symbols) {
            this._children.pushMany(symbols);
        }

    }

    get symbol() {
        this._symbol.children = this._children.toArray();
        return this._symbol;
    }

}

class MemberAccessExpressionTransform implements NodeTransformer {

    constructor(
        public phraseType: PhraseType,
        public symbolKind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {

        switch (transformer.phraseType) {
            case PhraseType.ScopedMemberName:
            case PhraseType.MemberName:
                {
                    const reference = (<ReferenceTransformer>transformer).reference;
                    reference.kind = this.symbolKind;
                    if (this.symbolKind === SymbolKind.Property && reference.name && reference.name[0] !== '$') {
                        reference.name = '$' + reference.name;
                    }
                }
                break;

            default:
                break;
        }

    }

}

class MemberNameTransform implements ReferenceTransformer {

    phraseType = PhraseType.MemberName;
    reference: Reference;

    constructor(public node: Phrase, loc: PackedLocation) {
        this.reference = (<ReferencePhrase>node).reference = Reference.create(SymbolKind.None, '', loc.range);
    }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.Name) {
            this.reference.name = (<TokenTransform>transformer).text;
        }
    }

}

class ScopedMemberNameTransform implements ReferenceTransformer {

    phraseType = PhraseType.ScopedMemberName;
    reference: Reference;

    constructor(public node: Phrase, loc: PackedLocation) {
        this.reference = (<ReferencePhrase>node).reference = Reference.create(SymbolKind.None, '', loc.range);
    }

    push(transformer: NodeTransformer) {
        if (
            transformer.tokenType === TokenType.VariableName ||
            transformer.phraseType === PhraseType.Identifier
        ) {
            this.reference.name = (<TextTransformer>transformer).text;
        }
    }

}

class DelimiteredListTransform implements NodeTransformer {

    transforms: NodeTransformer[];

    constructor(public phraseType: PhraseType) {
        this.transforms = [];
    }

    push(transform: NodeTransformer) {
        this.transforms.push(transform);
    }

}

class TokenTransform implements TextTransformer {

    constructor(public tokenType: TokenType, public text: string, public location: PackedLocation) { }
    push(transform: NodeTransformer) { }

}

class NamespaceNameTransformer implements TextTransformer, ReferenceTransformer {

    phraseType = PhraseType.NamespaceName;
    text = '';
    reference: Reference;

    constructor(public node: Phrase, public range: PackedRange) {
        this.reference = (<ReferencePhrase>this.node).reference = Reference.create(SymbolKind.Class, '', range);
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            if (this.text) {
                this.text += '\\' + (<TokenTransform>transform).text;
            } else {
                this.text = (<TokenTransform>transform).text;
            }
            this.reference.name = this.text;
        }
    }

}

class QualifiedNameTransform implements NameTransformer {

    phraseType = PhraseType.QualifiedName;
    name = '';
    unresolvedName = '';

    constructor(
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.unresolvedName = (<NamespaceNameTransformer>transformer).text;
            this.name = this.nameResolver.resolveNotFullyQualified(this.unresolvedName, this.kind);
            const ref = (<NamespaceNameTransformer>transformer).reference;
            ref.name = this.name;
            ref.kind = this.kind;

            if (
                (this.kind === SymbolKind.Function || this.kind === SymbolKind.Constant) &&
                this.name !== this.unresolvedName
            ) {
                ref.unresolvedName = this.unresolvedName;
            }

        }
    }

}

class RelativeQualifiedNameTransform implements NameTransformer {

    phraseType = PhraseType.RelativeQualifiedName;
    name = '';
    unresolvedName = '';
    constructor(
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.unresolvedName = (<NamespaceNameTransformer>transformer).text;
            this.name = this.nameResolver.resolveRelative(this.unresolvedName);
            const ref = (<NamespaceNameTransformer>transformer).reference;
            ref.name = this.name;
            ref.kind = this.kind;
        }
    }

}

class FullyQualifiedNameTransform implements NameTransformer {

    phraseType = PhraseType.FullyQualifiedName;
    name = '';
    unresolvedName = '';

    constructor(private kind: SymbolKind) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.name = this.unresolvedName = (<NamespaceNameTransformer>transformer).text;
            const ref = (<NamespaceNameTransformer>transformer).reference;
            ref.kind = this.kind;
        }
    }

}

class CatchClauseVariableNameTransform implements SymbolTransformer {
    tokenType = TokenType.VariableName;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(name: string, location: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Variable, name, location);
        this.reference = Reference.create(SymbolKind.Class, name, location.range);
    }
    push(transform: NodeTransformer) { }
}

class ParameterDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.ParameterDeclaration;
    symbol: PhpSymbol;
    reference:Reference;

    constructor(
        public node: Phrase, 
        private location: PackedLocation, 
        private doc: PhpDoc, 
        private docLocation: PackedLocation, 
        private nameResolver: NameResolver
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Parameter, '', location);
        this.reference = Reference.create(SymbolKind.Parameter, '', location.range);
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.TypeDeclaration) {
            this.symbol.type = (<TypeDeclarationTransform>transform).type;
            SymbolReader.assignTypeToReference(this.symbol.type, (<ReferencePhrase>this.node).reference);
        } else if (transform.tokenType === TokenType.Ampersand) {
            this.symbol.modifiers |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenType.Ellipsis) {
            this.symbol.modifiers |= SymbolModifier.Variadic;
        } else if (transform.tokenType === TokenType.VariableName) {
            this.symbol.name = this.reference.name = (<TokenTransform>transform).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            SymbolReader.assignTypeToReference(this.symbol.type, (<ReferencePhrase>this.node).reference);
        } else {
            this.symbol.value = (<TextTransformer>transform).text;
        }
    }

}

class DefineFunctionCallExpressionTransform implements SymbolTransformer {

    phraseType = PhraseType.FunctionCallExpression;
    symbol: PhpSymbol;
    reference:Reference
    constructor(
        public node: Phrase, 
        private location: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Constant, '', this.location);
        this.reference = Reference.create(SymbolKind.Constant, '', this.location.range);
        (<ReferencePhrase>node).reference = this.reference;
     }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.ArgumentExpressionList) {

            let arg1: TextTransformer, arg2: TextTransformer;
            [arg1, arg2] = (<DelimiteredListTransform>transform).transforms as TextTransformer[];

            if (arg1 && arg1.tokenType === TokenType.StringLiteral) {
                let constName = arg1.text.slice(1, -1); //remove quotes
                if (constName && constName[0] === '\\') {
                    constName = constName.slice(1);
                }
                this.symbol.name = this.reference.name = constName;
                this.reference.range = (<TokenTransform>arg1).location.range;
            }

            //this could be an array or scalar expression too
            //could resolve scalar expression in type pass to a value and type
            //but array may be too large to add as value here
            if (
                arg2 &&
                (
                    arg2.tokenType === TokenType.FloatingLiteral ||
                    arg2.tokenType === TokenType.IntegerLiteral ||
                    arg2.tokenType === TokenType.StringLiteral
                )
            ) {
                this.symbol.value = arg2.text;
                this.symbol.type = SymbolReader.tokenTypeToPhpType(arg2.tokenType);
                this.reference.type = this.symbol.type;
            }

        }
    }

}

class SimpleVariableTransform implements SymbolTransformer {

    phraseType = PhraseType.SimpleVariable;
    symbol: PhpSymbol;
    /**
     * dynamic variables dont get a reference
     */
    reference: Reference;

    constructor(public node: Phrase, private location: PackedLocation) { }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.VariableName) {
            this.symbol = PhpSymbol.create(SymbolKind.Variable, (<TokenTransform>transform).text, this.location);
            this.reference = Reference.create(SymbolKind.Variable, this.symbol.name, this.location.range);
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class AnonymousClassDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.AnonymousClassDeclaration;
    symbol: PhpSymbol;

    constructor(location: PackedLocation, name: string) {
        this.symbol = PhpSymbol.create(SymbolKind.Class, name, location);
        this.symbol.modifiers = SymbolModifier.Anonymous;
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.AnonymousClassDeclarationHeader) {
            if ((<AnonymousClassDeclarationHeaderTransform>transform).base) {
                this.symbol.associated.push((<AnonymousClassDeclarationHeaderTransform>transform).base);
            }
            Array.prototype.push.apply(this.symbol.associated, (<AnonymousClassDeclarationHeaderTransform>transform).interfaces);
        } else if (transform.phraseType === PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransform>transform).declarations, this.symbol.name))
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransform>transform).useTraits);
        }
    }

}

class TypeDeclarationBodyTransform implements NodeTransformer {

    declarations: PhpSymbol[];
    useTraits: PhpSymbol[];

    constructor(public phraseType: PhraseType) {
        this.declarations = [];
        this.useTraits = [];
    }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseType.ClassConstDeclaration:
            case PhraseType.PropertyDeclaration:
                Array.prototype.push.apply(this.declarations, (<FieldDeclarationTransform>transform).symbols);
                break;

            case PhraseType.MethodDeclaration:
                this.declarations.push((<MethodDeclarationTransform>transform).symbol);
                break;

            case PhraseType.TraitUseClause:
                Array.prototype.push.apply(this.useTraits, (<TraitUseClauseTransform>transform).symbols);
                break;

            default:
                break;

        }
    }

}

class AnonymousClassDeclarationHeaderTransform implements NodeTransformer {

    phraseType = PhraseType.AnonymousClassDeclarationHeader;
    base: PhpSymbol;
    interfaces: PhpSymbol[];

    constructor() {
        this.interfaces = [];
    }

    push(transform: NodeTransformer) {

        if (transform.phraseType === PhraseType.ClassBaseClause) {
            this.base = (<ClassBaseClauseTransform>transform).symbol;
        } else if (transform.phraseType === PhraseType.ClassInterfaceClause) {
            this.interfaces = (<ClassInterfaceClauseTransformer>transform).symbols;
        }

    }

}

class AnonymousFunctionCreationExpressionTransform implements SymbolTransformer {

    phraseType = PhraseType.AnonymousFunctionCreationExpression;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(location: PackedLocation, name: string) {
        this._symbol = PhpSymbol.create(SymbolKind.Function, name, location);
        this._symbol.modifiers = SymbolModifier.Anonymous;
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.AnonymousFunctionHeader) {
            this._symbol.modifiers |= (<AnonymousFunctionHeaderTransform>transform).modifier;
            this._children.pushMany((<AnonymousFunctionHeaderTransform>transform).parameters);
            this._children.pushMany((<AnonymousFunctionHeaderTransform>transform).uses);
            this._symbol.type = (<AnonymousFunctionHeaderTransform>transform).returnType;
        } else if (transform.phraseType === PhraseType.FunctionDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransform>transform).symbols);
        }
    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class AnonymousFunctionHeaderTransform implements NodeTransformer {

    phraseType = PhraseType.AnonymousFunctionHeader;
    modifier = SymbolModifier.None;
    parameters: PhpSymbol[];
    uses: PhpSymbol[];
    returnType = '';

    constructor() {
        this.parameters = [];
        this.uses = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Ampersand) {
            this.modifier |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenType.Static) {
            this.modifier |= SymbolModifier.Static;
        } else if (transform.phraseType === PhraseType.ParameterDeclarationList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as SymbolTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.parameters.push(transforms[n].symbol);
            }
        } else if (transform.phraseType === PhraseType.AnonymousFunctionUseClause) {
            let symbols = (<AnonymousFunctionUseClauseTransform>transform).symbols;
            for (let n = 0; n < symbols.length; ++n) {
                this.uses.push(symbols[n]);
            }
        } else if (transform.phraseType === PhraseType.ReturnType) {
            this.returnType = (<ReturnTypeTransform>transform).type;
        }
    }

}

class FunctionDeclarationBodyTransform implements SymbolsTransformer {

    private _value: UniqueSymbolCollection;

    constructor(public phraseType: PhraseType) {
        this._value = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseType.SimpleVariable:
            case PhraseType.AnonymousFunctionCreationExpression:
            case PhraseType.AnonymousClassDeclaration:
            case PhraseType.FunctionCallExpression: //define    
                this._value.push((<SymbolTransformer>transform).symbol);
                break;

            case undefined:
                //catch clause vars
                if (transform instanceof CatchClauseVariableNameTransform) {
                    this._value.push(transform.symbol);
                }
                break;

            default:
                break;
        }

    }

    get symbols() {
        return this._value.toArray();
    }

}

class AnonymousFunctionUseClauseTransform implements SymbolsTransformer {

    phraseType = PhraseType.AnonymousFunctionUseClause;
    symbols: PhpSymbol[];

    constructor() {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.ClosureUseList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as SymbolTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(transforms[n].symbol);
            }
        }
    }

}

class AnonymousFunctionUseVariableTransform implements SymbolTransformer {

    phraseType = PhraseType.AnonymousFunctionUseVariable;
    symbol: PhpSymbol;

    constructor(public node: Phrase, public location: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Variable, '', location);
        this.symbol.modifiers = SymbolModifier.Use;
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.VariableName) {
            this.symbol.name = (<TokenTransform>transform).text;
            (<ReferencePhrase>this.node).reference = Reference.create(SymbolKind.Variable, this.symbol.name, this.location.range);
        } else if (transform.tokenType === TokenType.Ampersand) {
            this.symbol.modifiers |= SymbolModifier.Reference;
        }
    }

}

class InterfaceDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.InterfaceDeclaration;
    symbol: PhpSymbol;

    constructor(public nameResolver: NameResolver, location: PackedLocation, doc: PhpDoc, docLocation: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Interface, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.InterfaceDeclarationHeader) {
            this.symbol.name = this.nameResolver.resolveRelative((<InterfaceDeclarationHeaderTransform>transform).name);
            this.symbol.associated = (<InterfaceDeclarationHeaderTransform>transform).extends;
        } else if (transform.phraseType === PhraseType.InterfaceDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransform>transform).declarations, this.symbol.name));
        }
    }

}

class ConstElementTransformer implements SymbolTransformer {

    phraseType = PhraseType.ConstElement;
    symbol: PhpSymbol;
    reference:Reference;

    constructor(
        public node: Phrase,
        public nameResolver: NameResolver,
        private location: PackedLocation,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Constant, '', location);
        this.symbol.scope = this.nameResolver.namespaceName;
        this.reference = Reference.create(SymbolKind.Constant, '', location.range);
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenType.Name) {
            this.symbol.name = this.nameResolver.resolveRelative((<TokenTransform>transformer).text);
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            this.reference.name = this.symbol.name;
            this.reference.range = (<TokenTransform>transformer).location.range;
            SymbolReader.assignTypeToReference(this.symbol.type, <Reference>(<ReferencePhrase>this.node).reference);
        } else if (
            transformer.tokenType === TokenType.StringLiteral ||
            transformer.tokenType === TokenType.IntegerLiteral ||
            transformer.tokenType === TokenType.FloatingLiteral
        ) {
            //could also be any scalar expression or array
            //handle in types pass ?
            this.symbol.value = (<TextTransformer>transformer).text;
            this.symbol.type = SymbolReader.tokenTypeToPhpType(transformer.tokenType);
            SymbolReader.assignTypeToReference(this.symbol.type, <Reference>(<ReferencePhrase>this.node).reference);
        }

    }

}

class TraitDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.TraitDeclaration;
    symbol: PhpSymbol;

    constructor(public nameResolver: NameResolver, location: PackedLocation, doc: PhpDoc, docLocation: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Trait, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.TraitDeclarationHeader) {
            this.symbol.name = this.nameResolver.resolveRelative((<TraitDeclarationHeaderTransform>transform).name);
        } else if (transform.phraseType === PhraseType.TraitDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransform>transform).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransform>transform).useTraits);
        }
    }

}

class TraitDeclarationHeaderTransform implements NodeTransformer {
    phraseType = PhraseType.TraitDeclarationHeader;
    name = '';
    reference:Reference;

    constructor(public node: Phrase, public nameResolver: NameResolver) { }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            this.name = (<TokenTransform>transform).text;
            this.reference = Reference.create(
                SymbolKind.Trait,
                this.nameResolver.resolveRelative(this.name),
                (<TokenTransform>transform).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class InterfaceBaseClauseTransform implements SymbolsTransformer {
    phraseType = PhraseType.InterfaceBaseClause;
    symbols: PhpSymbol[];

    constructor() {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.QualifiedNameList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as NameTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(PhpSymbol.create(SymbolKind.Interface, transforms[n].name));
            }
        }
    }

}

class InterfaceDeclarationHeaderTransform implements NodeTransformer {
    phraseType = PhraseType.InterfaceDeclarationHeader;
    name = '';
    extends: PhpSymbol[];
    reference:Reference;

    constructor(public node: Phrase, public nameResolver: NameResolver) {
        this.extends = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            this.name = (<TokenTransform>transform).text;
            this.reference = Reference.create(
                SymbolKind.Interface,
                this.nameResolver.resolveRelative(this.name),
                (<TokenTransform>transform).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transform.phraseType === PhraseType.InterfaceBaseClause) {
            this.extends = (<InterfaceBaseClauseTransform>transform).symbols;
        }
    }

}

class TraitUseClauseTransform implements SymbolsTransformer {

    phraseType = PhraseType.TraitUseClause;
    symbols: PhpSymbol[];

    constructor() {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.QualifiedNameList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as NameTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(PhpSymbol.create(SymbolKind.Trait, transforms[n].name));
            }
        }
    }

}

class ClassInterfaceClauseTransformer implements SymbolsTransformer {
    phraseType = PhraseType.ClassInterfaceClause;
    symbols: PhpSymbol[];

    constructor() {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.QualifiedNameList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as NameTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.symbols.push(PhpSymbol.create(SymbolKind.Interface, transforms[n].name));
            }
        }
    }
}

class NamespaceDefinitionTransform implements SymbolTransformer {

    phraseType = PhraseType.NamespaceDefinition;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(location: PackedLocation) {
        this._symbol = PhpSymbol.create(SymbolKind.Namespace, '', location);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.NamespaceName) {
            this._symbol.name = (<NamespaceNameTransformer>transform).text;
        } else {
            let s = (<SymbolTransformer>transform).symbol;
            if (s) {
                this._children.push(s);
                return;
            }

            let symbols = (<SymbolsTransformer>transform).symbols;
            if (symbols) {
                this._children.pushMany(symbols);
            }
        }
    }

    get symbol() {
        if (this._children.length > 0) {
            this._symbol.children = this._children.toArray();
        }

        return this._symbol;
    }
}

class ClassDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.ClassDeclaration;
    symbol: PhpSymbol;

    constructor(public nameResolver: NameResolver, location: PackedLocation, doc: PhpDoc, docLocation: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Class, '', location);
        this.symbol.children = [];
        this.symbol.associated = [];
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
    }

    push(transform: NodeTransformer) {

        if (transform instanceof ClassDeclarationHeaderTransform) {
            this.symbol.modifiers = transform.modifier;
            this.symbol.name = this.nameResolver.resolveRelative(transform.name);
            if (transform.extends) {
                this.symbol.associated.push(transform.extends);
            }
            Array.prototype.push.apply(this.symbol.associated, transform.implements);
        } else if (transform.phraseType === PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransform>transform).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransform>transform).useTraits);
        }

    }

}

class ClassDeclarationHeaderTransform implements NodeTransformer {

    phraseType = PhraseType.ClassDeclarationHeader;
    modifier = SymbolModifier.None;
    name = '';
    extends: PhpSymbol;
    implements: PhpSymbol[];
    reference:Reference;

    constructor(public node: Phrase, public nameResolver: NameResolver) {
        this.implements = [];
    }

    push(transform: NodeTransformer) {

        if (transform.tokenType === TokenType.Abstract) {
            this.modifier = SymbolModifier.Abstract;
        } else if (transform.tokenType === TokenType.Final) {
            this.modifier = SymbolModifier.Final;
        } else if (transform.tokenType === TokenType.Name) {
            this.name = (<TokenTransform>transform).text;
            this.reference = Reference.create(
                SymbolKind.Class,
                this.nameResolver.resolveRelative(this.name),
                (<TokenTransform>transform).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transform.phraseType === PhraseType.ClassBaseClause) {
            this.extends = (<ClassBaseClauseTransform>transform).symbol;
        } else if (transform.phraseType === PhraseType.ClassInterfaceClause) {
            this.implements = (<ClassInterfaceClauseTransformer>transform).symbols;
        }

    }

}

class ClassBaseClauseTransform implements SymbolTransformer {

    phraseType = PhraseType.ClassBaseClause;
    symbol: PhpSymbol;

    constructor() {
        this.symbol = PhpSymbol.create(SymbolKind.Class, '');
    }

    push(transform: NodeTransformer) {
        switch (transform.phraseType) {
            case PhraseType.FullyQualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.QualifiedName:
                this.symbol.name = (<NameTransformer>transform).name;
                break;

            default:
                break;
        }
    }

}

class MemberModifierListTransform implements NodeTransformer {

    phraseType = PhraseType.MemberModifierList;
    modifiers = SymbolModifier.None;

    push(transform: NodeTransformer) {
        switch (transform.tokenType) {
            case TokenType.Public:
                this.modifiers |= SymbolModifier.Public;
                break;
            case TokenType.Protected:
                this.modifiers |= SymbolModifier.Protected;
                break;
            case TokenType.Private:
                this.modifiers |= SymbolModifier.Private;
                break;
            case TokenType.Abstract:
                this.modifiers |= SymbolModifier.Abstract;
                break;
            case TokenType.Final:
                this.modifiers |= SymbolModifier.Final;
                break;
            case TokenType.Static:
                this.modifiers |= SymbolModifier.Static;
                break;
            default:
                break;
        }
    }

}

class ClassConstantElementTransform implements SymbolTransformer {

    phraseType = PhraseType.ClassConstElement;
    symbol: PhpSymbol;
    private _docLocation: PackedLocation;
    private _doc: PhpDoc;

    constructor(
        public node: Phrase,
        public nameResolver: NameResolver,
        location: PackedLocation,
        doc: PhpDoc,
        docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.ClassConstant, '', location);
        this.symbol.modifiers = SymbolModifier.Static;
        this._doc = doc;
        this._docLocation = docLocation;
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.Identifier) {
            this.symbol.name = (<IdentifierTransform>transformer).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this.nameResolver);
            (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.ClassConstant,
                this.symbol.name,
                (<IdentifierTransform>transformer).location.range
            );
        } else if (
            transformer.tokenType === TokenType.StringLiteral ||
            transformer.tokenType === TokenType.IntegerLiteral ||
            transformer.tokenType === TokenType.FloatingLiteral
        ) {
            //could also be any scalar expression or array
            //handle in types pass ?
            this.symbol.value = (<TextTransformer>transformer).text;
            this.symbol.type = SymbolReader.tokenTypeToPhpType(transformer.tokenType);
            SymbolReader.assignTypeToReference(this.symbol.type, <Reference>(<ReferencePhrase>this.node).reference);
        }
    }

}

class MethodDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.MethodDeclaration;
    private _children: UniqueSymbolCollection;
    private _symbol: PhpSymbol;

    constructor(public nameResolver: NameResolver, location: PackedLocation, doc: PhpDoc, docLocation: PackedLocation) {
        this._symbol = PhpSymbol.create(SymbolKind.Method, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, doc, docLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        if (transform instanceof MethodDeclarationHeaderTransform) {
            this._symbol.modifiers = transform.modifiers;
            this._symbol.name = transform.name;
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        } else if (transform.phraseType === PhraseType.MethodDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransform>transform).symbols);
        }

    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class ReturnTypeTransform implements NodeTransformer {

    phraseType = PhraseType.ReturnType;
    type = '';

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.TypeDeclaration) {
            this.type = (<TypeDeclarationTransform>transform).type;
        }
    }

}

class TypeDeclarationTransform implements NodeTransformer {

    phraseType = PhraseType.TypeDeclaration;
    type = '';
    private static _scalarTypes: { [name: string]: number } = { 'int': 1, 'string': 1, 'bool': 1, 'float': 1, 'iterable': 1 };

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseType.FullyQualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.QualifiedName:
                if (TypeDeclarationTransform._scalarTypes[(<NameTransformer>transform).unresolvedName.toLowerCase()] === 1) {
                    this.type = (<NameTransformer>transform).unresolvedName;
                } else {
                    this.type = (<NameTransformer>transform).name;
                }
                break;

            case undefined:
                if (transform.tokenType === TokenType.Callable || transform.tokenType === TokenType.Array) {
                    this.type = (<TokenTransform>transform).text;
                }
                break;

            default:
                break;
        }

    }

}

class IdentifierTransform implements TextTransformer {

    phraseType = PhraseType.Identifier;
    text = '';
    push(transform: NodeTransformer) {
        this.text = (<TokenTransform>transform).text;
    }

}

class MethodDeclarationHeaderTransform implements NodeTransformer {

    phraseType = PhraseType.MethodDeclarationHeader;
    modifiers = SymbolModifier.Public;
    name = '';
    parameters: PhpSymbol[];
    returnType = '';

    constructor(public node: Phrase, public nameResolver: NameResolver) {
        this.parameters = [];
    }

    push(transform: NodeTransformer) {
        switch (transform.phraseType) {
            case PhraseType.MemberModifierList:
                this.modifiers = (<MemberModifierListTransform>transform).modifiers;
                if (!(this.modifiers & (SymbolModifier.Public | SymbolModifier.Protected | SymbolModifier.Private))) {
                    this.modifiers |= SymbolModifier.Public;
                }
                break;

            case PhraseType.Identifier:
                this.name = (<IdentifierTransform>transform).text;
                (<ReferencePhrase>this.node).reference = Reference.create(
                    SymbolKind.Method,
                    this.name,
                    (<IdentifierTransform>transform).location.range
                );
                break;

            case PhraseType.ParameterDeclarationList:
                {
                    let transforms = (<DelimiteredListTransform>transform).transforms as ParameterDeclarationTransform[];
                    for (let n = 0; n < transforms.length; ++n) {
                        this.parameters.push(transforms[n].symbol);
                    }
                }
                break;

            case PhraseType.ReturnType:
                this.returnType = (<TypeDeclarationTransform>transform).type;
                break;

            default:
                break;
        }
    }

}

class PropertyInitialiserTransformer implements NodeTransformer {

    phraseType = PhraseType.PropertyInitialiser;
    text = '';

    push(transform: NodeTransformer) {
        this.text = (<TextTransformer>transform).text;
    }

}

class PropertyElementTransformer implements SymbolTransformer {

    phraseType = PhraseType.PropertyElement;
    symbol: PhpSymbol;
    private _doc: PhpDoc;
    private _docLocation: PackedLocation;

    constructor(public node: Phrase, public nameResolver: NameResolver, location: PackedLocation, doc: PhpDoc, docLocation: PackedLocation) {
        this.symbol = PhpSymbol.create(SymbolKind.Property, '', location);
        this._doc = doc;
        this._docLocation = docLocation;
    }

    push(transform: NodeTransformer) {

        if (transform.tokenType === TokenType.VariableName) {
            this.symbol.name = (<TokenTransform>transform).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this._doc, this._docLocation, this.nameResolver);
            (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.Property,
                this.symbol.name,
                (<TokenTransform>transform).location.range
            );
        } else if (transform.phraseType === PhraseType.PropertyInitialiser) {
            //this.symbol.value = (<PropertyInitialiserTransformer>transform).text;
        }

    }

}

class FieldDeclarationTransform implements SymbolsTransformer {

    private _modifier = SymbolModifier.Public;
    symbols: PhpSymbol[];

    constructor(public phraseType: PhraseType) {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.MemberModifierList) {
            this._modifier = (<MemberModifierListTransform>transform).modifiers;
        } else if (
            transform.phraseType === PhraseType.PropertyElementList ||
            transform.phraseType === PhraseType.ClassConstElementList
        ) {
            let transforms = (<DelimiteredListTransform>transform).transforms as SymbolTransformer[];
            let s: PhpSymbol;
            for (let n = 0; n < transforms.length; ++n) {
                s = transforms[n].symbol;
                if (s) {
                    s.modifiers |= this._modifier;
                    this.symbols.push(s);
                }
            }
        }
    }

}

class FunctionDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.FunctionDeclaration;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(public nameResolver: NameResolver, location: PackedLocation, phpDoc: PhpDoc, phpDocLocation: PackedLocation) {
        this._symbol = PhpSymbol.create(SymbolKind.Function, '', location);
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, phpDoc, phpDocLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform instanceof FunctionDeclarationHeaderTransform) {
            this._symbol.name = this.nameResolver.resolveRelative(transform.name);
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        } else if (transform.phraseType === PhraseType.FunctionDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransform>transform).symbols);
        }
    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class FunctionDeclarationHeaderTransform implements NodeTransformer {

    phraseType = PhraseType.FunctionDeclarationHeader;
    name = '';
    parameters: PhpSymbol[];
    returnType = '';

    constructor(public node: Phrase, public nameResolver: NameResolver) {
        this.parameters = [];
    }

    push(transform: NodeTransformer) {

        if (transform.tokenType === TokenType.Name) {
            this.name = (<TokenTransform>transform).text;
            (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.Function,
                this.nameResolver.resolveRelative(this.name),
                (<TokenTransform>transform).location.range
            );
        } else if (transform.phraseType === PhraseType.ParameterDeclarationList) {
            let transforms = (<DelimiteredListTransform>transform).transforms as SymbolTransformer[];
            for (let n = 0; n < transforms.length; ++n) {
                this.parameters.push(transforms[n].symbol);
            }
        } else if (transform.phraseType === PhraseType.ReturnType) {
            this.returnType = (<ReturnTypeTransform>transform).type;
        }
    }
}

class DefaultNodeTransform implements TextTransformer {

    constructor(public phraseType: PhraseType, public text: string) { }
    push(transform: NodeTransformer) { }

}

export namespace SymbolReader {

    export function tokenTypeToPhpType(tokenType: TokenType) {
        switch (tokenType) {
            case TokenType.StringLiteral:
                return 'string';
            case TokenType.IntegerLiteral:
                return 'int';
            case TokenType.FloatingLiteral:
                return 'float';
            default:
                return '';
        }
    }

    export function assignTypeToReference(type: string, ref: Reference) {
        //@todo handle this better in cases where a doc block type hint may be more
        //specific than a type declaration eg array or object

        if (!ref.type) {
            ref.type = type;
        }
    }

    export function assignPhpDocInfoToSymbol(s: PhpSymbol, doc: PhpDoc, docLocation: PackedLocation, nameResolver: NameResolver) {

        if (!doc) {
            return s;
        }
        let tag: Tag;

        switch (s.kind) {
            case SymbolKind.Property:
            case SymbolKind.ClassConstant:
                tag = doc.findVarTag(s.name);
                if (tag) {
                    s.doc = PhpSymbolDoc.create(tag.description, TypeString.nameResolve(tag.typeString, nameResolver));
                }
                break;

            case SymbolKind.Method:
            case SymbolKind.Function:
                tag = doc.returnTag;
                s.doc = PhpSymbolDoc.create(doc.text);
                if (tag) {
                    s.doc.type = TypeString.nameResolve(tag.typeString, nameResolver);
                }
                break;

            case SymbolKind.Parameter:
                tag = doc.findParamTag(s.name);
                if (tag) {
                    s.doc = PhpSymbolDoc.create(tag.description, TypeString.nameResolve(tag.typeString, nameResolver));
                }
                break;

            case SymbolKind.Class:
            case SymbolKind.Trait:
            case SymbolKind.Interface:
                s.doc = PhpSymbolDoc.create(doc.text);
                if (!s.children) {
                    s.children = [];
                }
                Array.prototype.push.apply(s.children, phpDocMembers(doc, docLocation, nameResolver));
                break;

            default:
                break;

        }

        return s;

    }

    export function phpDocMembers(phpDoc: PhpDoc, phpDocLoc: PackedLocation, nameResolver: NameResolver) {

        let magic: Tag[] = phpDoc.propertyTags;
        let symbols: PhpSymbol[] = [];

        for (let n = 0, l = magic.length; n < l; ++n) {
            symbols.push(propertyTagToSymbol(magic[n], phpDocLoc, nameResolver));
        }

        magic = phpDoc.methodTags;
        for (let n = 0, l = magic.length; n < l; ++n) {
            symbols.push(methodTagToSymbol(magic[n], phpDocLoc, nameResolver));
        }

        return symbols;
    }

    function methodTagToSymbol(tag: Tag, phpDocLoc: PackedLocation, nameResolver: NameResolver) {

        let s = PhpSymbol.create(SymbolKind.Method, tag.name, phpDocLoc);
        s.modifiers = SymbolModifier.Magic | SymbolModifier.Public;
        s.doc = PhpSymbolDoc.create(tag.description, TypeString.nameResolve(tag.typeString, nameResolver));
        s.children = [];

        if (tag.isStatic) {
            s.modifiers |= SymbolModifier.Static;
        }

        if (!tag.parameters) {
            return s;
        }

        for (let n = 0, l = tag.parameters.length; n < l; ++n) {
            s.children.push(magicMethodParameterToSymbol(tag.parameters[n], phpDocLoc, nameResolver));
        }

        return s;
    }

    function magicMethodParameterToSymbol(p: MethodTagParam, phpDocLoc: PackedLocation, nameResolver: NameResolver) {

        let s = PhpSymbol.create(SymbolKind.Parameter, p.name, phpDocLoc);
        s.modifiers = SymbolModifier.Magic;
        s.doc = PhpSymbolDoc.create(undefined, TypeString.nameResolve(p.typeString, nameResolver));
        return s;

    }

    function propertyTagToSymbol(t: Tag, phpDocLoc: PackedLocation, nameResolver: NameResolver) {
        let s = PhpSymbol.create(SymbolKind.Property, t.name, phpDocLoc);
        s.modifiers = magicPropertyModifier(t) | SymbolModifier.Magic | SymbolModifier.Public;
        s.doc = PhpSymbolDoc.create(t.description, TypeString.nameResolve(t.typeString, nameResolver));
        return s;
    }

    function magicPropertyModifier(t: Tag) {
        switch (t.tagName) {
            case '@property-read':
                return SymbolModifier.ReadOnly;
            case '@property-write':
                return SymbolModifier.WriteOnly;
            default:
                return SymbolModifier.None;
        }
    }

    export function modifierListToSymbolModifier(phrase: Phrase) {

        if (!phrase) {
            return 0;
        }

        let flag = SymbolModifier.None;
        let tokens = phrase.children || [];

        for (let n = 0, l = tokens.length; n < l; ++n) {
            flag |= modifierTokenToSymbolModifier(<Token>tokens[n]);
        }

        return flag;
    }

    export function modifierTokenToSymbolModifier(t: Token) {
        switch (t.tokenType) {
            case TokenType.Public:
                return SymbolModifier.Public;
            case TokenType.Protected:
                return SymbolModifier.Protected;
            case TokenType.Private:
                return SymbolModifier.Private;
            case TokenType.Abstract:
                return SymbolModifier.Abstract;
            case TokenType.Final:
                return SymbolModifier.Final;
            case TokenType.Static:
                return SymbolModifier.Static;
            default:
                return SymbolModifier.None;
        }

    }

}

class NamespaceUseClauseListTransform implements SymbolsTransformer {

    symbols: PhpSymbol[];

    constructor(public phraseType: PhraseType) {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (
            transform.phraseType === PhraseType.NamespaceUseClause ||
            transform.phraseType === PhraseType.NamespaceUseGroupClause
        ) {
            this.symbols.push((<NamespaceUseClauseTransform>transform).symbol);
        }
    }

}

class NamespaceUseDeclarationTransform implements SymbolsTransformer {

    phraseType = PhraseType.NamespaceUseDeclaration;
    symbols: PhpSymbol[];
    private _kind = SymbolKind.Class;
    private _prefix = '';

    constructor() {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Const) {
            this._kind = SymbolKind.Constant;
        } else if (transform.tokenType === TokenType.Function) {
            this._kind = SymbolKind.Function;
        } else if (transform.phraseType === PhraseType.NamespaceName) {
            this._prefix = (<NamespaceNameTransformer>transform).text;
        } else if (transform.phraseType === PhraseType.NamespaceUseGroupClauseList) {
            this.symbols = (<NamespaceUseClauseListTransform>transform).symbols;
            let s: PhpSymbol;
            let prefix = this._prefix ? this._prefix + '\\' : '';
            for (let n = 0; n < this.symbols.length; ++n) {
                s = this.symbols[n];
                s.associated[0].name = prefix + s.associated[0].name;
                if (!s.kind) {
                    s.kind = s.associated[0].kind = this._kind;
                }
            }
        } else if (transform.phraseType === PhraseType.NamespaceUseClauseList) {
            this.symbols = (<NamespaceUseClauseListTransform>transform).symbols;
            let s: PhpSymbol;
            for (let n = 0; n < this.symbols.length; ++n) {
                s = this.symbols[n];
                s.kind = s.associated[0].kind = this._kind;
            }
        }
    }

}

class NamespaceUseClauseTransform implements NodeTransformer {

    symbol: PhpSymbol;
    references: Reference[];

    constructor(public phraseType: PhraseType, location: PackedLocation) {
        this.symbol = PhpSymbol.create(0, '', location);
        this.symbol.modifiers = SymbolModifier.Use;
        this.symbol.associated = [];
        this.references = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Function) {
            this.symbol.kind = SymbolKind.Function;
        } else if (transform.tokenType === TokenType.Const) {
            this.symbol.kind = SymbolKind.Constant;
        } else if (transform.phraseType === PhraseType.NamespaceName) {
            let text = (<NamespaceNameTransformer>transform).text;
            this.symbol.name = PhpSymbol.notFqn(text);
            this.symbol.associated.push(PhpSymbol.create(this.symbol.kind, text));

        } else if (transform.phraseType === PhraseType.NamespaceAliasingClause) {
            this.symbol.name = (<NamespaceAliasingClauseTransformer>transform).text;
            const ref = (<NamespaceAliasingClauseTransformer>transform).reference;
            ref.name = this.symbol.
        }
    }

}

class NamespaceAliasingClauseTransformer implements TextTransformer, ReferenceTransformer {

    phraseType = PhraseType.NamespaceAliasingClause;
    text = '';
    reference:Reference;

    constructor(public node:Phrase) { }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            this.text = (<TokenTransform>transform).text;
            this.reference = (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.Class,
                this.text,
                (<TokenTransform>transform).location.range
            );
            this.reference.unresolvedName = this.text;
        }
    }

}

