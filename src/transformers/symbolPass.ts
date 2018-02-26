/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { TreeVisitor, MultiVisitor, PackedLocation } from '../types';
import { ParsedDocument, NodeUtils } from '../parsedDocument';
import { Phrase, PhraseType } from '../parser/phrase';
import { Token, TokenType } from '../parser/lexer';
import { PhpDoc, PhpDocParser, Tag, MethodTagParam } from '../phpDoc';
import { PhpSymbol, SymbolKind, SymbolModifier, PhpSymbolDoc } from '../symbol';
import { NameResolver } from '../nameResolver';
import { TypeString } from '../typeString';
import { PackedRange } from '../types';
import * as util from '../util';
import { Reference } from '../reference';
import { NodeTransformer, ReferencePhrase, PhpDocPhrase } from './transformers';


const RESERVED_WORDS: { [name: string]: number } = {
    'int': 1,
    'string': 1,
    'bool': 1,
    'float': 1,
    'iterable': 1,
    'true': 1,
    'false': 1,
    'null': 1,
    'void': 1,
    'object': 1
};

/** 
 * First parse tree pass
 * 1. Add symbol reference objects to relevant nodes in tree and collect references
 * 2. Build symbol definition tree
 */
export class SymbolPass implements TreeVisitor<Phrase | Token> {

    lastPhpDoc: PhpDoc;
    lastPhpDocLocation: PackedLocation;
    references: Reference[];

    private _transformerStack: NodeTransformer[];
    private _lastTransformer: NodeTransformer;
    private _utils: NodeUtils;

    constructor(
        public document: ParsedDocument,
        public nameResolver: NameResolver
    ) {
        this._transformerStack = [];
        this.references = [];
    }

    get symbol() {
        return this._lastTransformer ? (<SymbolTransformer>this._lastTransformer).symbol : undefined;
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        let s: PhpSymbol;
        let parentNode = <Phrase>(spine.length ? spine[spine.length - 1] : { phraseType: PhraseType.Unknown, children: [] });
        let parentTransform = this._transformerStack[this._transformerStack.length - 1];

        switch ((<Phrase>node).phraseType) {

            case PhraseType.Error:
                return false;

            case PhraseType.TopStatementList:
                this._transformerStack.push(new FileTransform(node, this.document.uri, this._utils));
                break;

            case PhraseType.NamespaceDefinitionHeader:
                this._transformerStack.push(new NamespaceDefinitionHeaderTransformer(node));
                break;

            case PhraseType.NamespaceDefinition:
                {
                    const t = new NamespaceDefinitionTransformer(node, this._utils);
                    this._transformerStack.push(t);
                    this.nameResolver.namespace = t.symbol;
                }
                break;

            case PhraseType.NamespaceUseDeclaration:
                this._transformerStack.push(new NamespaceUseDeclarationTransformer(node));
                break;

            case PhraseType.NamespaceUseClause:
            case PhraseType.NamespaceUseGroupClause:
                {
                    const t = new NamespaceUseClauseTransformer(node, (<Phrase>node).phraseType, this._utils);
                    this._transformerStack.push(t);
                    this.nameResolver.rules.push(t.symbol);
                }
                break;

            case PhraseType.NamespaceAliasingClause:
                this._transformerStack.push(new NamespaceAliasingClauseTransformer(node));
                break;

            case PhraseType.ConstElement:
                this._transformerStack.push(
                    new ConstElementTransformer(node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    ));
                break;

            case PhraseType.FunctionDeclaration:
                this._transformerStack.push(new FunctionDeclarationTransform(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.FunctionDeclarationHeader:
                this._transformerStack.push(new FunctionDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseType.ParameterDeclaration:
                this._transformerStack.push(new ParameterDeclarationTransformer(
                    node, this._utils, this.lastPhpDoc, this.lastPhpDocLocation, this.nameResolver
                ));
                break;

            case PhraseType.TypeDeclaration:
                this._transformerStack.push(new TypeDeclarationTransformer(node));
                break;

            case PhraseType.FunctionDeclarationBody:
            case PhraseType.MethodDeclarationBody:
                this._transformerStack.push(new FunctionDeclarationBodyTransformer(node, (<Phrase>node).phraseType));
                break;

            case PhraseType.ClassDeclaration:
                {
                    let t = new ClassDeclarationTransformer(
                        node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.ClassDeclarationHeader:
                this._transformerStack.push(new ClassDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseType.ClassDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseType.ClassDeclarationBody));
                break;

            case PhraseType.InterfaceDeclaration:
                {
                    let t = new InterfaceDeclarationTransformer(
                        node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.InterfaceDeclarationHeader:
                this._transformerStack.push(new InterfaceDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseType.InterfaceDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseType.InterfaceDeclarationBody));
                break;

            case PhraseType.TraitDeclaration:
                this._transformerStack.push(new TraitDeclarationTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.TraitDeclarationHeader:
                this._transformerStack.push(new TraitDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseType.TraitDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseType.TraitDeclarationBody));
                break;

            case PhraseType.ClassConstDeclaration:
                this._transformerStack.push(
                    new FieldDeclarationTransformer(node, PhraseType.ClassConstDeclaration, PhraseType.ClassConstElement)
                );
                break;

            case PhraseType.ClassConstElement:
                this._transformerStack.push(new ClassConstantElementTransform(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.PropertyDeclaration:
                this._transformerStack.push(
                    new FieldDeclarationTransformer(node, PhraseType.PropertyDeclaration, PhraseType.PropertyElement)
                );
                break;

            case PhraseType.PropertyElement:
                this._transformerStack.push(new PropertyElementTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            /*
            case PhraseType.PropertyInitialiser:
                this._transformerStack.push(new PropertyInitialiserTransformer(node));
                break;
            */

            case PhraseType.TraitUseClause:
                this._transformerStack.push(new TraitUseClauseTransformer(node));
                break;

            case PhraseType.MethodDeclaration:
                this._transformerStack.push(new MethodDeclarationTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseType.MethodDeclarationHeader:
                this._transformerStack.push(new MethodDeclarationHeaderTransformer(node));
                break;

            case PhraseType.Identifier:
                if (parentNode.phraseType === PhraseType.MethodDeclarationHeader || parentNode.phraseType === PhraseType.ClassConstElement) {
                    this._transformerStack.push(new IdentifierTransformer(node));
                }
                break;

            case PhraseType.MemberModifierList:
                this._transformerStack.push(new MemberModifierListTransformer(node));
                break;

            case PhraseType.AnonymousClassDeclaration:
                {
                    let t = new AnonymousClassDeclarationTransformer(node, this._utils);
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseType.AnonymousClassDeclarationHeader:
                this._transformerStack.push(new AnonymousClassDeclarationHeaderTransformer(node));
                break;

            case PhraseType.AnonymousFunctionCreationExpression:
                this._transformerStack.push(
                    new AnonymousFunctionCreationExpressionTransformer(node, this._utils)
                );
                break;

            case PhraseType.AnonymousFunctionHeader:
                this._transformerStack.push(new AnonymousFunctionHeaderTransformer(node));
                break;

            case PhraseType.AnonymousFunctionUseVariable:
                this._transformerStack.push(new AnonymousFunctionUseVariableTransformer(node, this._utils));
                break;

            case PhraseType.SimpleVariable:
                this._transformerStack.push(new SimpleVariableTransformer(node, this._utils));
                break;

            case PhraseType.ScopedCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, PhraseType.ScopedCallExpression, SymbolKind.Method)
                );
                break;

            case PhraseType.ScopedPropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, PhraseType.ScopedPropertyAccessExpression, SymbolKind.Property)
                );
                break;

            case PhraseType.ClassConstantAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, PhraseType.ClassConstantAccessExpression, SymbolKind.ClassConstant)
                );
                break;

            case PhraseType.PropertyAccessExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, PhraseType.PropertyAccessExpression, SymbolKind.Property)
                );
                break;

            case PhraseType.MethodCallExpression:
                this._transformerStack.push(
                    new MemberAccessExpressionTransformer(node, PhraseType.MethodCallExpression, SymbolKind.Method)
                );
                break;

            case PhraseType.ScopedMemberName:
                this._transformerStack.push(new ScopedMemberNameTransformer(<Phrase>node, this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.MemberName:
                this._transformerStack.push(new MemberNameTransform(<Phrase>node, this.document.nodeHashedLocation(node)));
                break;

            case PhraseType.FunctionCallExpression:
                //define
                if ((<Phrase>node).children.length) {
                    const name = this.document.nodeText((<Phrase>node).children[0]).toLowerCase();
                    if (name === 'define' || name === '\\define') {
                        this._transformerStack.push(
                            new DefineFunctionCallExpressionTransformer(node, this.document.nodeHashedLocation(node))
                        );
                    }
                }
                break;

            case PhraseType.ArgumentExpressionList:
                if (parentNode.phraseType === PhraseType.FunctionCallExpression && parentTransform.node === parentNode) {
                    this._transformerStack.push(new DelimiteredListTransformer(node, PhraseType.ArgumentExpressionList));
                }
                break;

            case PhraseType.FullyQualifiedName:
                this._transformerStack.push(new FullyQualifiedNameTransformer(node, this._nameSymbolType(parentNode)));
                break;

            case PhraseType.RelativeQualifiedName:
                this._transformerStack.push(
                    new RelativeQualifiedNameTransformer(node, this.nameResolver, this._nameSymbolType(parentNode))
                );
                break;

            case PhraseType.QualifiedName:
                this._transformerStack.push(
                    new QualifiedNameTransformer(node, this.nameResolver, this._nameSymbolType(parentNode))
                );
                break;

            case PhraseType.NamespaceName:
                this._transformerStack.push(new NamespaceNameTransformer(node, this._utils));
                break;

            case PhraseType.DocBlock:
                this._transformerStack.push(new DocBlockTransformer(node));
                break;

            case undefined:
                //tokens
                if ((<Token>node).tokenType === TokenType.DocumentComment && parentTransform) {

                    parentTransform.push(new TokenTransformer(<Token>node, this._utils));

                } else if (
                    (<Token>node).tokenType === TokenType.CloseBrace || 
                    (<Token>node).tokenType === TokenType.OpenBrace
                ) {

                    this.lastPhpDoc = null;
                    this.lastPhpDocLocation = null;

                } else if (
                    (<Token>node).tokenType === TokenType.VariableName &&
                    parentTransform &&
                    parentNode &&
                    parentNode.phraseType === PhraseType.CatchClause
                ) {
                    //catch clause vars
                    parentTransform.push(new CatchClauseVariableNameTransformer(node, this._utils));

                } else if (
                    parentTransform &&
                    parentTransform.node === parentNode &&
                    (<Token>node).tokenType > TokenType.EndOfFile &&
                    (<Token>node).tokenType < TokenType.Equals
                ) {
                    parentTransform.push(new TokenTransformer(<Token>node, this._utils));
                }
                break;

            default:
                if (parentNode.phraseType === PhraseType.ArgumentExpressionList) {
                    const grandParentNode = spine.length > 1 ? spine[spine.length - 2] : undefined;
                    if (parentTransform.node === grandParentNode) {
                        //define func call expr args
                        this._transformerStack.push(new DefaultNodeTransformer(node, (<Phrase>node).phraseType, this._utils));
                    }
                }
                break;
        }

        return true;

    }

    postorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        const transformer = this._transformerStack[this._transformerStack.length - 1];
        if (transformer.node !== node) {
            //a transformer wasnt pushed to stack for this node
            return;
        }

        const ref = (<ReferencePhrase>node).reference;
        if(ref) {
            this.references.push(ref);
        }

        if(transformer.phraseType === PhraseType.DocBlock) {
            this.lastPhpDoc = (<DocBlockTransformer>transformer).doc
            this.lastPhpDocLocation = (<DocBlockTransformer>transformer).location;
        }

        this._transformerStack.pop();
        this._lastTransformer = transformer;
        if (this._transformerStack.length > 0) {
            //push transformer to ancestor transformer
            this._transformerStack[this._transformerStack.length - 1].push(transformer);
        }

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

class DocBlockTransformer implements NodeTransformer {

    phraseType = PhraseType.DocBlock;
    doc:PhpDoc;
    location:PackedLocation;

    constructor(public node:Phrase|Token) { }

    push(transformer:NodeTransformer) { 
        if(transformer.tokenType === TokenType.DocumentComment) {
            this.doc = (<PhpDocPhrase>this.node).doc = PhpDocParser.parse((<TokenTransformer>transformer).text);
            this.location = (<TokenTransformer>transformer).location;
        }
    }
}

class FileTransform implements SymbolTransformer {

    private _children: UniqueSymbolCollection;
    private _symbol: PhpSymbol;

    constructor(public node: Phrase | Token, uri: string, nodeUtils: NodeUtils) {
        this._symbol = PhpSymbol.create(SymbolKind.File, uri, nodeUtils.nodePackedLocation(this.node));
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

class MemberAccessExpressionTransformer implements NodeTransformer {

    constructor(
        public node: Phrase | Token,
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

    constructor(public node: Phrase, private utils:NodeUtils) { }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.Name) {
            this.reference = Reference.create(SymbolKind.None, (<TokenTransformer>transformer).text, this.utils.nodePackedRange(this.node));
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class ScopedMemberNameTransformer implements ReferenceTransformer {

    phraseType = PhraseType.ScopedMemberName;
    reference: Reference;

    constructor(public node: Phrase, private utils: NodeUtils) { }

    push(transformer: NodeTransformer) {
        if (
            transformer.tokenType === TokenType.VariableName ||
            transformer.phraseType === PhraseType.Identifier
        ) {
            this.reference = Reference.create(SymbolKind.None, (<TextTransformer>transformer).text, this.utils.nodePackedLocation(this.node).range);
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class DelimiteredListTransformer implements NodeTransformer {

    transforms: NodeTransformer[];

    constructor(public node:Phrase|Token, public phraseType: PhraseType) {
        this.transforms = [];
    }

    push(transform: NodeTransformer) {
        this.transforms.push(transform);
    }

}

class TokenTransformer implements TextTransformer {

    tokenType: TokenType;

    constructor(
        public node: Phrase | Token,
        private utils: NodeUtils
    ) {
        this.tokenType = (<Token>node).tokenType;
    }

    get text() {
        return this.utils.nodeText(this.node);
    }

    get location() {
        return this.utils.nodePackedLocation(this.node);
    }

    push(transformer: NodeTransformer) { }

}

class NamespaceNameTransformer implements TextTransformer, ReferenceTransformer {

    phraseType = PhraseType.NamespaceName;
    text = '';
    reference: Reference;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.reference = Reference.create(SymbolKind.Class, '', utils.nodePackedRange(node));
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            if (this.text) {
                this.text += '\\' + (<TokenTransformer>transform).text;
            } else {
                this.text = (<TokenTransformer>transform).text;
            }
            this.reference.name = this.text;
        }
    }

}

class QualifiedNameTransformer implements ReferenceTransformer {

    phraseType = PhraseType.QualifiedName;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.reference = (<NamespaceNameTransformer>transformer).reference;
            this.reference.kind = this.kind;
            const unresolvedName = this.reference.name;
            const lcUnresolvedName = unresolvedName.toLowerCase();

            if (RESERVED_WORDS[lcUnresolvedName]) {
                return;
            }

            this.reference.name = this.nameResolver.resolveNotFullyQualified(unresolvedName, this.kind);

            if (
                (this.kind === SymbolKind.Function || this.kind === SymbolKind.Constant) &&
                this.reference.name !== unresolvedName
            ) {
                this.reference.unresolvedName = unresolvedName;
            }

        }
    }

}

class RelativeQualifiedNameTransformer implements ReferenceTransformer {

    phraseType = PhraseType.RelativeQualifiedName;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.reference = (<NamespaceNameTransformer>transformer).reference;
            this.reference.name = this.nameResolver.resolveRelative(this.reference.name);
            this.reference.kind = this.kind;
        }
    }

}

class FullyQualifiedNameTransformer implements ReferenceTransformer {

    phraseType = PhraseType.FullyQualifiedName;
    reference: Reference;

    constructor(public node: Phrase | Token, private kind: SymbolKind) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.reference = (<NamespaceNameTransformer>transformer).reference;
            this.reference.kind = this.kind;
        }
    }

}

class CatchClauseVariableNameTransformer implements SymbolTransformer, ReferenceTransformer {
    tokenType = TokenType.VariableName;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        private utils: NodeUtils
    ) {
        const name = utils.nodeText(node);
        this.symbol = PhpSymbol.create(SymbolKind.Variable, name, utils.nodePackedLocation(node));
        this.reference = Reference.create(SymbolKind.Variable, name, this.symbol.location.range);
    }
    push(transform: NodeTransformer) { }
}

class ParameterDeclarationTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseType.ParameterDeclaration;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation,
        private nameResolver: NameResolver
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Parameter, '', utils.nodePackedLocation(node));
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.TypeDeclaration) {
            this.symbol.type = (<TypeDeclarationTransformer>transform).type;
        } else if (transform.tokenType === TokenType.Ampersand) {
            this.symbol.modifiers |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenType.Ellipsis) {
            this.symbol.modifiers |= SymbolModifier.Variadic;
        } else if (transform.tokenType === TokenType.VariableName) {
            this.reference = Reference.create(
                SymbolKind.Parameter,
                (<TokenTransformer>transform).text,
                (<TokenTransformer>transform).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
            this.symbol.name = this.reference.name;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
        } else {
            this.symbol.value = (<TextTransformer>transform).text;
        }
    }

}

class DefineFunctionCallExpressionTransformer implements SymbolTransformer {

    phraseType = PhraseType.FunctionCallExpression;
    symbol: PhpSymbol;
    reference: Reference

    constructor(
        public node: Phrase|Token,
        private utils:NodeUtils
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.ArgumentExpressionList) {

            let arg1: TextTransformer, arg2: TextTransformer;
            [arg1, arg2] = (<DelimiteredListTransformer>transformer).transforms as TextTransformer[];

            if (arg1 && arg1.tokenType === TokenType.StringLiteral) {
                let constName = arg1.text.slice(1, -1); //remove quotes
                if (constName && constName[0] === '\\') {
                    constName = constName.slice(1);
                }
                this.symbol = PhpSymbol.create(SymbolKind.Constant, constName, this.utils.nodePackedLocation(this.node));
                this.reference = Reference.create(SymbolKind.Constant, constName, (<TokenTransformer>arg1).location.range);
                (<ReferencePhrase>this.node).reference = this.reference;
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
            }

        }
    }

}

class SimpleVariableTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseType.SimpleVariable;
    symbol: PhpSymbol;
    /**
     * dynamic variables dont get a reference
     */
    reference: Reference;

    constructor(public node: Phrase | Token, private utils: NodeUtils) { }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.VariableName) {
            this.symbol = PhpSymbol.create(SymbolKind.Variable, (<TokenTransformer>transformer).text, this.utils.nodePackedLocation(this.node));
            this.reference = Reference.create(SymbolKind.Variable, this.symbol.name, this.symbol.location.range);
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class AnonymousClassDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseType.AnonymousClassDeclaration;
    symbol: PhpSymbol;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.symbol = PhpSymbol.create(SymbolKind.Class, utils.anonymousName(<Phrase>node), utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Anonymous;
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.AnonymousClassDeclarationHeader) {
            Array.prototype.push.apply(this.symbol.associated, (<AnonymousClassDeclarationHeaderTransformer>transformer).associated);
        } else if (transformer.phraseType === PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name))
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }
    }

}

class TypeDeclarationBodyTransformer implements NodeTransformer {

    declarations: PhpSymbol[];
    useTraits: Reference[];

    constructor(public node: Phrase | Token, public phraseType: PhraseType) {
        this.declarations = [];
        this.useTraits = [];
    }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseType.ClassConstDeclaration:
            case PhraseType.PropertyDeclaration:
                Array.prototype.push.apply(this.declarations, (<FieldDeclarationTransformer>transform).symbols);
                break;

            case PhraseType.MethodDeclaration:
                this.declarations.push((<MethodDeclarationTransformer>transform).symbol);
                break;

            case PhraseType.TraitUseClause:
                Array.prototype.push.apply(this.useTraits, (<TraitUseClauseTransformer>transform).references);
                break;

            default:
                break;

        }
    }

}

class AnonymousClassDeclarationHeaderTransformer implements NodeTransformer {

    phraseType = PhraseType.AnonymousClassDeclarationHeader;
    associated: Reference[];

    constructor(public node: Phrase | Token) {
        this.associated = [];
    }

    push(transformer: NodeTransformer) {

        if (
            transformer.phraseType === PhraseType.FullyQualifiedName ||
            transformer.phraseType === PhraseType.QualifiedName ||
            transformer.phraseType === PhraseType.RelativeQualifiedName
        ) {
            //names from base clause and interface clause
            const ref = (<ReferenceTransformer>transformer).reference;
            if (ref) {
                this.associated.push(ref);
            }
        }

    }

}

class AnonymousFunctionCreationExpressionTransformer implements SymbolTransformer {

    phraseType = PhraseType.AnonymousFunctionCreationExpression;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this._symbol = PhpSymbol.create(SymbolKind.Function, utils.anonymousName(<Phrase>node), utils.nodePackedLocation(node));
        this._symbol.modifiers = SymbolModifier.Anonymous;
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.AnonymousFunctionHeader) {
            this._symbol.modifiers |= (<AnonymousFunctionHeaderTransformer>transform).modifier;
            this._children.pushMany((<AnonymousFunctionHeaderTransformer>transform).parameters);
            this._children.pushMany((<AnonymousFunctionHeaderTransformer>transform).uses);
            this._symbol.type = (<AnonymousFunctionHeaderTransformer>transform).returnType;
        } else if (transform.phraseType === PhraseType.FunctionDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransformer>transform).symbols);
        }
    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class AnonymousFunctionHeaderTransformer implements NodeTransformer {

    phraseType = PhraseType.AnonymousFunctionHeader;
    modifier = SymbolModifier.None;
    parameters: PhpSymbol[];
    uses: PhpSymbol[];
    returnType = '';

    constructor(public node: Phrase | Token) {
        this.parameters = [];
        this.uses = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Ampersand) {
            this.modifier |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenType.Static) {
            this.modifier |= SymbolModifier.Static;
        } else if (transform.phraseType === PhraseType.ParameterDeclaration) {
            const s = (<ParameterDeclarationTransformer>transform).symbol;
            if (s) {
                this.parameters.push(s);
            }
        } else if (transform.phraseType === PhraseType.AnonymousFunctionUseVariable) {
            const s = (<AnonymousFunctionUseVariableTransformer>transform).symbol;
            if (s) {
                this.uses.push(s);
            }
        } else if (transform.phraseType === PhraseType.TypeDeclaration) {
            this.returnType = (<TypeDeclarationTransformer>transform).type;
        }
    }

}

class FunctionDeclarationBodyTransformer implements SymbolsTransformer {

    private _value: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, public phraseType: PhraseType) {
        this._value = new UniqueSymbolCollection();
    }

    push(transformer: NodeTransformer) {

        switch (transformer.phraseType) {
            case PhraseType.SimpleVariable:
            case PhraseType.AnonymousFunctionCreationExpression:
            case PhraseType.AnonymousClassDeclaration:
            case PhraseType.FunctionCallExpression: //define    
                this._value.push((<SymbolTransformer>transformer).symbol);
                break;

            case undefined:
                //catch clause vars
                if (transformer instanceof CatchClauseVariableNameTransformer) {
                    this._value.push(transformer.symbol);
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

class AnonymousFunctionUseVariableTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseType.AnonymousFunctionUseVariable;
    reference: Reference;
    symbol: PhpSymbol;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.symbol = PhpSymbol.create(SymbolKind.Variable, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Use;
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Ampersand) {
            this.symbol.modifiers |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenType.VariableName) {
            this.symbol.name = (<TokenTransformer>transform).text;
            this.reference = Reference.create(
                SymbolKind.Variable,
                this.symbol.name,
                (<TokenTransformer>transform).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class InterfaceDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseType.InterfaceDeclaration;
    symbol: PhpSymbol;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Interface, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.InterfaceDeclarationHeader) {
            this.symbol.name = (<InterfaceDeclarationHeaderTransformer>transform).name;
            this.symbol.associated = (<InterfaceDeclarationHeaderTransformer>transform).associated;
        } else if (transform.phraseType === PhraseType.InterfaceDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransformer>transform).declarations, this.symbol.name));
        }
    }

}

class ConstElementTransformer implements SymbolTransformer {

    phraseType = PhraseType.ConstElement;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {

        this.symbol = PhpSymbol.create(SymbolKind.Constant, '', this.utils.nodePackedLocation(node));
        this.symbol.scope = this.nameResolver.namespaceName;
        this.reference = Reference.create(SymbolKind.Constant, '', this.symbol.location.range);
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenType.Name) {
            this.symbol.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            this.reference.name = this.symbol.name;
            this.reference.range = (<TokenTransformer>transformer).location.range;
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

class TraitDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseType.TraitDeclaration;
    symbol: PhpSymbol;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Trait, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.TraitDeclarationHeader) {
            this.symbol.name = (<TraitDeclarationHeaderTransformer>transformer).name;
        } else if (transformer.phraseType === PhraseType.TraitDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }
    }

}

class TraitDeclarationHeaderTransformer implements NodeTransformer {
    phraseType = PhraseType.TraitDeclarationHeader;
    name = '';
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) { }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Trait,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class InterfaceDeclarationHeaderTransformer implements ReferenceTransformer {
    phraseType = PhraseType.InterfaceDeclarationHeader;
    name = '';
    associated: Reference[];
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.associated = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Interface,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (
            transformer.phraseType === PhraseType.FullyQualifiedName ||
            transformer.phraseType === PhraseType.QualifiedName ||
            transformer.phraseType === PhraseType.RelativeQualifiedName
        ) {
            //names from base clause and interface clause
            const ref = (<ReferenceTransformer>transformer).reference;
            if (ref) {
                this.associated.push(ref);
            }
        }
    }

}

class TraitUseClauseTransformer implements NodeTransformer {

    phraseType = PhraseType.TraitUseClause;
    references: Reference[];

    constructor(public node: Phrase | Token) {
        this.references = [];
    }

    push(transformer: NodeTransformer) {
        if (
            transformer.phraseType === PhraseType.FullyQualifiedName ||
            transformer.phraseType === PhraseType.QualifiedName ||
            transformer.phraseType === PhraseType.RelativeQualifiedName
        ) {
            const ref = (<ReferenceTransformer>transformer).reference;
            if (ref) {
                this.references.push(ref);
            }
        }
    }

}

class NamespaceDefinitionHeaderTransformer implements TextTransformer {

    phraseType = PhraseType.NamespaceDefinitionHeader;
    text = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.NamespaceName) {
            this.text = (<NamespaceNameTransformer>transformer).text;
        }
    }

}

class NamespaceDefinitionTransformer implements SymbolTransformer {

    phraseType = PhraseType.NamespaceDefinition;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this._symbol = PhpSymbol.create(SymbolKind.Namespace, '', utils.nodePackedLocation(node));
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseType.NamespaceDefinitionHeader) {
            this._symbol.name = (<NamespaceDefinitionHeaderTransformer>transform).text;
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

class ClassDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseType.ClassDeclaration;
    symbol: PhpSymbol;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Class, '', utils.nodePackedLocation(node));
        this.symbol.children = [];
        this.symbol.associated = [];
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
    }

    push(transformer: NodeTransformer) {

        if (transformer.phraseType === PhraseType.ClassDeclarationHeader) {
            this.symbol.modifiers = (<ClassDeclarationHeaderTransformer>transformer).modifier;
            this.symbol.name = (<ClassDeclarationHeaderTransformer>transformer).name;
            if ((<ClassDeclarationHeaderTransformer>transformer).associated) {
                Array.prototype.push.apply(this.symbol.associated, (<ClassDeclarationHeaderTransformer>transformer).associated);
            }
        } else if (transformer.phraseType === PhraseType.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, PhpSymbol.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }

    }

}

class ClassDeclarationHeaderTransformer implements NodeTransformer {

    phraseType = PhraseType.ClassDeclarationHeader;
    modifier = SymbolModifier.None;
    name = '';
    associated: Reference[];
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.associated = [];
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenType.Abstract) {
            this.modifier = SymbolModifier.Abstract;
        } else if (transformer.tokenType === TokenType.Final) {
            this.modifier = SymbolModifier.Final;
        } else if (transformer.tokenType === TokenType.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Class,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (
            transformer.phraseType === PhraseType.FullyQualifiedName ||
            transformer.phraseType === PhraseType.QualifiedName ||
            transformer.phraseType === PhraseType.RelativeQualifiedName
        ) {
            //these will be names from class base clause and class interface clause
            const ref = (<ReferenceTransformer>transformer).reference;
            if (ref) {
                this.associated.push(ref);
            }
        }

    }

}

class MemberModifierListTransformer implements NodeTransformer {

    phraseType = PhraseType.MemberModifierList;
    modifiers = SymbolModifier.None;

    constructor(public node: Phrase | Token) { }

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

class ClassConstantElementTransform implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseType.ClassConstElement;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.ClassConstant, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Static;
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.Identifier) {
            this.symbol.name = (<IdentifierTransformer>transformer).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.ClassConstant,
                this.symbol.name,
                (<IdentifierTransformer>transformer).location.range
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
        }
    }

}

class MethodDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseType.MethodDeclaration;
    private _children: UniqueSymbolCollection;
    private _symbol: PhpSymbol;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this._symbol = PhpSymbol.create(SymbolKind.Method, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, doc, docLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        if (transform instanceof MethodDeclarationHeaderTransformer) {
            this._symbol.modifiers = transform.modifiers;
            this._symbol.name = transform.name;
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        } else if (transform.phraseType === PhraseType.MethodDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransformer>transform).symbols);
        }

    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class TypeDeclarationTransformer implements NodeTransformer {

    phraseType = PhraseType.TypeDeclaration;
    type = '';

    constructor(public node: Phrase | Token) { }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseType.FullyQualifiedName:
            case PhraseType.RelativeQualifiedName:
            case PhraseType.QualifiedName:
                this.type = (<NameTransformer>transform).name;
                break;

            case undefined:
                if (transform.tokenType === TokenType.Callable) {
                    this.type = 'callable';
                } else if (transform.tokenType === TokenType.Array) {
                    this.type = 'array';
                }
                break;

            default:
                break;
        }

    }

}

class IdentifierTransformer implements TextTransformer {

    phraseType = PhraseType.Identifier;
    text = '';
    location: PackedLocation;

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.text = (<TokenTransformer>transformer).text;
        this.location = (<TokenTransformer>transformer).location;
    }

}

class MethodDeclarationHeaderTransformer implements NodeTransformer, ReferenceTransformer {

    phraseType = PhraseType.MethodDeclarationHeader;
    modifiers = SymbolModifier.Public;
    name = '';
    parameters: PhpSymbol[];
    returnType = '';
    reference: Reference;

    constructor(public node: Phrase | Token) {
        this.parameters = [];
    }

    push(transformer: NodeTransformer) {
        switch (transformer.phraseType) {
            case PhraseType.MemberModifierList:
                this.modifiers = (<MemberModifierListTransformer>transformer).modifiers;
                if (!(this.modifiers & (SymbolModifier.Public | SymbolModifier.Protected | SymbolModifier.Private))) {
                    this.modifiers |= SymbolModifier.Public;
                }
                break;

            case PhraseType.Identifier:
                this.name = (<IdentifierTransformer>transformer).text;
                this.reference = Reference.create(
                    SymbolKind.Method,
                    this.name,
                    (<IdentifierTransformer>transformer).location.range
                );
                (<ReferencePhrase>this.node).reference = this.reference;
                break;

            case PhraseType.ParameterDeclaration:
                {
                    const s = (<ParameterDeclarationTransformer>transformer).symbol;
                    if (s) {
                        this.parameters.push(s);
                    }
                }
                break;

            case PhraseType.TypeDeclaration:
                this.returnType = (<TypeDeclarationTransformer>transformer).type;
                break;

            default:
                break;
        }
    }

}

class PropertyInitialiserTransformer implements NodeTransformer {

    phraseType = PhraseType.PropertyInitialiser;
    text = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.text = (<TextTransformer>transformer).text;
    }

}

class PropertyElementTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseType.PropertyElement;
    symbol: PhpSymbol;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = PhpSymbol.create(SymbolKind.Property, '', utils.nodePackedLocation(node));
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenType.VariableName) {
            this.symbol.name = (<TokenTransformer>transformer).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            this.reference = Reference.create(
                SymbolKind.Property,
                this.symbol.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transformer.phraseType === PhraseType.PropertyInitialiser) {
            //this.symbol.value = (<PropertyInitialiserTransformer>transform).text;
        }

    }

}

class FieldDeclarationTransformer implements SymbolsTransformer {

    private _modifier = SymbolModifier.Public;
    symbols: PhpSymbol[];

    constructor(public node: Phrase | Token, public phraseType: PhraseType, private elementType: PhraseType) {
        this.symbols = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.MemberModifierList) {
            this._modifier = (<MemberModifierListTransformer>transformer).modifiers;
        } else if (transformer.phraseType === this.elementType) {
            const s = (<SymbolTransformer>transformer).symbol;
            if (s) {
                s.modifiers |= this._modifier;
                this.symbols.push(s);
            }
        }
    }

}

class FunctionDeclarationTransform implements SymbolTransformer {

    phraseType = PhraseType.FunctionDeclaration;
    private _symbol: PhpSymbol;
    private _children: UniqueSymbolCollection;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private phpDoc: PhpDoc,
        private phpDocLocation: PackedLocation
    ) {
        this._symbol = PhpSymbol.create(SymbolKind.Function, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, phpDoc, phpDocLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseType.FunctionDeclarationHeader) {
            this._symbol.name = (<FunctionDeclarationHeaderTransformer>transformer).name;
            this._children.pushMany((<FunctionDeclarationHeaderTransformer>transformer).parameters);
            this._symbol.type = (<FunctionDeclarationHeaderTransformer>transformer).returnType;
        } else {
            const s = (<SymbolTransformer>transformer).symbol;
            if (s) {
                this._children.push(s);
            }
        }
    }

    get symbol() {
        this._symbol.children = PhpSymbol.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class FunctionDeclarationHeaderTransformer implements NodeTransformer, ReferenceTransformer {

    phraseType = PhraseType.FunctionDeclarationHeader;
    name = '';
    parameters: PhpSymbol[];
    returnType = '';
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.parameters = [];
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenType.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Function,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transformer.phraseType === PhraseType.ParameterDeclaration) {
            const s = (<ParameterDeclarationTransformer>transformer).symbol;
            if (s) {
                this.parameters.push(s);
            }
        } else if (transformer.phraseType === PhraseType.TypeDeclaration) {
            this.returnType = (<TypeDeclarationTransformer>transformer).type;
        }
    }
}

class DefaultNodeTransformer implements TextTransformer {

    constructor(public node: Phrase | Token, public phraseType: PhraseType, private utils: NodeUtils) { }
    push(transform: NodeTransformer) { }
    get text() {
        return this.utils.nodeText(this.node);
    }
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

class NamespaceUseDeclarationTransformer implements SymbolsTransformer {

    phraseType = PhraseType.NamespaceUseDeclaration;
    symbols: PhpSymbol[];
    private _kind = SymbolKind.Class;
    private _prefix = '';

    constructor(public node: Phrase | Token) {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Const) {
            this._kind = SymbolKind.Constant;

        } else if (transform.tokenType === TokenType.Function) {
            this._kind = SymbolKind.Function;

        } else if (transform.phraseType === PhraseType.NamespaceName) {

            this._prefix = (<NamespaceNameTransformer>transform).text;
            (<NamespaceNameTransformer>transform).reference.kind = SymbolKind.Namespace;

        } else if (
            transform.phraseType === PhraseType.NamespaceUseGroupClause ||
            transform.phraseType === PhraseType.NamespaceUseClause
        ) {

            const s = (<NamespaceUseClauseTransformer>transform).symbol;
            const prefix = this._prefix ? this._prefix + '\\' : '';
            const refs = (<NamespaceUseClauseTransformer>transform).references;
            if (!s.kind) {
                s.kind = this._kind;
            }
            refs.forEach(x => {
                x.name = prefix + x.name;
                x.kind = s.kind;
            });
            this.symbols.push(s);

        }
    }

}

class NamespaceUseClauseTransformer implements NodeTransformer {

    symbol: PhpSymbol;
    /**
     * a reference for namespace name and a reference for alias
     */
    references: Reference[];

    constructor(public node: Phrase | Token, public phraseType: PhraseType, private utils: NodeUtils) {
        this.symbol = PhpSymbol.create(0, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Use;
        this.symbol.associated = [];
        this.references = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenType.Function) {
            this.symbol.kind = SymbolKind.Function;
        } else if (transformer.tokenType === TokenType.Const) {
            this.symbol.kind = SymbolKind.Constant;
        } else if (transformer.phraseType === PhraseType.NamespaceName) {
            const text = (<NamespaceNameTransformer>transformer).text;
            const ref = (<NamespaceNameTransformer>transformer).reference;
            ref.kind = this.symbol.kind;
            this.symbol.name = PhpSymbol.notFqn(text);
            this.symbol.associated.push(ref);
            this.references.push(ref);
        } else if (transformer.phraseType === PhraseType.NamespaceAliasingClause) {
            this.symbol.name = (<NamespaceAliasingClauseTransformer>transformer).text;
            const ref = (<NamespaceAliasingClauseTransformer>transformer).reference;
            if (!ref) {
                return;
            }

            if (this.references[0]) {
                ref.name = this.references[0].name;
            }
            this.references.push(ref);
        }
    }

}

class NamespaceAliasingClauseTransformer implements TextTransformer, ReferenceTransformer {

    phraseType = PhraseType.NamespaceAliasingClause;
    text = '';
    reference: Reference;

    constructor(public node: Phrase | Token) { }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenType.Name) {
            this.text = (<TokenTransformer>transform).text;
            this.reference = (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.Class,
                this.text,
                (<TokenTransformer>transform).location.range
            );
            this.reference.unresolvedName = this.text;
        }
    }

}

