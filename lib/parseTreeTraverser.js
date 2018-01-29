'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./types");
const parsedDocument_1 = require("./parsedDocument");
class ParseTreeTraverser extends types_1.TreeTraverser {
    constructor(document, symbolTable, refTable) {
        super([document.tree]);
        this._doc = document;
        this._symbolTable = symbolTable;
        this._refTable = refTable;
    }
    get document() {
        return this._doc;
    }
    get symbolTable() {
        return this._symbolTable;
    }
    get refTable() {
        return this._refTable;
    }
    get text() {
        return this._doc.nodeText(this.node);
    }
    get range() {
        return this._doc.nodeRange(this.node);
    }
    get reference() {
        let range = this.range;
        return this._refTable.referenceAtPosition(range.start);
    }
    get scope() {
        let range = this.range;
        if (!range) {
            return null;
        }
        return this._symbolTable.scope(range.start);
    }
    get nameResolver() {
        let firstToken = parsedDocument_1.ParsedDocument.firstToken(this.node);
        let pos = this.document.positionAtOffset(firstToken.offset);
        return this._symbolTable.nameResolver(pos);
    }
    position(pos) {
        let offset = this._doc.offsetAtPosition(pos) - 1;
        let fn = (x) => {
            return x.tokenType !== undefined &&
                offset < x.offset + x.length &&
                offset >= x.offset;
        };
        return this.find(fn);
    }
    clone() {
        let spine = this.spine;
        let traverser = new ParseTreeTraverser(this._doc, this._symbolTable, this._refTable);
        traverser._spine = spine;
        return traverser;
    }
    get isDeclarationName() {
        let traverser = this.clone();
        let t = traverser.node;
        let parent = traverser.parent();
        if (!t || !parent) {
            return false;
        }
        return ((t.tokenType === 83 || t.tokenType === 84) && this._isDeclarationPhrase(parent)) ||
            (parent.phraseType === 95 && this._isDeclarationPhrase(traverser.parent()));
    }
    _isDeclarationPhrase(node) {
        if (!node) {
            return false;
        }
        switch (node.phraseType) {
            case 30:
            case 167:
            case 105:
            case 138:
            case 43:
            case 129:
            case 88:
            case 115:
            case 26:
                return true;
            default:
                return false;
        }
    }
}
exports.ParseTreeTraverser = ParseTreeTraverser;
