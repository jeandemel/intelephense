/* Copyright (c) Ben Robert Mewburn 
 * Licensed under the ISC Licence.
 */

'use strict';

import { Token, Lexer, TokenType, LexerMode, tokenTypeToString } from './lexer';
import {
    ParseError,
    Phrase,
    PhraseType,
} from './phrase';

export namespace Parser {

    interface Predicate {
        (t: Token): boolean;
    }

    const enum Associativity {
        None,
        Left,
        Right
    }

    function precedenceAssociativityTuple(t: Token) {
        switch (t.tokenType) {
            case TokenType.AsteriskAsterisk:
                return [48, Associativity.Right];
            case TokenType.PlusPlus:
                return [47, Associativity.Right];
            case TokenType.MinusMinus:
                return [47, Associativity.Right];
            case TokenType.Tilde:
                return [47, Associativity.Right];
            case TokenType.IntegerCast:
                return [47, Associativity.Right];
            case TokenType.FloatCast:
                return [47, Associativity.Right];
            case TokenType.StringCast:
                return [47, Associativity.Right];
            case TokenType.ArrayCast:
                return [47, Associativity.Right];
            case TokenType.ObjectCast:
                return [47, Associativity.Right];
            case TokenType.BooleanCast:
                return [47, Associativity.Right];
            case TokenType.UnsetCast:
                return [47, Associativity.Right];
            case TokenType.AtSymbol:
                return [47, Associativity.Right];
            case TokenType.InstanceOf:
                return [46, Associativity.None];
            case TokenType.Exclamation:
                return [45, Associativity.Right];
            case TokenType.Asterisk:
                return [44, Associativity.Left];
            case TokenType.ForwardSlash:
                return [44, Associativity.Left];
            case TokenType.Percent:
                return [44, Associativity.Left];
            case TokenType.Plus:
                return [43, Associativity.Left];
            case TokenType.Minus:
                return [43, Associativity.Left];
            case TokenType.Dot:
                return [43, Associativity.Left];
            case TokenType.LessThanLessThan:
                return [42, Associativity.Left];
            case TokenType.GreaterThanGreaterThan:
                return [42, Associativity.Left];
            case TokenType.LessThan:
                return [41, Associativity.None];
            case TokenType.GreaterThan:
                return [41, Associativity.None];
            case TokenType.LessThanEquals:
                return [41, Associativity.None];
            case TokenType.GreaterThanEquals:
                return [41, Associativity.None];
            case TokenType.EqualsEquals:
                return [40, Associativity.None];
            case TokenType.EqualsEqualsEquals:
                return [40, Associativity.None];
            case TokenType.ExclamationEquals:
                return [40, Associativity.None];
            case TokenType.ExclamationEqualsEquals:
                return [40, Associativity.None];
            case TokenType.Spaceship:
                return [40, Associativity.None];
            case TokenType.Ampersand:
                return [39, Associativity.Left];
            case TokenType.Caret:
                return [38, Associativity.Left];
            case TokenType.Bar:
                return [37, Associativity.Left];
            case TokenType.AmpersandAmpersand:
                return [36, Associativity.Left];
            case TokenType.BarBar:
                return [35, Associativity.Left];
            case TokenType.QuestionQuestion:
                return [34, Associativity.Right];
            case TokenType.Question:
                return [33, Associativity.Left]; //?: ternary
            case TokenType.Equals:
                return [32, Associativity.Right];
            case TokenType.DotEquals:
                return [32, Associativity.Right];
            case TokenType.PlusEquals:
                return [32, Associativity.Right];
            case TokenType.MinusEquals:
                return [32, Associativity.Right];
            case TokenType.AsteriskEquals:
                return [32, Associativity.Right];
            case TokenType.ForwardslashEquals:
                return [32, Associativity.Right];
            case TokenType.PercentEquals:
                return [32, Associativity.Right];
            case TokenType.AsteriskAsteriskEquals:
                return [32, Associativity.Right];
            case TokenType.AmpersandEquals:
                return [32, Associativity.Right];
            case TokenType.BarEquals:
                return [32, Associativity.Right];
            case TokenType.CaretEquals:
                return [32, Associativity.Right];
            case TokenType.LessThanLessThanEquals:
                return [32, Associativity.Right];
            case TokenType.GreaterThanGreaterThanEquals:
                return [32, Associativity.Right];
            case TokenType.And:
                return [31, Associativity.Left];
            case TokenType.Xor:
                return [30, Associativity.Left];
            case TokenType.Or:
                return [29, Associativity.Left];
            default:
                throwUnexpectedTokenError(t);

        }
    }

    const statementListRecoverSet = [
        TokenType.Use,
        TokenType.HaltCompiler,
        TokenType.Const,
        TokenType.Function,
        TokenType.Class,
        TokenType.Abstract,
        TokenType.Final,
        TokenType.Trait,
        TokenType.Interface,
        TokenType.OpenBrace,
        TokenType.If,
        TokenType.While,
        TokenType.Do,
        TokenType.For,
        TokenType.Switch,
        TokenType.Break,
        TokenType.Continue,
        TokenType.Return,
        TokenType.Global,
        TokenType.Static,
        TokenType.Echo,
        TokenType.Unset,
        TokenType.ForEach,
        TokenType.Declare,
        TokenType.Try,
        TokenType.Throw,
        TokenType.Goto,
        TokenType.Semicolon,
        TokenType.CloseTag
    ];

    const classMemberDeclarationListRecoverSet = [
        TokenType.Public,
        TokenType.Protected,
        TokenType.Private,
        TokenType.Static,
        TokenType.Abstract,
        TokenType.Final,
        TokenType.Function,
        TokenType.Var,
        TokenType.Const,
        TokenType.Use,
    ];

    const encapsulatedVariableListRecoverSet = [
        TokenType.EncapsulatedAndWhitespace,
        TokenType.DollarCurlyOpen,
        TokenType.CurlyOpen
    ];

    function binaryOpToPhraseType(t: Token) {
        switch (t.tokenType) {
            case TokenType.Question:
                return PhraseType.TernaryExpression;
            case TokenType.Dot:
            case TokenType.Plus:
            case TokenType.Minus:
                return PhraseType.AdditiveExpression;
            case TokenType.Bar:
            case TokenType.Ampersand:
            case TokenType.Caret:
                return PhraseType.BitwiseExpression;
            case TokenType.Asterisk:
            case TokenType.ForwardSlash:
            case TokenType.Percent:
                return PhraseType.MultiplicativeExpression;
            case TokenType.AsteriskAsterisk:
                return PhraseType.ExponentiationExpression;
            case TokenType.LessThanLessThan:
            case TokenType.GreaterThanGreaterThan:
                return PhraseType.ShiftExpression;
            case TokenType.AmpersandAmpersand:
            case TokenType.BarBar:
            case TokenType.And:
            case TokenType.Or:
            case TokenType.Xor:
                return PhraseType.LogicalExpression;
            case TokenType.EqualsEqualsEquals:
            case TokenType.ExclamationEqualsEquals:
            case TokenType.EqualsEquals:
            case TokenType.ExclamationEquals:
                return PhraseType.EqualityExpression;
            case TokenType.LessThan:
            case TokenType.LessThanEquals:
            case TokenType.GreaterThan:
            case TokenType.GreaterThanEquals:
            case TokenType.Spaceship:
                return PhraseType.RelationalExpression;
            case TokenType.QuestionQuestion:
                return PhraseType.CoalesceExpression;
            case TokenType.Equals:
                return PhraseType.SimpleAssignmentExpression;
            case TokenType.PlusEquals:
            case TokenType.MinusEquals:
            case TokenType.AsteriskEquals:
            case TokenType.AsteriskAsteriskEquals:
            case TokenType.ForwardslashEquals:
            case TokenType.DotEquals:
            case TokenType.PercentEquals:
            case TokenType.AmpersandEquals:
            case TokenType.BarEquals:
            case TokenType.CaretEquals:
            case TokenType.LessThanLessThanEquals:
            case TokenType.GreaterThanGreaterThanEquals:
                return PhraseType.CompoundAssignmentExpression;
            case TokenType.InstanceOf:
                return PhraseType.InstanceOfExpression;
            default:
                return PhraseType.Unknown;

        }
    }

    var tokenBuffer: Token[];
    var phraseStack: Phrase[];
    var errorPhrase: ParseError;
    var recoverSetStack: TokenType[][];

    export function parse(text: string): Phrase {
        init(text);
        return statementList([TokenType.EndOfFile]);
    }

    function init(text: string, lexerModeStack?: LexerMode[]) {
        Lexer.setInput(text, lexerModeStack);
        phraseStack = [];
        tokenBuffer = [];
        recoverSetStack = [];
        errorPhrase = null;
    }

    function optional(tokenType: TokenType) {

        if (tokenType === peek().tokenType) {
            errorPhrase = undefined;
            return next();
        } else {
            return undefined;
        }

    }

    function optionalOneOf(tokenTypes: TokenType[]) {

        if (tokenTypes.indexOf(peek().tokenType) > -1) {
            errorPhrase = undefined;
            return next();
        } else {
            return undefined;
        }

    }

    /**
     * skips over whitespace, comments and doc comments
     * @param allowDocComment doc comments returned when true
     */
    function next(allowDocComment?: boolean): Token {
        let t = tokenBuffer.length ? tokenBuffer.shift() : Lexer.lex();
        if (t.tokenType >= TokenType.Comment && (!allowDocComment || t.tokenType !== TokenType.DocumentComment)) {
            return next(allowDocComment);
        }
        return t;
    }

    function expect(tokenType: TokenType) {

        let t = peek();

        if (t.tokenType === tokenType) {
            errorPhrase = undefined;
            return next();
        } else if (tokenType === TokenType.Semicolon && t.tokenType === TokenType.CloseTag) {
            //implicit end statement
            return Token.create(TokenType.ImplicitSemicolon, t.offset, 0, t.modeStack);
        } else {
            //test skipping a single token to sync
            if (peek(1).tokenType === tokenType) {
                return error([next(), next()], t, tokenType);
            }
            return error([], t, tokenType);
        }

    }

    function expectOneOf(tokenTypes: TokenType[]) {

        let t = peek();

        if (tokenTypes.indexOf(t.tokenType) > -1) {
            errorPhrase = undefined;
            return next();
        } else if (tokenTypes.indexOf(TokenType.Semicolon) > -1 && t.tokenType === TokenType.CloseTag) {
            //implicit end statement
            return Token.create(TokenType.ImplicitSemicolon, t.offset, 0, t.modeStack);
        } else {
            //test skipping single token to sync
            if (tokenTypes.indexOf(peek(1).tokenType) > -1) {
                return error([next(), next()], t);
            }
            return error([], t);
        }

    }

    function peek(n?: number, allowDocComment?: boolean) {

        n = n ? n + 1 : 1;
        let bufferPos = -1;
        let t: Token;

        do {

            ++bufferPos;
            if (bufferPos === tokenBuffer.length) {
                tokenBuffer.push(Lexer.lex());
            }

            t = tokenBuffer[bufferPos];

            if (t.tokenType < TokenType.Comment || (allowDocComment && t.tokenType === TokenType.DocumentComment)) {
                //not a hidden token
                --n;
            }

        } while (t.tokenType !== TokenType.EndOfFile && n > 0);

        return t;
    }

    function skip(until: Predicate) {

        let t: Token;
        let skipped: Token[] = [];

        do {
            t = tokenBuffer.length ? tokenBuffer.shift() : Lexer.lex();
            skipped.push(t);
        } while (!until(t) && t.tokenType !== TokenType.EndOfFile);

        //last skipped token should go back on buffer
        tokenBuffer.unshift(skipped.pop());
        return skipped;

    }

    function error(children: (Phrase | Token)[], unexpected: Token, expected?: TokenType, errType?: PhraseType): ParseError {

        //prefer the child range then the unexpected token start range
        //ie if no tokens are skipped then this node is empty and start === end
        let start: number;
        let end: number;

        if (children.length > 0) {
            let first = children[0];
            let last = children[children.length - 1];

            start = Lexer.tokenPackedRange(first as Token)[0];
            end = Lexer.tokenPackedRange(last as Token)[1];

        } else {
            start = end = Lexer.tokenPackedRange(unexpected)[0];
        }

        let err = Phrase.createParseError(start, end, children, unexpected, expected);
        if (errType) {
            err.phraseType = errType;
        }

        return err;

    }

    function list(phraseType: PhraseType, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, breakOn?: TokenType[], recoverSet?: TokenType[], allowDocComment?: boolean) {

        let t = peek(0, allowDocComment);
        let listRecoverSet = recoverSet ? recoverSet.slice(0) : [];
        let children: (Phrase | Token)[] = [];

        let start = Lexer.tokenPackedRange(t)[0];
        let end = start;

        if (breakOn) {
            Array.prototype.push.apply(listRecoverSet, breakOn);
        }

        recoverSetStack.push(listRecoverSet);

        while (!breakOn || breakOn.indexOf(t.tokenType) < 0) {

            if (elementStartPredicate(t)) {
                children.push(elementFunction());
            } else if (!breakOn) {
                break;
            } else {
                //error
                //attempt to skip single token to sync
                let t1 = peek(1, allowDocComment);
                if (elementStartPredicate(t1) || (breakOn && breakOn.indexOf(t1.tokenType) > -1)) {
                    children.push(error([next()], t));
                } else {
                    //skip many to sync
                    children.push(error(defaultSyncStrategy(), t));
                    //only continue if recovered on a token in the listRecoverSet
                    t = peek(0, allowDocComment);
                    if (listRecoverSet.indexOf(t.tokenType) < 0) {
                        break;
                    }
                }
            }

            t = peek(0, allowDocComment);

        }

        recoverSetStack.pop();
        if (children.length > 0) {
            let child = children[children.length - 1];
            if ((<Token>child).tokenType !== undefined) {
                end = Lexer.tokenPackedRange(<Token>child)[1];
            } else {
                end = (<Phrase>child).end;
            }
        }

        return Phrase.create(phraseType, start, end, children);

    }

    /**
     * default strategy is to skip tokens until a token in the combined recoverSetStack is found
     */
    function defaultSyncStrategy() {

        let mergedRecoverTokenTypeArray: TokenType[] = [];

        for (let n = recoverSetStack.length - 1; n >= 0; --n) {
            Array.prototype.push.apply(mergedRecoverTokenTypeArray, recoverSetStack[n]);
        }

        let mergedRecoverTokenTypeSet = new Set(mergedRecoverTokenTypeArray);
        let predicate: Predicate = (x) => { return mergedRecoverTokenTypeSet.has(x.tokenType); };
        return skip(predicate);

    }

    function statementList(breakOn: TokenType[]) {
        return list(
            PhraseType.StatementList,
            statement,
            isStatementStart,
            breakOn,
            statementListRecoverSet,
            true
        );
    }

    function nodePackedRange(node: Phrase | Token) {
        if ((<Token>node).tokenType !== undefined) {
            return Lexer.tokenPackedRange(<Token>node);
        } else {
            return [(<Phrase>node).start, (<Phrase>node).end];
        }
    }

    function constDeclaration() {
        const keyword = next();
        const start = nodePackedRange(keyword)[0];
        const list = delimitedList(
            PhraseType.ConstElementList,
            constElement,
            isConstElementStartToken,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        const end = nodePackedRange(semicolon)[1];
        return Phrase.create(PhraseType.ConstDeclaration, start, end, [keyword, list, semicolon]);
    }

    function isClassConstElementStartToken(t: Token) {
        return t.tokenType === TokenType.Name || isSemiReservedToken(t);
    }

    function isConstElementStartToken(t: Token) {
        return t.tokenType === TokenType.Name;
    }

    function constElement() {
        const name = expect(TokenType.Name);
        const start = nodePackedRange(name)[0];
        const equals = expect(TokenType.Equals);
        const expr = expression(0);
        const end = nodePackedRange(expr)[1];
        return Phrase.create(PhraseType.ConstElement, start, end, [name, equals, expr]);
    }

    function expression(minPrecedence: number) {

        let precedence: number;
        let associativity: Associativity;
        let lhs = expressionAtom();
        let start: number, end: number;
        [start, end] = nodePackedRange(lhs);
        let p: Phrase;
        let rhs: Phrase | Token;
        let op = peek();
        let binaryPhraseType = binaryOpToPhraseType(op);

        while (binaryPhraseType !== PhraseType.Unknown) {

            [precedence, associativity] = precedenceAssociativityTuple(op);

            if (precedence < minPrecedence) {
                break;
            }

            if (associativity === Associativity.Left) {
                ++precedence;
            }

            if (binaryPhraseType === PhraseType.TernaryExpression) {
                lhs = ternaryExpression(lhs, start);
                continue;
            }

            op = next();

            if (binaryPhraseType === PhraseType.InstanceOfExpression) {
                rhs = typeDesignator(PhraseType.InstanceofTypeDesignator);
                end = nodePackedRange(rhs)[1];
                lhs = Phrase.create(binaryPhraseType, start, end, [lhs, op, rhs]);
            } else if (
                binaryPhraseType === PhraseType.SimpleAssignmentExpression &&
                peek().tokenType === TokenType.Ampersand
            ) {
                let ampersand = next();
                rhs = expression(precedence);
                end = nodePackedRange(rhs)[1];
                lhs = Phrase.create(PhraseType.ByRefAssignmentExpression, start, end, [lhs, op, ampersand, rhs]);
            } else {
                rhs = expression(precedence);
                end = nodePackedRange(rhs)[1];
                lhs = Phrase.create(binaryPhraseType, start, end, [lhs, op, rhs]);
            }

            op = peek();
            binaryPhraseType = binaryOpToPhraseType(op);

        }

        return lhs;

    }

    function ternaryExpression(testExpr: Phrase | Token, start: number) {

        const question = next();
        let colon: Token | ParseError = optional(TokenType.Colon);
        let falseExpr: Phrase | Token;

        if (colon) {
            //short form
            falseExpr = expression(0);
            return Phrase.create(
                PhraseType.TernaryExpression,
                start,
                nodePackedRange(falseExpr)[1],
                [testExpr, question, colon, falseExpr]
            );
        }

        const trueExpr = expression(0);
        colon = expect(TokenType.Colon);
        falseExpr = expression(0);

        return Phrase.create(
            PhraseType.TernaryExpression,
            start,
            nodePackedRange(falseExpr)[1],
            [testExpr, question, trueExpr, colon, falseExpr]
        );
    }


    function variableOrExpression() {

        let part = variableAtom();
        let isVariable = (<Phrase>part).phraseType === PhraseType.SimpleVariable;

        if (isDereferenceOperator(peek())) {
            part = variable(part);
            isVariable = true;
        } else {

            switch ((<Phrase>part).phraseType) {
                case PhraseType.QualifiedName:
                case PhraseType.FullyQualifiedName:
                case PhraseType.RelativeQualifiedName:
                    part = constantAccessExpression(part);
                    break;
                default:
                    break;
            }

        }

        if (!isVariable) {
            return part;
        }

        //check for post increment/decrement
        let t = peek();
        if (t.tokenType === TokenType.PlusPlus) {
            return postfixExpression(PhraseType.PostfixIncrementExpression, <Phrase>part);
        } else if (t.tokenType === TokenType.MinusMinus) {
            return postfixExpression(PhraseType.PostfixDecrementExpression, <Phrase>part);
        } else {
            return part;
        }

    }

    function constantAccessExpression(qName: Phrase | Token) {
        let start: number, end: number;
        [start, end] = nodePackedRange(qName);
        return Phrase.create(PhraseType.ConstantAccessExpression, start, end, [qName]);
    }

    function postfixExpression(phraseType: PhraseType, variableNode: Phrase) {
        const op = next();
        return Phrase.create(phraseType, nodePackedRange(variableNode)[0], nodePackedRange(op)[1], [variableNode, op]);
    }

    function isDereferenceOperator(t: Token) {
        switch (t.tokenType) {
            case TokenType.OpenBracket:
            case TokenType.OpenBrace:
            case TokenType.Arrow:
            case TokenType.OpenParenthesis:
            case TokenType.ColonColon:
                return true;
            default:
                return false;
        }
    }

    function expressionAtom() {

        let t = peek();

        switch (t.tokenType) {
            case TokenType.Static:
                if (peek(1).tokenType === TokenType.Function) {
                    return anonymousFunctionCreationExpression();
                } else {
                    return variableOrExpression();
                }
            case TokenType.StringLiteral:
                if (isDereferenceOperator(peek(1))) {
                    return variableOrExpression();
                } else {
                    return next();
                }
            case TokenType.VariableName:
            case TokenType.Dollar:
            case TokenType.Array:
            case TokenType.OpenBracket:
            case TokenType.Backslash:
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.OpenParenthesis:
                return variableOrExpression();
            case TokenType.PlusPlus:
                return unaryExpression(PhraseType.PrefixIncrementExpression);
            case TokenType.MinusMinus:
                return unaryExpression(PhraseType.PrefixDecrementExpression);
            case TokenType.Plus:
            case TokenType.Minus:
            case TokenType.Exclamation:
            case TokenType.Tilde:
                return unaryExpression(PhraseType.UnaryOpExpression);
            case TokenType.AtSymbol:
                return unaryExpression(PhraseType.ErrorControlExpression);
            case TokenType.IntegerCast:
            case TokenType.FloatCast:
            case TokenType.StringCast:
            case TokenType.ArrayCast:
            case TokenType.ObjectCast:
            case TokenType.BooleanCast:
            case TokenType.UnsetCast:
                return unaryExpression(PhraseType.CastExpression);
            case TokenType.List:
                return listIntrinsic();
            case TokenType.Clone:
                return cloneExpression();
            case TokenType.New:
                return objectCreationExpression();
            case TokenType.FloatingLiteral:
            case TokenType.IntegerLiteral:
            case TokenType.LineConstant:
            case TokenType.FileConstant:
            case TokenType.DirectoryConstant:
            case TokenType.TraitConstant:
            case TokenType.MethodConstant:
            case TokenType.FunctionConstant:
            case TokenType.NamespaceConstant:
            case TokenType.ClassConstant:
                return next();
            case TokenType.StartHeredoc:
                return heredocStringLiteral();
            case TokenType.DoubleQuote:
                return doubleQuotedStringLiteral();
            case TokenType.Backtick:
                return shellCommandExpression();
            case TokenType.Print:
                return printIntrinsic();
            case TokenType.Yield:
                return yieldExpression();
            case TokenType.YieldFrom:
                return yieldFromExpression();
            case TokenType.Function:
                return anonymousFunctionCreationExpression();
            case TokenType.Include:
                return scriptInclusion(PhraseType.IncludeExpression);
            case TokenType.IncludeOnce:
                return scriptInclusion(PhraseType.IncludeOnceExpression);
            case TokenType.Require:
                return scriptInclusion(PhraseType.RequireExpression);
            case TokenType.RequireOnce:
                return scriptInclusion(PhraseType.RequireOnceExpression);
            case TokenType.Eval:
                return evalIntrinsic();
            case TokenType.Empty:
                return emptyIntrinsic();
            case TokenType.Exit:
                return exitIntrinsic();
            case TokenType.Isset:
                return issetIntrinsic();
            default:
                return error([], t, undefined, PhraseType.ErrorExpression);
        }

    }

    function exitIntrinsic() {
        const keyword = next(); //exit or die
        let start: number, end: number;
        [start, end] = nodePackedRange(keyword);
        const open = optional(TokenType.OpenParenthesis);
        let children: (Phrase | Token)[];

        if (open) {
            let expr: Phrase | Token;
            if (isExpressionStart(peek())) {
                expr = expression(0);
            }
            const close = expect(TokenType.CloseParenthesis);
            children = expr ? [keyword, open, expr, close] : [keyword, open, close];
            end = nodePackedRange(close)[1];
        } else {
            children = [keyword];
        }

        return Phrase.create(PhraseType.ExitIntrinsic, start, end, children);
    }

    function issetIntrinsic() {

        const keyword = next(); //isset
        const open = expect(TokenType.OpenParenthesis);
        const list = variableList([TokenType.CloseParenthesis]);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(
            PhraseType.IssetIntrinsic,
            nodePackedRange(keyword)[0],
            nodePackedRange(close)[1],
            [keyword, open, list, close]
        );

    }

    function emptyIntrinsic() {
        const keyword = next(); //keyword
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(
            PhraseType.EmptyIntrinsic,
            nodePackedRange(keyword)[0],
            nodePackedRange(close)[1],
            [keyword, open, expr, close]
        );
    }

    function evalIntrinsic() {
        const keyword = next();
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(
            PhraseType.EvalIntrinsic,
            nodePackedRange(keyword)[0],
            nodePackedRange(close)[1],
            [keyword, open, expr, close]
        );
    }

    function scriptInclusion(phraseType: PhraseType) {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(
            phraseType,
            nodePackedRange(keyword)[0],
            nodePackedRange(expr)[1],
            [keyword, expr]
        );
    }

    function printIntrinsic() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(
            PhraseType.PrintIntrinsic,
            nodePackedRange(keyword)[0],
            nodePackedRange(expr)[1],
            [keyword, expr]
        );
    }

    function yieldFromExpression() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(
            PhraseType.YieldFromExpression,
            nodePackedRange(keyword)[0],
            nodePackedRange(expr)[1],
            [keyword, expr]
        );
    }

    function yieldExpression() {
        const keyword = next();
        let start: number, end: number;
        [start, end] = nodePackedRange(keyword);

        if (!isExpressionStart(peek())) {
            return Phrase.create(PhraseType.YieldExpression, start, end, [keyword]);
        }

        const keyOrValue = expression(0);
        const arrow = optional(TokenType.FatArrow);

        if (arrow) {
            const value = expression(0);
            return Phrase.create(
                PhraseType.YieldExpression,
                start,
                nodePackedRange(value)[1],
                [keyword, keyOrValue, arrow, value]
            );
        }

        Phrase.create(PhraseType.YieldExpression, start, nodePackedRange(keyOrValue)[1], [keyword]);
    }

    function shellCommandExpression() {
        const open = next(); //`
        const list = encapsulatedVariableList(TokenType.Backtick);
        const close = expect(TokenType.Backtick);
        return Phrase.create(
            PhraseType.ShellCommandExpression,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            [open, list, close]
        );
    }

    function doubleQuotedStringLiteral() {
        const open = next(); //"
        const list = encapsulatedVariableList(TokenType.DoubleQuote);
        const close = expect(TokenType.DoubleQuote);
        return Phrase.create(
            PhraseType.DoubleQuotedStringLiteral,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            [open, list, close]
        );
    }

    function encapsulatedVariableList(breakOn: TokenType) {
        return list(
            PhraseType.EncapsulatedVariableList,
            encapsulatedVariable,
            isEncapsulatedVariableStart,
            [breakOn],
            encapsulatedVariableListRecoverSet
        );
    }

    function isEncapsulatedVariableStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.EncapsulatedAndWhitespace:
            case TokenType.VariableName:
            case TokenType.DollarCurlyOpen:
            case TokenType.CurlyOpen:
                return true;
            default:
                return false;
        }
    }

    function encapsulatedVariable() {
        switch (peek().tokenType) {
            case TokenType.EncapsulatedAndWhitespace:
                return next(true);
            case TokenType.VariableName:
                {
                    let t = peek(1);
                    if (t.tokenType === TokenType.OpenBracket) {
                        return encapsulatedDimension();
                    } else if (t.tokenType === TokenType.Arrow) {
                        return encapsulatedProperty();
                    } else {
                        return simpleVariable();
                    }
                }
            case TokenType.DollarCurlyOpen:
                return dollarCurlyOpenEncapsulatedVariable();
            case TokenType.CurlyOpen:
                return curlyOpenEncapsulatedVariable();
            default:
                throwUnexpectedTokenError(peek());
        }
    }

    function curlyOpenEncapsulatedVariable() {
        const open = next(); //{
        const vble = variable(variableAtom());
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(
            PhraseType.EncapsulatedVariable,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            [open, vble, close]
        );
    }

    function dollarCurlyOpenEncapsulatedVariable() {
        const open = next(); //${
        const t = peek();
        let expr: Phrase | Token;

        if (t.tokenType === TokenType.VariableName) {
            if (peek(1).tokenType === TokenType.OpenBracket) {
                expr = dollarCurlyEncapsulatedDimension();
            } else {
                const varName = next();
                const varNameRange = nodePackedRange(varName);
                expr = Phrase.create(PhraseType.SimpleVariable, varNameRange[0], varNameRange[1], [varName]);
            }
        } else if (isExpressionStart(t)) {
            expr = expression(0);
        } else {
            expr = error([], t);
        }

        const close = expect(TokenType.CloseBrace);
        return Phrase.create(
            PhraseType.EncapsulatedVariable,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            [open, expr, close]
        )
    }

    function dollarCurlyEncapsulatedDimension() {
        const varName = next();
        const open = next(); // [
        const expr = expression(0);
        const close = expect(TokenType.CloseBracket);
        return Phrase.create(
            PhraseType.SubscriptExpression,
            nodePackedRange(varName)[0],
            nodePackedRange(close)[1],
            [varName, open, expr, close]
        );
    }

    function encapsulatedDimension() {
        const sv = simpleVariable(); //T_VARIABLE
        const open = next(); //[
        let expr: Phrase | Token;

        switch (peek().tokenType) {
            case TokenType.Name:
            case TokenType.IntegerLiteral:
                expr = next();
                break;
            case TokenType.VariableName:
                expr = simpleVariable();
                break;
            case TokenType.Minus:
                {
                    const minus = next();
                    const intLiteral = expect(TokenType.IntegerLiteral);
                    expr = Phrase.create(
                        PhraseType.UnaryOpExpression,
                        nodePackedRange(minus)[0],
                        nodePackedRange(intLiteral)[1],
                        [minus, intLiteral]
                    );
                }
                break;
            default:
                //error
                expr = error([], peek());
                break;
        }

        const close = expect(TokenType.CloseBracket);
        return Phrase.create(
            PhraseType.SubscriptExpression,
            nodePackedRange(sv)[0],
            nodePackedRange(close)[1],
            [sv, open, expr, close]
        );

    }

    function encapsulatedProperty() {
        const sv = simpleVariable();
        const arrow = next(); //->
        const name = expect(TokenType.Name);
        return Phrase.create(
            PhraseType.PropertyAccessExpression,
            nodePackedRange(sv)[0],
            nodePackedRange(name)[1],
            [sv, arrow, name]
        );
    }

    function heredocStringLiteral() {
        const startHeredoc = next();
        const list = encapsulatedVariableList(TokenType.EndHeredoc);
        const endHeredoc = expect(TokenType.EndHeredoc);
        return Phrase.create(
            PhraseType.HeredocStringLiteral,
            nodePackedRange(startHeredoc)[0],
            nodePackedRange(endHeredoc)[1],
            [startHeredoc, list, endHeredoc]
        );
    }

    function anonymousClassDeclaration() {
        const header = anonymousClassDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.ClassDeclarationBody, isClassMemberStart, classMemberDeclarationList
        );
        return Phrase.create(
            PhraseType.AnonymousClassDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        )
    }

    function anonymousClassDeclarationHeader() {
        const classToken = next(); //class
        const open = optional(TokenType.OpenParenthesis);
        const children: (Phrase | Token)[] = [classToken];

        if (open) {
            children.push(open);
            if (isArgumentStart(peek())) {
                children.push(argumentList());
            }
            children.push(expect(TokenType.CloseParenthesis));
        }

        if (peek().tokenType === TokenType.Extends) {
            children.push(classBaseClause());
        }

        if (peek().tokenType === TokenType.Implements) {
            children.push(classInterfaceClause());
        }

        return Phrase.create(
            PhraseType.AnonymousClassDeclarationHeader,
            nodePackedRange(classToken)[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function classInterfaceClause() {
        const keyword = next(); //implements
        const list = qualifiedNameList([TokenType.OpenBrace]);
        return Phrase.create(
            PhraseType.ClassInterfaceClause,
            nodePackedRange(keyword)[0],
            nodePackedRange(list)[1],
            [keyword, list]
        );
    }

    function classMemberDeclarationList() {
        return list(
            PhraseType.ClassMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenType.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );
    }

    function isClassMemberStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.Public:
            case TokenType.Protected:
            case TokenType.Private:
            case TokenType.Static:
            case TokenType.Abstract:
            case TokenType.Final:
            case TokenType.Function:
            case TokenType.Var:
            case TokenType.Const:
            case TokenType.Use:
            case TokenType.DocumentComment:
                return true;
            default:
                return false;
        }
    }

    function docBlock() {
        let start: number, end: number;
        const t = next(); //DocumentComment
        [start, end] = nodePackedRange(t);
        return Phrase.create(PhraseType.DocBlock, start, end, [t]);
    }

    function classMemberDeclaration() {

        let p = start(PhraseType.ErrorClassMemberDeclaration);
        let t = peek();

        switch (t.tokenType) {
            case TokenType.DocumentComment:
                return docBlock();
            case TokenType.Public:
            case TokenType.Protected:
            case TokenType.Private:
            case TokenType.Static:
            case TokenType.Abstract:
            case TokenType.Final:
                {
                    const modifiers = memberModifierList();
                    t = peek();
                    if (t.tokenType === TokenType.VariableName) {
                        return propertyDeclaration(modifiers);
                    } else if (t.tokenType === TokenType.Function) {
                        return methodDeclaration(modifiers);
                    } else if (t.tokenType === TokenType.Const) {
                        return classConstDeclaration(modifiers);
                    } else {
                        //error
                        p.children.push(modifiers);
                        error();
                        return end();
                    }
                }
            case TokenType.Function:
                return methodDeclaration();
            case TokenType.Var:
                return propertyDeclaration(next());
            case TokenType.Const:
                return classConstDeclaration();
            case TokenType.Use:
                return traitUseClause();
            default:
                //should not get here
                throwUnexpectedTokenError(t);
        }

    }

    function throwUnexpectedTokenError(t: Token) {
        throw new Error(`Unexpected token: ${tokenTypeToString(t.tokenType)}`);
    }

    function traitUseClause() {
        const use = next(); //use
        const list = qualifiedNameList([TokenType.Semicolon, TokenType.OpenBrace]);
        const spec = traitUseSpecification();
        return Phrase.create(
            PhraseType.TraitUseClause,
            nodePackedRange(use)[0],
            nodePackedRange(spec)[1],
            [use, list, spec]
        );
    }

    function traitUseSpecification() {
        const t = expectOneOf([TokenType.Semicolon, TokenType.OpenBrace]) as Token;
        let start: number, end: number;
        [start, end] = nodePackedRange(t);

        if (t && t.tokenType === TokenType.OpenBrace) {
            let list: Phrase;
            if (isTraitAdaptationStart(peek())) {
                list = traitAdaptationList();
            }
            const close = expect(TokenType.CloseBrace);
            return Phrase.create(PhraseType.TraitUseSpecification, start, nodePackedRange(close)[1], list ? [t, list, close] : [t, close]);
        }

        return Phrase.create(PhraseType.TraitUseSpecification, start, end, [t]);
    }

    function traitAdaptationList() {
        return list(
            PhraseType.TraitAdaptationList,
            traitAdaptation,
            isTraitAdaptationStart,
            [TokenType.CloseBrace]
        );
    }

    function isTraitAdaptationStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.Name:
            case TokenType.Backslash:
            case TokenType.Namespace:
                return true;
            default:
                return isSemiReservedToken(t);
        }
    }

    function traitAdaptation() {

        let p = start(PhraseType.ErrorTraitAdaptation);
        let t = peek();
        let t2 = peek(1);

        if (t.tokenType === TokenType.Namespace ||
            t.tokenType === TokenType.Backslash ||
            (t.tokenType === TokenType.Name &&
                (t2.tokenType === TokenType.ColonColon || t2.tokenType === TokenType.Backslash))) {

            p.children.push(methodReference());

            if (peek().tokenType === TokenType.InsteadOf) {
                next();
                return traitPrecedence(p);
            }

        } else if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {

            let methodRef = start(PhraseType.MethodReference);
            methodRef.children.push(identifier());
            p.children.push(end());
        } else {
            //error
            error();
            return end();
        }

        return traitAlias(p);


    }

    function traitAlias(p: Phrase) {

        p.phraseType = PhraseType.TraitAlias;
        expect(TokenType.As);

        let t = peek();

        if (t.tokenType === TokenType.Name || isReservedToken(t)) {
            p.children.push(identifier());
        } else if (isMemberModifier(t)) {
            next();
            t = peek();
            if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {
                p.children.push(identifier());
            }
        } else {
            error();
        }

        expect(TokenType.Semicolon);
        return end();

    }

    function traitPrecedence(p: Phrase) {
        p.phraseType = PhraseType.TraitPrecedence;
        const list = qualifiedNameList([TokenType.Semicolon]);
        const semicolon = expect(TokenType.Semicolon);
        return end();

    }

    function methodReference() {
        const name = qualifiedName();
        const op = expect(TokenType.ColonColon);
        const ident = identifier();
        return Phrase.create(
            PhraseType.MethodReference,
            nodePackedRange(name)[0],
            nodePackedRange(ident)[1],
            [name, op, ident]
        );
    }

    function methodDeclarationHeader(memberModifers?: Phrase) {
        const children: (Phrase | Token)[] = [];
        if (memberModifers) {
            children.push(memberModifers);
        }
        children.push(next()); //function
        const ampersand = optional(TokenType.Ampersand);
        if (ampersand) {
            children.push(ampersand);
        }
        children.push(identifier());
        children.push(expect(TokenType.OpenParenthesis));

        if (isParameterStart(peek())) {
            children.push(delimitedList(
                PhraseType.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenType.Comma,
                [TokenType.CloseParenthesis]
            ));
        }

        children.push(expect(TokenType.CloseParenthesis));

        if (peek().tokenType === TokenType.Colon) {
            children.push(returnType());
        }

        return Phrase.create(
            PhraseType.MethodDeclarationHeader,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );

    }

    function methodDeclaration(memberModifers?: Phrase) {
        const header = methodDeclarationHeader(memberModifers);
        const body = methodDeclarationBody();
        return Phrase.create(
            PhraseType.MethodDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function methodDeclarationBody() {
        let body: Phrase | Token;
        let start: number, end: number;

        if (peek().tokenType === TokenType.Semicolon) {
            body = next();
        } else {
            body = compoundStatement();
        }

        [start, end] = nodePackedRange(body);
        return Phrase.create(
            PhraseType.MethodDeclarationBody,
            start,
            end,
            [body]
        );
    }

    function identifier() {
        let ident: Phrase | Token = peek();

        if (ident.tokenType === TokenType.Name || isSemiReservedToken(ident)) {
            ident = next();
        } else {
            ident = error([], ident);
        }

        let start: number, end: number;
        [start, end] = nodePackedRange(ident);

        return Phrase.create(
            PhraseType.Identifier,
            start,
            end,
            [ident]
        );
    }

    function interfaceDeclaration() {
        const header = interfaceDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.InterfaceDeclarationBody, isClassMemberStart, interfaceMemberDeclarations
        );
        return Phrase.create(
            PhraseType.InterfaceDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function typeDeclarationBody<T extends Phrase>(phraseType: PhraseType, elementStartPredicate: Predicate, listFunction: () => T) {
        const open = expect(TokenType.OpenBrace);
        let list: Phrase | Token;

        if (elementStartPredicate(peek())) {
            list = listFunction();
        }

        const close = expect(TokenType.CloseBrace);
        return Phrase.create(
            phraseType,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            list ? [open, list, close] : [open, close]
        );
    }

    function interfaceMemberDeclarations() {
        return list(
            PhraseType.InterfaceMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenType.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );
    }

    function interfaceDeclarationHeader() {
        const interfaceToken = next();
        const name = expect(TokenType.Name);
        let base: Phrase | Token;

        if (peek().tokenType === TokenType.Extends) {
            base = interfaceBaseClause();
        }

        return Phrase.create(
            PhraseType.InterfaceDeclarationHeader,
            nodePackedRange(interfaceToken)[0],
            nodePackedRange(base || name)[1],
            base ? [interfaceToken, name, base] : [interfaceToken, name]
        );
    }

    function interfaceBaseClause() {
        const ext = next(); //extends
        const list = qualifiedNameList([TokenType.OpenBrace]);
        return Phrase.create(
            PhraseType.InterfaceBaseClause,
            nodePackedRange(ext)[0],
            nodePackedRange(list)[1],
            [ext, list]
        );
    }

    function traitDeclaration() {
        const header = traitDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.TraitDeclarationBody, isClassMemberStart, traitMemberDeclarations
        );
        return Phrase.create(
            PhraseType.TraitDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function traitDeclarationHeader() {
        const traitToken = next(); //trait
        const name = expect(TokenType.Name);
        return Phrase.create(
            PhraseType.TraitDeclarationHeader,
            nodePackedRange(traitToken)[0],
            nodePackedRange(name)[1],
            [traitToken, name]
        );
    }

    function traitMemberDeclarations() {
        return list(
            PhraseType.TraitMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenType.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );

    }

    function functionDeclaration() {
        const header = functionDeclarationHeader();
        const body = functionDeclarationBody();
        return Phrase.create(
            PhraseType.FunctionDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function functionDeclarationBody() {
        let cs = compoundStatement();
        cs.phraseType = PhraseType.FunctionDeclarationBody;
        return cs;
    }

    function functionDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //function
        const amp = optional(TokenType.Ampersand);

        if (amp) {
            children.push(amp);
        }

        children.push(expect(TokenType.Name));
        children.push(expect(TokenType.OpenParenthesis));

        if (isParameterStart(peek())) {
            children.push(delimitedList(
                PhraseType.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenType.Comma,
                [TokenType.CloseParenthesis]
            ));
        }

        children.push(expect(TokenType.CloseParenthesis));

        if (peek().tokenType === TokenType.Colon) {
            children.push(returnType());
        }

        return Phrase.create(
            PhraseType.FunctionDeclarationHeader,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );

    }

    function isParameterStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.Ampersand:
            case TokenType.Ellipsis:
            case TokenType.VariableName:
                return true;
            default:
                return isTypeDeclarationStart(t);
        }
    }

    function classDeclaration() {
        const header = classDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.ClassDeclarationBody, isClassMemberStart, classMemberDeclarationList
        );
        return Phrase.create(
            PhraseType.ClassDeclaration,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function classDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        const mod = optionalOneOf([TokenType.Abstract, TokenType.Final]);

        if (mod) {
            children.push(mod);
        }

        children.push(expect(TokenType.Class));
        children.push(expect(TokenType.Name));

        if (peek().tokenType === TokenType.Extends) {
            children.push(classBaseClause());
        }

        if (peek().tokenType === TokenType.Implements) {
            children.push(classInterfaceClause());
        }

        return Phrase.create(
            PhraseType.ClassDeclarationHeader,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function classBaseClause() {
        const ext = next(); //extends
        const name = qualifiedName();
        return Phrase.create(
            PhraseType.ClassBaseClause,
            nodePackedRange(ext)[0],
            nodePackedRange(name)[1],
            [ext, name]
        );
    }

    function compoundStatement() {
        const open = expect(TokenType.OpenBrace);
        let list: Phrase | Token;

        if (isStatementStart(peek())) {
            list = statementList([TokenType.CloseBrace]);
        }

        const close = expect(TokenType.CloseBrace);
        return Phrase.create(
            PhraseType.CompoundStatement,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            list ? [open, list, close] : [open, close]
        );
    }

    function isFunctionStatic(peek1: Token, peek2: Token) {
        return peek1.tokenType === TokenType.VariableName &&
            (peek2.tokenType === TokenType.Semicolon ||
                peek2.tokenType === TokenType.Comma ||
                peek2.tokenType === TokenType.CloseTag ||
                peek2.tokenType === TokenType.Equals);
    }

    function isAnonFunction(peek1: Token, peek2: Token) {
        return peek1.tokenType === TokenType.OpenParenthesis ||
            (peek1.tokenType === TokenType.Ampersand && peek2.tokenType === TokenType.OpenParenthesis);
    }

    function statement() {

        let t = peek();

        switch (t.tokenType) {
            case TokenType.DocumentComment:
                return docBlock();
            case TokenType.Namespace:
                return namespaceDefinition();
            case TokenType.Use:
                return namespaceUseDeclaration();
            case TokenType.HaltCompiler:
                return haltCompilerStatement();
            case TokenType.Const:
                return constDeclaration();
            case TokenType.Function:
                if (isAnonFunction(peek(1), peek(2))) {
                    return expressionStatement();
                } else {
                    return functionDeclaration();
                }
            case TokenType.Class:
            case TokenType.Abstract:
            case TokenType.Final:
                return classDeclaration();
            case TokenType.Trait:
                return traitDeclaration();
            case TokenType.Interface:
                return interfaceDeclaration();
            case TokenType.OpenBrace:
                return compoundStatement();
            case TokenType.If:
                return ifStatement();
            case TokenType.While:
                return whileStatement();
            case TokenType.Do:
                return doStatement();
            case TokenType.For:
                return forStatement();
            case TokenType.Switch:
                return switchStatement();
            case TokenType.Break:
                return breakStatement();
            case TokenType.Continue:
                return continueStatement();
            case TokenType.Return:
                return returnStatement();
            case TokenType.Global:
                return globalDeclaration();
            case TokenType.Static:
                if (isFunctionStatic(peek(1), peek(2))) {
                    return functionStaticDeclaration();
                } else {
                    return expressionStatement();
                }
            case TokenType.Text:
            case TokenType.OpenTag:
            case TokenType.OpenTagEcho:
            case TokenType.CloseTag:
                return inlineText();
            case TokenType.ForEach:
                return foreachStatement();
            case TokenType.Declare:
                return declareStatement();
            case TokenType.Try:
                return tryStatement();
            case TokenType.Throw:
                return throwStatement();
            case TokenType.Goto:
                return gotoStatement();
            case TokenType.Echo:
                return echoIntrinsic();
            case TokenType.Unset:
                return unsetIntrinsic();
            case TokenType.Semicolon:
                return nullStatement();
            case TokenType.Name:
                if (peek(1).tokenType === TokenType.Colon) {
                    return namedLabelStatement();
                }
            //fall though
            default:
                return expressionStatement();

        }

    }

    function inlineText() {
        const children: (Phrase | Token)[] = [];
        const close = optional(TokenType.CloseTag);
        const text = optional(TokenType.Text);
        const open = optionalOneOf([TokenType.OpenTagEcho, TokenType.OpenTag]);

        if (close) {
            children.push(close);
        }

        if (text) {
            children.push(text);
        }

        if (open) {
            children.push(open);
        }

        return Phrase.create(
            PhraseType.InlineText,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function nullStatement() {
        const semicolon = next(); //;
        let start: number, end: number;
        [start, end] = nodePackedRange(semicolon);
        return Phrase.create(
            PhraseType.NullStatement,
            start,
            end,
            [semicolon]
        );
    }

    function isCatchClauseStart(t: Token) {
        return t.tokenType === TokenType.Catch;
    }

    function tryStatement() {
        const tryToken = next();
        const compound = compoundStatement();

        let t = peek();
        let catchListOrFinally: Phrase | Token;

        if (t.tokenType === TokenType.Catch) {
            catchListOrFinally = list(
                PhraseType.CatchClauseList,
                catchClause,
                isCatchClauseStart
            );
        } else if (t.tokenType !== TokenType.Finally) {
            catchListOrFinally = error([], t);
        }

        let finClause: Phrase | Token;
        if (peek().tokenType === TokenType.Finally) {
            finClause = finallyClause();
        }

        return Phrase.create(
            PhraseType.TryStatement,
            nodePackedRange(tryToken)[0],
            nodePackedRange(finClause || catchListOrFinally)[1],
            finClause ? [tryToken, compound, catchListOrFinally, finClause] : [tryToken, compound, catchListOrFinally]
        );
    }

    function finallyClause() {
        const fin = next(); //finally
        const stmt = compoundStatement();
        return Phrase.create(
            PhraseType.FinallyClause,
            nodePackedRange(fin)[0],
            nodePackedRange(stmt)[1],
            [fin, stmt]
        );
    }

    function catchClause() {
        const catchToken = next();
        const open = expect(TokenType.OpenParenthesis);
        const list = delimitedList(
            PhraseType.CatchNameList,
            qualifiedName,
            isQualifiedNameStart,
            TokenType.Bar,
            [TokenType.VariableName]
        );
        const varName = expect(TokenType.VariableName);
        const close = expect(TokenType.CloseParenthesis);
        const stmt = compoundStatement();
        return Phrase.create(
            PhraseType.CatchClause,
            nodePackedRange(catchToken)[0],
            nodePackedRange(stmt)[1],
            [catchToken, open, list, varName, close, stmt]
        );
    }

    function declareDirective() {
        const name = expect(TokenType.Name);
        const equals = expect(TokenType.Equals);
        const literal = expectOneOf([TokenType.IntegerLiteral, TokenType.FloatingLiteral, TokenType.StringLiteral]);
        return Phrase.create(
            PhraseType.DeclareDirective,
            nodePackedRange(name)[0],
            nodePackedRange(literal)[1],
            [name, equals, literal]
        );
    }

    function declareStatement() {

        let p = start(PhraseType.DeclareStatement);
        const declareToken = next();
        const open = expect(TokenType.OpenParenthesis);
        const directive = declareDirective();
        const close = expect(TokenType.CloseParenthesis);


        let t = peek();

        if (t.tokenType === TokenType.Colon) {

            next(); //:
            p.children.push(statementList([TokenType.EndDeclare]));
            expect(TokenType.EndDeclare);
            expect(TokenType.Semicolon);

        } else if (isStatementStart(t)) {

            p.children.push(statement());

        } else if (t.tokenType === TokenType.Semicolon) {

            next();

        } else {

            error();

        }

        return end();

    }

    function switchStatement() {

        let p = start(PhraseType.SwitchStatement);
        next(); //switch
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);

        let t = expectOneOf([TokenType.Colon, TokenType.OpenBrace]);
        let tCase = peek();

        if (tCase.tokenType === TokenType.Case || tCase.tokenType === TokenType.Default) {
            p.children.push(caseStatements(t && t.tokenType === TokenType.Colon ?
                TokenType.EndSwitch : TokenType.CloseBrace));
        }

        if (t && t.tokenType === TokenType.Colon) {
            expect(TokenType.EndSwitch);
            expect(TokenType.Semicolon);
        } else {
            expect(TokenType.CloseBrace);
        }

        return end();

    }

    function caseStatements(breakOn: TokenType) {

        let p = start(PhraseType.CaseStatementList);
        let t: Token;
        let caseBreakOn = [TokenType.Case, TokenType.Default];
        caseBreakOn.push(breakOn);

        while (true) {

            t = peek();

            if (t.tokenType === TokenType.Case) {
                p.children.push(caseStatement(caseBreakOn));
            } else if (t.tokenType === TokenType.Default) {
                p.children.push(defaultStatement(caseBreakOn));
            } else if (breakOn === t.tokenType) {
                break;
            } else {
                error();
                break;
            }

        }

        return end();

    }

    function caseStatement(breakOn: TokenType[]) {

        let p = start(PhraseType.CaseStatement);
        next(); //case
        p.children.push(expression(0));
        expectOneOf([TokenType.Colon, TokenType.Semicolon]);
        if (isStatementStart(peek())) {
            p.children.push(statementList(breakOn));
        }
        return end();

    }

    function defaultStatement(breakOn: TokenType[]) {
        let p = start(PhraseType.DefaultStatement);
        next(); //default
        expectOneOf([TokenType.Colon, TokenType.Semicolon]);
        if (isStatementStart(peek())) {
            p.children.push(statementList(breakOn));
        }
        return end();
    }

    function namedLabelStatement() {

        let p = start(PhraseType.NamedLabelStatement);
        next(); //name
        next(); //:
        return end();
    }

    function gotoStatement() {

        let p = start(PhraseType.GotoStatement);
        next(); //goto
        expect(TokenType.Name);
        expect(TokenType.Semicolon);
        return end();

    }

    function throwStatement() {

        let p = start(PhraseType.ThrowStatement);
        next(); //throw
        p.children.push(expression(0));
        expect(TokenType.Semicolon);
        return end();
    }

    function foreachCollection() {
        let p = start(PhraseType.ForeachCollection);
        p.children.push(expression(0));
        return end();
    }

    function foreachKeyOrValue() {
        let p = start(PhraseType.ForeachValue);
        p.children.push(expression(0));
        if (peek().tokenType === TokenType.FatArrow) {
            next();
            p.phraseType = PhraseType.ForeachKey;
        }
        return end();
    }

    function foreachValue() {
        let p = start(PhraseType.ForeachValue);
        optional(TokenType.Ampersand);
        p.children.push(expression(0));
        return end();
    }

    function foreachStatement() {

        let p = start(PhraseType.ForeachStatement);
        next(); //foreach
        expect(TokenType.OpenParenthesis);
        p.children.push(foreachCollection());
        expect(TokenType.As);
        let keyOrValue = peek().tokenType === TokenType.Ampersand ? foreachValue() : foreachKeyOrValue();
        p.children.push(keyOrValue);

        if (keyOrValue.phraseType === PhraseType.ForeachKey) {
            p.children.push(foreachValue());
        }

        expect(TokenType.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            next();
            p.children.push(statementList([TokenType.EndForeach]));
            expect(TokenType.EndForeach);
            expect(TokenType.Semicolon);
        } else if (isStatementStart(t)) {
            p.children.push(statement());
        } else {
            error();
        }

        return end();

    }

    function isVariableStart(t: Token) {

        switch (t.tokenType) {
            case TokenType.VariableName:
            case TokenType.Dollar:
            case TokenType.OpenParenthesis:
            case TokenType.Array:
            case TokenType.OpenBracket:
            case TokenType.StringLiteral:
            case TokenType.Static:
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                return true;
            default:
                return false;
        }

    }

    function variableInitial() {
        return variable(variableAtom());
    }

    function variableList(breakOn?: TokenType[]) {
        return delimitedList(
            PhraseType.VariableList,
            variableInitial,
            isVariableStart,
            TokenType.Comma,
            breakOn
        );
    }

    function unsetIntrinsic() {

        let p = start(PhraseType.UnsetIntrinsic);
        next(); //unset
        expect(TokenType.OpenParenthesis);
        p.children.push(variableList([TokenType.CloseParenthesis]));
        expect(TokenType.CloseParenthesis);
        expect(TokenType.Semicolon);
        return end();

    }

    function expressionInitial() {
        return expression(0);
    }

    function echoIntrinsic() {

        let p = start(PhraseType.EchoIntrinsic);
        next(); //echo
        p.children.push(delimitedList(
            PhraseType.ExpressionList,
            expressionInitial,
            isExpressionStart,
            TokenType.Comma
        ));
        expect(TokenType.Semicolon);
        return end();

    }

    function isStaticVariableDclarationStart(t: Token) {
        return t.tokenType === TokenType.VariableName;
    }

    function functionStaticDeclaration() {

        let p = start(PhraseType.FunctionStaticDeclaration);
        next(); //static
        p.children.push(delimitedList(
            PhraseType.StaticVariableDeclarationList,
            staticVariableDeclaration,
            isStaticVariableDclarationStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        ));
        expect(TokenType.Semicolon);
        return end();

    }

    function globalDeclaration() {

        let p = start(PhraseType.GlobalDeclaration);
        next(); //global
        p.children.push(delimitedList(
            PhraseType.VariableNameList,
            simpleVariable,
            isSimpleVariableStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        ));
        expect(TokenType.Semicolon);
        return end();

    }

    function isSimpleVariableStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.VariableName:
            case TokenType.Dollar:
                return true;
            default:
                return false;
        }
    }

    function staticVariableDeclaration() {

        let p = start(PhraseType.StaticVariableDeclaration);
        expect(TokenType.VariableName);

        if (peek().tokenType === TokenType.Equals) {
            p.children.push(functionStaticInitialiser());
        }

        return end();

    }

    function functionStaticInitialiser() {

        let p = start(PhraseType.FunctionStaticInitialiser);
        next(); //=
        p.children.push(expression(0));
        return end();

    }

    function continueStatement() {
        let p = start(PhraseType.ContinueStatement);
        next(); //break/continue
        if (isExpressionStart(peek())) {
            p.children.push(expression(0));
        }
        expect(TokenType.Semicolon);
        return end();
    }

    function breakStatement() {
        let p = start(PhraseType.BreakStatement);
        next(); //break/continue
        if (isExpressionStart(peek())) {
            p.children.push(expression(0));
        }
        expect(TokenType.Semicolon);
        return end();
    }

    function returnStatement() {
        let p = start(PhraseType.ReturnStatement);
        next(); //return

        if (isExpressionStart(peek())) {
            p.children.push(expression(0));
        }

        expect(TokenType.Semicolon);
        return end();
    }

    function forExpressionGroup(phraseType: PhraseType, breakOn: TokenType[]) {

        return delimitedList(
            phraseType,
            expressionInitial,
            isExpressionStart,
            TokenType.Comma,
            breakOn
        );

    }

    function forStatement() {

        let p = start(PhraseType.ForStatement);
        next(); //for
        expect(TokenType.OpenParenthesis);

        if (isExpressionStart(peek())) {
            p.children.push(forExpressionGroup(PhraseType.ForInitialiser, [TokenType.Semicolon]));
        }

        expect(TokenType.Semicolon);

        if (isExpressionStart(peek())) {
            p.children.push(forExpressionGroup(PhraseType.ForControl, [TokenType.Semicolon]));
        }

        expect(TokenType.Semicolon);

        if (isExpressionStart(peek())) {
            p.children.push(forExpressionGroup(PhraseType.ForEndOfLoop, [TokenType.CloseParenthesis]));
        }

        expect(TokenType.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            next();
            p.children.push(statementList([TokenType.EndFor]));
            expect(TokenType.EndFor);
            expect(TokenType.Semicolon);
        } else if (isStatementStart(peek())) {
            p.children.push(statement());
        } else {
            error();
        }

        return end();

    }

    function doStatement() {

        let p = start(PhraseType.DoStatement);
        next(); // do
        p.children.push(statement());
        expect(TokenType.While);
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);
        expect(TokenType.Semicolon);
        return end();

    }

    function whileStatement() {

        let p = start(PhraseType.WhileStatement);
        next(); //while
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            next();
            p.children.push(statementList([TokenType.EndWhile]));
            expect(TokenType.EndWhile);
            expect(TokenType.Semicolon);
        } else if (isStatementStart(t)) {
            p.children.push(statement());
        } else {
            //error
            error();
        }

        return end();

    }

    function elseIfClause1() {

        let p = start(PhraseType.ElseIfClause);
        next(); //elseif
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);
        p.children.push(statement());
        return end();
    }

    function elseIfClause2() {
        let p = start(PhraseType.ElseIfClause);
        next(); //elseif
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);
        expect(TokenType.Colon);
        p.children.push(statementList([TokenType.EndIf, TokenType.Else, TokenType.ElseIf]));
        return end();
    }

    function elseClause1() {
        let p = start(PhraseType.ElseClause);
        next(); //else
        p.children.push(statement());
        return end();
    }

    function elseClause2() {
        let p = start(PhraseType.ElseClause);
        next(); //else
        expect(TokenType.Colon);
        p.children.push(statementList([TokenType.EndIf]));
        return end();
    }

    function isElseIfClauseStart(t: Token) {
        return t.tokenType === TokenType.ElseIf;
    }

    function ifStatement() {

        let p = start(PhraseType.IfStatement);
        next(); //if
        expect(TokenType.OpenParenthesis);
        p.children.push(expression(0));
        expect(TokenType.CloseParenthesis);

        let t = peek();
        let elseIfClauseFunction = elseIfClause1;
        let elseClauseFunction = elseClause1;
        let expectEndIf = false;

        if (t.tokenType === TokenType.Colon) {
            next();
            p.children.push(statementList([TokenType.ElseIf, TokenType.Else, TokenType.EndIf]));
            elseIfClauseFunction = elseIfClause2;
            elseClauseFunction = elseClause2;
            expectEndIf = true;
        } else if (isStatementStart(t)) {
            p.children.push(statement());
        } else {
            error();
        }

        if (peek().tokenType === TokenType.ElseIf) {
            p.children.push(list(
                PhraseType.ElseIfClauseList,
                elseIfClauseFunction,
                isElseIfClauseStart
            ));
        }

        if (peek().tokenType === TokenType.Else) {
            p.children.push(elseClauseFunction());
        }

        if (expectEndIf) {
            expect(TokenType.EndIf);
            expect(TokenType.Semicolon);
        }

        return end();

    }

    function expressionStatement() {

        let p = start(PhraseType.ExpressionStatement);
        p.children.push(expression(0));
        expect(TokenType.Semicolon);
        return end();

    }

    function returnType() {
        let p = start(PhraseType.ReturnType);
        next(); //:
        p.children.push(typeDeclaration());
        return end();
    }

    function typeDeclaration() {

        let p = start(PhraseType.TypeDeclaration);
        optional(TokenType.Question);

        switch (peek().tokenType) {
            case TokenType.Callable:
            case TokenType.Array:
                next();
                break;
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                p.children.push(qualifiedName());
                break;
            default:
                error();
                break;
        }

        return end();

    }

    function classConstDeclaration(modifiers?: Phrase) {
        const constToken = next();
        const list = delimitedList(
            PhraseType.ClassConstElementList,
            classConstElement,
            isClassConstElementStartToken,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(
            PhraseType.ClassConstDeclaration,
            nodePackedRange(modifiers || constToken)[0],
            nodePackedRange(semicolon)[1],
            modifiers ? [modifiers, constToken, list, semicolon] : [constToken, list, semicolon]
        );
    }

    function isExpressionStart(t: Token) {

        switch (t.tokenType) {
            case TokenType.VariableName:
            case TokenType.Dollar:
            case TokenType.Array:
            case TokenType.OpenBracket:
            case TokenType.StringLiteral:
            case TokenType.Backslash:
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.OpenParenthesis:
            case TokenType.Static:
            case TokenType.PlusPlus:
            case TokenType.MinusMinus:
            case TokenType.Plus:
            case TokenType.Minus:
            case TokenType.Exclamation:
            case TokenType.Tilde:
            case TokenType.AtSymbol:
            case TokenType.IntegerCast:
            case TokenType.FloatCast:
            case TokenType.StringCast:
            case TokenType.ArrayCast:
            case TokenType.ObjectCast:
            case TokenType.BooleanCast:
            case TokenType.UnsetCast:
            case TokenType.List:
            case TokenType.Clone:
            case TokenType.New:
            case TokenType.FloatingLiteral:
            case TokenType.IntegerLiteral:
            case TokenType.LineConstant:
            case TokenType.FileConstant:
            case TokenType.DirectoryConstant:
            case TokenType.TraitConstant:
            case TokenType.MethodConstant:
            case TokenType.FunctionConstant:
            case TokenType.NamespaceConstant:
            case TokenType.ClassConstant:
            case TokenType.StartHeredoc:
            case TokenType.DoubleQuote:
            case TokenType.Backtick:
            case TokenType.Print:
            case TokenType.Yield:
            case TokenType.YieldFrom:
            case TokenType.Function:
            case TokenType.Include:
            case TokenType.IncludeOnce:
            case TokenType.Require:
            case TokenType.RequireOnce:
            case TokenType.Eval:
            case TokenType.Empty:
            case TokenType.Isset:
            case TokenType.Exit:
                return true;
            default:
                return false;
        }

    }

    function classConstElement() {

        let p = start(PhraseType.ClassConstElement);
        p.children.push(identifier());
        expect(TokenType.Equals);
        p.children.push(expression(0));
        return end();

    }

    function isPropertyElementStart(t: Token) {
        return t.tokenType === TokenType.VariableName;
    }

    function propertyDeclaration(modifiersOrVar: Phrase | Token) {
        const list = delimitedList(
            PhraseType.PropertyElementList,
            propertyElement,
            isPropertyElementStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(
            PhraseType.PropertyDeclaration,
            nodePackedRange(modifiersOrVar)[0],
            nodePackedRange(semicolon)[1],
            [modifiersOrVar, list, semicolon]
        );
    }

    function propertyElement() {
        const varName = expect(TokenType.VariableName);
        let start: number, end: number;
        [start, end] = nodePackedRange(varName);

        if (peek().tokenType === TokenType.Equals) {
            const initialiser = propertyInitialiser();
            return Phrase.create(
                PhraseType.PropertyElement,
                start,
                nodePackedRange(initialiser)[1],
                [varName, initialiser]
            );
        }

        return Phrase.create(PhraseType.PropertyElement, start, end, [varName]);
    }

    function propertyInitialiser() {
        const equals = next();
        const expr = expression(0);
        return Phrase.create(
            PhraseType.PropertyInitialiser,
            nodePackedRange(equals)[0],
            nodePackedRange(expr)[1],
            [equals, expr]
        );
    }

    function memberModifierList() {
        let children: (Phrase | Token)[] = [];
        let start: number, end: number;
        [start, end] = nodePackedRange(peek());

        while (isMemberModifier(peek())) {
            children.push(next());
        }

        if (children.length > 1) {
            end = nodePackedRange(children[children.length - 1])[1];
        }

        return Phrase.create(PhraseType.MemberModifierList, start, end, children);

    }

    function isMemberModifier(t: Token) {
        switch (t.tokenType) {
            case TokenType.Public:
            case TokenType.Protected:
            case TokenType.Private:
            case TokenType.Static:
            case TokenType.Abstract:
            case TokenType.Final:
                return true;
            default:
                return false;
        }
    }


    function qualifiedNameList(breakOn: TokenType[]) {
        return delimitedList(
            PhraseType.QualifiedNameList,
            qualifiedName,
            isQualifiedNameStart,
            TokenType.Comma,
            breakOn
        );
    }

    function objectCreationExpression() {

        let p = start(PhraseType.ObjectCreationExpression);
        next(); //new

        if (peek().tokenType === TokenType.Class) {
            p.children.push(anonymousClassDeclaration());
            return end();
        }

        p.children.push(typeDesignator(PhraseType.ClassTypeDesignator));

        if (optional(TokenType.OpenParenthesis)) {

            if (isArgumentStart(peek())) {
                p.children.push(argumentList());
            }

            expect(TokenType.CloseParenthesis);
        }

        return end();

    }

    function typeDesignator(phraseType: PhraseType) {

        let p = start(phraseType);
        let part = classTypeDesignatorAtom();

        while (true) {

            switch (peek().tokenType) {
                case TokenType.OpenBracket:
                    part = subscriptExpression(part, TokenType.CloseBracket);
                    continue;
                case TokenType.OpenBrace:
                    part = subscriptExpression(part, TokenType.CloseBrace);
                    continue;
                case TokenType.Arrow:
                    part = propertyAccessExpression(part);
                    continue;
                case TokenType.ColonColon:
                    let staticPropNode = start(PhraseType.ScopedPropertyAccessExpression);
                    staticPropNode.children.push(part);
                    next(); //::
                    staticPropNode.children.push(restrictedScopedMemberName());
                    part = end();
                    continue;
                default:
                    break;
            }

            break;

        }

        p.children.push(part);
        return end();

    }

    function restrictedScopedMemberName() {

        let p = start(PhraseType.ScopedMemberName);
        let t = peek();

        switch (t.tokenType) {
            case TokenType.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                next();
                break;
            case TokenType.Dollar:
                p.children.push(simpleVariable());
                break;
            default:
                error();
                break;
        }

        return end();

    }

    function classTypeDesignatorAtom() {

        let t = peek();

        switch (t.tokenType) {
            case TokenType.Static:
                return relativeScope();
            case TokenType.VariableName:
            case TokenType.Dollar:
                return simpleVariable();
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                return qualifiedName();
            default:
                start(PhraseType.ErrorClassTypeDesignatorAtom);
                error();
                return end();
        }

    }

    function cloneExpression() {

        let p = start(PhraseType.CloneExpression);
        next(); //clone
        p.children.push(expression(0));
        return end();

    }

    function listIntrinsic() {

        let p = start(PhraseType.ListIntrinsic);
        next(); //list
        expect(TokenType.OpenParenthesis);
        p.children.push(arrayInitialiserList(TokenType.CloseParenthesis));
        expect(TokenType.CloseParenthesis);
        return end();

    }

    function unaryExpression(phraseType: PhraseType) {

        let p = start(phraseType);
        let op = next();//op

        switch (phraseType) {
            case PhraseType.PrefixDecrementExpression:
            case PhraseType.PrefixIncrementExpression:
                p.children.push(variable(variableAtom()));
                break;
            default:
                p.children.push(expression(precedenceAssociativityTuple(op)[0]));
                break;
        }

        return end();

    }

    function anonymousFunctionHeader() {
        let p = start(PhraseType.AnonymousFunctionHeader);
        optional(TokenType.Static);
        next(); //function
        optional(TokenType.Ampersand);
        expect(TokenType.OpenParenthesis);

        if (isParameterStart(peek())) {
            p.children.push(delimitedList(
                PhraseType.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenType.Comma,
                [TokenType.CloseParenthesis]
            ));
        }

        expect(TokenType.CloseParenthesis);

        if (peek().tokenType === TokenType.Use) {
            p.children.push(anonymousFunctionUseClause());
        }

        if (peek().tokenType === TokenType.Colon) {
            p.children.push(returnType());
        }

        return end();

    }

    function anonymousFunctionCreationExpression() {

        let p = start(PhraseType.AnonymousFunctionCreationExpression);

        p.children.push(anonymousFunctionHeader());
        p.children.push(functionDeclarationBody());
        return end();

    }

    function isAnonymousFunctionUseVariableStart(t: Token) {
        return t.tokenType === TokenType.VariableName ||
            t.tokenType === TokenType.Ampersand;
    }

    function anonymousFunctionUseClause() {

        let p = start(PhraseType.AnonymousFunctionUseClause);
        next(); //use
        expect(TokenType.OpenParenthesis);
        p.children.push(delimitedList(
            PhraseType.ClosureUseList,
            anonymousFunctionUseVariable,
            isAnonymousFunctionUseVariableStart,
            TokenType.Comma,
            [TokenType.CloseParenthesis]
        ));
        expect(TokenType.CloseParenthesis);
        return end();

    }

    function anonymousFunctionUseVariable() {

        let p = start(PhraseType.AnonymousFunctionUseVariable);
        optional(TokenType.Ampersand);
        expect(TokenType.VariableName);
        return end();

    }

    function isTypeDeclarationStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.Backslash:
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Question:
            case TokenType.Array:
            case TokenType.Callable:
                return true;
            default:
                return false;
        }
    }

    function parameterDeclaration() {

        let p = start(PhraseType.ParameterDeclaration);

        if (isTypeDeclarationStart(peek())) {
            p.children.push(typeDeclaration());
        }

        optional(TokenType.Ampersand);
        optional(TokenType.Ellipsis);
        expect(TokenType.VariableName);

        if (peek().tokenType === TokenType.Equals) {
            next();
            p.children.push(expression(0));
        }

        return end();

    }

    function variable(variableAtomNode: Phrase | Token) {

        let count = 0;

        while (true) {
            ++count;
            switch (peek().tokenType) {
                case TokenType.ColonColon:
                    variableAtomNode = scopedAccessExpression(variableAtomNode);
                    continue;
                case TokenType.Arrow:
                    variableAtomNode = propertyOrMethodAccessExpression(variableAtomNode);
                    continue;
                case TokenType.OpenBracket:
                    variableAtomNode = subscriptExpression(variableAtomNode, TokenType.CloseBracket);
                    continue;
                case TokenType.OpenBrace:
                    variableAtomNode = subscriptExpression(variableAtomNode, TokenType.CloseBrace);
                    continue;
                case TokenType.OpenParenthesis:
                    variableAtomNode = functionCallExpression(variableAtomNode);
                    continue;
                default:
                    //only simple variable atoms qualify as variables
                    if (count === 1 && (<Phrase>variableAtomNode).phraseType !== PhraseType.SimpleVariable) {
                        let errNode = start(PhraseType.ErrorVariable, true);
                        errNode.children.push(variableAtomNode);
                        error();
                        return end();
                    }
                    break;
            }

            break;
        }

        return variableAtomNode;
    }

    function functionCallExpression(lhs: Phrase | Token) {
        let p = start(PhraseType.FunctionCallExpression, true);
        p.children.push(lhs);
        expect(TokenType.OpenParenthesis);
        if (isArgumentStart(peek())) {
            p.children.push(argumentList());
        }
        expect(TokenType.CloseParenthesis);
        return end();
    }

    function scopedAccessExpression(lhs: Phrase | Token) {

        let p = start(PhraseType.ErrorScopedAccessExpression, true);
        p.children.push(lhs);
        next() //::
        p.children.push(scopedMemberName(p));

        if (optional(TokenType.OpenParenthesis)) {
            p.phraseType = PhraseType.ScopedCallExpression;
            if (isArgumentStart(peek())) {
                p.children.push(argumentList());
            }

            expect(TokenType.CloseParenthesis);
            return end();
        } else if (p.phraseType === PhraseType.ScopedCallExpression) {
            //error
            error();
        }

        return end();

    }

    function scopedMemberName(parent: Phrase) {

        let p = start(PhraseType.ScopedMemberName);
        let t = peek();

        switch (t.tokenType) {
            case TokenType.OpenBrace:
                parent.phraseType = PhraseType.ScopedCallExpression;
                p.children.push(encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace));
                break;
            case TokenType.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                parent.phraseType = PhraseType.ScopedPropertyAccessExpression;
                next();
                break;
            case TokenType.Dollar:
                p.children.push(simpleVariable());
                parent.phraseType = PhraseType.ScopedPropertyAccessExpression;
                break;
            default:
                if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {
                    p.children.push(identifier());
                    parent.phraseType = PhraseType.ClassConstantAccessExpression;
                } else {
                    //error
                    error();
                }
                break;
        }

        return end();

    }

    function propertyAccessExpression(lhs: Phrase | Token) {
        let p = start(PhraseType.PropertyAccessExpression, true);
        p.children.push(lhs);
        next(); //->
        p.children.push(memberName());
        return end();
    }

    function propertyOrMethodAccessExpression(lhs: Phrase | Token) {

        let p = start(PhraseType.PropertyAccessExpression, true);
        p.children.push(lhs);
        next(); //->
        p.children.push(memberName());

        if (optional(TokenType.OpenParenthesis)) {
            if (isArgumentStart(peek())) {
                p.children.push(argumentList());
            }
            p.phraseType = PhraseType.MethodCallExpression;
            expect(TokenType.CloseParenthesis);
        }

        return end();

    }

    function memberName() {

        let p = start(PhraseType.MemberName);

        switch (peek().tokenType) {
            case TokenType.Name:
                next();
                break;
            case TokenType.OpenBrace:
                p.children.push(encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace));
                break;
            case TokenType.Dollar:
            case TokenType.VariableName:
                p.children.push(simpleVariable());
                break;
            default:
                error();
                break;
        }

        return end();

    }

    function subscriptExpression(lhs: Phrase | Token, closeTokenType: TokenType) {

        let p = start(PhraseType.SubscriptExpression, true);
        p.children.push(lhs);
        next(); // [ or {

        if (isExpressionStart(peek())) {
            p.children.push(expression(0));
        }

        expect(closeTokenType);
        return end();

    }

    function argumentList() {

        return delimitedList(
            PhraseType.ArgumentExpressionList,
            argumentExpression,
            isArgumentStart,
            TokenType.Comma,
            [TokenType.CloseParenthesis]
        );

    }

    function isArgumentStart(t: Token) {
        return t.tokenType === TokenType.Ellipsis || isExpressionStart(t);
    }

    function variadicUnpacking() {
        let p = start(PhraseType.VariadicUnpacking);
        next(); //...
        p.children.push(expression(0));
        return end();
    }

    function argumentExpression() {
        return peek().tokenType === TokenType.Ellipsis ?
            variadicUnpacking() : expression(0);
    }

    function qualifiedName() {

        let p = start(PhraseType.QualifiedName);
        let t = peek();

        if (t.tokenType === TokenType.Backslash) {
            next();
            p.phraseType = PhraseType.FullyQualifiedName;
        } else if (t.tokenType === TokenType.Namespace) {
            p.phraseType = PhraseType.RelativeQualifiedName;
            next();
            expect(TokenType.Backslash);
        }

        p.children.push(namespaceName());
        return end();

    }

    function isQualifiedNameStart(t: Token) {
        switch (t.tokenType) {
            case TokenType.Backslash:
            case TokenType.Name:
            case TokenType.Namespace:
                return true;
            default:
                return false;
        }
    }

    function shortArrayCreationExpression() {

        let p = start(PhraseType.ArrayCreationExpression);
        next(); //[
        if (isArrayElementStart(peek())) {
            p.children.push(arrayInitialiserList(TokenType.CloseBracket));
        }
        expect(TokenType.CloseBracket);
        return end();

    }

    function longArrayCreationExpression() {

        let p = start(PhraseType.ArrayCreationExpression);
        next(); //array
        expect(TokenType.OpenParenthesis);

        if (isArrayElementStart(peek())) {
            p.children.push(arrayInitialiserList(TokenType.CloseParenthesis));
        }

        expect(TokenType.CloseParenthesis);
        return end();

    }

    function isArrayElementStart(t: Token) {
        return t.tokenType === TokenType.Ampersand || isExpressionStart(t);
    }

    function arrayInitialiserList(breakOn: TokenType) {

        let p = start(PhraseType.ArrayInitialiserList);
        let t: Token;

        let arrayInitialiserListRecoverSet = [breakOn, TokenType.Comma];
        recoverSetStack.push(arrayInitialiserListRecoverSet);

        while (true) {

            //an array can have empty elements
            if (isArrayElementStart(peek())) {
                p.children.push(arrayElement());
            }

            t = peek();

            if (t.tokenType === TokenType.Comma) {
                next();
            } else if (t.tokenType === breakOn) {
                break;
            } else {
                error();
                //check for missing delimeter
                if (isArrayElementStart(t)) {
                    continue;
                } else {
                    //skip until recover token
                    defaultSyncStrategy();
                    t = peek();
                    if (t.tokenType === TokenType.Comma || t.tokenType === breakOn) {
                        continue;
                    }
                }

                break;
            }

        }

        recoverSetStack.pop();
        return end();

    }

    function arrayValue() {

        let p = start(PhraseType.ArrayValue);
        optional(TokenType.Ampersand)
        p.children.push(expression(0));
        return end();

    }

    function arrayKey() {
        let p = start(PhraseType.ArrayKey);
        p.children.push(expression(0));
        return end();
    }

    function arrayElement() {

        let p = start(PhraseType.ArrayElement);

        if (peek().tokenType === TokenType.Ampersand) {
            p.children.push(arrayValue());
            return end();
        }

        let keyOrValue = arrayKey();
        p.children.push(keyOrValue);

        if (!optional(TokenType.FatArrow)) {
            keyOrValue.phraseType = PhraseType.ArrayValue;
            return end();
        }

        p.children.push(arrayValue());
        return end();

    }

    function encapsulatedExpression(openTokenType: TokenType, closeTokenType: TokenType) {
        const open = expect(openTokenType);
        const expr = expression(0);
        const close = expect(closeTokenType);
        return Phrase.create(
            PhraseType.EncapsulatedExpression,
            nodePackedRange(open)[0],
            nodePackedRange(close)[1],
            [open, expr, close]
        );
    }

    function relativeScope() {
        const keyword = next();
        const range = nodePackedRange(keyword);
        return Phrase.create(
            PhraseType.RelativeScope,
            range[0],
            range[1],
            [keyword]
        );
    }

    function variableAtom(): Phrase | Token {

        let t = peek();
        switch (t.tokenType) {
            case TokenType.VariableName:
            case TokenType.Dollar:
                return simpleVariable();
            case TokenType.OpenParenthesis:
                return encapsulatedExpression(TokenType.OpenParenthesis, TokenType.CloseParenthesis);
            case TokenType.Array:
                return longArrayCreationExpression();
            case TokenType.OpenBracket:
                return shortArrayCreationExpression();
            case TokenType.StringLiteral:
                return next(true);
            case TokenType.Static:
                return relativeScope();
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                return qualifiedName();
            default:
                //error
                return error([], t, undefined, PhraseType.ErrorVariableAtom);
        }

    }

    function simpleVariable() {
        const varNameOrDollar = expectOneOf([TokenType.VariableName, TokenType.Dollar]);
        const varNameOrDollarRange = nodePackedRange(varNameOrDollar);

        if ((<Token>varNameOrDollar).tokenType !== TokenType.Dollar) {
            return Phrase.create(PhraseType.SimpleVariable, varNameOrDollarRange[0], varNameOrDollarRange[1], [varNameOrDollar]);
        }

        const t = peek();
        let varOrExpr:Phrase|Token;
        if (t.tokenType === TokenType.OpenBrace) {
            varOrExpr = encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace);
        } else if (t.tokenType === TokenType.Dollar || t.tokenType === TokenType.VariableName) {
            varOrExpr = simpleVariable();
        } else {
            varOrExpr = error([], t);
        }

        return Phrase.create(
            PhraseType.SimpleVariable, 
            varNameOrDollarRange[0], 
            nodePackedRange(varOrExpr)[1], 
            [varNameOrDollar, varOrExpr]
        );

    }

    function haltCompilerStatement() {
        const keyword = next(); // __halt_compiler
        const open = expect(TokenType.OpenParenthesis);
        const close = expect(TokenType.CloseParenthesis);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(
            PhraseType.HaltCompilerStatement,
            nodePackedRange(keyword)[0],
            nodePackedRange(semicolon)[1],
            [keyword, open, close, semicolon]
        );
    }

    function namespaceUseDeclaration() {
        const use = next();
        const children:(Phrase|Token)[] = [];
        children.push(use);
        const start = nodePackedRange(use)[0];
        const kind = optionalOneOf([TokenType.Function, TokenType.Const]);
        if(kind) {
            children.push(kind);
        }
        const leadingBackslash = optional(TokenType.Backslash);
        if(leadingBackslash) {
            children.push(leadingBackslash);
        }
        const nsNameNode = namespaceName();
        let t = peek();

        //should be \ but allow { to recover from missing \
        if (t.tokenType === TokenType.Backslash || t.tokenType === TokenType.OpenBrace) {
            children.push(nsNameNode);
            children.push(expect(TokenType.Backslash));
            children.push(expect(TokenType.OpenBrace));
            children.push(delimitedList(
                PhraseType.NamespaceUseGroupClauseList,
                namespaceUseGroupClause,
                isNamespaceUseGroupClauseStartToken,
                TokenType.Comma,
                [TokenType.CloseBrace]
            ));
            children.push(expect(TokenType.CloseBrace));
            children.push(expect(TokenType.Semicolon));
            return Phrase.create(
                PhraseType.NamespaceUseDeclaration,
                start,
                nodePackedRange(children[children.length - 1])[1],
                children
            );
        }

        children.push(delimitedList(
            PhraseType.NamespaceUseClauseList,
            namespaceUseClauseFunction(nsNameNode),
            isNamespaceUseClauseStartToken,
            TokenType.Comma,
            [TokenType.Semicolon],
        ));

        children.push(expect(TokenType.Semicolon));
        return Phrase.create(
            PhraseType.NamespaceUseDeclaration,
            start,
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function isNamespaceUseClauseStartToken(t: Token) {
        return t.tokenType === TokenType.Name || t.tokenType === TokenType.Backslash;
    }

    function namespaceUseClauseFunction(nsName: Phrase) {

        return () => {
            let name = nsName;

            if (name) {
                nsName = undefined;
            } else {
                name = namespaceName();
            }

            const nameRange = nodePackedRange(name);

            if (peek().tokenType !== TokenType.As) {
                return Phrase.create(PhraseType.NamespaceUseClause, nameRange[0], nameRange[1], [name]);
            }

            const alias = namespaceAliasingClause();
            return Phrase.create(PhraseType.NamespaceUseClause, nameRange[0], nodePackedRange(alias)[1], [name, alias]);
        };

    }

    function delimitedList(phraseType: PhraseType, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, delimiter: TokenType, breakOn?: TokenType[]) {
        let t: Token;
        let delimitedListRecoverSet = breakOn ? breakOn.slice(0) : [];
        delimitedListRecoverSet.push(delimiter);
        recoverSetStack.push(delimitedListRecoverSet);
        const children: (Phrase | Token)[] = [];

        do {

            children.push(elementFunction());
            t = peek();

            if (t.tokenType === delimiter) {
                children.push(next());
            } else if (!breakOn) {
                break;
            } else {
                //error
                //check for missing delimeter
                if (elementStartPredicate(t)) {
                    children.push(error([], t));
                    continue;
                } else {
                    //skip until recover set
                    let skipped = defaultSyncStrategy();
                    children.push(error(skipped, t));
                    if (delimitedListRecoverSet.indexOf(peek().tokenType) > -1) {
                        continue;
                    }
                }

                break;
            }

        } while (!breakOn || breakOn.indexOf(t.tokenType) > -1);

        recoverSetStack.pop();
        return Phrase.create(
            phraseType,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function isNamespaceUseGroupClauseStartToken(t: Token) {
        switch (t.tokenType) {
            case TokenType.Const:
            case TokenType.Function:
            case TokenType.Name:
                return true;
            default:
                return false;
        }
    }

    function namespaceUseGroupClause() {
        const kind = optionalOneOf([TokenType.Function, TokenType.Const]);
        const name = namespaceName();

        if (peek().tokenType !== TokenType.As) {
            return Phrase.create(
                PhraseType.NamespaceUseGroupClause,
                nodePackedRange(kind)[0],
                nodePackedRange(name)[1],
                [kind, name]
            );
        }

        const aliasing = namespaceAliasingClause();
        return Phrase.create(
            PhraseType.NamespaceUseGroupClause,
            nodePackedRange(kind)[0],
            nodePackedRange(aliasing)[1],
            [kind, name, aliasing]
        );
    }

    function namespaceAliasingClause() {
        const asToken = next();
        const name = expect(TokenType.Name);
        return Phrase.create(
            PhraseType.NamespaceAliasingClause,
            nodePackedRange(asToken)[0],
            nodePackedRange(name)[1],
            [asToken, name]
        );
    }

    function namespaceDefinitionHeader() {
        const ns = next(); //namespace
        let start: number, end: number;
        [start, end] = nodePackedRange(ns);

        if (peek().tokenType !== TokenType.Name) {
            return Phrase.create(PhraseType.NamespaceDefinitionHeader, start, end, [ns]);
        }

        const name = namespaceName();
        return Phrase.create(PhraseType.NamespaceDefinitionHeader, start, nodePackedRange(name)[1], [ns, name]);
    }

    function namespaceDefinitionBody() {

        const t = expectOneOf([TokenType.Semicolon, TokenType.OpenBrace]);
        let start: number, end: number;
        [start, end] = nodePackedRange(t);

        if ((<Token>t).tokenType !== TokenType.OpenBrace) {
            return Phrase.create(PhraseType.NamespaceDefinitionBody, start, end, [t]);
        }

        const list = statementList([TokenType.CloseBrace]);
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(PhraseType.NamespaceDefinitionBody, start, nodePackedRange(close)[1], [t, list, close]);
    }

    function namespaceDefinition() {
        const header = namespaceDefinitionHeader();
        const body = namespaceDefinitionBody();
        return Phrase.create(
            PhraseType.NamespaceDefinition,
            nodePackedRange(header)[0],
            nodePackedRange(body)[1],
            [header, body]
        );
    }

    function namespaceName() {
        const children: (Phrase | Token)[] = [];
        children.push(expect(TokenType.Name));

        while (peek().tokenType === TokenType.Backslash && peek(1).tokenType === TokenType.Name) {
            children.push(next(), next());
        }

        return Phrase.create(
            PhraseType.NamespaceName,
            nodePackedRange(children[0])[0],
            nodePackedRange(children[children.length - 1])[1],
            children
        );
    }

    function isReservedToken(t: Token) {
        switch (t.tokenType) {
            case TokenType.Include:
            case TokenType.IncludeOnce:
            case TokenType.Eval:
            case TokenType.Require:
            case TokenType.RequireOnce:
            case TokenType.Or:
            case TokenType.Xor:
            case TokenType.And:
            case TokenType.InstanceOf:
            case TokenType.New:
            case TokenType.Clone:
            case TokenType.Exit:
            case TokenType.If:
            case TokenType.ElseIf:
            case TokenType.Else:
            case TokenType.EndIf:
            case TokenType.Echo:
            case TokenType.Do:
            case TokenType.While:
            case TokenType.EndWhile:
            case TokenType.For:
            case TokenType.EndFor:
            case TokenType.ForEach:
            case TokenType.EndForeach:
            case TokenType.Declare:
            case TokenType.EndDeclare:
            case TokenType.As:
            case TokenType.Try:
            case TokenType.Catch:
            case TokenType.Finally:
            case TokenType.Throw:
            case TokenType.Use:
            case TokenType.InsteadOf:
            case TokenType.Global:
            case TokenType.Var:
            case TokenType.Unset:
            case TokenType.Isset:
            case TokenType.Empty:
            case TokenType.Continue:
            case TokenType.Goto:
            case TokenType.Function:
            case TokenType.Const:
            case TokenType.Return:
            case TokenType.Print:
            case TokenType.Yield:
            case TokenType.List:
            case TokenType.Switch:
            case TokenType.EndSwitch:
            case TokenType.Case:
            case TokenType.Default:
            case TokenType.Break:
            case TokenType.Array:
            case TokenType.Callable:
            case TokenType.Extends:
            case TokenType.Implements:
            case TokenType.Namespace:
            case TokenType.Trait:
            case TokenType.Interface:
            case TokenType.Class:
            case TokenType.ClassConstant:
            case TokenType.TraitConstant:
            case TokenType.FunctionConstant:
            case TokenType.MethodConstant:
            case TokenType.LineConstant:
            case TokenType.FileConstant:
            case TokenType.DirectoryConstant:
            case TokenType.NamespaceConstant:
                return true;
            default:
                return false;
        }
    }

    function isSemiReservedToken(t: Token) {
        switch (t.tokenType) {
            case TokenType.Static:
            case TokenType.Abstract:
            case TokenType.Final:
            case TokenType.Private:
            case TokenType.Protected:
            case TokenType.Public:
                return true;
            default:
                return isReservedToken(t);
        }
    }

    function isStatementStart(t: Token) {

        switch (t.tokenType) {
            case TokenType.Namespace:
            case TokenType.Use:
            case TokenType.HaltCompiler:
            case TokenType.Const:
            case TokenType.Function:
            case TokenType.Class:
            case TokenType.Abstract:
            case TokenType.Final:
            case TokenType.Trait:
            case TokenType.Interface:
            case TokenType.OpenBrace:
            case TokenType.If:
            case TokenType.While:
            case TokenType.Do:
            case TokenType.For:
            case TokenType.Switch:
            case TokenType.Break:
            case TokenType.Continue:
            case TokenType.Return:
            case TokenType.Global:
            case TokenType.Static:
            case TokenType.Echo:
            case TokenType.Unset:
            case TokenType.ForEach:
            case TokenType.Declare:
            case TokenType.Try:
            case TokenType.Throw:
            case TokenType.Goto:
            case TokenType.Name:
            case TokenType.Semicolon:
            case TokenType.CloseTag:
            case TokenType.Text:
            case TokenType.OpenTag:
            case TokenType.OpenTagEcho:
            case TokenType.DocumentComment:
                return true;
            default:
                return isExpressionStart(t);
        }
    }

}
