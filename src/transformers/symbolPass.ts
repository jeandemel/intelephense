/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import { TreeVisitor, MultiVisitor, PackedLocation } from '../types';
import { Document } from '../document/document';
import { NodeUtils } from '../document/parseTree';
import { Phrase, PhraseKind } from '../parser/phrase';
import { Token, TokenKind } from '../parser/lexer';
import { PhpDoc, PhpDocParser, Tag, MethodTagParam } from '../phpDoc';
import { Definition, SymbolKind, SymbolModifier } from '../symbol/symbol';
import { NameResolver } from '../nameResolver';
import { TypeString } from '../typeString';
import { PackedRange } from '../types';
import * as util from '../util';
import { Reference } from '../symbol/symbol';
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


namespace SymbolTransform {

    var utils: NodeUtils;
    var nameResolver: NameResolver;

    export function file(node: Phrase): Definition {

        let def: Definition | Definition[];
        for (let n = 0, l = node.children.length; n < l; ++n) {
            def = visit(node.children[n]);
            if (!def) {
                continue;
            } else if (Array.isArray(def)) {

            } else {

            }
        }

    }

    function visit(node: Phrase | Token): any {

    }

    function namespaceName(node: Phrase) {

        let text = '';
        let t: Token;
        for (let n = 0, l = node.children.length; n < l; ++n) {
            t = node.children[n] as Token;
            if (t.tokenType === TokenKind.Name) {
                text += '\\' + utils.nodeText(t);
            }
        }

        return (<ReferencePhrase>node).reference = Reference.create(
            SymbolKind.Class, text.slice(1), utils.nodePackedLocation(node)
        );

    }

    function namespaceUseDeclaration(node:Phrase) {

        let kind = 0;
        let prefix = '';
        let child:Phrase|Token;
        for(let n = 0, l = node.children.length; n < l; ++n) {

            if ((<Token>child).tokenType === TokenKind.Const) {
                kind = SymbolKind.Constant;
            } else if ((<Token>child).tokenType === TokenKind.Function) {
                kind = SymbolKind.Function;
            } else if ((<Phrase>child).phraseType === PhraseKind.NamespaceName) {
                const ref = namespaceName(<Phrase>child);
                if(ref) {
                    prefix = ref.name;
                    ref.kind = SymbolKind.Namespace;
                }
            } else if ((<Phrase>child).phraseType === PhraseKind.NamespaceUseClauseList

                transform.phraseType === PhraseKind.NamespaceUseClause
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

    function functionCallExpression(node:Phrase) {
        const ref = name(<Phrase>node.children[0], SymbolKind.Function);
        visit(node.children[2]); //arglist
    }

    function constantAccessExpression(node: Phrase) {
        name(<Phrase>node.children[0], SymbolKind.Constant);
    }

    function name(node: Phrase, kind?: SymbolKind) {

        switch (node.phraseType) {
            case PhraseKind.FullyQualifiedName:
                return fullyQualifiedName(node, kind);
            case PhraseKind.QualifiedName:
                return qualifiedName(node, kind);
            case PhraseKind.RelativeQualifiedName:
                return relativeQualifiedName(node, kind);
            default:
                return undefined;
        }

    }

    function qualifiedName(node: Phrase, kind?: SymbolKind) {
        const nsName = node.children[0] as Phrase;
        if (nsName.phraseType !== PhraseKind.NamespaceName) {
            return undefined;
        }

        const ref = namespaceName(nsName);
        if (!ref) {
            return undefined;
        }

        ref.name = nameResolver.resolveNotFullyQualified(ref.name, kind);
        ref.kind = kind || SymbolKind.Class;
        return ref;
    }

    function fullyQualifiedName(node: Phrase, kind?: SymbolKind) {
        const nsName = node.children[1] as Phrase;
        if (nsName.phraseType !== PhraseKind.NamespaceName) {
            return undefined;
        }

        const ref = namespaceName(nsName);
        if (ref) {
            ref.kind = kind || SymbolKind.Class;
        }
        return ref;
    }

    function relativeQualifiedName(node: Phrase, kind?: SymbolKind) {
        const nsName = node.children[2] as Phrase;
        if (nsName.phraseType !== PhraseKind.NamespaceName) {
            return undefined;
        }

        const ref = namespaceName(nsName);
        if (!ref) {
            return undefined;
        }

        ref.name = nameResolver.resolveRelative(ref.name);
        ref.kind = kind || SymbolKind.Class;
        return ref;
    }


}

/** 
 * First parse tree pass
 * 1. Add symbol reference objects to relevant nodes in tree and collect reference names
 * 2. Build symbol definition tree
 */
export class SymbolPass implements TreeVisitor<Phrase | Token> {

    lastPhpDoc: PhpDoc;
    lastPhpDocLocation: PackedLocation;
    referenceNames: Set<string>;

    private _transformerStack: NodeTransformer[];
    private _lastTransformer: NodeTransformer;
    private _utils: NodeUtils;
    private _isScoped = 0;
    private static readonly REFERENCE_INDEX_NOT_KIND_MASK = SymbolKind.Parameter | SymbolKind.File | SymbolKind.Variable;

    constructor(
        public document: Document,
        public nameResolver: NameResolver
    ) {
        this._transformerStack = [];
        this.referenceNames = new Set<string>();
    }

    get symbol() {
        return this._lastTransformer ? (<SymbolTransformer>this._lastTransformer).symbol : undefined;
    }

    preorder(node: Phrase | Token, spine: (Phrase | Token)[]) {

        let parentNode = <Phrase>(spine.length ? spine[spine.length - 1] : { phraseType: PhraseKind.Unknown, children: [] });
        let parentTransform = this._transformerStack[this._transformerStack.length - 1];

        switch ((<Phrase>node).phraseType) {

            case PhraseKind.Error:
                return false;

            case PhraseKind.TopStatementList:
                this._transformerStack.push(new FileTransform(node, this.document.uri, this._utils));
                break;

            case PhraseKind.NamespaceDefinitionHeader:
                this._transformerStack.push(new NamespaceDefinitionHeaderTransformer(node));
                break;

            case PhraseKind.NamespaceDefinition:
                this._transformerStack.push(new NamespaceDefinitionTransformer(node, this._utils));
                break;

            case PhraseKind.NamespaceUseDeclaration:
                this._transformerStack.push(new NamespaceUseDeclarationTransformer(node));
                break;

            case PhraseKind.NamespaceUseClause:
            case PhraseKind.NamespaceUseGroupClause:
                this._transformerStack.push(new NamespaceUseClauseTransformer(node, (<Phrase>node).phraseType, this._utils));
                break;

            case PhraseKind.NamespaceAliasingClause:
                this._transformerStack.push(new NamespaceAliasingClauseTransformer(node));
                break;

            case PhraseKind.ConstElement:
                this._transformerStack.push(
                    new ConstElementTransformer(node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    ));
                break;

            case PhraseKind.FunctionDeclaration:
                this._transformerStack.push(new FunctionDeclarationTransform(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseKind.FunctionDeclarationHeader:
                this._transformerStack.push(new FunctionDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseKind.ParameterDeclaration:
                this._transformerStack.push(new ParameterDeclarationTransformer(
                    node, this._utils, this.lastPhpDoc, this.lastPhpDocLocation, this.nameResolver
                ));
                break;

            case PhraseKind.TypeDeclaration:
                this._transformerStack.push(new TypeDeclarationTransformer(node));
                break;

            case PhraseKind.FunctionDeclarationBody:
            case PhraseKind.MethodDeclarationBody:
                this._transformerStack.push(new FunctionDeclarationBodyTransformer(node, (<Phrase>node).phraseType));
                break;

            case PhraseKind.ClassDeclaration:
                {
                    let t = new ClassDeclarationTransformer(
                        node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseKind.ClassDeclarationHeader:
                this._transformerStack.push(new ClassDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseKind.ClassDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseKind.ClassDeclarationBody));
                break;

            case PhraseKind.InterfaceDeclaration:
                {
                    let t = new InterfaceDeclarationTransformer(
                        node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                    );
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseKind.InterfaceDeclarationHeader:
                this._transformerStack.push(new InterfaceDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseKind.InterfaceDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseKind.InterfaceDeclarationBody));
                break;

            case PhraseKind.TraitDeclaration:
                this._transformerStack.push(new TraitDeclarationTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseKind.TraitDeclarationHeader:
                this._transformerStack.push(new TraitDeclarationHeaderTransformer(node, this.nameResolver));
                break;

            case PhraseKind.TraitDeclarationBody:
                this._transformerStack.push(new TypeDeclarationBodyTransformer(node, PhraseKind.TraitDeclarationBody));
                break;

            case PhraseKind.ClassConstDeclaration:
                this._transformerStack.push(
                    new FieldDeclarationTransformer(node, PhraseKind.ClassConstDeclaration, PhraseKind.ClassConstElement)
                );
                break;

            case PhraseKind.ClassConstElement:
                this._transformerStack.push(new ClassConstantElementTransform(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseKind.PropertyDeclaration:
                this._transformerStack.push(
                    new FieldDeclarationTransformer(node, PhraseKind.PropertyDeclaration, PhraseKind.PropertyElement)
                );
                break;

            case PhraseKind.PropertyElement:
                this._transformerStack.push(new PropertyElementTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            /*
            case PhraseType.PropertyInitialiser:
                this._transformerStack.push(new PropertyInitialiserTransformer(node));
                break;
            */

            case PhraseKind.TraitUseClause:
                this._transformerStack.push(new TraitUseClauseTransformer(node));
                break;

            case PhraseKind.MethodDeclaration:
                this._transformerStack.push(new MethodDeclarationTransformer(
                    node, this.nameResolver, this._utils, this.lastPhpDoc, this.lastPhpDocLocation
                ));
                break;

            case PhraseKind.MethodDeclarationHeader:
                this._transformerStack.push(new MethodDeclarationHeaderTransformer(node));
                break;

            case PhraseKind.Identifier:
                if (parentNode.phraseType === PhraseKind.MethodDeclarationHeader || parentNode.phraseType === PhraseKind.ClassConstElement) {
                    this._transformerStack.push(new IdentifierTransformer(node));
                }
                break;

            case PhraseKind.MemberModifierList:
                this._transformerStack.push(new MemberModifierListTransformer(node));
                break;

            case PhraseKind.AnonymousClassDeclaration:
                {
                    let t = new AnonymousClassDeclarationTransformer(node, this._utils);
                    this._transformerStack.push(t);
                    this.nameResolver.pushClass(t.symbol);
                }
                break;

            case PhraseKind.AnonymousClassDeclarationHeader:
                this._transformerStack.push(new AnonymousClassDeclarationHeaderTransformer(node));
                break;

            case PhraseKind.AnonymousFunctionCreationExpression:
                this._transformerStack.push(
                    new AnonymousFunctionCreationExpressionTransformer(node, this._utils)
                );
                break;

            case PhraseKind.AnonymousFunctionHeader:
                this._transformerStack.push(new AnonymousFunctionHeaderTransformer(node));
                break;

            case PhraseKind.AnonymousFunctionUseVariable:
                this._transformerStack.push(new AnonymousFunctionUseVariableTransformer(node, this._utils));
                break;

            case PhraseKind.SimpleVariable:
                this._transformerStack.push(new SimpleVariableTransformer(node, this._utils));
                break;

            case PhraseKind.ScopedMemberName:
                this._transformerStack.push(new ScopedMemberNameTransformer(<Phrase>node, parentNode, this._utils));
                break;

            case PhraseKind.MemberName:
                this._transformerStack.push(new MemberNameTransform(<Phrase>node, parentNode, this._utils));
                break;

            case PhraseKind.FunctionCallExpression:
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

            case PhraseKind.ArgumentExpressionList:
                //define args
                if (parentNode.phraseType === PhraseKind.FunctionCallExpression && parentTransform.node === parentNode) {
                    this._transformerStack.push(new DelimiteredListTransformer(node, PhraseKind.ArgumentExpressionList));
                }
                break;

            case PhraseKind.FullyQualifiedName:
                this._transformerStack.push(new FullyQualifiedNameTransformer(node, this._nameSymbolType(parentNode)));
                break;

            case PhraseKind.RelativeQualifiedName:
                this._transformerStack.push(
                    new RelativeQualifiedNameTransformer(node, this.nameResolver, this._nameSymbolType(parentNode))
                );
                break;

            case PhraseKind.QualifiedName:
                this._transformerStack.push(
                    new QualifiedNameTransformer(node, this.nameResolver, this._nameSymbolType(parentNode))
                );
                break;

            case PhraseKind.NamespaceName:
                this._transformerStack.push(new NamespaceNameTransformer(<Phrase>node, this._utils));
                return false;

            case PhraseKind.DocBlock:
                this._transformerStack.push(new DocBlockTransformer(node));
                break;

            case undefined:
                //tokens
                if ((<Token>node).tokenType === TokenKind.DocumentComment && parentTransform) {

                    parentTransform.push(new TokenTransformer(<Token>node, this._utils));

                } else if (
                    (<Token>node).tokenType === TokenKind.CloseBrace ||
                    (<Token>node).tokenType === TokenKind.OpenBrace
                ) {

                    this.lastPhpDoc = null;
                    this.lastPhpDocLocation = null;

                } else if (
                    (<Token>node).tokenType === TokenKind.VariableName &&
                    parentTransform &&
                    parentNode &&
                    parentNode.phraseType === PhraseKind.CatchClause
                ) {
                    //catch clause vars
                    parentTransform.push(new CatchClauseVariableNameTransformer(node, this._utils));

                } else if (
                    parentTransform &&
                    parentTransform.node === parentNode &&
                    (<Token>node).tokenType > TokenKind.EndOfFile &&
                    (<Token>node).tokenType < TokenKind.Equals
                ) {
                    parentTransform.push(new TokenTransformer(<Token>node, this._utils));
                }
                break;

            default:
                if (parentNode.phraseType === PhraseKind.ArgumentExpressionList) {
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

        if (
            (<Phrase>node).phraseType === PhraseKind.MethodDeclarationBody ||
            (<Phrase>node).phraseType === PhraseKind.FunctionDeclarationBody
        ) {
            --this._isScoped;
        }

        const transformer = this._transformerStack[this._transformerStack.length - 1];
        if (transformer.node !== node) {
            //a transformer wasnt pushed to stack for this node
            return;
        }

        const ref = (<ReferencePhrase>node).reference;
        if (ref && this._isIndexableReference(ref)) {
            this.referenceNames.add(ref.name);
        }

        switch ((<Phrase>transformer.node).phraseType) {
            case PhraseKind.DocBlock:
                this.lastPhpDoc = (<DocBlockTransformer>transformer).doc
                this.lastPhpDocLocation = (<DocBlockTransformer>transformer).location;
                break;

            case PhraseKind.NamespaceDefinitionHeader:
                this.nameResolver.namespaceName = (<NamespaceDefinitionHeaderTransformer>transformer).text;
                break;

            case PhraseKind.NamespaceUseDeclaration:
                {
                    const definitions = (<NamespaceUseDeclarationTransformer>transformer).symbols;
                    let def: Definition;
                    for (let n = 0, l = definitions.length; n < l; ++n) {
                        def = definitions[n];
                        this.nameResolver.rules.push({
                            kind: def.kind,
                            name: def.name,
                            fqn: def.associated && def.associated.length > 0 ? def.associated[0].name : ''
                        });
                    }
                }
                break;

            case PhraseKind.ClassDeclarationHeader:
                {
                    const className = (<ClassDeclarationHeaderTransformer>transformer).name;
                    const baseRef = (<ClassDeclarationHeaderTransformer>transformer).associated.find(this._isClassReference);
                    this.nameResolver.pushClass(className, baseRef ? baseRef.name : '');
                }
                break;

            case PhraseKind.AnonymousClassDeclarationHeader:

                break;

            case PhraseKind.ClassDeclaration:
            case PhraseKind.AnonymousClassDeclaration:
                this.nameResolver.popClass();
                break;

            default:
                break;
        }

        this._transformerStack.pop();
        this._lastTransformer = transformer;
        if (this._transformerStack.length > 0) {
            //push transformer to ancestor transformer
            this._transformerStack[this._transformerStack.length - 1].push(transformer);
        }

    }

    private _isClassReference(r: Reference) {
        return r.kind === SymbolKind.Class;
    }

    private _isIndexableReference(ref: Reference) {
        return ref.name &&
            (!(ref.kind & SymbolPass.REFERENCE_INDEX_NOT_KIND_MASK) ||
                (ref.kind & SymbolKind.Variable) > 0 && this._isScoped < 1) //allow global scoped vars
    }

    private _nameSymbolType(parent: Phrase) {
        if (!parent) {
            return SymbolKind.Class;
        }

        switch (parent.phraseType) {
            case PhraseKind.ConstantAccessExpression:
                return SymbolKind.Constant;
            case PhraseKind.FunctionCallExpression:
                return SymbolKind.Function;
            case PhraseKind.ClassTypeDesignator:
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

    private _symbols: Definition[];
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

    push(s: Definition) {
        if (s.kind & (SymbolKind.Parameter | SymbolKind.Variable)) {
            if (this._varMap[s.name] === undefined) {
                this._varMap[s.name] = true;
                this._symbols.push(s);
            }
        } else {
            this._symbols.push(s);
        }
    }

    pushMany(symbols: Definition[]) {
        for (let n = 0, l = symbols.length; n < l; ++n) {
            this.push(symbols[n]);
        }
    }

    toArray() {
        return this._symbols;
    }
}

interface SymbolTransformer extends NodeTransformer {
    symbol: Definition;
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
    symbols: Definition[];
}

interface ReferenceTransformer extends NodeTransformer {
    reference: Reference;
}

function docBlock(node: Phrase, utils: NodeUtils): [PhpDoc, PackedLocation] {
    const documentCommentToken = node.children[0] as Token;
    if (documentCommentToken.tokenType !== TokenKind.DocumentComment) {
        return undefined;
    }

    const doc = (<PhpDocPhrase>node).doc = PhpDocParser.parse(utils.nodeText(documentCommentToken));
    const loc = utils.nodePackedLocation(documentCommentToken);
    return [doc, loc];
}

class DocBlockTransformer implements NodeTransformer {

    phraseType = PhraseKind.DocBlock;
    doc: PhpDoc;
    location: PackedLocation;

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        //can only be a DocumentComment token
        this.doc = (<PhpDocPhrase>this.node).doc = PhpDocParser.parse((<TokenTransformer>transformer).text);
        this.location = (<TokenTransformer>transformer).location;
    }
}

class FileTransform implements SymbolTransformer {

    private _children: UniqueSymbolCollection;
    private _symbol: Definition;

    constructor(public node: Phrase | Token, uri: string, nodeUtils: NodeUtils) {
        this._symbol = Definition.create(SymbolKind.File, uri, nodeUtils.nodePackedLocation(this.node));
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        const s = (<SymbolTransformer>transform).symbol;
        if (s) {
            this._children.push(s);
            return;
        }

        const symbols = (<SymbolsTransformer>transform).symbols;
        if (symbols) {
            this._children.pushMany(symbols);
        }

    }

    get symbol() {
        this._symbol.children = this._children.toArray();
        return this._symbol;
    }

}

class MemberNameTransform implements ReferenceTransformer {

    reference: Reference;

    constructor(public node: Phrase | Token, public parentNode: Phrase, private utils: NodeUtils) { }

    push(transformer: NodeTransformer) {
        if ((<Token>transformer.node).tokenType === TokenKind.Name) {

            this.reference = Reference.create(
                SymbolKind.None,
                (<TokenTransformer>transformer).text,
                this.utils.nodePackedLocation(this.node)
            );

            switch (this.parentNode.phraseType) {
                case PhraseKind.PropertyAccessExpression:
                    this.reference.kind = SymbolKind.Property;
                    if (this.reference.name && this.reference.name[0] !== '$') {
                        this.reference.name = '$' + this.reference.name;
                    }
                    break;
                case PhraseKind.MethodCallExpression:
                    this.reference.kind = SymbolKind.Method;
                    break;
                default:
                    break;
            }

            (<ReferencePhrase>this.node).reference = this.reference;
        }
    }

}

class ScopedMemberNameTransformer implements ReferenceTransformer {

    reference: Reference;

    constructor(public node: Phrase, public parentNode: Phrase, private utils: NodeUtils) { }

    push(transformer: NodeTransformer) {
        if (
            (<Token>transformer.node).tokenType === TokenKind.VariableName ||
            (<Phrase>transformer.node).phraseType === PhraseKind.Identifier
        ) {
            this.reference = Reference.create(
                SymbolKind.None,
                (<TextTransformer>transformer).text,
                this.utils.nodePackedLocation(this.node)
            );
            (<ReferencePhrase>this.node).reference = this.reference;

            switch (this.parentNode.phraseType) {
                case PhraseKind.ClassConstantAccessExpression:
                    this.reference.kind = SymbolKind.ClassConstant;
                    break;
                case PhraseKind.ScopedPropertyAccessExpression:
                    this.reference.kind = SymbolKind.Property;
                    break;
                case PhraseKind.ScopedCallExpression:
                    this.reference.kind = SymbolKind.Method;
                    break;
            }
        }
    }

}

class DelimiteredListTransformer implements NodeTransformer {

    transforms: NodeTransformer[];

    constructor(public node: Phrase | Token) {
        this.transforms = [];
    }

    push(transform: NodeTransformer) {
        this.transforms.push(transform);
    }

}

class TokenTransformer implements TextTransformer {

    tokenType: TokenKind;

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

    text = '';
    reference: Reference;

    constructor(public node: Phrase, private utils: NodeUtils) {
        this.reference = Reference.create(SymbolKind.Class, '', utils.nodePackedLocation(node));
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transformer: NodeTransformer) {
        //should be only name tokens
        if (this.text) {
            this.text += '\\' + (<TokenTransformer>transformer).text;
        } else {
            this.text = (<TokenTransformer>transformer).text;
        }
    }

}

class QualifiedNameTransformer implements ReferenceTransformer {

    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        //should only ever be a namespace name

        this.reference = (<NamespaceNameTransformer>transformer).reference;
        this.reference.kind = this.kind;
        const unresolvedName = this.reference.name;
        const lcUnresolvedName = unresolvedName.toLowerCase();
        this.reference.name = this.nameResolver.resolveNotFullyQualified(unresolvedName, this.kind);

        if (
            (this.kind === SymbolKind.Function || this.kind === SymbolKind.Constant) &&
            this.reference.name.toLowerCase() !== lcUnresolvedName
        ) {
            this.reference.unresolvedName = unresolvedName;
        }

    }

}

class RelativeQualifiedNameTransformer implements ReferenceTransformer {

    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private kind: SymbolKind
    ) { }

    push(transformer: NodeTransformer) {
        //should only ever be a namespacename
        this.reference = (<NamespaceNameTransformer>transformer).reference;
        this.reference.name = this.nameResolver.resolveRelative(this.reference.name);
        this.reference.kind = this.kind;
    }

}

class FullyQualifiedNameTransformer implements ReferenceTransformer {

    reference: Reference;

    constructor(public node: Phrase | Token, private kind: SymbolKind) { }

    push(transformer: NodeTransformer) {
        //should only ever be a namespacename
        this.reference = (<NamespaceNameTransformer>transformer).reference;
        this.reference.kind = this.kind;
    }

}

class CatchClauseTransformer implements SymbolTransformer, ReferenceTransformer {
    symbol: Definition;
    reference: Reference;

    constructor(
        public node: Phrase,
        private utils: NodeUtils
    ) {

        //varname will be element 3
        const variableNameToken = this.node.children[3] as Token;
        if (variableNameToken.tokenType !== TokenKind.VariableName) {
            return;
        }

        const name = utils.nodeText(variableNameToken);
        this.symbol = Definition.create(SymbolKind.Variable, name, utils.nodePackedLocation(variableNameToken));
        this.reference = Reference.create(SymbolKind.Variable, name, this.symbol.location);
    }
    push(transform: NodeTransformer) {



    }
}

class ParameterDeclarationTransformer implements SymbolTransformer, ReferenceTransformer {

    symbol: Definition;
    reference: Reference;

    constructor(
        public node: Phrase,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation,
        private nameResolver: NameResolver
    ) {

        let t: Token;
        for (let n = 0, l = node.children.length; n < l; ++n) {
            t = node.children[n] as Token;
            if (t.tokenType === TokenKind.Ampersand) {
                this.symbol.modifiers |= SymbolModifier.Reference;
            } else if (t.tokenType === TokenKind.Ellipsis) {
                this.symbol.modifiers |= SymbolModifier.Variadic;
            } else if (t.tokenType === TokenKind.VariableName) {

                const name = utils.nodeText(t);
                const loc = utils.nodePackedLocation(t);

                this.symbol = Definition.create(SymbolKind.Parameter, name, loc);
                this.reference = Reference.create(SymbolKind.Parameter, name, loc);
                (<ReferencePhrase>this.node).reference = this.reference;
                SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
                this.reference.type = this.symbol.type;
            }
        }
    }

    push(transform: NodeTransformer) {

        if (!this.symbol) {
            return;
        }

        if ((<Phrase>transform.node).phraseType === PhraseKind.TypeDeclaration) {
            this.symbol.type = this.reference.type = (<TypeDeclarationTransformer>transform).type;
        } else if ((<Phrase>transform.node).phraseType === PhraseKind.DefaultArgumentSpecifier) {

            this.symbol.value = (<TextTransformer>transform).text;
        }
    }

}

class DefineFunctionCallExpressionTransformer implements SymbolTransformer {

    symbol: Definition;
    reference: Reference

    constructor(
        public node: Phrase | Token,
        private utils: NodeUtils
    ) { }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseKind.ArgumentExpressionList) {

            let arg1: TextTransformer, arg2: TextTransformer;
            [arg1, arg2] = (<DelimiteredListTransformer>transformer).transforms as TextTransformer[];

            if (arg1 && arg1.tokenType === TokenKind.StringLiteral) {
                let constName = arg1.text.slice(1, -1); //remove quotes
                if (constName && constName[0] === '\\') {
                    constName = constName.slice(1);
                }
                this.symbol = Definition.create(SymbolKind.Constant, constName, this.utils.nodePackedLocation(this.node));
                this.reference = Reference.create(SymbolKind.Constant, constName, (<TokenTransformer>arg1).location.range);
                (<ReferencePhrase>this.node).reference = this.reference;
            }

            //this could be an array or scalar expression too
            //could resolve scalar expression in type pass to a value and type
            //but array may be too large to add as value here
            if (
                arg2 &&
                (
                    arg2.tokenType === TokenKind.FloatingLiteral ||
                    arg2.tokenType === TokenKind.IntegerLiteral ||
                    arg2.tokenType === TokenKind.StringLiteral
                )
            ) {
                this.symbol.value = arg2.text;
                this.symbol.type = SymbolReader.tokenTypeToPhpType(arg2.tokenType);
            }

        }
    }

}

class SimpleVariableTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseKind.SimpleVariable;
    symbol: Definition;
    /**
     * dynamic variables dont get a reference
     */
    reference: Reference;

    constructor(public node: Phrase, private utils: NodeUtils) {

        const variableNameToken = node.children[0] as Token;
        if (variableNameToken.tokenType !== TokenKind.VariableName) {
            return;
        }

        const name = utils.nodeText(variableNameToken);
        const loc = utils.nodePackedLocation(node);

        this.symbol = Definition.create(SymbolKind.Variable, name, loc);
        this.reference = Reference.create(SymbolKind.Variable, name, loc);
        (<ReferencePhrase>node).reference = this.reference;

    }

    push(transformer: NodeTransformer) { }

}

class AnonymousClassDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseKind.AnonymousClassDeclaration;
    symbol: Definition;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.symbol = Definition.create(SymbolKind.Class, utils.anonymousName(<Phrase>node), utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Anonymous;
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseKind.AnonymousClassDeclarationHeader) {
            Array.prototype.push.apply(this.symbol.associated, (<AnonymousClassDeclarationHeaderTransformer>transformer).associated);
        } else if ((<Phrase>transformer.node).phraseType === PhraseKind.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, Definition.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name))
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }
    }

}

class TypeDeclarationBodyTransformer implements NodeTransformer {

    declarations: Definition[];
    useTraits: Reference[];

    constructor(public node: Phrase | Token, public phraseType: PhraseKind) {
        this.declarations = [];
        this.useTraits = [];
    }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseKind.ClassConstDeclaration:
            case PhraseKind.PropertyDeclaration:
                Array.prototype.push.apply(this.declarations, (<FieldDeclarationTransformer>transform).symbols);
                break;

            case PhraseKind.MethodDeclaration:
                this.declarations.push((<MethodDeclarationTransformer>transform).symbol);
                break;

            case PhraseKind.TraitUseClause:
                Array.prototype.push.apply(this.useTraits, (<TraitUseClauseTransformer>transform).references);
                break;

            default:
                break;

        }
    }

}

class AnonymousClassDeclarationHeaderTransformer implements NodeTransformer {

    phraseType = PhraseKind.AnonymousClassDeclarationHeader;
    associated: Reference[];

    constructor(public node: Phrase | Token) {
        this.associated = [];
    }

    push(transformer: NodeTransformer) {

        if (
            (<Phrase>transformer.node).phraseType === PhraseKind.FullyQualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseKind.QualifiedName ||
            (<Phrase>transformer.node).phraseType === PhraseKind.RelativeQualifiedName
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

    symbol: Definition;
    private _children: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.symbol = Definition.create(SymbolKind.Function, utils.anonymousName(<Phrase>node), utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Anonymous;
        this._children = new UniqueSymbolCollection();
    }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseKind.AnonymousFunctionHeader) {
            this.symbol.modifiers |= (<AnonymousFunctionHeaderTransformer>transformer).modifier;
            this._children.pushMany(
                Definition.setScope((<AnonymousFunctionHeaderTransformer>transformer).parameters, this.symbol.name)
            );
            this._children.pushMany(
                Definition.setScope((<AnonymousFunctionHeaderTransformer>transformer).uses, this.symbol.name)
            );
            this.symbol.type = (<AnonymousFunctionHeaderTransformer>transformer).returnType;
        } else if ((<Phrase>transformer.node).phraseType === PhraseKind.FunctionDeclarationBody) {
            this._children.pushMany(
                Definition.setScope((<FunctionDeclarationBodyTransformer>transformer).symbols, this.symbol.name)
            );
        }
    }

}

class AnonymousFunctionHeaderTransformer implements NodeTransformer {

    modifier = SymbolModifier.None;
    parameters: Definition[];
    uses: Definition[];
    returnType = '';

    constructor(public node: Phrase) {
        this.parameters = [];
        this.uses = [];

        let t: Token;
        for (let n = 0, l = node.children.length; n < l; ++n) {
            t = node.children[n] as Token;

        }
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenKind.Ampersand) {
            this.modifier |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenKind.Static) {
            this.modifier |= SymbolModifier.Static;
        } else if (transform.phraseType === PhraseKind.ParameterDeclaration) {
            const s = (<ParameterDeclarationTransformer>transform).symbol;
            if (s) {
                this.parameters.push(s);
            }
        } else if (transform.phraseType === PhraseKind.AnonymousFunctionUseVariable) {
            const s = (<AnonymousFunctionUseVariableTransformer>transform).symbol;
            if (s) {
                this.uses.push(s);
            }
        } else if (transform.phraseType === PhraseKind.TypeDeclaration) {
            this.returnType = (<TypeDeclarationTransformer>transform).type;
        }
    }

}

class FunctionDeclarationBodyTransformer implements SymbolsTransformer {

    private _value: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, public phraseType: PhraseKind) {
        this._value = new UniqueSymbolCollection();
    }

    push(transformer: NodeTransformer) {

        switch (transformer.phraseType) {
            case PhraseKind.SimpleVariable:
            case PhraseKind.AnonymousFunctionCreationExpression:
            case PhraseKind.AnonymousClassDeclaration:
            case PhraseKind.FunctionCallExpression: //define    
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

    phraseType = PhraseKind.AnonymousFunctionUseVariable;
    reference: Reference;
    symbol: Definition;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this.symbol = Definition.create(SymbolKind.Variable, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Use;
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenKind.Ampersand) {
            this.symbol.modifiers |= SymbolModifier.Reference;
        } else if (transform.tokenType === TokenKind.VariableName) {
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

    phraseType = PhraseKind.InterfaceDeclaration;
    symbol: Definition;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = Definition.create(SymbolKind.Interface, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseKind.InterfaceDeclarationHeader) {
            this.symbol.name = (<InterfaceDeclarationHeaderTransformer>transform).name;
            this.symbol.associated = (<InterfaceDeclarationHeaderTransformer>transform).associated;
        } else if (transform.phraseType === PhraseKind.InterfaceDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, Definition.setScope((<TypeDeclarationBodyTransformer>transform).declarations, this.symbol.name));
        }
    }

}

class ConstElementTransformer implements SymbolTransformer {

    phraseType = PhraseKind.ConstElement;
    symbol: Definition;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {

        this.symbol = Definition.create(SymbolKind.Constant, '', this.utils.nodePackedLocation(node));
        this.symbol.scope = this.nameResolver.namespaceName;
        this.reference = Reference.create(SymbolKind.Constant, '', this.symbol.location.range);
        (<ReferencePhrase>this.node).reference = this.reference;
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenKind.Name) {
            this.symbol.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            this.reference.name = this.symbol.name;
            this.reference.range = (<TokenTransformer>transformer).location.range;
            SymbolReader.assignTypeToReference(this.symbol.type, <Reference>(<ReferencePhrase>this.node).reference);
        } else if (
            transformer.tokenType === TokenKind.StringLiteral ||
            transformer.tokenType === TokenKind.IntegerLiteral ||
            transformer.tokenType === TokenKind.FloatingLiteral
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

    phraseType = PhraseKind.TraitDeclaration;
    symbol: Definition;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = Definition.create(SymbolKind.Trait, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
        this.symbol.children = [];
        this.symbol.associated = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseKind.TraitDeclarationHeader) {
            this.symbol.name = (<TraitDeclarationHeaderTransformer>transformer).name;
        } else if (transformer.phraseType === PhraseKind.TraitDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, Definition.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }
    }

}

class TraitDeclarationHeaderTransformer implements NodeTransformer {
    phraseType = PhraseKind.TraitDeclarationHeader;
    name = '';
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) { }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenKind.Name) {
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
    phraseType = PhraseKind.InterfaceDeclarationHeader;
    name = '';
    associated: Reference[];
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.associated = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenKind.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Interface,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (
            transformer.phraseType === PhraseKind.FullyQualifiedName ||
            transformer.phraseType === PhraseKind.QualifiedName ||
            transformer.phraseType === PhraseKind.RelativeQualifiedName
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

    phraseType = PhraseKind.TraitUseClause;
    references: Reference[];

    constructor(public node: Phrase | Token) {
        this.references = [];
    }

    push(transformer: NodeTransformer) {
        if (
            transformer.phraseType === PhraseKind.FullyQualifiedName ||
            transformer.phraseType === PhraseKind.QualifiedName ||
            transformer.phraseType === PhraseKind.RelativeQualifiedName
        ) {
            const ref = (<ReferenceTransformer>transformer).reference;
            if (ref) {
                this.references.push(ref);
            }
        }
    }

}

class NamespaceDefinitionHeaderTransformer implements TextTransformer {

    phraseType = PhraseKind.NamespaceDefinitionHeader;
    text = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        if ((<Phrase>transformer.node).phraseType === PhraseKind.NamespaceName) {
            this.text = (<NamespaceNameTransformer>transformer).text;
        }
    }

}

class NamespaceDefinitionTransformer implements SymbolTransformer {

    phraseType = PhraseKind.NamespaceDefinition;
    private _symbol: Definition;
    private _children: UniqueSymbolCollection;

    constructor(public node: Phrase | Token, private utils: NodeUtils) {
        this._symbol = Definition.create(SymbolKind.Namespace, '', utils.nodePackedLocation(node));
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {
        if (transform.phraseType === PhraseKind.NamespaceDefinitionHeader) {
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

    phraseType = PhraseKind.ClassDeclaration;
    symbol: Definition;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = Definition.create(SymbolKind.Class, '', utils.nodePackedLocation(node));
        this.symbol.children = [];
        this.symbol.associated = [];
        SymbolReader.assignPhpDocInfoToSymbol(this.symbol, doc, docLocation, nameResolver);
    }

    push(transformer: NodeTransformer) {

        if (transformer.phraseType === PhraseKind.ClassDeclarationHeader) {
            this.symbol.modifiers = (<ClassDeclarationHeaderTransformer>transformer).modifier;
            this.symbol.name = (<ClassDeclarationHeaderTransformer>transformer).name;
            if ((<ClassDeclarationHeaderTransformer>transformer).associated) {
                Array.prototype.push.apply(this.symbol.associated, (<ClassDeclarationHeaderTransformer>transformer).associated);
            }
        } else if (transformer.phraseType === PhraseKind.ClassDeclarationBody) {
            Array.prototype.push.apply(this.symbol.children, Definition.setScope((<TypeDeclarationBodyTransformer>transformer).declarations, this.symbol.name));
            Array.prototype.push.apply(this.symbol.associated, (<TypeDeclarationBodyTransformer>transformer).useTraits);
        }

    }

}

class ClassDeclarationHeaderTransformer implements NodeTransformer {

    modifier = SymbolModifier.None;
    name = '';
    associated: Reference[];
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.associated = [];



    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenKind.Abstract) {
            this.modifier = SymbolModifier.Abstract;
        } else if (transformer.tokenType === TokenKind.Final) {
            this.modifier = SymbolModifier.Final;
        } else if (transformer.tokenType === TokenKind.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Class,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (
            transformer.phraseType === PhraseKind.FullyQualifiedName ||
            transformer.phraseType === PhraseKind.QualifiedName ||
            transformer.phraseType === PhraseKind.RelativeQualifiedName
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

    phraseType = PhraseKind.MemberModifierList;
    modifiers = SymbolModifier.None;

    constructor(public node: Phrase | Token) { }

    push(transform: NodeTransformer) {
        switch (transform.tokenType) {
            case TokenKind.Public:
                this.modifiers |= SymbolModifier.Public;
                break;
            case TokenKind.Protected:
                this.modifiers |= SymbolModifier.Protected;
                break;
            case TokenKind.Private:
                this.modifiers |= SymbolModifier.Private;
                break;
            case TokenKind.Abstract:
                this.modifiers |= SymbolModifier.Abstract;
                break;
            case TokenKind.Final:
                this.modifiers |= SymbolModifier.Final;
                break;
            case TokenKind.Static:
                this.modifiers |= SymbolModifier.Static;
                break;
            default:
                break;
        }
    }

}

class ClassConstantElementTransform implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseKind.ClassConstElement;
    symbol: Definition;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = Definition.create(SymbolKind.ClassConstant, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Static;
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseKind.Identifier) {
            this.symbol.name = (<IdentifierTransformer>transformer).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            (<ReferencePhrase>this.node).reference = Reference.create(
                SymbolKind.ClassConstant,
                this.symbol.name,
                (<IdentifierTransformer>transformer).location.range
            );
        } else if (
            transformer.tokenType === TokenKind.StringLiteral ||
            transformer.tokenType === TokenKind.IntegerLiteral ||
            transformer.tokenType === TokenKind.FloatingLiteral
        ) {
            //could also be any scalar expression or array
            //handle in types pass ?
            this.symbol.value = (<TextTransformer>transformer).text;
            this.symbol.type = SymbolReader.tokenTypeToPhpType(transformer.tokenType);
        }
    }

}

class MethodDeclarationTransformer implements SymbolTransformer {

    phraseType = PhraseKind.MethodDeclaration;
    private _children: UniqueSymbolCollection;
    private _symbol: Definition;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this._symbol = Definition.create(SymbolKind.Method, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, doc, docLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transform: NodeTransformer) {

        if (transform instanceof MethodDeclarationHeaderTransformer) {
            this._symbol.modifiers = transform.modifiers;
            this._symbol.name = transform.name;
            this._children.pushMany(transform.parameters);
            this._symbol.type = transform.returnType;
        } else if (transform.phraseType === PhraseKind.MethodDeclarationBody) {
            this._children.pushMany((<FunctionDeclarationBodyTransformer>transform).symbols);
        }

    }

    get symbol() {
        this._symbol.children = Definition.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class TypeDeclarationTransformer implements NodeTransformer {

    phraseType = PhraseKind.TypeDeclaration;
    type = '';

    constructor(public node: Phrase | Token) { }

    push(transform: NodeTransformer) {

        switch (transform.phraseType) {
            case PhraseKind.FullyQualifiedName:
            case PhraseKind.RelativeQualifiedName:
            case PhraseKind.QualifiedName:
                this.type = (<NameTransformer>transform).name;
                break;

            case undefined:
                if (transform.tokenType === TokenKind.Callable) {
                    this.type = 'callable';
                } else if (transform.tokenType === TokenKind.Array) {
                    this.type = 'array';
                }
                break;

            default:
                break;
        }

    }

}

class IdentifierTransformer implements TextTransformer {

    phraseType = PhraseKind.Identifier;
    text = '';
    location: PackedLocation;

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.text = (<TokenTransformer>transformer).text;
        this.location = (<TokenTransformer>transformer).location;
    }

}

class MethodDeclarationHeaderTransformer implements NodeTransformer, ReferenceTransformer {

    phraseType = PhraseKind.MethodDeclarationHeader;
    modifiers = SymbolModifier.Public;
    name = '';
    parameters: Definition[];
    returnType = '';
    reference: Reference;

    constructor(public node: Phrase | Token) {
        this.parameters = [];
    }

    push(transformer: NodeTransformer) {
        switch (transformer.phraseType) {
            case PhraseKind.MemberModifierList:
                this.modifiers = (<MemberModifierListTransformer>transformer).modifiers;
                if (!(this.modifiers & (SymbolModifier.Public | SymbolModifier.Protected | SymbolModifier.Private))) {
                    this.modifiers |= SymbolModifier.Public;
                }
                break;

            case PhraseKind.Identifier:
                this.name = (<IdentifierTransformer>transformer).text;
                this.reference = Reference.create(
                    SymbolKind.Method,
                    this.name,
                    (<IdentifierTransformer>transformer).location.range
                );
                (<ReferencePhrase>this.node).reference = this.reference;
                break;

            case PhraseKind.ParameterDeclaration:
                {
                    const s = (<ParameterDeclarationTransformer>transformer).symbol;
                    if (s) {
                        this.parameters.push(s);
                    }
                }
                break;

            case PhraseKind.TypeDeclaration:
                this.returnType = (<TypeDeclarationTransformer>transformer).type;
                break;

            default:
                break;
        }
    }

}

class PropertyInitialiserTransformer implements NodeTransformer {

    phraseType = PhraseKind.PropertyInitialiser;
    text = '';

    constructor(public node: Phrase | Token) { }

    push(transformer: NodeTransformer) {
        this.text = (<TextTransformer>transformer).text;
    }

}

class PropertyElementTransformer implements SymbolTransformer, ReferenceTransformer {

    phraseType = PhraseKind.PropertyElement;
    symbol: Definition;
    reference: Reference;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private doc: PhpDoc,
        private docLocation: PackedLocation
    ) {
        this.symbol = Definition.create(SymbolKind.Property, '', utils.nodePackedLocation(node));
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenKind.VariableName) {
            this.symbol.name = (<TokenTransformer>transformer).text;
            SymbolReader.assignPhpDocInfoToSymbol(this.symbol, this.doc, this.docLocation, this.nameResolver);
            this.reference = Reference.create(
                SymbolKind.Property,
                this.symbol.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transformer.phraseType === PhraseKind.PropertyInitialiser) {
            //this.symbol.value = (<PropertyInitialiserTransformer>transform).text;
        }

    }

}

class FieldDeclarationTransformer implements SymbolsTransformer {

    private _modifier = SymbolModifier.Public;
    symbols: Definition[];

    constructor(public node: Phrase | Token, public phraseType: PhraseKind, private elementType: PhraseKind) {
        this.symbols = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseKind.MemberModifierList) {
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

    phraseType = PhraseKind.FunctionDeclaration;
    private _symbol: Definition;
    private _children: UniqueSymbolCollection;

    constructor(
        public node: Phrase | Token,
        public nameResolver: NameResolver,
        private utils: NodeUtils,
        private phpDoc: PhpDoc,
        private phpDocLocation: PackedLocation
    ) {
        this._symbol = Definition.create(SymbolKind.Function, '', utils.nodePackedLocation(node));
        SymbolReader.assignPhpDocInfoToSymbol(this._symbol, phpDoc, phpDocLocation, nameResolver);
        this._children = new UniqueSymbolCollection();
    }

    push(transformer: NodeTransformer) {
        if (transformer.phraseType === PhraseKind.FunctionDeclarationHeader) {
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
        this._symbol.children = Definition.setScope(this._children.toArray(), this._symbol.name);
        return this._symbol;
    }

}

class FunctionDeclarationHeaderTransformer implements NodeTransformer, ReferenceTransformer {

    phraseType = PhraseKind.FunctionDeclarationHeader;
    name = '';
    parameters: Definition[];
    returnType = '';
    reference: Reference;

    constructor(public node: Phrase | Token, public nameResolver: NameResolver) {
        this.parameters = [];
    }

    push(transformer: NodeTransformer) {

        if (transformer.tokenType === TokenKind.Name) {
            this.name = this.nameResolver.resolveRelative((<TokenTransformer>transformer).text);
            this.reference = Reference.create(
                SymbolKind.Function,
                this.name,
                (<TokenTransformer>transformer).location.range
            );
            (<ReferencePhrase>this.node).reference = this.reference;
        } else if (transformer.phraseType === PhraseKind.ParameterDeclaration) {
            const s = (<ParameterDeclarationTransformer>transformer).symbol;
            if (s) {
                this.parameters.push(s);
            }
        } else if (transformer.phraseType === PhraseKind.TypeDeclaration) {
            this.returnType = (<TypeDeclarationTransformer>transformer).type;
        }
    }
}

class DefaultNodeTransformer implements TextTransformer {

    constructor(public node: Phrase | Token, public phraseType: PhraseKind, private utils: NodeUtils) { }
    push(transform: NodeTransformer) { }
    get text() {
        return this.utils.nodeText(this.node);
    }
}

export namespace SymbolReader {

    export function tokenTypeToPhpType(tokenType: TokenKind) {
        switch (tokenType) {
            case TokenKind.StringLiteral:
                return 'string';
            case TokenKind.IntegerLiteral:
                return 'int';
            case TokenKind.FloatingLiteral:
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

    export function assignPhpDocInfoToSymbol(s: Definition, doc: PhpDoc, docLocation: PackedLocation, nameResolver: NameResolver) {

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
        let symbols: Definition[] = [];

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

        let s = Definition.create(SymbolKind.Method, tag.name, phpDocLoc);
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

        let s = Definition.create(SymbolKind.Parameter, p.name, phpDocLoc);
        s.modifiers = SymbolModifier.Magic;
        s.doc = PhpSymbolDoc.create(undefined, TypeString.nameResolve(p.typeString, nameResolver));
        return s;

    }

    function propertyTagToSymbol(t: Tag, phpDocLoc: PackedLocation, nameResolver: NameResolver) {
        let s = Definition.create(SymbolKind.Property, t.name, phpDocLoc);
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
            case TokenKind.Public:
                return SymbolModifier.Public;
            case TokenKind.Protected:
                return SymbolModifier.Protected;
            case TokenKind.Private:
                return SymbolModifier.Private;
            case TokenKind.Abstract:
                return SymbolModifier.Abstract;
            case TokenKind.Final:
                return SymbolModifier.Final;
            case TokenKind.Static:
                return SymbolModifier.Static;
            default:
                return SymbolModifier.None;
        }

    }

}

class NamespaceUseDeclarationTransformer implements SymbolsTransformer {

    phraseType = PhraseKind.NamespaceUseDeclaration;
    symbols: Definition[];
    private _kind = SymbolKind.Class;
    private _prefix = '';

    constructor(public node: Phrase | Token) {
        this.symbols = [];
    }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenKind.Const) {
            this._kind = SymbolKind.Constant;

        } else if (transform.tokenType === TokenKind.Function) {
            this._kind = SymbolKind.Function;

        } else if (transform.phraseType === PhraseKind.NamespaceName) {

            this._prefix = (<NamespaceNameTransformer>transform).text;
            (<NamespaceNameTransformer>transform).reference.kind = SymbolKind.Namespace;

        } else if (
            transform.phraseType === PhraseKind.NamespaceUseGroupClause ||
            transform.phraseType === PhraseKind.NamespaceUseClause
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

    symbol: Definition;
    /**
     * a reference for namespace name and a reference for alias
     */
    references: Reference[];

    constructor(public node: Phrase | Token, public phraseType: PhraseKind, private utils: NodeUtils) {
        this.symbol = Definition.create(0, '', utils.nodePackedLocation(node));
        this.symbol.modifiers = SymbolModifier.Use;
        this.symbol.associated = [];
        this.references = [];
    }

    push(transformer: NodeTransformer) {
        if (transformer.tokenType === TokenKind.Function) {
            this.symbol.kind = SymbolKind.Function;
        } else if (transformer.tokenType === TokenKind.Const) {
            this.symbol.kind = SymbolKind.Constant;
        } else if (transformer.phraseType === PhraseKind.NamespaceName) {
            const text = (<NamespaceNameTransformer>transformer).text;
            const ref = (<NamespaceNameTransformer>transformer).reference;
            ref.kind = this.symbol.kind;
            this.symbol.name = Definition.notFqn(text);
            this.symbol.associated.push(ref);
            this.references.push(ref);
        } else if (transformer.phraseType === PhraseKind.NamespaceAliasingClause) {
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

    phraseType = PhraseKind.NamespaceAliasingClause;
    text = '';
    reference: Reference;

    constructor(public node: Phrase | Token) { }

    push(transform: NodeTransformer) {
        if (transform.tokenType === TokenKind.Name) {
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

