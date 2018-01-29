'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const lexer_1 = require("./lexer");
const phrase_1 = require("./phrase");
var Parser;
(function (Parser) {
    function precedenceAssociativityTuple(t) {
        switch (t.tokenType) {
            case 114:
                return [48, 2];
            case 136:
                return [47, 2];
            case 130:
                return [47, 2];
            case 87:
                return [47, 2];
            case 153:
                return [47, 2];
            case 154:
                return [47, 2];
            case 151:
                return [47, 2];
            case 156:
                return [47, 2];
            case 152:
                return [47, 2];
            case 149:
                return [47, 2];
            case 150:
                return [47, 2];
            case 95:
                return [47, 2];
            case 43:
                return [46, 0];
            case 90:
                return [45, 2];
            case 102:
                return [44, 1];
            case 92:
                return [44, 1];
            case 93:
                return [44, 1];
            case 112:
                return [43, 1];
            case 144:
                return [43, 1];
            case 127:
                return [43, 1];
            case 107:
                return [42, 1];
            case 109:
                return [42, 1];
            case 100:
                return [41, 0];
            case 101:
                return [41, 0];
            case 142:
                return [41, 0];
            case 138:
                return [41, 0];
            case 137:
                return [40, 0];
            case 139:
                return [40, 0];
            case 140:
                return [40, 0];
            case 141:
                return [40, 0];
            case 143:
                return [40, 0];
            case 104:
                return [39, 1];
            case 126:
                return [38, 1];
            case 124:
                return [37, 1];
            case 103:
                return [36, 1];
            case 125:
                return [35, 1];
            case 123:
                return [34, 2];
            case 97:
                return [33, 1];
            case 86:
                return [32, 2];
            case 128:
                return [32, 2];
            case 113:
                return [32, 2];
            case 145:
                return [32, 2];
            case 147:
                return [32, 2];
            case 131:
                return [32, 2];
            case 146:
                return [32, 2];
            case 115:
                return [32, 2];
            case 105:
                return [32, 2];
            case 111:
                return [32, 2];
            case 106:
                return [32, 2];
            case 108:
                return [32, 2];
            case 110:
                return [32, 2];
            case 48:
                return [31, 1];
            case 50:
                return [30, 1];
            case 49:
                return [29, 1];
            default:
                throwUnexpectedTokenError(t);
        }
    }
    const statementListRecoverSet = [
        66,
        38,
        12,
        35,
        9,
        2,
        31,
        63,
        45,
        117,
        39,
        68,
        16,
        33,
        61,
        5,
        13,
        59,
        36,
        60,
        17,
        65,
        34,
        14,
        64,
        62,
        37,
        89,
        159
    ];
    const classMemberDeclarationListRecoverSet = [
        55,
        56,
        54,
        60,
        2,
        31,
        35,
        67,
        12,
        66,
    ];
    const encapsulatedVariableListRecoverSet = [
        80,
        132,
        129
    ];
    function binaryOpToPhraseType(t) {
        switch (t.tokenType) {
            case 97:
                return 40;
            case 127:
            case 112:
            case 144:
                return 1;
            case 124:
            case 104:
            case 126:
                return 14;
            case 102:
            case 92:
            case 93:
                return 118;
            case 114:
                return 72;
            case 107:
            case 109:
                return 157;
            case 103:
            case 125:
            case 48:
            case 49:
            case 50:
                return 110;
            case 139:
            case 141:
            case 137:
            case 140:
                return 60;
            case 100:
            case 142:
            case 101:
            case 138:
            case 143:
                return 146;
            case 123:
                return 37;
            case 86:
                return 158;
            case 113:
            case 145:
            case 147:
            case 115:
            case 131:
            case 128:
            case 146:
            case 105:
            case 111:
            case 106:
            case 108:
            case 110:
                return 38;
            case 43:
                return 101;
            default:
                return 0;
        }
    }
    var tokenBuffer;
    var phraseStack;
    var errorPhrase;
    var recoverSetStack;
    function parse(text) {
        init(text);
        return statementList([1]);
    }
    Parser.parse = parse;
    function init(text, lexerModeStack) {
        lexer_1.Lexer.setInput(text, lexerModeStack);
        phraseStack = [];
        tokenBuffer = [];
        recoverSetStack = [];
        errorPhrase = null;
    }
    function optional(tokenType) {
        return tokenType === peek().tokenType ? next() : undefined;
    }
    function optionalOneOf(tokenTypes) {
        return tokenTypes.indexOf(peek().tokenType) > -1 ? next() : undefined;
    }
    function next(allowDocComment) {
        const t = tokenBuffer.length > 0 ? tokenBuffer.shift() : lexer_1.Lexer.lex();
        if (t.tokenType >= 160 && (!allowDocComment || t.tokenType !== 161)) {
            return next(allowDocComment);
        }
        return t;
    }
    function expect(tokenType) {
        let t = peek();
        if (t.tokenType === tokenType) {
            return next();
        }
        else if (tokenType === 89 && t.tokenType === 159) {
            return lexer_1.Token.create(85, t.offset, 0, t.modeStack);
        }
        else {
            if (peek(1).tokenType === tokenType) {
                return error([next(), next()], t, tokenType);
            }
            return error([], t, tokenType);
        }
    }
    function expectOneOf(tokenTypes) {
        let t = peek();
        if (tokenTypes.indexOf(t.tokenType) > -1) {
            return next();
        }
        else if (tokenTypes.indexOf(89) > -1 && t.tokenType === 159) {
            return lexer_1.Token.create(85, t.offset, 0, t.modeStack);
        }
        else {
            if (tokenTypes.indexOf(peek(1).tokenType) > -1) {
                return error([next(), next()], t);
            }
            return error([], t);
        }
    }
    function peek(n, allowDocComment) {
        n = n ? n + 1 : 1;
        let bufferPos = -1;
        let t;
        do {
            ++bufferPos;
            if (bufferPos === tokenBuffer.length) {
                tokenBuffer.push(lexer_1.Lexer.lex());
            }
            t = tokenBuffer[bufferPos];
            if (t.tokenType < 160 || (allowDocComment && t.tokenType === 161)) {
                --n;
            }
        } while (t.tokenType !== 1 && n > 0);
        return t;
    }
    function skip(until) {
        let t;
        let skipped = [];
        do {
            t = tokenBuffer.length ? tokenBuffer.shift() : lexer_1.Lexer.lex();
            skipped.push(t);
        } while (!until(t) && t.tokenType !== 1);
        tokenBuffer.unshift(skipped.pop());
        return skipped;
    }
    function error(children, unexpected, expected) {
        let start;
        let end;
        if (children.length > 0) {
            start = nodePackedRange(children[0])[0];
            end = nodePackedRange(children[children.length - 1])[1];
        }
        else {
            start = end = lexer_1.Lexer.tokenPackedRange(unexpected)[0];
        }
        return phrase_1.Phrase.createParseError(start, end, children, unexpected, expected);
    }
    function phrase(type, children, packedRange) {
        if (!packedRange) {
            if (children.length < 1) {
                packedRange = lexer_1.Lexer.tokenPackedRange(peek());
                packedRange[1] = packedRange[0];
            }
            else {
                packedRange = [nodePackedRange(children[0])[0], nodePackedRange(children[children.length - 1])[1]];
            }
        }
        return phrase_1.Phrase.create(type, packedRange[0], packedRange[1], children);
    }
    function list(phraseType, elementFunction, elementStartPredicate, breakOn, recoverSet, allowDocComment) {
        let t;
        let listRecoverSet = recoverSet ? recoverSet.slice(0) : [];
        let children = [];
        if (breakOn) {
            Array.prototype.push.apply(listRecoverSet, breakOn);
        }
        recoverSetStack.push(listRecoverSet);
        while (true) {
            t = peek(0, allowDocComment);
            if (elementStartPredicate(t)) {
                children.push(elementFunction());
            }
            else if (!breakOn || breakOn.indexOf(t.tokenType) > -1) {
                break;
            }
            else {
                let t1 = peek(1, allowDocComment);
                if (elementStartPredicate(t1) || (breakOn && breakOn.indexOf(t1.tokenType) > -1)) {
                    children.push(error([next()], t));
                }
                else {
                    children.push(error(defaultSyncStrategy(), t));
                    t = peek(0, allowDocComment);
                    if (listRecoverSet.indexOf(t.tokenType) < 0) {
                        break;
                    }
                }
            }
        }
        recoverSetStack.pop();
        return phrase(phraseType, children);
    }
    function defaultSyncStrategy() {
        let mergedRecoverTokenTypeArray = [];
        for (let n = recoverSetStack.length - 1; n >= 0; --n) {
            Array.prototype.push.apply(mergedRecoverTokenTypeArray, recoverSetStack[n]);
        }
        let mergedRecoverTokenTypeSet = new Set(mergedRecoverTokenTypeArray);
        let predicate = (x) => { return mergedRecoverTokenTypeSet.has(x.tokenType); };
        return skip(predicate);
    }
    function statementList(breakOn) {
        return list(160, statement, isStatementStart, breakOn, statementListRecoverSet, true);
    }
    function nodePackedRange(node) {
        return node.tokenType !== undefined ? lexer_1.Lexer.tokenPackedRange(node) : [node.start, node.end];
    }
    function constDeclaration() {
        const keyword = next();
        const list = delimitedList(44, constElement, isConstElementStartToken, 94, [89]);
        const semicolon = expect(89);
        return phrase(42, [keyword, list, semicolon]);
    }
    function isClassConstElementStartToken(t) {
        return t.tokenType === 83 || isSemiReservedToken(t);
    }
    function isConstElementStartToken(t) {
        return t.tokenType === 83;
    }
    function constElement() {
        const name = expect(83);
        const equals = expect(86);
        const expr = expression(0);
        return phrase(43, [name, equals, expr]);
    }
    function expression(minPrecedence) {
        let precedence;
        let associativity;
        let lhs = expressionAtom();
        let p;
        let rhs;
        let op = peek();
        let binaryPhraseType = binaryOpToPhraseType(op);
        while (binaryPhraseType !== 0) {
            [precedence, associativity] = precedenceAssociativityTuple(op);
            if (precedence < minPrecedence) {
                break;
            }
            if (associativity === 1) {
                ++precedence;
            }
            if (binaryPhraseType === 40) {
                lhs = ternaryExpression(lhs);
                op = peek();
                binaryPhraseType = binaryOpToPhraseType(op);
                continue;
            }
            op = next();
            if (binaryPhraseType === 101) {
                rhs = typeDesignator(102);
                lhs = phrase(binaryPhraseType, [lhs, op, rhs]);
            }
            else if (binaryPhraseType === 158 &&
                peek().tokenType === 104) {
                const ampersand = next();
                rhs = expression(precedence);
                lhs = phrase(16, [lhs, op, ampersand, rhs]);
            }
            else {
                rhs = expression(precedence);
                lhs = phrase(binaryPhraseType, [lhs, op, rhs]);
            }
            op = peek();
            binaryPhraseType = binaryOpToPhraseType(op);
        }
        return lhs;
    }
    function ternaryExpression(testExpr) {
        const question = next();
        let colon = optional(88);
        let falseExpr;
        if (colon) {
            falseExpr = expression(0);
            return phrase(40, [testExpr, question, colon, falseExpr]);
        }
        const trueExpr = expression(0);
        colon = expect(88);
        falseExpr = expression(0);
        return phrase(40, [testExpr, question, trueExpr, colon, falseExpr]);
    }
    function variableOrExpression() {
        let part = variableAtom();
        let isVariable = part.phraseType === 159;
        if (isDereferenceOperator(peek())) {
            part = variable(part);
            isVariable = true;
        }
        else {
            switch (part.phraseType) {
                case 144:
                case 85:
                case 147:
                    part = constantAccessExpression(part);
                    break;
                default:
                    break;
            }
        }
        if (!isVariable) {
            return part;
        }
        let t = peek();
        if (t.tokenType === 136) {
            return postfixExpression(135, part);
        }
        else if (t.tokenType === 130) {
            return postfixExpression(134, part);
        }
        else {
            return part;
        }
    }
    function constantAccessExpression(qName) {
        return phrase(41, [qName]);
    }
    function postfixExpression(phraseType, variableNode) {
        const op = next();
        return phrase(phraseType, [variableNode, op]);
    }
    function isDereferenceOperator(t) {
        switch (t.tokenType) {
            case 118:
            case 117:
            case 116:
            case 119:
            case 134:
                return true;
            default:
                return false;
        }
    }
    function expressionAtom() {
        let t = peek();
        switch (t.tokenType) {
            case 60:
                if (peek(1).tokenType === 35) {
                    return anonymousFunctionCreationExpression();
                }
                else {
                    return variableOrExpression();
                }
            case 78:
                if (isDereferenceOperator(peek(1))) {
                    return variableOrExpression();
                }
                else {
                    return next();
                }
            case 84:
            case 91:
            case 3:
            case 118:
            case 148:
            case 83:
            case 51:
            case 119:
                return variableOrExpression();
            case 136:
                return unaryExpression(137);
            case 130:
                return unaryExpression(136);
            case 112:
            case 144:
            case 90:
            case 87:
                return unaryExpression(177);
            case 95:
                return unaryExpression(64);
            case 153:
            case 154:
            case 151:
            case 156:
            case 152:
            case 149:
            case 150:
                return unaryExpression(19);
            case 47:
                return listIntrinsic();
            case 11:
                return cloneExpression();
            case 52:
                return objectCreationExpression();
            case 79:
            case 82:
            case 73:
            case 72:
            case 71:
            case 77:
            case 75:
            case 74:
            case 76:
            case 10:
                return next();
            case 155:
                return heredocStringLiteral();
            case 98:
                return doubleQuotedStringLiteral();
            case 96:
                return shellCommandExpression();
            case 53:
                return printIntrinsic();
            case 69:
                return yieldExpression();
            case 70:
                return yieldFromExpression();
            case 35:
                return anonymousFunctionCreationExpression();
            case 41:
                return scriptInclusion(98);
            case 42:
                return scriptInclusion(99);
            case 57:
                return scriptInclusion(149);
            case 58:
                return scriptInclusion(150);
            case 28:
                return evalIntrinsic();
            case 20:
                return emptyIntrinsic();
            case 29:
                return exitIntrinsic();
            case 46:
                return issetIntrinsic();
            default:
                return error([], t);
        }
    }
    function exitIntrinsic() {
        const keyword = next();
        const open = optional(119);
        if (!open) {
            return phrase(71, [keyword]);
        }
        if (!isExpressionStart(peek())) {
            const close = expect(122);
            return phrase(71, [keyword, open, close]);
        }
        const expr = expression(0);
        const close = expect(122);
        return phrase(71, [keyword, open, expr, close]);
    }
    function issetIntrinsic() {
        const keyword = next();
        const open = expect(119);
        const list = variableList([122]);
        const close = expect(122);
        return phrase(108, [keyword, open, list, close]);
    }
    function emptyIntrinsic() {
        const keyword = next();
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        return phrase(56, [keyword, open, expr, close]);
    }
    function evalIntrinsic() {
        const keyword = next();
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        return phrase(70, [keyword, open, expr, close]);
    }
    function scriptInclusion(phraseType) {
        const keyword = next();
        const expr = expression(0);
        return phrase(phraseType, [keyword, expr]);
    }
    function printIntrinsic() {
        const keyword = next();
        const expr = expression(0);
        return phrase(138, [keyword, expr]);
    }
    function yieldFromExpression() {
        const keyword = next();
        const expr = expression(0);
        return phrase(184, [keyword, expr]);
    }
    function yieldExpression() {
        const keyword = next();
        if (!isExpressionStart(peek())) {
            return phrase(183, [keyword]);
        }
        const keyOrValue = expression(0);
        const arrow = optional(133);
        if (!arrow) {
            return phrase(183, [keyword, keyOrValue]);
        }
        const value = expression(0);
        return phrase(183, [keyword, keyOrValue, arrow, value]);
    }
    function shellCommandExpression() {
        const open = next();
        const list = encapsulatedVariableList(96);
        const close = expect(96);
        return phrase(156, [open, list, close]);
    }
    function doubleQuotedStringLiteral() {
        const open = next();
        const list = encapsulatedVariableList(98);
        const close = expect(98);
        return phrase(51, [open, list, close]);
    }
    function encapsulatedVariableList(breakOn) {
        return list(59, encapsulatedVariable, isEncapsulatedVariableStart, [breakOn], encapsulatedVariableListRecoverSet);
    }
    function isEncapsulatedVariableStart(t) {
        switch (t.tokenType) {
            case 80:
            case 84:
            case 132:
            case 129:
                return true;
            default:
                return false;
        }
    }
    function encapsulatedVariable() {
        switch (peek().tokenType) {
            case 80:
                return next();
            case 84:
                {
                    let t = peek(1);
                    if (t.tokenType === 118) {
                        return encapsulatedDimension();
                    }
                    else if (t.tokenType === 116) {
                        return encapsulatedProperty();
                    }
                    else {
                        return simpleVariable();
                    }
                }
            case 132:
                return dollarCurlyOpenEncapsulatedVariable();
            case 129:
                return curlyOpenEncapsulatedVariable();
            default:
                throwUnexpectedTokenError(peek());
        }
    }
    function curlyOpenEncapsulatedVariable() {
        const open = next();
        const vble = variable(variableAtom());
        const close = expect(120);
        return phrase(58, [open, vble, close]);
    }
    function dollarCurlyOpenEncapsulatedVariable() {
        const open = next();
        const t = peek();
        let expr;
        if (t.tokenType === 84) {
            if (peek(1).tokenType === 118) {
                expr = dollarCurlyEncapsulatedDimension();
            }
            else {
                const varName = next();
                expr = phrase(159, [varName]);
            }
        }
        else if (isExpressionStart(t)) {
            expr = expression(0);
        }
        else {
            expr = error([], t);
        }
        const close = expect(120);
        return phrase(58, [open, expr, close]);
    }
    function dollarCurlyEncapsulatedDimension() {
        const varName = next();
        const open = next();
        const expr = expression(0);
        const close = expect(121);
        return phrase(163, [varName, open, expr, close]);
    }
    function encapsulatedDimension() {
        const sv = simpleVariable();
        const open = next();
        let expr;
        switch (peek().tokenType) {
            case 83:
            case 82:
                expr = next();
                break;
            case 84:
                expr = simpleVariable();
                break;
            case 144:
                {
                    const minus = next();
                    const intLiteral = expect(82);
                    expr = phrase(177, [minus, intLiteral]);
                }
                break;
            default:
                expr = error([], peek());
                break;
        }
        const close = expect(121);
        return phrase(163, [sv, open, expr, close]);
    }
    function encapsulatedProperty() {
        const sv = simpleVariable();
        const arrow = next();
        const name = expect(83);
        return phrase(139, [sv, arrow, name]);
    }
    function heredocStringLiteral() {
        const startHeredoc = next();
        const list = encapsulatedVariableList(27);
        const endHeredoc = expect(27);
        return phrase(95, [startHeredoc, list, endHeredoc]);
    }
    function anonymousClassDeclaration() {
        const header = anonymousClassDeclarationHeader();
        const body = typeDeclarationBody(29, isClassMemberStart, classMemberDeclarationList);
        return phrase(2, [header, body]);
    }
    function anonymousClassDeclarationHeader() {
        const children = [];
        children.push(next());
        const open = optional(119);
        if (open) {
            children.push(open);
            if (isArgumentStart(peek())) {
                children.push(argumentList());
            }
            children.push(expect(122));
        }
        if (peek().tokenType === 30) {
            children.push(classBaseClause());
        }
        if (peek().tokenType === 40) {
            children.push(classInterfaceClause());
        }
        return phrase(3, children);
    }
    function classInterfaceClause() {
        const keyword = next();
        const list = qualifiedNameList([117]);
        return phrase(31, [keyword, list]);
    }
    function classMemberDeclarationList() {
        return list(32, classMemberDeclaration, isClassMemberStart, [120], classMemberDeclarationListRecoverSet, true);
    }
    function isClassMemberStart(t) {
        switch (t.tokenType) {
            case 55:
            case 56:
            case 54:
            case 60:
            case 2:
            case 31:
            case 35:
            case 67:
            case 12:
            case 66:
            case 161:
                return true;
            default:
                return false;
        }
    }
    function docBlock() {
        const t = next(true);
        return phrase(49, [t]);
    }
    function classMemberDeclaration() {
        let t = peek(0, true);
        switch (t.tokenType) {
            case 161:
                return docBlock();
            case 55:
            case 56:
            case 54:
            case 60:
            case 2:
            case 31:
                {
                    const modifiers = memberModifierList();
                    t = peek();
                    if (t.tokenType === 84) {
                        return propertyDeclaration(modifiers);
                    }
                    else if (t.tokenType === 35) {
                        return methodDeclaration(modifiers);
                    }
                    else if (t.tokenType === 12) {
                        return classConstDeclaration(modifiers);
                    }
                    else {
                        return error([modifiers], t);
                    }
                }
            case 35:
                return methodDeclaration();
            case 67:
                return propertyDeclaration(next());
            case 12:
                return classConstDeclaration();
            case 66:
                return traitUseClause();
            default:
                throwUnexpectedTokenError(t);
        }
    }
    function throwUnexpectedTokenError(t) {
        throw new Error(`Unexpected token: ${lexer_1.tokenTypeToString(t.tokenType)}`);
    }
    function traitUseClause() {
        const use = next();
        const nameList = qualifiedNameList([89, 117]);
        const spec = traitUseSpecification();
        return phrase(173, [use, nameList, spec]);
    }
    function traitUseSpecification() {
        const t = expectOneOf([89, 117]);
        if (t.tokenType !== 117) {
            return phrase(174, [t]);
        }
        if (!isTraitAdaptationStart(peek())) {
            const close = expect(120);
            return phrase(174, [t, close]);
        }
        const adaptList = traitAdaptationList();
        const close = expect(120);
        return phrase(174, [t, adaptList, close]);
    }
    function traitAdaptationList() {
        return list(166, traitAdaptation, isTraitAdaptationStart, [120]);
    }
    function isTraitAdaptationStart(t) {
        switch (t.tokenType) {
            case 83:
            case 148:
            case 51:
                return true;
            default:
                return isSemiReservedToken(t);
        }
    }
    function traitAdaptation() {
        const children = [];
        let t = peek();
        let t2 = peek(1);
        if (t.tokenType === 51 ||
            t.tokenType === 148 ||
            (t.tokenType === 83 &&
                (t2.tokenType === 134 || t2.tokenType === 148))) {
            children.push(methodReference());
            if (peek().tokenType === 44) {
                children.push(next());
                return traitPrecedence(children);
            }
        }
        else if (t.tokenType === 83 || isSemiReservedToken(t)) {
            const ident = identifier();
            children.push(phrase(117, [ident]));
        }
        else {
            return error([], t);
        }
        return traitAlias(children);
    }
    function traitAlias(children) {
        children.push(expect(4));
        let t = peek();
        if (t.tokenType === 83 || isReservedToken(t)) {
            children.push(identifier());
        }
        else if (isMemberModifier(t)) {
            children.push(next());
            t = peek();
            if (t.tokenType === 83 || isSemiReservedToken(t)) {
                children.push(identifier());
            }
        }
        else {
            children.push(error([], t));
        }
        children.push(expect(89));
        return phrase(167, children);
    }
    function traitPrecedence(children) {
        children.push(qualifiedNameList([89]));
        children.push(expect(89));
        return phrase(172, children);
    }
    function methodReference() {
        const name = qualifiedName();
        const op = expect(134);
        const ident = identifier();
        return phrase(117, [name, op, ident]);
    }
    function methodDeclarationHeader(memberModifers) {
        const children = [];
        if (memberModifers) {
            children.push(memberModifers);
        }
        children.push(next());
        const ampersand = optional(104);
        if (ampersand) {
            children.push(ampersand);
        }
        children.push(identifier());
        children.push(expect(119));
        if (isParameterStart(peek())) {
            children.push(delimitedList(133, parameterDeclaration, isParameterStart, 94, [122]));
        }
        children.push(expect(122));
        if (peek().tokenType === 88) {
            children.push(returnType());
        }
        return phrase(116, children);
    }
    function methodDeclaration(memberModifers) {
        const header = methodDeclarationHeader(memberModifers);
        const body = methodDeclarationBody();
        return phrase(114, [header, body]);
    }
    function methodDeclarationBody() {
        let body;
        if (peek().tokenType === 89) {
            body = next();
        }
        else {
            body = compoundStatement();
        }
        return phrase(115, [body]);
    }
    function identifier() {
        let ident = peek();
        if (ident.tokenType === 83 || isSemiReservedToken(ident)) {
            ident = next();
        }
        else {
            ident = error([], ident);
        }
        return phrase(96, [ident]);
    }
    function interfaceDeclaration() {
        const header = interfaceDeclarationHeader();
        const body = typeDeclarationBody(105, isClassMemberStart, interfaceMemberDeclarations);
        return phrase(104, [header, body]);
    }
    function typeDeclarationBody(phraseType, elementStartPredicate, listFunction) {
        const open = expect(117);
        if (!elementStartPredicate(peek())) {
            const close = expect(120);
            return phrase(phraseType, [open, close]);
        }
        const l = listFunction();
        const close = expect(120);
        return phrase(phraseType, [open, l, close]);
    }
    function interfaceMemberDeclarations() {
        return list(107, classMemberDeclaration, isClassMemberStart, [120], classMemberDeclarationListRecoverSet, true);
    }
    function interfaceDeclarationHeader() {
        const interfaceToken = next();
        const name = expect(83);
        if (peek().tokenType !== 30) {
            return phrase(106, [interfaceToken, name]);
        }
        const base = interfaceBaseClause();
        return phrase(106, [interfaceToken, name, base]);
    }
    function interfaceBaseClause() {
        const ext = next();
        const list = qualifiedNameList([117]);
        return phrase(103, [ext, list]);
    }
    function traitDeclaration() {
        const header = traitDeclarationHeader();
        const body = typeDeclarationBody(169, isClassMemberStart, traitMemberDeclarations);
        return phrase(168, [header, body]);
    }
    function traitDeclarationHeader() {
        const traitToken = next();
        const name = expect(83);
        return phrase(170, [traitToken, name]);
    }
    function traitMemberDeclarations() {
        return list(171, classMemberDeclaration, isClassMemberStart, [120], classMemberDeclarationListRecoverSet, true);
    }
    function functionDeclaration() {
        const header = functionDeclarationHeader();
        const body = functionDeclarationBody();
        return phrase(87, [header, body]);
    }
    function functionDeclarationBody() {
        let cs = compoundStatement();
        cs.phraseType = 88;
        return cs;
    }
    function functionDeclarationHeader() {
        const children = [];
        children.push(next());
        const amp = optional(104);
        if (amp) {
            children.push(amp);
        }
        children.push(expect(83));
        children.push(expect(119));
        if (isParameterStart(peek())) {
            children.push(delimitedList(133, parameterDeclaration, isParameterStart, 94, [122]));
        }
        children.push(expect(122));
        if (peek().tokenType === 88) {
            children.push(returnType());
        }
        return phrase(89, children);
    }
    function isParameterStart(t) {
        switch (t.tokenType) {
            case 104:
            case 135:
            case 84:
                return true;
            default:
                return isTypeDeclarationStart(t);
        }
    }
    function classDeclaration() {
        const header = classDeclarationHeader();
        const body = typeDeclarationBody(29, isClassMemberStart, classMemberDeclarationList);
        return phrase(28, [header, body]);
    }
    function classDeclarationHeader() {
        const children = [];
        const mod = optionalOneOf([2, 31]);
        if (mod) {
            children.push(mod);
        }
        children.push(expect(9));
        children.push(expect(83));
        if (peek().tokenType === 30) {
            children.push(classBaseClause());
        }
        if (peek().tokenType === 40) {
            children.push(classInterfaceClause());
        }
        return phrase(30, children);
    }
    function classBaseClause() {
        const ext = next();
        const name = qualifiedName();
        return phrase(23, [ext, name]);
    }
    function compoundStatement() {
        const open = expect(117);
        if (!isStatementStart(peek())) {
            const close = expect(120);
            return phrase(39, [open, close]);
        }
        const start = nodePackedRange(open)[0];
        const stmtList = statementList([120]);
        const close = expect(120);
        return phrase(39, [open, stmtList, close], [start, nodePackedRange(close)[1]]);
    }
    function isFunctionStatic(peek1, peek2) {
        return peek1.tokenType === 84 &&
            (peek2.tokenType === 89 ||
                peek2.tokenType === 94 ||
                peek2.tokenType === 159 ||
                peek2.tokenType === 86);
    }
    function isAnonFunction(peek1, peek2) {
        return peek1.tokenType === 119 ||
            (peek1.tokenType === 104 && peek2.tokenType === 119);
    }
    function statement() {
        let t = peek(0, true);
        switch (t.tokenType) {
            case 161:
                return docBlock();
            case 51:
                return namespaceDefinition();
            case 66:
                return namespaceUseDeclaration();
            case 38:
                return haltCompilerStatement();
            case 12:
                return constDeclaration();
            case 35:
                if (isAnonFunction(peek(1), peek(2))) {
                    return expressionStatement();
                }
                else {
                    return functionDeclaration();
                }
            case 9:
            case 2:
            case 31:
                return classDeclaration();
            case 63:
                return traitDeclaration();
            case 45:
                return interfaceDeclaration();
            case 117:
                return compoundStatement();
            case 39:
                return ifStatement();
            case 68:
                return whileStatement();
            case 16:
                return doStatement();
            case 33:
                return forStatement();
            case 61:
                return switchStatement();
            case 5:
                return breakStatement();
            case 13:
                return continueStatement();
            case 59:
                return returnStatement();
            case 36:
                return globalDeclaration();
            case 60:
                if (isFunctionStatic(peek(1), peek(2))) {
                    return functionStaticDeclaration();
                }
                else {
                    return expressionStatement();
                }
            case 81:
            case 157:
            case 158:
            case 159:
                return inlineText();
            case 34:
                return foreachStatement();
            case 14:
                return declareStatement();
            case 64:
                return tryStatement();
            case 62:
                return throwStatement();
            case 37:
                return gotoStatement();
            case 17:
                return echoIntrinsic();
            case 65:
                return unsetIntrinsic();
            case 89:
                return nullStatement();
            case 83:
                if (peek(1).tokenType === 88) {
                    return namedLabelStatement();
                }
            default:
                return expressionStatement();
        }
    }
    function inlineText() {
        const children = [];
        const close = optional(159);
        const text = optional(81);
        const open = optionalOneOf([158, 157]);
        if (close) {
            children.push(close);
        }
        if (text) {
            children.push(text);
        }
        if (open) {
            children.push(open);
        }
        return phrase(100, children);
    }
    function nullStatement() {
        const semicolon = next();
        return phrase(130, [semicolon]);
    }
    function isCatchClauseStart(t) {
        return t.tokenType === 8;
    }
    function tryStatement() {
        const tryToken = next();
        const start = nodePackedRange(tryToken)[0];
        const compound = compoundStatement();
        let t = peek();
        let catchListOrFinally;
        if (t.tokenType === 8) {
            catchListOrFinally = list(21, catchClause, isCatchClauseStart);
        }
        else if (t.tokenType !== 32) {
            catchListOrFinally = error([], t);
        }
        if (peek().tokenType !== 32) {
            return phrase(175, [tryToken, compound, catchListOrFinally], [start, nodePackedRange(catchListOrFinally)[1]]);
        }
        const finClause = finallyClause();
        return phrase(175, [tryToken, compound, catchListOrFinally, finClause], [start, nodePackedRange(finClause)[1]]);
    }
    function finallyClause() {
        const fin = next();
        const start = nodePackedRange(fin)[0];
        const stmt = compoundStatement();
        return phrase(75, [fin, stmt], [start, nodePackedRange(stmt)[1]]);
    }
    function catchClause() {
        const catchToken = next();
        const start = nodePackedRange(catchToken)[0];
        const open = expect(119);
        const delimList = delimitedList(22, qualifiedName, isQualifiedNameStart, 124, [84]);
        const varName = expect(84);
        const close = expect(122);
        const stmt = compoundStatement();
        return phrase(20, [catchToken, open, delimList, varName, close, stmt], [start, nodePackedRange(stmt)[1]]);
    }
    function declareDirective() {
        const name = expect(83);
        const equals = expect(86);
        const literal = expectOneOf([82, 79, 78]);
        return phrase(46, [name, equals, literal]);
    }
    function declareStatement() {
        const declareToken = next();
        const open = expect(119);
        const directive = declareDirective();
        const close = expect(122);
        let t = peek();
        if (t.tokenType === 88) {
            const colon = next();
            const stmtList = statementList([21]);
            const end = expect(21);
            const semicolon = expect(89);
            return phrase(47, [declareToken, open, directive, close, colon, stmtList, end, semicolon]);
        }
        else if (isStatementStart(t)) {
            const stmt = statement();
            return phrase(47, [declareToken, open, directive, close, stmt]);
        }
        else if (t.tokenType === 89) {
            const semicolon = next();
            return phrase(47, [declareToken, open, directive, close, semicolon]);
        }
        else {
            const err = error([], t);
            return phrase(47, [declareToken, open, directive, close, err]);
        }
    }
    function switchStatement() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        const colonOrBrace = expectOneOf([88, 117]);
        let tCase = peek();
        let stmtList;
        if (tCase.tokenType === 7 || tCase.tokenType === 15) {
            stmtList = caseStatements(colonOrBrace.tokenType === 88 ? 25 : 120);
        }
        if (colonOrBrace.tokenType === 88) {
            const endSwitch = expect(25);
            const semicolon = expect(89);
            return phrase(164, stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, endSwitch, semicolon] :
                [keyword, open, expr, close, colonOrBrace, endSwitch, semicolon], [start, nodePackedRange(semicolon)[1]]);
        }
        else {
            const braceClose = expect(120);
            return phrase(164, stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, braceClose] :
                [keyword, open, expr, close, colonOrBrace, braceClose], [start, nodePackedRange(braceClose)[1]]);
        }
    }
    function caseStatements(breakOn) {
        let t;
        const children = [];
        const caseBreakOn = [7, 15];
        caseBreakOn.push(breakOn);
        recoverSetStack.push(caseBreakOn.slice(0));
        while (true) {
            t = peek();
            if (t.tokenType === 7) {
                children.push(caseStatement(caseBreakOn));
            }
            else if (t.tokenType === 15) {
                children.push(defaultStatement(caseBreakOn));
            }
            else if (breakOn === t.tokenType) {
                break;
            }
            else {
                let skipped = defaultSyncStrategy();
                children.push(error(skipped, t));
                if (caseBreakOn.indexOf(peek().tokenType) > -1) {
                    continue;
                }
                break;
            }
        }
        recoverSetStack.pop();
        return phrase(18, children);
    }
    function caseStatement(breakOn) {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const expr = expression(0);
        const colonOrSemicolon = expectOneOf([88, 89]);
        if (!isStatementStart(peek())) {
            return phrase(17, [keyword, expr, colonOrSemicolon], [start, nodePackedRange(colonOrSemicolon)[1]]);
        }
        const stmtList = statementList(breakOn);
        return phrase(17, [keyword, expr, colonOrSemicolon, stmtList], [start, nodePackedRange(stmtList)[1]]);
    }
    function defaultStatement(breakOn) {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const colonOrSemicolon = expectOneOf([88, 89]);
        if (!isStatementStart(peek())) {
            return phrase(17, [keyword, colonOrSemicolon], [start, nodePackedRange(colonOrSemicolon)[1]]);
        }
        const stmtList = statementList(breakOn);
        return phrase(17, [keyword, colonOrSemicolon, stmtList], [start, nodePackedRange(stmtList)[1]]);
    }
    function namedLabelStatement() {
        const name = next();
        const colon = next();
        return phrase(119, [name, colon]);
    }
    function gotoStatement() {
        const keyword = next();
        const name = expect(83);
        const semicolon = expect(89);
        return phrase(93, [keyword, name, semicolon]);
    }
    function throwStatement() {
        const keyword = next();
        const expr = expression(0);
        const semicolon = expect(89);
        return phrase(165, [keyword, expr, semicolon]);
    }
    function foreachCollection() {
        let expr = expression(0);
        return phrase(77, [expr]);
    }
    function foreachKeyOrValue() {
        const expr = expression(0);
        const arrow = optional(133);
        if (!arrow) {
            return phrase(80, [expr]);
        }
        return phrase(78, [expr, arrow]);
    }
    function foreachValue() {
        const amp = optional(104);
        const expr = expression(0);
        return phrase(80, amp ? [amp, expr] : [expr]);
    }
    function foreachStatement() {
        const foreachToken = next();
        const start = nodePackedRange(foreachToken)[0];
        const open = expect(119);
        const collection = foreachCollection();
        const asToken = expect(4);
        const keyOrValue = peek().tokenType === 104 ? foreachValue() : foreachKeyOrValue();
        let val;
        if (keyOrValue.phraseType === 78) {
            val = foreachValue();
        }
        const close = expect(122);
        let t = peek();
        if (t.tokenType === 88) {
            const colon = next();
            const stmtList = statementList([23]);
            const endForeach = expect(23);
            const semicolon = expect(89);
            return phrase(79, val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, colon, stmtList, endForeach, semicolon] :
                [foreachToken, open, collection, asToken, keyOrValue, close, colon, stmtList, endForeach, semicolon], [start, nodePackedRange(semicolon)[1]]);
        }
        else if (isStatementStart(t)) {
            const stmt = statement();
            return phrase(79, val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, stmt] :
                [foreachToken, open, collection, asToken, keyOrValue, close, stmt], [start, nodePackedRange(stmt)[1]]);
        }
        else {
            const err = error([], t);
            return phrase(79, val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, err] :
                [foreachToken, open, collection, asToken, keyOrValue, close, err], [start, nodePackedRange(err)[1]]);
        }
    }
    function isVariableStart(t) {
        switch (t.tokenType) {
            case 84:
            case 91:
            case 119:
            case 3:
            case 118:
            case 78:
            case 60:
            case 83:
            case 51:
            case 148:
                return true;
            default:
                return false;
        }
    }
    function variableInitial() {
        return variable(variableAtom());
    }
    function variableList(breakOn) {
        return delimitedList(179, variableInitial, isVariableStart, 94, breakOn);
    }
    function unsetIntrinsic() {
        const keyword = next();
        const open = expect(119);
        const varList = variableList([122]);
        const close = expect(122);
        const semicolon = expect(89);
        return phrase(178, [keyword, open, varList, close, semicolon]);
    }
    function expressionInitial() {
        return expression(0);
    }
    function echoIntrinsic() {
        const keyword = next();
        const exprList = delimitedList(73, expressionInitial, isExpressionStart, 94);
        const semicolon = expect(89);
        return phrase(52, [keyword, exprList, semicolon]);
    }
    function isStaticVariableDclarationStart(t) {
        return t.tokenType === 84;
    }
    function functionStaticDeclaration() {
        const keyword = next();
        const varList = delimitedList(162, staticVariableDeclaration, isStaticVariableDclarationStart, 94, [89]);
        const semicolon = expect(89);
        return phrase(90, [keyword, varList, semicolon]);
    }
    function globalDeclaration() {
        const keyword = next();
        const varList = delimitedList(180, simpleVariable, isSimpleVariableStart, 94, [89]);
        const semicolon = expect(89);
        return phrase(92, [keyword, varList, semicolon]);
    }
    function isSimpleVariableStart(t) {
        return t.tokenType === 84 || t.tokenType === 91;
    }
    function staticVariableDeclaration() {
        const varName = expect(84);
        if (peek().tokenType !== 86) {
            return phrase(161, [varName]);
        }
        const init = functionStaticInitialiser();
        return phrase(161, [varName, init]);
    }
    function functionStaticInitialiser() {
        const equals = next();
        const expr = expression(0);
        return phrase(91, [equals, expr]);
    }
    function continueStatement() {
        const keyword = next();
        if (!isExpressionStart(peek())) {
            const semicolon = expect(89);
            return phrase(45, [keyword, semicolon]);
        }
        const expr = expression(0);
        const semicolon = expect(89);
        return phrase(45, [keyword, expr, semicolon]);
    }
    function breakStatement() {
        const keyword = next();
        if (!isExpressionStart(peek())) {
            const semicolon = expect(89);
            return phrase(15, [keyword, semicolon]);
        }
        const expr = expression(0);
        const semicolon = expect(89);
        return phrase(15, [keyword, expr, semicolon]);
    }
    function returnStatement() {
        const keyword = next();
        if (!isExpressionStart(peek())) {
            const semicolon = expect(89);
            return phrase(151, [keyword, semicolon]);
        }
        const expr = expression(0);
        const semicolon = expect(89);
        return phrase(151, [keyword, expr, semicolon]);
    }
    function forExpressionGroup(phraseType, breakOn) {
        return delimitedList(phraseType, expressionInitial, isExpressionStart, 94, breakOn);
    }
    function forStatement() {
        const children = [];
        const forToken = next();
        const start = nodePackedRange(forToken)[0];
        children.push(forToken);
        children.push(expect(119));
        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(83, [89]));
        }
        children.push(expect(89));
        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(76, [89]));
        }
        children.push(expect(89));
        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(81, [122]));
        }
        children.push(expect(122));
        let t = peek();
        if (t.tokenType === 88) {
            children.push(next());
            children.push(statementList([22]));
            children.push(expect(22));
            children.push(expect(89));
        }
        else if (isStatementStart(peek())) {
            children.push(statement());
        }
        else {
            children.push(error([], t));
        }
        return phrase(84, children, [start, nodePackedRange(children[children.length - 1])[1]]);
    }
    function doStatement() {
        const doToken = next();
        const start = nodePackedRange(doToken)[0];
        const stmt = statement();
        const whileToken = expect(68);
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        const semicolon = expect(89);
        return phrase(50, [doToken, stmt, whileToken, open, expr, close, semicolon], [start, nodePackedRange(semicolon)[1]]);
    }
    function whileStatement() {
        const whileToken = next();
        const start = nodePackedRange(whileToken)[0];
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        let t = peek();
        if (t.tokenType === 88) {
            const colon = next();
            const stmtList = statementList([26]);
            const endWhile = expect(26);
            const semicolon = expect(89);
            return phrase(182, [whileToken, open, expr, close, colon, stmtList, endWhile, semicolon], [start, nodePackedRange(semicolon)[1]]);
        }
        else if (isStatementStart(t)) {
            const stmt = statement();
            return phrase(182, [whileToken, open, expr, close, stmt], [start, nodePackedRange(stmt)[1]]);
        }
        else {
            const err = error([], t);
            return phrase(182, [whileToken, open, expr, close, err], [start, nodePackedRange(err)[1]]);
        }
    }
    function elseIfClause1() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        const stmt = statement();
        return phrase(54, [keyword, open, expr, close, stmt], [start, nodePackedRange(stmt)[1]]);
    }
    function elseIfClause2() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const open = expect(119);
        const expr = expression(0);
        const close = expect(122);
        const colon = expect(88);
        const stmtList = statementList([24, 18, 19]);
        return phrase(54, [keyword, open, expr, close, colon, stmtList], [start, nodePackedRange(stmtList)[1]]);
    }
    function elseClause1() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const stmt = statement();
        return phrase(53, [keyword, stmt], [start, nodePackedRange(stmt)[1]]);
    }
    function elseClause2() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const colon = expect(88);
        const stmtList = statementList([24]);
        return phrase(53, [keyword, colon, stmtList], [start, nodePackedRange(stmtList)[1]]);
    }
    function isElseIfClauseStart(t) {
        return t.tokenType === 19;
    }
    function ifStatement() {
        const children = [];
        const ifToken = next();
        const start = nodePackedRange(ifToken)[0];
        children.push(ifToken);
        children.push(expect(119));
        children.push(expression(0));
        children.push(expect(122));
        let t = peek();
        let elseIfClauseFunction = elseIfClause1;
        let elseClauseFunction = elseClause1;
        let expectEndIf = false;
        if (t.tokenType === 88) {
            children.push(next());
            children.push(statementList([19, 18, 24]));
            elseIfClauseFunction = elseIfClause2;
            elseClauseFunction = elseClause2;
            expectEndIf = true;
        }
        else if (isStatementStart(t)) {
            children.push(statement());
        }
        else {
            children.push(error([], t));
        }
        if (peek().tokenType === 19) {
            children.push(list(55, elseIfClauseFunction, isElseIfClauseStart));
        }
        if (peek().tokenType === 18) {
            children.push(elseClauseFunction());
        }
        if (expectEndIf) {
            children.push(expect(24));
            children.push(expect(89));
        }
        return phrase(97, children, [start, nodePackedRange(children[children.length - 1])[1]]);
    }
    function expressionStatement() {
        const expr = expression(0);
        const semicolon = expect(89);
        return phrase(74, [expr, semicolon]);
    }
    function returnType() {
        const colon = next();
        const typeDecl = typeDeclaration();
        return phrase(152, [colon, typeDecl]);
    }
    function typeDeclaration() {
        const question = optional(97);
        let decl;
        switch (peek().tokenType) {
            case 6:
            case 3:
                decl = next();
                break;
            case 83:
            case 51:
            case 148:
                decl = qualifiedName();
                break;
            default:
                decl = error([], peek());
                break;
        }
        return phrase(176, question ? [question, decl] : [decl]);
    }
    function classConstDeclaration(modifiers) {
        const constToken = next();
        const delimList = delimitedList(27, classConstElement, isClassConstElementStartToken, 94, [89]);
        const semicolon = expect(89);
        return phrase(25, modifiers ? [modifiers, constToken, delimList, semicolon] : [constToken, delimList, semicolon]);
    }
    function isExpressionStart(t) {
        switch (t.tokenType) {
            case 84:
            case 91:
            case 3:
            case 118:
            case 78:
            case 148:
            case 83:
            case 51:
            case 119:
            case 60:
            case 136:
            case 130:
            case 112:
            case 144:
            case 90:
            case 87:
            case 95:
            case 153:
            case 154:
            case 151:
            case 156:
            case 152:
            case 149:
            case 150:
            case 47:
            case 11:
            case 52:
            case 79:
            case 82:
            case 73:
            case 72:
            case 71:
            case 77:
            case 75:
            case 74:
            case 76:
            case 10:
            case 155:
            case 98:
            case 96:
            case 53:
            case 69:
            case 70:
            case 35:
            case 41:
            case 42:
            case 57:
            case 58:
            case 28:
            case 20:
            case 46:
            case 29:
                return true;
            default:
                return false;
        }
    }
    function classConstElement() {
        const ident = identifier();
        const equals = expect(86);
        const expr = expression(0);
        return phrase(26, [ident, equals, expr]);
    }
    function isPropertyElementStart(t) {
        return t.tokenType === 84;
    }
    function propertyDeclaration(modifiersOrVar) {
        const delimList = delimitedList(142, propertyElement, isPropertyElementStart, 94, [89]);
        const semicolon = expect(89);
        return phrase(140, [modifiersOrVar, delimList, semicolon]);
    }
    function propertyElement() {
        const varName = expect(84);
        if (peek().tokenType !== 86) {
            return phrase(141, [varName]);
        }
        const initialiser = propertyInitialiser();
        return phrase(141, [varName, initialiser]);
    }
    function propertyInitialiser() {
        const equals = next();
        const expr = expression(0);
        return phrase(143, [equals, expr]);
    }
    function memberModifierList() {
        let children = [];
        while (isMemberModifier(peek())) {
            children.push(next());
        }
        return phrase(111, children);
    }
    function isMemberModifier(t) {
        switch (t.tokenType) {
            case 55:
            case 56:
            case 54:
            case 60:
            case 2:
            case 31:
                return true;
            default:
                return false;
        }
    }
    function qualifiedNameList(breakOn) {
        return delimitedList(145, qualifiedName, isQualifiedNameStart, 94, breakOn);
    }
    function objectCreationExpression() {
        const newToken = next();
        if (peek().tokenType === 9) {
            const anonClass = anonymousClassDeclaration();
            return phrase(131, [newToken, anonClass]);
        }
        const typeDes = typeDesignator(34);
        const open = optional(119);
        if (!open) {
            return phrase(131, [newToken, typeDes]);
        }
        if (!isArgumentStart(peek())) {
            const close = expect(122);
            return phrase(131, [newToken, typeDes, open, close]);
        }
        const argList = argumentList();
        const close = expect(122);
        return phrase(131, [newToken, typeDes, open, argList, close]);
    }
    function typeDesignator(phraseType) {
        let part = classTypeDesignatorAtom();
        while (true) {
            switch (peek().tokenType) {
                case 118:
                    part = subscriptExpression(part, 121);
                    continue;
                case 117:
                    part = subscriptExpression(part, 120);
                    continue;
                case 116:
                    part = propertyAccessExpression(part);
                    continue;
                case 134:
                    {
                        const op = next();
                        const name = restrictedScopedMemberName();
                        part = phrase(155, [part, op, name]);
                    }
                    continue;
                default:
                    break;
            }
            break;
        }
        return phrase(phraseType, [part]);
    }
    function restrictedScopedMemberName() {
        let t = peek();
        let name;
        switch (t.tokenType) {
            case 84:
                name = next();
                break;
            case 91:
                name = simpleVariable();
                break;
            default:
                name = error([], t);
                break;
        }
        return phrase(154, [name]);
    }
    function classTypeDesignatorAtom() {
        let t = peek();
        switch (t.tokenType) {
            case 60:
                return relativeScope();
            case 84:
            case 91:
                return simpleVariable();
            case 83:
            case 51:
            case 148:
                return qualifiedName();
            default:
                return error([], t);
        }
    }
    function cloneExpression() {
        const keyword = next();
        const expr = expression(0);
        return phrase(35, [keyword, expr]);
    }
    function isArrayElementStartOrComma(t) {
        return isArrayElementStart(t) || t.tokenType === 94;
    }
    function listIntrinsic() {
        const keyword = next();
        const open = expect(119);
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(122);
            return phrase(109, [keyword, open, close]);
        }
        const arrayList = arrayInitialiserList(122);
        const close = expect(122);
        return phrase(109, [keyword, open, arrayList, close]);
    }
    function unaryExpression(phraseType) {
        const op = next();
        let vbl;
        switch (phraseType) {
            case 136:
            case 137:
                vbl = variable(variableAtom());
                break;
            default:
                vbl = expression(precedenceAssociativityTuple(op)[0]);
                break;
        }
        return phrase(phraseType, [op, vbl]);
    }
    function anonymousFunctionHeader() {
        const children = [];
        const stat = optional(60);
        if (stat) {
            children.push(stat);
        }
        children.push(next());
        const amp = optional(104);
        if (amp) {
            children.push(amp);
        }
        children.push(expect(119));
        if (isParameterStart(peek())) {
            children.push(delimitedList(133, parameterDeclaration, isParameterStart, 94, [122]));
        }
        children.push(expect(122));
        if (peek().tokenType === 66) {
            children.push(anonymousFunctionUseClause());
        }
        if (peek().tokenType === 88) {
            children.push(returnType());
        }
        return phrase(5, children);
    }
    function anonymousFunctionCreationExpression() {
        const header = anonymousFunctionHeader();
        const body = functionDeclarationBody();
        return phrase(4, [header, body]);
    }
    function isAnonymousFunctionUseVariableStart(t) {
        return t.tokenType === 84 || t.tokenType === 104;
    }
    function anonymousFunctionUseClause() {
        const use = next();
        const open = expect(119);
        const delimList = delimitedList(36, anonymousFunctionUseVariable, isAnonymousFunctionUseVariableStart, 94, [122]);
        const close = expect(122);
        return phrase(6, [use, open, delimList, close]);
    }
    function anonymousFunctionUseVariable() {
        const amp = optional(104);
        const varName = expect(84);
        return phrase(7, amp ? [amp, varName] : [varName]);
    }
    function isTypeDeclarationStart(t) {
        switch (t.tokenType) {
            case 148:
            case 83:
            case 51:
            case 97:
            case 3:
            case 6:
                return true;
            default:
                return false;
        }
    }
    function parameterDeclaration() {
        const children = [];
        if (isTypeDeclarationStart(peek())) {
            children.push(typeDeclaration());
        }
        const amp = optional(104);
        if (amp) {
            children.push(amp);
        }
        const ellip = optional(135);
        if (ellip) {
            children.push(ellip);
        }
        children.push(expect(84));
        if (peek().tokenType === 86) {
            children.push(next());
            children.push(expression(0));
        }
        return phrase(132, children);
    }
    function variable(variableAtomNode) {
        let count = 0;
        while (true) {
            ++count;
            switch (peek().tokenType) {
                case 134:
                    variableAtomNode = scopedAccessExpression(variableAtomNode);
                    continue;
                case 116:
                    variableAtomNode = propertyOrMethodAccessExpression(variableAtomNode);
                    continue;
                case 118:
                    variableAtomNode = subscriptExpression(variableAtomNode, 121);
                    continue;
                case 117:
                    variableAtomNode = subscriptExpression(variableAtomNode, 120);
                    continue;
                case 119:
                    variableAtomNode = functionCallExpression(variableAtomNode);
                    continue;
                default:
                    if (count === 1 && variableAtomNode.phraseType !== 159) {
                        variableAtomNode = error([variableAtomNode], peek());
                    }
                    break;
            }
            break;
        }
        return variableAtomNode;
    }
    function functionCallExpression(lhs) {
        const open = expect(119);
        if (!isArgumentStart(peek())) {
            const close = expect(122);
            return phrase(86, [lhs, open, close]);
        }
        const argList = argumentList();
        const close = expect(122);
        return phrase(86, [lhs, open, argList, close]);
    }
    function scopedAccessExpression(lhs) {
        const op = next();
        const memberNamePhraseTypeTuple = scopedMemberName();
        const open = optional(119);
        if (open) {
            if (!isArgumentStart(peek())) {
                const close = expect(122);
                return phrase(153, [lhs, op, memberNamePhraseTypeTuple[0], open, close]);
            }
            const argList = argumentList();
            const close = expect(122);
            return phrase(153, [lhs, op, memberNamePhraseTypeTuple[0], open, argList, close]);
        }
        else if (memberNamePhraseTypeTuple[1] === 153) {
            let err = error([], peek(), 119);
            return phrase(153, [lhs, op, memberNamePhraseTypeTuple[0], err]);
        }
        return phrase(memberNamePhraseTypeTuple[1], [lhs, op, memberNamePhraseTypeTuple[0]]);
    }
    function scopedMemberName() {
        let t = peek();
        const tup = [undefined, 153];
        let name;
        switch (t.tokenType) {
            case 117:
                tup[1] = 153;
                name = encapsulatedExpression(117, 120);
                break;
            case 84:
                tup[1] = 155;
                name = next();
                break;
            case 91:
                name = simpleVariable();
                tup[1] = 155;
                break;
            default:
                if (t.tokenType === 83 || isSemiReservedToken(t)) {
                    name = identifier();
                    tup[1] = 24;
                }
                else {
                    name = error([], t);
                }
                break;
        }
        tup[0] = phrase(154, [name]);
        return tup;
    }
    function propertyAccessExpression(lhs) {
        const op = next();
        const name = memberName();
        return phrase(139, [lhs, op, name]);
    }
    function propertyOrMethodAccessExpression(lhs) {
        const op = next();
        const name = memberName();
        const open = optional(119);
        if (!open) {
            return phrase(139, [lhs, op, name]);
        }
        if (!isArgumentStart(peek())) {
            const close = expect(122);
            return phrase(113, [lhs, op, name, open, close]);
        }
        const argList = argumentList();
        const close = expect(122);
        return phrase(113, [lhs, op, name, open, argList, close]);
    }
    function memberName() {
        let name;
        switch (peek().tokenType) {
            case 83:
                name = next();
                break;
            case 117:
                name = encapsulatedExpression(117, 120);
                break;
            case 91:
            case 84:
                name = simpleVariable();
                break;
            default:
                name = error([], peek());
                break;
        }
        return phrase(112, [name]);
    }
    function subscriptExpression(lhs, closeTokenType) {
        const open = next();
        if (!isExpressionStart(peek())) {
            const close = expect(closeTokenType);
            return phrase(163, [lhs, open, close]);
        }
        const expr = expression(0);
        const close = expect(closeTokenType);
        return phrase(163, [lhs, open, expr, close]);
    }
    function argumentList() {
        return delimitedList(8, argumentExpression, isArgumentStart, 94, [122]);
    }
    function isArgumentStart(t) {
        return t.tokenType === 135 || isExpressionStart(t);
    }
    function variadicUnpacking() {
        const op = next();
        const expr = expression(0);
        return phrase(181, [op, expr]);
    }
    function argumentExpression() {
        return peek().tokenType === 135 ? variadicUnpacking() : expression(0);
    }
    function qualifiedName() {
        let t = peek();
        let name;
        if (t.tokenType === 148) {
            t = next();
            name = namespaceName();
            return phrase(85, [t, name]);
        }
        else if (t.tokenType === 51) {
            t = next();
            const bslash = expect(148);
            name = namespaceName();
            return phrase(147, [t, bslash, name]);
        }
        else {
            name = namespaceName();
            return phrase(144, [name]);
        }
    }
    function isQualifiedNameStart(t) {
        switch (t.tokenType) {
            case 148:
            case 83:
            case 51:
                return true;
            default:
                return false;
        }
    }
    function shortArrayCreationExpression() {
        const open = next();
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(121);
            return phrase(9, [open, close]);
        }
        const initList = arrayInitialiserList(121);
        const close = expect(121);
        return phrase(9, [open, initList, close]);
    }
    function longArrayCreationExpression() {
        const keyword = next();
        const open = expect(119);
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(122);
            return phrase(9, [keyword, open, close]);
        }
        const initList = arrayInitialiserList(122);
        const close = expect(122);
        return phrase(9, [keyword, open, initList, close]);
    }
    function isArrayElementStart(t) {
        return t.tokenType === 104 || isExpressionStart(t);
    }
    function arrayInitialiserList(breakOn) {
        let t = peek();
        const children = [];
        let arrayInitialiserListRecoverSet = [breakOn, 94];
        recoverSetStack.push(arrayInitialiserListRecoverSet);
        do {
            if (isArrayElementStart(peek())) {
                children.push(arrayElement());
            }
            t = peek();
            if (t.tokenType === 94) {
                children.push(next());
            }
            else if (t.tokenType !== breakOn) {
                if (isArrayElementStart(t)) {
                    children.push(error([], t));
                    continue;
                }
                else {
                    const skipped = defaultSyncStrategy();
                    children.push(error(skipped, t));
                    t = peek();
                    if (t.tokenType === 94) {
                        continue;
                    }
                }
                break;
            }
        } while (t.tokenType !== breakOn);
        recoverSetStack.pop();
        return phrase(11, children);
    }
    function arrayValue() {
        const amp = optional(104);
        const expr = expression(0);
        return phrase(13, amp ? [amp, expr] : [expr]);
    }
    function arrayKey() {
        const expr = expression(0);
        return phrase(12, [expr]);
    }
    function arrayElement() {
        if (peek().tokenType === 104) {
            const val = arrayValue();
            return phrase(10, [val]);
        }
        let keyOrValue = arrayKey();
        const arrow = optional(133);
        if (!arrow) {
            keyOrValue.phraseType = 13;
            return phrase(10, [keyOrValue]);
        }
        const val = arrayValue();
        return phrase(10, [keyOrValue, arrow, val]);
    }
    function encapsulatedExpression(openTokenType, closeTokenType) {
        const open = expect(openTokenType);
        const expr = expression(0);
        const close = expect(closeTokenType);
        return phrase(57, [open, expr, close]);
    }
    function relativeScope() {
        const keyword = next();
        return phrase(148, [keyword]);
    }
    function variableAtom() {
        let t = peek();
        switch (t.tokenType) {
            case 84:
            case 91:
                return simpleVariable();
            case 119:
                return encapsulatedExpression(119, 122);
            case 3:
                return longArrayCreationExpression();
            case 118:
                return shortArrayCreationExpression();
            case 78:
                return next();
            case 60:
                return relativeScope();
            case 83:
            case 51:
            case 148:
                return qualifiedName();
            default:
                return error([], t);
        }
    }
    function simpleVariable() {
        const varNameOrDollar = expectOneOf([84, 91]);
        if (varNameOrDollar.tokenType !== 91) {
            return phrase(159, [varNameOrDollar]);
        }
        const t = peek();
        let varOrExpr;
        if (t.tokenType === 117) {
            varOrExpr = encapsulatedExpression(117, 120);
        }
        else if (t.tokenType === 91 || t.tokenType === 84) {
            varOrExpr = simpleVariable();
        }
        else {
            varOrExpr = error([], t);
        }
        return phrase(159, [varNameOrDollar, varOrExpr]);
    }
    function haltCompilerStatement() {
        const keyword = next();
        const open = expect(119);
        const close = expect(122);
        const semicolon = expect(89);
        return phrase(94, [keyword, open, close, semicolon]);
    }
    function namespaceUseDeclaration() {
        const children = [];
        children.push(next());
        const kind = optionalOneOf([35, 12]);
        if (kind) {
            children.push(kind);
        }
        const leadingBackslash = optional(148);
        if (leadingBackslash) {
            children.push(leadingBackslash);
        }
        const nsNameNode = namespaceName();
        let t = peek();
        if (t.tokenType === 148 || t.tokenType === 117) {
            children.push(nsNameNode);
            children.push(expect(148));
            children.push(expect(117));
            children.push(delimitedList(129, namespaceUseGroupClause, isNamespaceUseGroupClauseStartToken, 94, [120]));
            children.push(expect(120));
            children.push(expect(89));
            return phrase(127, children);
        }
        children.push(delimitedList(126, namespaceUseClauseFunction(nsNameNode), isNamespaceUseClauseStartToken, 94, [89]));
        children.push(expect(89));
        return phrase(127, children);
    }
    function isNamespaceUseClauseStartToken(t) {
        return t.tokenType === 83 || t.tokenType === 148;
    }
    function namespaceUseClauseFunction(nsName) {
        return () => {
            let name = nsName;
            if (name) {
                nsName = undefined;
            }
            else {
                name = namespaceName();
            }
            if (peek().tokenType !== 4) {
                return phrase(125, [name]);
            }
            const alias = namespaceAliasingClause();
            return phrase(125, [name, alias]);
        };
    }
    function delimitedList(phraseType, elementFunction, elementStartPredicate, delimiter, breakOn) {
        let t;
        let delimitedListRecoverSet = breakOn ? breakOn.slice(0) : [];
        delimitedListRecoverSet.push(delimiter);
        recoverSetStack.push(delimitedListRecoverSet);
        const children = [];
        while (true) {
            children.push(elementFunction());
            t = peek();
            if (t.tokenType === delimiter) {
                children.push(next());
            }
            else if (!breakOn || breakOn.indexOf(t.tokenType) > -1) {
                break;
            }
            else {
                if (elementStartPredicate(t)) {
                    children.push(error([], t));
                    continue;
                }
                else {
                    let skipped = defaultSyncStrategy();
                    children.push(error(skipped, t));
                    if (delimitedListRecoverSet.indexOf(peek().tokenType) > -1) {
                        continue;
                    }
                }
                break;
            }
        }
        recoverSetStack.pop();
        return phrase(phraseType, children);
    }
    function isNamespaceUseGroupClauseStartToken(t) {
        switch (t.tokenType) {
            case 12:
            case 35:
            case 83:
                return true;
            default:
                return false;
        }
    }
    function namespaceUseGroupClause() {
        const kind = optionalOneOf([35, 12]);
        const name = namespaceName();
        if (peek().tokenType !== 4) {
            return phrase(128, [kind, name]);
        }
        const alias = namespaceAliasingClause();
        return phrase(128, [kind, name, alias]);
    }
    function namespaceAliasingClause() {
        const asToken = next();
        const name = expect(83);
        return phrase(120, [asToken, name]);
    }
    function namespaceDefinitionHeader() {
        const ns = next();
        if (peek().tokenType !== 83) {
            return phrase(122, [ns]);
        }
        const name = namespaceName();
        return phrase(122, [ns, name]);
    }
    function namespaceDefinitionBody() {
        const t = expectOneOf([89, 117]);
        if (t.tokenType !== 117) {
            return phrase(123, [t]);
        }
        const start = nodePackedRange(t)[0];
        const list = statementList([120]);
        const close = expect(120);
        return phrase(123, [t, list, close], [start, nodePackedRange(close)[1]]);
    }
    function namespaceDefinition() {
        const header = namespaceDefinitionHeader();
        const body = namespaceDefinitionBody();
        return phrase(121, [header, body]);
    }
    function namespaceName() {
        const children = [];
        children.push(expect(83));
        while (peek().tokenType === 148 && peek(1).tokenType === 83) {
            children.push(next(), next());
        }
        return phrase(124, children);
    }
    function isReservedToken(t) {
        switch (t.tokenType) {
            case 41:
            case 42:
            case 28:
            case 57:
            case 58:
            case 49:
            case 50:
            case 48:
            case 43:
            case 52:
            case 11:
            case 29:
            case 39:
            case 19:
            case 18:
            case 24:
            case 17:
            case 16:
            case 68:
            case 26:
            case 33:
            case 22:
            case 34:
            case 23:
            case 14:
            case 21:
            case 4:
            case 64:
            case 8:
            case 32:
            case 62:
            case 66:
            case 44:
            case 36:
            case 67:
            case 65:
            case 46:
            case 20:
            case 13:
            case 37:
            case 35:
            case 12:
            case 59:
            case 53:
            case 69:
            case 47:
            case 61:
            case 25:
            case 7:
            case 15:
            case 5:
            case 3:
            case 6:
            case 30:
            case 40:
            case 51:
            case 63:
            case 45:
            case 9:
            case 10:
            case 77:
            case 74:
            case 75:
            case 73:
            case 72:
            case 71:
            case 76:
                return true;
            default:
                return false;
        }
    }
    function isSemiReservedToken(t) {
        switch (t.tokenType) {
            case 60:
            case 2:
            case 31:
            case 54:
            case 56:
            case 55:
                return true;
            default:
                return isReservedToken(t);
        }
    }
    function isStatementStart(t) {
        switch (t.tokenType) {
            case 51:
            case 66:
            case 38:
            case 12:
            case 35:
            case 9:
            case 2:
            case 31:
            case 63:
            case 45:
            case 117:
            case 39:
            case 68:
            case 16:
            case 33:
            case 61:
            case 5:
            case 13:
            case 59:
            case 36:
            case 60:
            case 17:
            case 65:
            case 34:
            case 14:
            case 64:
            case 62:
            case 37:
            case 83:
            case 89:
            case 159:
            case 81:
            case 157:
            case 158:
            case 161:
                return true;
            default:
                return isExpressionStart(t);
        }
    }
})(Parser = exports.Parser || (exports.Parser = {}));
