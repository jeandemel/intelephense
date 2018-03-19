/* Copyright (c) Ben Robert Mewburn 
 * Licensed under the ISC Licence.
 */

'use strict';

import { Token, Lexer, TokenKind, LexerMode, tokenTypeToString } from './lexer';
import {
    ParseError,
    Phrase,
    PhraseKind,
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
            case TokenKind.AsteriskAsterisk:
                return [48, Associativity.Right];
            case TokenKind.PlusPlus:
                return [47, Associativity.Right];
            case TokenKind.MinusMinus:
                return [47, Associativity.Right];
            case TokenKind.Tilde:
                return [47, Associativity.Right];
            case TokenKind.IntegerCast:
                return [47, Associativity.Right];
            case TokenKind.FloatCast:
                return [47, Associativity.Right];
            case TokenKind.StringCast:
                return [47, Associativity.Right];
            case TokenKind.ArrayCast:
                return [47, Associativity.Right];
            case TokenKind.ObjectCast:
                return [47, Associativity.Right];
            case TokenKind.BooleanCast:
                return [47, Associativity.Right];
            case TokenKind.UnsetCast:
                return [47, Associativity.Right];
            case TokenKind.AtSymbol:
                return [47, Associativity.Right];
            case TokenKind.InstanceOf:
                return [46, Associativity.None];
            case TokenKind.Exclamation:
                return [45, Associativity.Right];
            case TokenKind.Asterisk:
                return [44, Associativity.Left];
            case TokenKind.ForwardSlash:
                return [44, Associativity.Left];
            case TokenKind.Percent:
                return [44, Associativity.Left];
            case TokenKind.Plus:
                return [43, Associativity.Left];
            case TokenKind.Minus:
                return [43, Associativity.Left];
            case TokenKind.Dot:
                return [43, Associativity.Left];
            case TokenKind.LessThanLessThan:
                return [42, Associativity.Left];
            case TokenKind.GreaterThanGreaterThan:
                return [42, Associativity.Left];
            case TokenKind.LessThan:
                return [41, Associativity.None];
            case TokenKind.GreaterThan:
                return [41, Associativity.None];
            case TokenKind.LessThanEquals:
                return [41, Associativity.None];
            case TokenKind.GreaterThanEquals:
                return [41, Associativity.None];
            case TokenKind.EqualsEquals:
                return [40, Associativity.None];
            case TokenKind.EqualsEqualsEquals:
                return [40, Associativity.None];
            case TokenKind.ExclamationEquals:
                return [40, Associativity.None];
            case TokenKind.ExclamationEqualsEquals:
                return [40, Associativity.None];
            case TokenKind.Spaceship:
                return [40, Associativity.None];
            case TokenKind.Ampersand:
                return [39, Associativity.Left];
            case TokenKind.Caret:
                return [38, Associativity.Left];
            case TokenKind.Bar:
                return [37, Associativity.Left];
            case TokenKind.AmpersandAmpersand:
                return [36, Associativity.Left];
            case TokenKind.BarBar:
                return [35, Associativity.Left];
            case TokenKind.QuestionQuestion:
                return [34, Associativity.Right];
            case TokenKind.Question:
                return [33, Associativity.Left]; //?: ternary
            case TokenKind.Equals:
                return [32, Associativity.Right];
            case TokenKind.DotEquals:
                return [32, Associativity.Right];
            case TokenKind.PlusEquals:
                return [32, Associativity.Right];
            case TokenKind.MinusEquals:
                return [32, Associativity.Right];
            case TokenKind.AsteriskEquals:
                return [32, Associativity.Right];
            case TokenKind.ForwardslashEquals:
                return [32, Associativity.Right];
            case TokenKind.PercentEquals:
                return [32, Associativity.Right];
            case TokenKind.AsteriskAsteriskEquals:
                return [32, Associativity.Right];
            case TokenKind.AmpersandEquals:
                return [32, Associativity.Right];
            case TokenKind.BarEquals:
                return [32, Associativity.Right];
            case TokenKind.CaretEquals:
                return [32, Associativity.Right];
            case TokenKind.LessThanLessThanEquals:
                return [32, Associativity.Right];
            case TokenKind.GreaterThanGreaterThanEquals:
                return [32, Associativity.Right];
            case TokenKind.And:
                return [31, Associativity.Left];
            case TokenKind.Xor:
                return [30, Associativity.Left];
            case TokenKind.Or:
                return [29, Associativity.Left];
            default:
                throwUnexpectedTokenError(t);

        }
    }

    const statementListRecoverSet = [
        TokenKind.Use,
        TokenKind.HaltCompiler,
        TokenKind.Const,
        TokenKind.Function,
        TokenKind.Class,
        TokenKind.Abstract,
        TokenKind.Final,
        TokenKind.Trait,
        TokenKind.Interface,
        TokenKind.OpenBrace,
        TokenKind.If,
        TokenKind.While,
        TokenKind.Do,
        TokenKind.For,
        TokenKind.Switch,
        TokenKind.Break,
        TokenKind.Continue,
        TokenKind.Return,
        TokenKind.Global,
        TokenKind.Static,
        TokenKind.Echo,
        TokenKind.Unset,
        TokenKind.ForEach,
        TokenKind.Declare,
        TokenKind.Try,
        TokenKind.Throw,
        TokenKind.Goto,
        TokenKind.Semicolon,
        TokenKind.CloseTag,
        TokenKind.OpenTagEcho,
        TokenKind.Text,
        TokenKind.OpenTag
    ];

    const classMemberDeclarationListRecoverSet = [
        TokenKind.Public,
        TokenKind.Protected,
        TokenKind.Private,
        TokenKind.Static,
        TokenKind.Abstract,
        TokenKind.Final,
        TokenKind.Function,
        TokenKind.Var,
        TokenKind.Const,
        TokenKind.Use,
    ];

    const encapsulatedVariableListRecoverSet = [
        TokenKind.EncapsulatedAndWhitespace,
        TokenKind.DollarCurlyOpen,
        TokenKind.CurlyOpen
    ];

    function binaryOpToPhraseType(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Question:
                return PhraseKind.TernaryExpression;
            case TokenKind.Dot:
            case TokenKind.Plus:
            case TokenKind.Minus:
                return PhraseKind.AdditiveExpression;
            case TokenKind.Bar:
            case TokenKind.Ampersand:
            case TokenKind.Caret:
                return PhraseKind.BitwiseExpression;
            case TokenKind.Asterisk:
            case TokenKind.ForwardSlash:
            case TokenKind.Percent:
                return PhraseKind.MultiplicativeExpression;
            case TokenKind.AsteriskAsterisk:
                return PhraseKind.ExponentiationExpression;
            case TokenKind.LessThanLessThan:
            case TokenKind.GreaterThanGreaterThan:
                return PhraseKind.ShiftExpression;
            case TokenKind.AmpersandAmpersand:
            case TokenKind.BarBar:
            case TokenKind.And:
            case TokenKind.Or:
            case TokenKind.Xor:
                return PhraseKind.LogicalExpression;
            case TokenKind.EqualsEqualsEquals:
            case TokenKind.ExclamationEqualsEquals:
            case TokenKind.EqualsEquals:
            case TokenKind.ExclamationEquals:
                return PhraseKind.EqualityExpression;
            case TokenKind.LessThan:
            case TokenKind.LessThanEquals:
            case TokenKind.GreaterThan:
            case TokenKind.GreaterThanEquals:
            case TokenKind.Spaceship:
                return PhraseKind.RelationalExpression;
            case TokenKind.QuestionQuestion:
                return PhraseKind.CoalesceExpression;
            case TokenKind.Equals:
                return PhraseKind.SimpleAssignmentExpression;
            case TokenKind.PlusEquals:
            case TokenKind.MinusEquals:
            case TokenKind.AsteriskEquals:
            case TokenKind.AsteriskAsteriskEquals:
            case TokenKind.ForwardslashEquals:
            case TokenKind.DotEquals:
            case TokenKind.PercentEquals:
            case TokenKind.AmpersandEquals:
            case TokenKind.BarEquals:
            case TokenKind.CaretEquals:
            case TokenKind.LessThanLessThanEquals:
            case TokenKind.GreaterThanGreaterThanEquals:
                return PhraseKind.CompoundAssignmentExpression;
            case TokenKind.InstanceOf:
                return PhraseKind.InstanceOfExpression;
            default:
                return PhraseKind.Unknown;

        }
    }

    var tokenBuffer: Token[];
    var phraseStack: Phrase[];
    var errorPhrase: ParseError;
    var recoverSetStack: TokenKind[][];

    export function parse(text: string): Phrase {
        init(text);
        return statementList([TokenKind.EndOfFile]);
    }

    function init(text: string, lexerModeStack?: LexerMode[]) {
        Lexer.setInput(text, lexerModeStack);
        phraseStack = [];
        tokenBuffer = [];
        recoverSetStack = [];
        errorPhrase = null;
    }

    function optional(tokenType: TokenKind) {
        return tokenType === peek().tokenType ? next() : undefined;
    }

    function optionalOneOf(tokenTypes: TokenKind[]) {
        return tokenTypes.indexOf(peek().tokenType) > -1 ? next() : undefined;
    }

    /**
     * skips over whitespace, comments and doc comments
     * @param allowDocComment doc comments returned when true
     */
    function next(allowDocComment?: boolean): Token {
        const t = tokenBuffer.length > 0 ? tokenBuffer.shift() : Lexer.lex();
        if (t.tokenType >= TokenKind.Comment && (!allowDocComment || t.tokenType !== TokenKind.DocumentComment)) {
            return next(allowDocComment);
        }
        return t;
    }

    function expect(tokenType: TokenKind) {
        let t = peek();
        if (t.tokenType === tokenType) {
            return next();
        } else if (tokenType === TokenKind.Semicolon && t.tokenType === TokenKind.CloseTag) {
            //implicit end statement
            return next();
        } else {
            //test skipping a single token to sync
            if (peek(1).tokenType === tokenType) {
                return Phrase.createParseError([next(), next()], t, tokenType);
            }
            return Phrase.createParseError([], t, tokenType);
        }
    }

    function expectOneOf(tokenTypes: TokenKind[]) {
        let t = peek();
        if (tokenTypes.indexOf(t.tokenType) > -1) {
            return next();
        } else if (tokenTypes.indexOf(TokenKind.Semicolon) > -1 && t.tokenType === TokenKind.CloseTag) {
            //implicit end statement
            return next();
        } else {
            //test skipping single token to sync
            if (tokenTypes.indexOf(peek(1).tokenType) > -1) {
                return Phrase.createParseError([next(), next()], t);
            }
            return Phrase.createParseError([], t);
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

            if (t.tokenType < TokenKind.Comment || (allowDocComment && t.tokenType === TokenKind.DocumentComment)) {
                //not a hidden token
                --n;
            }

        } while (t.tokenType !== TokenKind.EndOfFile && n > 0);

        return t;
    }

    function skip(until: Predicate) {

        let t: Token;
        let skipped: Token[] = [];

        do {
            t = tokenBuffer.length ? tokenBuffer.shift() : Lexer.lex();
            skipped.push(t);
        } while (!until(t) && t.tokenType !== TokenKind.EndOfFile);

        //last skipped token should go back on buffer
        tokenBuffer.unshift(skipped.pop());
        return skipped;

    }


    function list(phraseType: PhraseKind, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, breakOn?: TokenKind[], recoverSet?: TokenKind[], allowDocComment?: boolean) {

        let t:Token;
        let listRecoverSet = recoverSet ? recoverSet.slice(0) : [];
        let children: (Phrase | Token)[] = [];

        if (breakOn) {
            Array.prototype.push.apply(listRecoverSet, breakOn);
        }

        recoverSetStack.push(listRecoverSet);

        while (true) {

            t = peek(0, allowDocComment);
            
            if (elementStartPredicate(t)) {
                children.push(elementFunction());
            } else if (!breakOn || breakOn.indexOf(t.tokenType) > -1) {
                break;
            } else {
                //error
                //attempt to skip single token to sync
                let t1 = peek(1, allowDocComment);
                if (elementStartPredicate(t1) || (breakOn && breakOn.indexOf(t1.tokenType) > -1)) {
                    children.push(Phrase.createParseError([next()], t));
                } else {
                    //skip many to sync
                    children.push(Phrase.createParseError(defaultSyncStrategy(), t));
                    //only continue if recovered on a token in the listRecoverSet
                    t = peek(0, allowDocComment);
                    if (listRecoverSet.indexOf(t.tokenType) < 0) {
                        break;
                    }
                }
            }

        }

        recoverSetStack.pop();
        return Phrase.create(phraseType, children);

    }

    /**
     * default strategy is to skip tokens until a token in the combined recoverSetStack is found
     */
    function defaultSyncStrategy() {

        let mergedRecoverTokenTypeArray: TokenKind[] = [];

        for (let n = recoverSetStack.length - 1; n >= 0; --n) {
            Array.prototype.push.apply(mergedRecoverTokenTypeArray, recoverSetStack[n]);
        }

        let mergedRecoverTokenTypeSet = new Set(mergedRecoverTokenTypeArray);
        let predicate: Predicate = (x) => { return mergedRecoverTokenTypeSet.has(x.tokenType); };
        return skip(predicate);

    }

    function topStatementList(breakOn: TokenKind[]) {
        //@todo restrict some statements to top stmt list only
        const stmtList = statementList(breakOn);
        stmtList.phraseType = PhraseKind.TopStatementList;
        return stmtList;
    }

    function statementList(breakOn: TokenKind[]):Phrase {
        return list(
            PhraseKind.StatementList,
            statement,
            isStatementStart,
            breakOn,
            statementListRecoverSet,
            true
        );
    }

    function constDeclaration() {
        const keyword = next();
        const list = delimitedList(
            PhraseKind.ConstElementList,
            constElement,
            isConstElementStartToken,
            TokenKind.Comma,
            [TokenKind.Semicolon]
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.ConstDeclaration, [keyword, list, semicolon]);
    }

    function isClassConstElementStartToken(t: Token) {
        return t.tokenType === TokenKind.Name || isSemiReservedToken(t);
    }

    function isConstElementStartToken(t: Token) {
        return t.tokenType === TokenKind.Name;
    }

    function constElement() {
        const name = expect(TokenKind.Name);
        const equals = expect(TokenKind.Equals);
        const expr = expression(0);
        return Phrase.create(PhraseKind.ConstElement, [name, equals, expr]);
    }

    function expression(minPrecedence: number) {

        let precedence: number;
        let associativity: Associativity;
        let lhs = expressionAtom();
        let p: Phrase;
        let rhs: Phrase | Token;
        let op = peek();
        let binaryPhraseType = binaryOpToPhraseType(op);

        while (binaryPhraseType !== PhraseKind.Unknown) {

            [precedence, associativity] = precedenceAssociativityTuple(op);

            if (precedence < minPrecedence) {
                break;
            }

            if (associativity === Associativity.Left) {
                ++precedence;
            }

            if (binaryPhraseType === PhraseKind.TernaryExpression) {
                lhs = ternaryExpression(lhs);
                op = peek();
                binaryPhraseType = binaryOpToPhraseType(op);
                continue;
            }

            op = next();

            if (binaryPhraseType === PhraseKind.InstanceOfExpression) {
                rhs = typeDesignator(PhraseKind.InstanceofTypeDesignator);
                lhs = Phrase.create(binaryPhraseType, [lhs, op, rhs]);
            } else if (
                binaryPhraseType === PhraseKind.SimpleAssignmentExpression &&
                peek().tokenType === TokenKind.Ampersand
            ) {
                const ampersand = next();
                rhs = expression(precedence);
                lhs = Phrase.create(PhraseKind.ByRefAssignmentExpression, [lhs, op, ampersand, rhs]);
            } else {
                rhs = expression(precedence);
                lhs = Phrase.create(binaryPhraseType, [lhs, op, rhs]);
            }

            op = peek();
            binaryPhraseType = binaryOpToPhraseType(op);

        }

        return lhs;

    }

    function ternaryExpression(testExpr: Phrase | Token) {

        const question = next();
        let colon: Token | ParseError = optional(TokenKind.Colon);
        let falseExpr: Phrase | Token;

        if (colon) {
            //short form
            falseExpr = expression(0);
            return Phrase.create(PhraseKind.TernaryExpression, [testExpr, question, colon, falseExpr]);
        }

        const trueExpr = expression(0);
        colon = expect(TokenKind.Colon);
        falseExpr = expression(0);
        return Phrase.create(PhraseKind.TernaryExpression, [testExpr, question, trueExpr, colon, falseExpr]);
    }

    function variableOrExpression() {

        let part = variableAtom();
        let isVariable = (<Phrase>part).phraseType === PhraseKind.SimpleVariable;

        if (isDereferenceOperator(peek())) {
            part = variable(part);
            isVariable = true;
        } else {

            switch ((<Phrase>part).phraseType) {
                case PhraseKind.QualifiedName:
                case PhraseKind.FullyQualifiedName:
                case PhraseKind.RelativeQualifiedName:
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
        if (t.tokenType === TokenKind.PlusPlus) {
            return postfixExpression(PhraseKind.PostfixIncrementExpression, <Phrase>part);
        } else if (t.tokenType === TokenKind.MinusMinus) {
            return postfixExpression(PhraseKind.PostfixDecrementExpression, <Phrase>part);
        } else {
            return part;
        }

    }

    function constantAccessExpression(qName: Phrase | Token) {
        return Phrase.create(PhraseKind.ConstantAccessExpression, [qName]);
    }

    function postfixExpression(phraseType: PhraseKind, variableNode: Phrase) {
        const op = next();
        return Phrase.create(phraseType, [variableNode, op]);
    }

    function isDereferenceOperator(t: Token) {
        switch (t.tokenType) {
            case TokenKind.OpenBracket:
            case TokenKind.OpenBrace:
            case TokenKind.Arrow:
            case TokenKind.OpenParenthesis:
            case TokenKind.ColonColon:
                return true;
            default:
                return false;
        }
    }

    function expressionAtom() {

        let t = peek();

        switch (t.tokenType) {
            case TokenKind.Static:
                if (peek(1).tokenType === TokenKind.Function) {
                    return anonymousFunctionCreationExpression();
                } else {
                    return variableOrExpression();
                }
            case TokenKind.StringLiteral:
                if (isDereferenceOperator(peek(1))) {
                    return variableOrExpression();
                } else {
                    return next();
                }
            case TokenKind.VariableName:
            case TokenKind.Dollar:
            case TokenKind.Array:
            case TokenKind.OpenBracket:
            case TokenKind.Backslash:
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.OpenParenthesis:
                return variableOrExpression();
            case TokenKind.PlusPlus:
                return unaryExpression(PhraseKind.PrefixIncrementExpression);
            case TokenKind.MinusMinus:
                return unaryExpression(PhraseKind.PrefixDecrementExpression);
            case TokenKind.Plus:
            case TokenKind.Minus:
            case TokenKind.Exclamation:
            case TokenKind.Tilde:
                return unaryExpression(PhraseKind.UnaryOpExpression);
            case TokenKind.AtSymbol:
                return unaryExpression(PhraseKind.ErrorControlExpression);
            case TokenKind.IntegerCast:
            case TokenKind.FloatCast:
            case TokenKind.StringCast:
            case TokenKind.ArrayCast:
            case TokenKind.ObjectCast:
            case TokenKind.BooleanCast:
            case TokenKind.UnsetCast:
                return unaryExpression(PhraseKind.CastExpression);
            case TokenKind.List:
                return listIntrinsic();
            case TokenKind.Clone:
                return cloneExpression();
            case TokenKind.New:
                return objectCreationExpression();
            case TokenKind.FloatingLiteral:
            case TokenKind.IntegerLiteral:
            case TokenKind.LineConstant:
            case TokenKind.FileConstant:
            case TokenKind.DirectoryConstant:
            case TokenKind.TraitConstant:
            case TokenKind.MethodConstant:
            case TokenKind.FunctionConstant:
            case TokenKind.NamespaceConstant:
            case TokenKind.ClassConstant:
                return next();
            case TokenKind.StartHeredoc:
                return heredocStringLiteral();
            case TokenKind.DoubleQuote:
                return doubleQuotedStringLiteral();
            case TokenKind.Backtick:
                return shellCommandExpression();
            case TokenKind.Print:
                return printIntrinsic();
            case TokenKind.Yield:
                return yieldExpression();
            case TokenKind.YieldFrom:
                return yieldFromExpression();
            case TokenKind.Function:
                return anonymousFunctionCreationExpression();
            case TokenKind.Include:
                return scriptInclusion(PhraseKind.IncludeExpression);
            case TokenKind.IncludeOnce:
                return scriptInclusion(PhraseKind.IncludeOnceExpression);
            case TokenKind.Require:
                return scriptInclusion(PhraseKind.RequireExpression);
            case TokenKind.RequireOnce:
                return scriptInclusion(PhraseKind.RequireOnceExpression);
            case TokenKind.Eval:
                return evalIntrinsic();
            case TokenKind.Empty:
                return emptyIntrinsic();
            case TokenKind.Exit:
                return exitIntrinsic();
            case TokenKind.Isset:
                return issetIntrinsic();
            default:
                return Phrase.createParseError([], t);
        }

    }

    function exitIntrinsic() {
        const keyword = next(); //exit or die
        const open = optional(TokenKind.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseKind.ExitIntrinsic, [keyword]);
        }

        if (!isExpressionStart(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.ExitIntrinsic, [keyword, open, close]);
        }
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.ExitIntrinsic, [keyword, open, expr, close]);
    }

    function issetIntrinsic() {
        const keyword = next(); //isset
        const open = expect(TokenKind.OpenParenthesis);
        const list = variableList([TokenKind.CloseParenthesis]);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.IssetIntrinsic, [keyword, open, list, close]);
    }

    function emptyIntrinsic() {
        const keyword = next(); //empty
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.EmptyIntrinsic, [keyword, open, expr, close]);
    }

    function evalIntrinsic() {
        const keyword = next(); //eval
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.EvalIntrinsic, [keyword, open, expr, close]);
    }

    function scriptInclusion(phraseType: PhraseKind) {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(phraseType, [keyword, expr]);
    }

    function printIntrinsic() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(PhraseKind.PrintIntrinsic, [keyword, expr]);
    }

    function yieldFromExpression() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(PhraseKind.YieldFromExpression, [keyword, expr]);
    }

    function yieldExpression() {
        const keyword = next();

        if (!isExpressionStart(peek())) {
            return Phrase.create(PhraseKind.YieldExpression, [keyword]);
        }

        const keyOrValue = expression(0);
        const arrow = optional(TokenKind.FatArrow);

        if (!arrow) {
            return Phrase.create(PhraseKind.YieldExpression, [keyword, keyOrValue]);
        }

        const value = expression(0);
        return Phrase.create(PhraseKind.YieldExpression, [keyword, keyOrValue, arrow, value]);
    }

    function shellCommandExpression() {
        const open = next(); //`
        const list = encapsulatedVariableList(TokenKind.Backtick);
        const close = expect(TokenKind.Backtick);
        return Phrase.create(PhraseKind.ShellCommandExpression, [open, list, close]);
    }

    function doubleQuotedStringLiteral() {
        const open = next(); //"
        const list = encapsulatedVariableList(TokenKind.DoubleQuote);
        const close = expect(TokenKind.DoubleQuote);
        return Phrase.create(PhraseKind.DoubleQuotedStringLiteral, [open, list, close]);
    }

    function encapsulatedVariableList(breakOn: TokenKind) {
        return list(
            PhraseKind.EncapsulatedVariableList,
            encapsulatedVariable,
            isEncapsulatedVariableStart,
            [breakOn],
            encapsulatedVariableListRecoverSet
        );
    }

    function isEncapsulatedVariableStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.EncapsulatedAndWhitespace:
            case TokenKind.VariableName:
            case TokenKind.DollarCurlyOpen:
            case TokenKind.CurlyOpen:
                return true;
            default:
                return false;
        }
    }

    function encapsulatedVariable() {
        switch (peek().tokenType) {
            case TokenKind.EncapsulatedAndWhitespace:
                return next();
            case TokenKind.VariableName:
                {
                    let t = peek(1);
                    if (t.tokenType === TokenKind.OpenBracket) {
                        return encapsulatedDimension();
                    } else if (t.tokenType === TokenKind.Arrow) {
                        return encapsulatedProperty();
                    } else {
                        return simpleVariable();
                    }
                }
            case TokenKind.DollarCurlyOpen:
                return dollarCurlyOpenEncapsulatedVariable();
            case TokenKind.CurlyOpen:
                return curlyOpenEncapsulatedVariable();
            default:
                throwUnexpectedTokenError(peek());
        }
    }

    function curlyOpenEncapsulatedVariable() {
        const open = next(); //{
        const vble = variable(variableAtom());
        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(PhraseKind.EncapsulatedVariable, [open, vble, close]);
    }

    function dollarCurlyOpenEncapsulatedVariable() {
        const open = next(); //${
        const t = peek();
        let expr: Phrase | Token;

        if (t.tokenType === TokenKind.VariableName) {
            if (peek(1).tokenType === TokenKind.OpenBracket) {
                expr = dollarCurlyEncapsulatedDimension();
            } else {
                const varName = next();
                expr = Phrase.create(PhraseKind.SimpleVariable, [varName]);
            }
        } else if (isExpressionStart(t)) {
            expr = expression(0);
        } else {
            expr = Phrase.createParseError([], t);
        }

        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(PhraseKind.EncapsulatedVariable, [open, expr, close]);
    }

    function dollarCurlyEncapsulatedDimension() {
        const varName = next();
        const open = next(); // [
        const expr = expression(0);
        const close = expect(TokenKind.CloseBracket);
        return Phrase.create(PhraseKind.SubscriptExpression, [varName, open, expr, close]);
    }

    function encapsulatedDimension() {
        const sv = simpleVariable(); //T_VARIABLE
        const open = next(); //[
        let expr: Phrase | Token;

        switch (peek().tokenType) {
            case TokenKind.Name:
            case TokenKind.IntegerLiteral:
                expr = next();
                break;
            case TokenKind.VariableName:
                expr = simpleVariable();
                break;
            case TokenKind.Minus:
                {
                    const minus = next();
                    const intLiteral = expect(TokenKind.IntegerLiteral);
                    expr = Phrase.create(PhraseKind.UnaryOpExpression, [minus, intLiteral]);
                }
                break;
            default:
                //error
                expr = Phrase.createParseError([], peek());
                break;
        }

        const close = expect(TokenKind.CloseBracket);
        return Phrase.create(PhraseKind.SubscriptExpression, [sv, open, expr, close]);
    }

    function encapsulatedProperty() {
        const sv = simpleVariable();
        const arrow = next(); //->
        const name = expect(TokenKind.Name);
        return Phrase.create(PhraseKind.PropertyAccessExpression, [sv, arrow, name]);
    }

    function heredocStringLiteral() {
        const startHeredoc = next();
        const list = encapsulatedVariableList(TokenKind.EndHeredoc);
        const endHeredoc = expect(TokenKind.EndHeredoc);
        return Phrase.create(PhraseKind.HeredocStringLiteral, [startHeredoc, list, endHeredoc]);
    }

    function anonymousClassDeclaration() {
        const header = anonymousClassDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseKind.ClassDeclarationBody, isClassMemberStart, classMemberDeclarationList
        );
        return Phrase.create(PhraseKind.AnonymousClassDeclaration, [header, body]);
    }

    function anonymousClassDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //class
        const open = optional(TokenKind.OpenParenthesis);

        if (open) {
            children.push(open);
            if (isArgumentStart(peek())) {
                children.push(argumentList());
            }
            children.push(expect(TokenKind.CloseParenthesis));
        }

        if (peek().tokenType === TokenKind.Extends) {
            children.push(classBaseClause());
        }

        if (peek().tokenType === TokenKind.Implements) {
            children.push(classInterfaceClause());
        }

        return Phrase.create(PhraseKind.AnonymousClassDeclarationHeader, children);
    }

    function classInterfaceClause() {
        const keyword = next(); //implements
        const list = qualifiedNameList([TokenKind.OpenBrace]);
        return Phrase.create(PhraseKind.ClassInterfaceClause, [keyword, list]);
    }

    function classMemberDeclarationList() {
        return list(
            PhraseKind.ClassMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenKind.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );
    }

    function isClassMemberStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Public:
            case TokenKind.Protected:
            case TokenKind.Private:
            case TokenKind.Static:
            case TokenKind.Abstract:
            case TokenKind.Final:
            case TokenKind.Function:
            case TokenKind.Var:
            case TokenKind.Const:
            case TokenKind.Use:
            case TokenKind.DocumentComment:
                return true;
            default:
                return false;
        }
    }

    function docBlock() {
        const t = next(true); //DocumentComment
        return Phrase.create(PhraseKind.DocBlock, [t]);
    }

    function classMemberDeclaration() {

        let t = peek(0, true);

        switch (t.tokenType) {
            case TokenKind.DocumentComment:
                return docBlock();
            case TokenKind.Public:
            case TokenKind.Protected:
            case TokenKind.Private:
            case TokenKind.Static:
            case TokenKind.Abstract:
            case TokenKind.Final:
                {
                    const modifiers = memberModifierList();
                    t = peek();
                    if (t.tokenType === TokenKind.VariableName) {
                        return propertyDeclaration(modifiers);
                    } else if (t.tokenType === TokenKind.Function) {
                        return methodDeclaration(modifiers);
                    } else if (t.tokenType === TokenKind.Const) {
                        return classConstDeclaration(modifiers);
                    } else {
                        //error
                        return Phrase.createParseError([modifiers], t);
                    }
                }
            case TokenKind.Function:
                return methodDeclaration();
            case TokenKind.Var:
                return propertyDeclaration(next());
            case TokenKind.Const:
                return classConstDeclaration();
            case TokenKind.Use:
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
        const use = next();
        const nameList = qualifiedNameList([TokenKind.Semicolon, TokenKind.OpenBrace]);
        const spec = traitUseSpecification();
        return Phrase.create(PhraseKind.TraitUseClause, [use, nameList, spec]);
    }

    function traitUseSpecification() {
        const t = expectOneOf([TokenKind.Semicolon, TokenKind.OpenBrace]) as Token;

        if (t.tokenType !== TokenKind.OpenBrace) {
            return Phrase.create(PhraseKind.TraitUseSpecification, [t]);
        }

        if (!isTraitAdaptationStart(peek())) {
            const close = expect(TokenKind.CloseBrace);
            return Phrase.create(PhraseKind.TraitUseSpecification, [t, close]);
        }

        const adaptList = traitAdaptationList();
        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(PhraseKind.TraitUseSpecification, [t, adaptList, close]);
    }

    function traitAdaptationList() {
        return list(
            PhraseKind.TraitAdaptationList,
            traitAdaptation,
            isTraitAdaptationStart,
            [TokenKind.CloseBrace]
        );
    }

    function isTraitAdaptationStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Name:
            case TokenKind.Backslash:
            case TokenKind.Namespace:
                return true;
            default:
                return isSemiReservedToken(t);
        }
    }

    function traitAdaptation() {

        const children: (Phrase | Token)[] = [];
        let t = peek();
        let t2 = peek(1);

        if (t.tokenType === TokenKind.Namespace ||
            t.tokenType === TokenKind.Backslash ||
            (t.tokenType === TokenKind.Name &&
                (t2.tokenType === TokenKind.ColonColon || t2.tokenType === TokenKind.Backslash))) {

            children.push(methodReference());

            if (peek().tokenType === TokenKind.InsteadOf) {
                children.push(next());
                return traitPrecedence(children);
            }

        } else if (t.tokenType === TokenKind.Name || isSemiReservedToken(t)) {
            const ident = identifier();
            children.push(Phrase.create(PhraseKind.MethodReference, [ident]));
        } else {
            //error
            return Phrase.createParseError([], t);
        }

        return traitAlias(children);
    }

    function traitAlias(children: (Phrase | Token)[]) {
        children.push(expect(TokenKind.As));
        let t = peek();

        if (t.tokenType === TokenKind.Name || isReservedToken(t)) {
            children.push(identifier());
        } else if (isMemberModifier(t)) {
            children.push(next());
            t = peek();
            if (t.tokenType === TokenKind.Name || isSemiReservedToken(t)) {
                children.push(identifier());
            }
        } else {
            children.push(Phrase.createParseError([], t));
        }

        children.push(expect(TokenKind.Semicolon));
        return Phrase.create(PhraseKind.TraitAlias, children);
    }

    function traitPrecedence(children: (Phrase | Token)[]) {
        children.push(qualifiedNameList([TokenKind.Semicolon]));
        children.push(expect(TokenKind.Semicolon));
        return Phrase.create(PhraseKind.TraitPrecedence, children);
    }

    function methodReference() {
        const name = qualifiedName();
        const op = expect(TokenKind.ColonColon);
        const ident = identifier();
        return Phrase.create(PhraseKind.MethodReference, [name, op, ident]);
    }

    function methodDeclarationHeader(memberModifers?: Phrase) {
        const children: (Phrase | Token)[] = [];
        if (memberModifers) {
            children.push(memberModifers);
        }
        children.push(next()); //function
        const ampersand = optional(TokenKind.Ampersand);
        if (ampersand) {
            children.push(ampersand);
        }
        children.push(identifier());
        children.push(expect(TokenKind.OpenParenthesis));

        if (isParameterStart(peek())) {
            children.push(delimitedList(
                PhraseKind.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenKind.Comma,
                [TokenKind.CloseParenthesis]
            ));
        }

        children.push(expect(TokenKind.CloseParenthesis));

        if (peek().tokenType === TokenKind.Colon) {
            children.push(returnType());
        }

        return Phrase.create(PhraseKind.MethodDeclarationHeader, children);
    }

    function methodDeclaration(memberModifers?: Phrase) {
        const header = methodDeclarationHeader(memberModifers);
        const body = methodDeclarationBody();
        return Phrase.create(PhraseKind.MethodDeclaration, [header, body]);
    }

    function methodDeclarationBody() {
        let body: Phrase | Token;

        if (peek().tokenType === TokenKind.Semicolon) {
            body = next();
        } else {
            body = compoundStatement();
        }

        return Phrase.create(PhraseKind.MethodDeclarationBody, [body]);
    }

    function identifier() {
        let ident: Phrase | Token = peek();

        if (ident.tokenType === TokenKind.Name || isSemiReservedToken(ident)) {
            ident = next();
        } else {
            ident = Phrase.createParseError([], ident);
        }

        return Phrase.create(PhraseKind.Identifier, [ident]);
    }

    function interfaceDeclaration() {
        const header = interfaceDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseKind.InterfaceDeclarationBody, isClassMemberStart, interfaceMemberDeclarations
        );
        return Phrase.create(PhraseKind.InterfaceDeclaration, [header, body]);
    }

    function typeDeclarationBody<T extends Phrase>(phraseType: PhraseKind, elementStartPredicate: Predicate, listFunction: () => T) {
        const open = expect(TokenKind.OpenBrace);

        if (!elementStartPredicate(peek())) {
            const close = expect(TokenKind.CloseBrace);
            return Phrase.create(phraseType, [open, close]);
        }

        const l = listFunction();
        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(phraseType, [open, l, close]);
    }

    function interfaceMemberDeclarations() {
        return list(
            PhraseKind.InterfaceMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenKind.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );
    }

    function interfaceDeclarationHeader() {
        const interfaceToken = next();
        const name = expect(TokenKind.Name);

        if (peek().tokenType !== TokenKind.Extends) {
            return Phrase.create(PhraseKind.InterfaceDeclarationHeader, [interfaceToken, name]);
        }

        const base = interfaceBaseClause();
        return Phrase.create(PhraseKind.InterfaceDeclarationHeader, [interfaceToken, name, base]);
    }

    function interfaceBaseClause() {
        const ext = next(); //extends
        const list = qualifiedNameList([TokenKind.OpenBrace]);
        return Phrase.create(PhraseKind.InterfaceBaseClause, [ext, list]);
    }

    function traitDeclaration() {
        const header = traitDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseKind.TraitDeclarationBody, isClassMemberStart, traitMemberDeclarations
        );
        return Phrase.create(PhraseKind.TraitDeclaration, [header, body]);
    }

    function traitDeclarationHeader() {
        const traitToken = next(); //trait
        const name = expect(TokenKind.Name);
        return Phrase.create(PhraseKind.TraitDeclarationHeader, [traitToken, name]);
    }

    function traitMemberDeclarations() {
        return list(
            PhraseKind.TraitMemberDeclarationList,
            classMemberDeclaration,
            isClassMemberStart,
            [TokenKind.CloseBrace],
            classMemberDeclarationListRecoverSet,
            true
        );
    }

    function functionDeclaration() {
        const header = functionDeclarationHeader();
        const body = functionDeclarationBody();
        return Phrase.create(PhraseKind.FunctionDeclaration, [header, body]);
    }

    function functionDeclarationBody() {
        let cs = compoundStatement();
        cs.phraseType = PhraseKind.FunctionDeclarationBody;
        return cs;
    }

    function functionDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //function
        const amp = optional(TokenKind.Ampersand);

        if (amp) {
            children.push(amp);
        }

        children.push(expect(TokenKind.Name));
        children.push(expect(TokenKind.OpenParenthesis));

        if (isParameterStart(peek())) {
            children.push(delimitedList(
                PhraseKind.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenKind.Comma,
                [TokenKind.CloseParenthesis]
            ));
        }

        children.push(expect(TokenKind.CloseParenthesis));

        if (peek().tokenType === TokenKind.Colon) {
            children.push(returnType());
        }

        return Phrase.create(PhraseKind.FunctionDeclarationHeader, children);
    }

    function isParameterStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Ampersand:
            case TokenKind.Ellipsis:
            case TokenKind.VariableName:
                return true;
            default:
                return isTypeDeclarationStart(t);
        }
    }

    function classDeclaration() {
        const header = classDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseKind.ClassDeclarationBody, isClassMemberStart, classMemberDeclarationList
        );
        return Phrase.create(PhraseKind.ClassDeclaration, [header, body]);
    }

    function classDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        const mod = optionalOneOf([TokenKind.Abstract, TokenKind.Final]);

        if (mod) {
            children.push(mod);
        }

        children.push(expect(TokenKind.Class));
        children.push(expect(TokenKind.Name));

        if (peek().tokenType === TokenKind.Extends) {
            children.push(classBaseClause());
        }

        if (peek().tokenType === TokenKind.Implements) {
            children.push(classInterfaceClause());
        }

        return Phrase.create(PhraseKind.ClassDeclarationHeader, children);
    }

    function classBaseClause() {
        const ext = next(); //extends
        const name = qualifiedName();
        return Phrase.create(PhraseKind.ClassBaseClause, [ext, name]);
    }

    function compoundStatement() {
        const open = expect(TokenKind.OpenBrace);

        if (!isStatementStart(peek())) {
            const close = expect(TokenKind.CloseBrace);
            return Phrase.create(PhraseKind.CompoundStatement, [open, close]);
        }

        const stmtList = statementList([TokenKind.CloseBrace]);
        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(PhraseKind.CompoundStatement, [open, stmtList, close]);
    }

    function isFunctionStatic(peek1: Token, peek2: Token) {
        return peek1.tokenType === TokenKind.VariableName &&
            (peek2.tokenType === TokenKind.Semicolon ||
                peek2.tokenType === TokenKind.Comma ||
                peek2.tokenType === TokenKind.CloseTag ||
                peek2.tokenType === TokenKind.Equals);
    }

    function isAnonFunction(peek1: Token, peek2: Token) {
        return peek1.tokenType === TokenKind.OpenParenthesis ||
            (peek1.tokenType === TokenKind.Ampersand && peek2.tokenType === TokenKind.OpenParenthesis);
    }

    function statement() {

        let t = peek(0, true);

        switch (t.tokenType) {
            case TokenKind.DocumentComment:
                return docBlock();
            case TokenKind.Namespace:
                return namespaceDefinition();
            case TokenKind.Use:
                return namespaceUseDeclaration();
            case TokenKind.HaltCompiler:
                return haltCompilerStatement();
            case TokenKind.Const:
                return constDeclaration();
            case TokenKind.Function:
                if (isAnonFunction(peek(1), peek(2))) {
                    return expressionStatement();
                } else {
                    return functionDeclaration();
                }
            case TokenKind.Class:
            case TokenKind.Abstract:
            case TokenKind.Final:
                return classDeclaration();
            case TokenKind.Trait:
                return traitDeclaration();
            case TokenKind.Interface:
                return interfaceDeclaration();
            case TokenKind.OpenBrace:
                return compoundStatement();
            case TokenKind.If:
                return ifStatement();
            case TokenKind.While:
                return whileStatement();
            case TokenKind.Do:
                return doStatement();
            case TokenKind.For:
                return forStatement();
            case TokenKind.Switch:
                return switchStatement();
            case TokenKind.Break:
                return breakStatement();
            case TokenKind.Continue:
                return continueStatement();
            case TokenKind.Return:
                return returnStatement();
            case TokenKind.Global:
                return globalDeclaration();
            case TokenKind.Static:
                if (isFunctionStatic(peek(1), peek(2))) {
                    return functionStaticDeclaration();
                } else {
                    return expressionStatement();
                }
            case TokenKind.Text:
            case TokenKind.OpenTag:
            case TokenKind.CloseTag:
                return inlineText();
            case TokenKind.ForEach:
                return foreachStatement();
            case TokenKind.Declare:
                return declareStatement();
            case TokenKind.Try:
                return tryStatement();
            case TokenKind.Throw:
                return throwStatement();
            case TokenKind.Goto:
                return gotoStatement();
            case TokenKind.Echo:
            case TokenKind.OpenTagEcho:
                return echoIntrinsic();
            case TokenKind.Unset:
                return unsetIntrinsic();
            case TokenKind.Semicolon:
                return nullStatement();
            case TokenKind.Name:
                if (peek(1).tokenType === TokenKind.Colon) {
                    return namedLabelStatement();
                }
            //fall though
            default:
                return expressionStatement();

        }

    }

    function inlineText() {
        const children: (Phrase | Token)[] = [];
        const close = optional(TokenKind.CloseTag);
        const text = optional(TokenKind.Text);
        const open = optionalOneOf([TokenKind.OpenTagEcho, TokenKind.OpenTag]);

        if (close) {
            children.push(close);
        }

        if (text) {
            children.push(text);
        }

        if (open) {
            children.push(open);
        }

        return Phrase.create(PhraseKind.InlineText, children);
    }

    function nullStatement() {
        const semicolon = next(); //;
        return Phrase.create(PhraseKind.NullStatement, [semicolon]);
    }

    function isCatchClauseStart(t: Token) {
        return t.tokenType === TokenKind.Catch;
    }

    function tryStatement() {
        const tryToken = next();
        const compound = compoundStatement();

        let t = peek();
        let catchListOrFinally: Phrase | Token;

        if (t.tokenType === TokenKind.Catch) {
            catchListOrFinally = list(
                PhraseKind.CatchClauseList,
                catchClause,
                isCatchClauseStart
            );
        } else if (t.tokenType !== TokenKind.Finally) {
            catchListOrFinally = Phrase.createParseError([], t);
        }

        if (peek().tokenType !== TokenKind.Finally) {
            return Phrase.create(PhraseKind.TryStatement, [tryToken, compound, catchListOrFinally]);
        }

        const finClause = finallyClause();
        return Phrase.create(PhraseKind.TryStatement, [tryToken, compound, catchListOrFinally, finClause]);
    }

    function finallyClause() {
        const fin = next(); //finally
        const stmt = compoundStatement();
        return Phrase.create(PhraseKind.FinallyClause, [fin, stmt]);
    }

    function catchClause() {
        const catchToken = next();
        const open = expect(TokenKind.OpenParenthesis);
        const delimList = delimitedList(
            PhraseKind.CatchNameList,
            qualifiedName,
            isQualifiedNameStart,
            TokenKind.Bar,
            [TokenKind.VariableName]
        );
        const varName = expect(TokenKind.VariableName);
        const close = expect(TokenKind.CloseParenthesis);
        const stmt = compoundStatement();
        return Phrase.create(PhraseKind.CatchClause, [catchToken, open, delimList, varName, close, stmt]);
    }

    function declareDirective() {
        const name = expect(TokenKind.Name);
        const equals = expect(TokenKind.Equals);
        const literal = expectOneOf([TokenKind.IntegerLiteral, TokenKind.FloatingLiteral, TokenKind.StringLiteral]);
        return Phrase.create(PhraseKind.DeclareDirective, [name, equals, literal]);
    }

    function declareStatement() {

        const declareToken = next();
        const open = expect(TokenKind.OpenParenthesis);
        const directive = declareDirective();
        const close = expect(TokenKind.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenKind.Colon) {
            const colon = next(); //:
            const stmtList = statementList([TokenKind.EndDeclare]);
            const end = expect(TokenKind.EndDeclare);
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(PhraseKind.DeclareStatement, [declareToken, open, directive, close, colon, stmtList, end, semicolon]);
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(PhraseKind.DeclareStatement, [declareToken, open, directive, close, stmt]);
        } else if (t.tokenType === TokenKind.Semicolon) {
            const semicolon = next();
            return Phrase.create(PhraseKind.DeclareStatement, [declareToken, open, directive, close, semicolon]);
        } else {
            const err = Phrase.createParseError([], t);
            return Phrase.create(PhraseKind.DeclareStatement, [declareToken, open, directive, close, err]);
        }
    }

    function switchStatement() {
        const keyword = next(); //switch
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);

        const colonOrBrace = expectOneOf([TokenKind.Colon, TokenKind.OpenBrace]);
        let tCase = peek();

        let stmtList: Phrase;
        if (tCase.tokenType === TokenKind.Case || tCase.tokenType === TokenKind.Default) {
            stmtList = caseStatements(
                (<Token>colonOrBrace).tokenType === TokenKind.Colon ? TokenKind.EndSwitch : TokenKind.CloseBrace
            );
        }

        if ((<Token>colonOrBrace).tokenType === TokenKind.Colon) {
            const endSwitch = expect(TokenKind.EndSwitch);
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(
                PhraseKind.SwitchStatement,
                stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, endSwitch, semicolon] :
                    [keyword, open, expr, close, colonOrBrace, endSwitch, semicolon],
            );
        } else {
            const braceClose = expect(TokenKind.CloseBrace);
            return Phrase.create(
                PhraseKind.SwitchStatement,
                stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, braceClose] :
                    [keyword, open, expr, close, colonOrBrace, braceClose],
            );
        }
    }

    function caseStatements(breakOn: TokenKind) {
        let t: Token;
        const children: (Phrase | Token)[] = [];
        const caseBreakOn = [TokenKind.Case, TokenKind.Default];
        caseBreakOn.push(breakOn);
        recoverSetStack.push(caseBreakOn.slice(0));

        while (true) {

            t = peek();

            if (t.tokenType === TokenKind.Case) {
                children.push(caseStatement(caseBreakOn));
            } else if (t.tokenType === TokenKind.Default) {
                children.push(defaultStatement(caseBreakOn));
            } else if (breakOn === t.tokenType) {
                break;
            } else {
                let skipped = defaultSyncStrategy();
                children.push(Phrase.createParseError(skipped, t));
                if (caseBreakOn.indexOf(peek().tokenType) > -1) {
                    continue;
                }
                break;
            }

        }

        recoverSetStack.pop();
        return Phrase.create(PhraseKind.CaseStatementList, children);
    }

    function caseStatement(breakOn: TokenKind[]) {
        const keyword = next(); //case
        const expr = expression(0);
        const colonOrSemicolon = expectOneOf([TokenKind.Colon, TokenKind.Semicolon]);

        if (!isStatementStart(peek())) {
            return Phrase.create(PhraseKind.CaseStatement, [keyword, expr, colonOrSemicolon]);
        }

        const stmtList = statementList(breakOn);
        return Phrase.create(PhraseKind.CaseStatement, [keyword, expr, colonOrSemicolon, stmtList]);
    }

    function defaultStatement(breakOn: TokenKind[]) {
        const keyword = next(); //default
        const colonOrSemicolon = expectOneOf([TokenKind.Colon, TokenKind.Semicolon]);
        if (!isStatementStart(peek())) {
            return Phrase.create(PhraseKind.CaseStatement, [keyword, colonOrSemicolon]);
        }

        const stmtList = statementList(breakOn);
        return Phrase.create(PhraseKind.CaseStatement, [keyword, colonOrSemicolon, stmtList]);
    }

    function namedLabelStatement() {
        const name = next();
        const colon = next();
        return Phrase.create(PhraseKind.NamedLabelStatement, [name, colon]);
    }

    function gotoStatement() {
        const keyword = next(); //goto
        const name = expect(TokenKind.Name);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.GotoStatement, [keyword, name, semicolon]);
    }

    function throwStatement() {
        const keyword = next(); //throw
        const expr = expression(0);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.ThrowStatement, [keyword, expr, semicolon]);
    }

    function foreachCollection() {
        let expr = expression(0);
        return Phrase.create(PhraseKind.ForeachCollection, [expr]);
    }

    function foreachKeyOrValue() {
        const expr = expression(0);
        const arrow = optional(TokenKind.FatArrow);
        if (!arrow) {
            return Phrase.create(PhraseKind.ForeachValue, [expr]);
        }
        return Phrase.create(PhraseKind.ForeachKey, [expr, arrow]);
    }

    function foreachValue() {
        const amp = optional(TokenKind.Ampersand);
        const expr = expression(0);
        return Phrase.create(PhraseKind.ForeachValue, amp ? [amp, expr] : [expr]);
    }

    function foreachStatement() {
        const foreachToken = next(); //foreach
        const open = expect(TokenKind.OpenParenthesis);
        const collection = foreachCollection();
        const asToken = expect(TokenKind.As);
        const keyOrValue = peek().tokenType === TokenKind.Ampersand ? foreachValue() : foreachKeyOrValue();
        let val: Phrase;

        if (keyOrValue.phraseType === PhraseKind.ForeachKey) {
            val = foreachValue();
        }

        const close = expect(TokenKind.CloseParenthesis);
        let t = peek();

        if (t.tokenType === TokenKind.Colon) {
            const colon = next();
            const stmtList = statementList([TokenKind.EndForeach]);
            const endForeach = expect(TokenKind.EndForeach);
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(
                PhraseKind.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, colon, stmtList, endForeach, semicolon] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, colon, stmtList, endForeach, semicolon],
            );
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(
                PhraseKind.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, stmt] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, stmt],
            );
        } else {
            const err = Phrase.createParseError([], t);
            return Phrase.create(
                PhraseKind.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, err] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, err],
            );
        }
    }

    function isVariableStart(t: Token) {

        switch (t.tokenType) {
            case TokenKind.VariableName:
            case TokenKind.Dollar:
            case TokenKind.OpenParenthesis:
            case TokenKind.Array:
            case TokenKind.OpenBracket:
            case TokenKind.StringLiteral:
            case TokenKind.Static:
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.Backslash:
                return true;
            default:
                return false;
        }

    }

    function variableInitial() {
        return variable(variableAtom());
    }

    function variableList(breakOn?: TokenKind[]) {
        return delimitedList(
            PhraseKind.VariableList,
            variableInitial,
            isVariableStart,
            TokenKind.Comma,
            breakOn
        );
    }

    function unsetIntrinsic() {
        const keyword = next(); //unset
        const open = expect(TokenKind.OpenParenthesis);
        const varList = variableList([TokenKind.CloseParenthesis]);
        const close = expect(TokenKind.CloseParenthesis);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.UnsetIntrinsic, [keyword, open, varList, close, semicolon]);
    }

    function expressionInitial() {
        return expression(0);
    }

    function echoIntrinsic() {
        const keyword = next(); //echo or <?=
        const exprList = delimitedList(
            PhraseKind.ExpressionList,
            expressionInitial,
            isExpressionStart,
            TokenKind.Comma
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.EchoIntrinsic, [keyword, exprList, semicolon]);
    }

    function isStaticVariableDclarationStart(t: Token) {
        return t.tokenType === TokenKind.VariableName;
    }

    function functionStaticDeclaration() {
        const keyword = next(); //static
        const varList = delimitedList(
            PhraseKind.StaticVariableDeclarationList,
            staticVariableDeclaration,
            isStaticVariableDclarationStart,
            TokenKind.Comma,
            [TokenKind.Semicolon]
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.FunctionStaticDeclaration, [keyword, varList, semicolon]);
    }

    function globalDeclaration() {
        const keyword = next(); //global
        const varList = delimitedList(
            PhraseKind.VariableNameList,
            simpleVariable,
            isSimpleVariableStart,
            TokenKind.Comma,
            [TokenKind.Semicolon]
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.GlobalDeclaration, [keyword, varList, semicolon]);
    }

    function isSimpleVariableStart(t: Token) {
        return t.tokenType === TokenKind.VariableName || t.tokenType === TokenKind.Dollar;
    }

    function staticVariableDeclaration() {
        const varName = expect(TokenKind.VariableName);

        if (peek().tokenType !== TokenKind.Equals) {
            return Phrase.create(PhraseKind.StaticVariableDeclaration, [varName]);
        }

        const init = functionStaticInitialiser();
        return Phrase.create(PhraseKind.StaticVariableDeclaration, [varName, init]);

    }

    function functionStaticInitialiser() {
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseKind.FunctionStaticInitialiser, [equals, expr]);
    }

    function continueStatement() {
        const keyword = next(); //break/continue
        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(PhraseKind.ContinueStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.ContinueStatement, [keyword, expr, semicolon]);

    }

    function breakStatement() {
        const keyword = next(); //break/continue

        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(PhraseKind.BreakStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.BreakStatement, [keyword, expr, semicolon]);
    }

    function returnStatement() {
        const keyword = next(); //return

        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(PhraseKind.ReturnStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.ReturnStatement, [keyword, expr, semicolon]);
    }

    function forExpressionGroup(phraseType: PhraseKind, breakOn: TokenKind[]) {
        return delimitedList(
            phraseType,
            expressionInitial,
            isExpressionStart,
            TokenKind.Comma,
            breakOn
        );
    }

    function forStatement() {
        const children: (Phrase | Token)[] = [];
        const forToken = next();
        children.push(forToken);
        children.push(expect(TokenKind.OpenParenthesis));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseKind.ForInitialiser, [TokenKind.Semicolon]));
        }

        children.push(expect(TokenKind.Semicolon));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseKind.ForControl, [TokenKind.Semicolon]));
        }

        children.push(expect(TokenKind.Semicolon));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseKind.ForEndOfLoop, [TokenKind.CloseParenthesis]));
        }

        children.push(expect(TokenKind.CloseParenthesis));

        let t = peek();

        if (t.tokenType === TokenKind.Colon) {
            children.push(next());
            children.push(statementList([TokenKind.EndFor]));
            children.push(expect(TokenKind.EndFor));
            children.push(expect(TokenKind.Semicolon));
        } else if (isStatementStart(peek())) {
            children.push(statement());
        } else {
            children.push(Phrase.createParseError([], t));
        }

        return Phrase.create(PhraseKind.ForStatement, children);
    }

    function doStatement() {
        const doToken = next(); // do
        const stmt = statement();
        const whileToken = expect(TokenKind.While);
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.DoStatement, [doToken, stmt, whileToken, open, expr, close, semicolon]);
    }

    function whileStatement() {
        const whileToken = next(); //while
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenKind.Colon) {
            const colon = next();
            const stmtList = statementList([TokenKind.EndWhile]);
            const endWhile = expect(TokenKind.EndWhile);
            const semicolon = expect(TokenKind.Semicolon);
            return Phrase.create(
                PhraseKind.WhileStatement,
                [whileToken, open, expr, close, colon, stmtList, endWhile, semicolon],
            );
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(
                PhraseKind.WhileStatement,
                [whileToken, open, expr, close, stmt],
            );
        } else {
            //error
            const err = Phrase.createParseError([], t);
            return Phrase.create(
                PhraseKind.WhileStatement,
                [whileToken, open, expr, close, err],
            );
        }
    }

    function elseIfClause1() {
        const keyword = next(); //elseif
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        const stmt = statement();
        return Phrase.create(PhraseKind.ElseIfClause, [keyword, open, expr, close, stmt]);
    }

    function elseIfClause2() {
        const keyword = next(); //elseif
        const open = expect(TokenKind.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenKind.CloseParenthesis);
        const colon = expect(TokenKind.Colon);
        const stmtList = statementList([TokenKind.EndIf, TokenKind.Else, TokenKind.ElseIf]);
        return Phrase.create(PhraseKind.ElseIfClause, [keyword, open, expr, close, colon, stmtList]);
    }

    function elseClause1() {
        const keyword = next(); //else
        const stmt = statement();
        return Phrase.create(PhraseKind.ElseClause, [keyword, stmt]);
    }

    function elseClause2() {
        const keyword = next(); //else
        const colon = expect(TokenKind.Colon);
        const stmtList = statementList([TokenKind.EndIf]);
        return Phrase.create(PhraseKind.ElseClause, [keyword, colon, stmtList]);
    }

    function isElseIfClauseStart(t: Token) {
        return t.tokenType === TokenKind.ElseIf;
    }

    function ifStatement() {

        const children: (Phrase | Token)[] = [];
        const ifToken = next();
        children.push(ifToken);
        children.push(expect(TokenKind.OpenParenthesis));
        children.push(expression(0));
        children.push(expect(TokenKind.CloseParenthesis));

        let t = peek();
        let elseIfClauseFunction = elseIfClause1;
        let elseClauseFunction = elseClause1;
        let expectEndIf = false;

        if (t.tokenType === TokenKind.Colon) {
            children.push(next());
            children.push(statementList([TokenKind.ElseIf, TokenKind.Else, TokenKind.EndIf]));
            elseIfClauseFunction = elseIfClause2;
            elseClauseFunction = elseClause2;
            expectEndIf = true;
        } else if (isStatementStart(t)) {
            children.push(statement());
        } else {
            children.push(Phrase.createParseError([], t));
        }

        if (peek().tokenType === TokenKind.ElseIf) {
            children.push(list(
                PhraseKind.ElseIfClauseList,
                elseIfClauseFunction,
                isElseIfClauseStart
            ));
        }

        if (peek().tokenType === TokenKind.Else) {
            children.push(elseClauseFunction());
        }

        if (expectEndIf) {
            children.push(expect(TokenKind.EndIf));
            children.push(expect(TokenKind.Semicolon));
        }

        return Phrase.create(PhraseKind.IfStatement, children);
    }

    function expressionStatement() {
        const expr = expression(0);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.ExpressionStatement, [expr, semicolon]);
    }

    function returnType() {
        const colon = next(); //:
        const typeDecl = typeDeclaration();
        return Phrase.create(PhraseKind.ReturnType, [colon, typeDecl]);
    }

    function typeDeclaration() {
        const question = optional(TokenKind.Question);
        let decl: Phrase | Token;

        switch (peek().tokenType) {
            case TokenKind.Callable:
            case TokenKind.Array:
                decl = next();
                break;
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.Backslash:
                decl = qualifiedName();
                break;
            default:
                decl = Phrase.createParseError([], peek());
                break;
        }

        return Phrase.create(PhraseKind.TypeDeclaration, question ? [question, decl] : [decl]);
    }

    function classConstDeclaration(modifiers?: Phrase) {
        const constToken = next();
        const delimList = delimitedList(
            PhraseKind.ClassConstElementList,
            classConstElement,
            isClassConstElementStartToken,
            TokenKind.Comma,
            [TokenKind.Semicolon]
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(
            PhraseKind.ClassConstDeclaration,
            modifiers ? [modifiers, constToken, delimList, semicolon] : [constToken, delimList, semicolon]
        );
    }

    function isExpressionStart(t: Token) {

        switch (t.tokenType) {
            case TokenKind.VariableName:
            case TokenKind.Dollar:
            case TokenKind.Array:
            case TokenKind.OpenBracket:
            case TokenKind.StringLiteral:
            case TokenKind.Backslash:
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.OpenParenthesis:
            case TokenKind.Static:
            case TokenKind.PlusPlus:
            case TokenKind.MinusMinus:
            case TokenKind.Plus:
            case TokenKind.Minus:
            case TokenKind.Exclamation:
            case TokenKind.Tilde:
            case TokenKind.AtSymbol:
            case TokenKind.IntegerCast:
            case TokenKind.FloatCast:
            case TokenKind.StringCast:
            case TokenKind.ArrayCast:
            case TokenKind.ObjectCast:
            case TokenKind.BooleanCast:
            case TokenKind.UnsetCast:
            case TokenKind.List:
            case TokenKind.Clone:
            case TokenKind.New:
            case TokenKind.FloatingLiteral:
            case TokenKind.IntegerLiteral:
            case TokenKind.LineConstant:
            case TokenKind.FileConstant:
            case TokenKind.DirectoryConstant:
            case TokenKind.TraitConstant:
            case TokenKind.MethodConstant:
            case TokenKind.FunctionConstant:
            case TokenKind.NamespaceConstant:
            case TokenKind.ClassConstant:
            case TokenKind.StartHeredoc:
            case TokenKind.DoubleQuote:
            case TokenKind.Backtick:
            case TokenKind.Print:
            case TokenKind.Yield:
            case TokenKind.YieldFrom:
            case TokenKind.Function:
            case TokenKind.Include:
            case TokenKind.IncludeOnce:
            case TokenKind.Require:
            case TokenKind.RequireOnce:
            case TokenKind.Eval:
            case TokenKind.Empty:
            case TokenKind.Isset:
            case TokenKind.Exit:
                return true;
            default:
                return false;
        }

    }

    function classConstElement() {
        const ident = identifier();
        const equals = expect(TokenKind.Equals);
        const expr = expression(0);
        return Phrase.create(PhraseKind.ClassConstElement, [ident, equals, expr]);
    }

    function isPropertyElementStart(t: Token) {
        return t.tokenType === TokenKind.VariableName;
    }

    function propertyDeclaration(modifiersOrVar: Phrase | Token) {
        const delimList = delimitedList(
            PhraseKind.PropertyElementList,
            propertyElement,
            isPropertyElementStart,
            TokenKind.Comma,
            [TokenKind.Semicolon]
        );
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.PropertyDeclaration, [modifiersOrVar, delimList, semicolon]);
    }

    function propertyElement() {
        const varName = expect(TokenKind.VariableName);

        if (peek().tokenType !== TokenKind.Equals) {
            return Phrase.create(PhraseKind.PropertyElement, [varName]);
        }

        const initialiser = propertyInitialiser();
        return Phrase.create(PhraseKind.PropertyElement, [varName, initialiser]);
    }

    function propertyInitialiser() {
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseKind.PropertyInitialiser, [equals, expr]);
    }

    function memberModifierList() {
        let children: (Phrase | Token)[] = [];
        while (isMemberModifier(peek())) {
            children.push(next());
        }
        return Phrase.create(PhraseKind.MemberModifierList, children);
    }

    function isMemberModifier(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Public:
            case TokenKind.Protected:
            case TokenKind.Private:
            case TokenKind.Static:
            case TokenKind.Abstract:
            case TokenKind.Final:
                return true;
            default:
                return false;
        }
    }


    function qualifiedNameList(breakOn: TokenKind[]) {
        return delimitedList(
            PhraseKind.QualifiedNameList,
            qualifiedName,
            isQualifiedNameStart,
            TokenKind.Comma,
            breakOn
        );
    }

    function objectCreationExpression() {
        const newToken = next();
        if (peek().tokenType === TokenKind.Class) {
            const anonClass = anonymousClassDeclaration();
            return Phrase.create(PhraseKind.ObjectCreationExpression, [newToken, anonClass]);
        }

        const typeDes = typeDesignator(PhraseKind.ClassTypeDesignator);
        const open = optional(TokenKind.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseKind.ObjectCreationExpression, [newToken, typeDes]);
        }

        if (!isArgumentStart(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.ObjectCreationExpression, [newToken, typeDes, open, close]);
        }

        const argList = argumentList();
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(
            PhraseKind.ObjectCreationExpression,
            [newToken, typeDes, open, argList, close]
        );

    }

    function typeDesignator(phraseType: PhraseKind) {

        let part = classTypeDesignatorAtom();

        while (true) {

            switch (peek().tokenType) {
                case TokenKind.OpenBracket:
                    part = subscriptExpression(part, TokenKind.CloseBracket);
                    continue;
                case TokenKind.OpenBrace:
                    part = subscriptExpression(part, TokenKind.CloseBrace);
                    continue;
                case TokenKind.Arrow:
                    part = propertyAccessExpression(part);
                    continue;
                case TokenKind.ColonColon:
                    {
                        const op = next(); //::
                        const name = restrictedScopedMemberName();
                        part = Phrase.create(PhraseKind.ScopedPropertyAccessExpression, [part, op, name]);
                    }
                    continue;
                default:
                    break;
            }

            break;
        }

        return Phrase.create(phraseType, [part]);
    }

    function restrictedScopedMemberName() {

        let t = peek();
        let name: Phrase | Token;

        switch (t.tokenType) {
            case TokenKind.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                name = next();
                break;
            case TokenKind.Dollar:
                name = simpleVariable();
                break;
            default:
                name = Phrase.createParseError([], t);
                break;
        }

        return Phrase.create(PhraseKind.ScopedMemberName, [name]);

    }

    function classTypeDesignatorAtom() {

        let t = peek();

        switch (t.tokenType) {
            case TokenKind.Static:
                return relativeScope();
            case TokenKind.VariableName:
            case TokenKind.Dollar:
                return simpleVariable();
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.Backslash:
                return qualifiedName();
            default:
                return Phrase.createParseError([], t);
        }

    }

    function cloneExpression() {
        const keyword = next(); //clone
        const expr = expression(0);
        return Phrase.create(PhraseKind.CloneExpression, [keyword, expr]);
    }

    function isArrayElementStartOrComma(t: Token) {
        return isArrayElementStart(t) || t.tokenType === TokenKind.Comma;
    }

    function listIntrinsic() {
        const keyword = next(); //list
        const open = expect(TokenKind.OpenParenthesis);
        //list must not be empty in php7+ but allow it for backwards compatibility
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.ListIntrinsic, [keyword, open, close]);
        }

        const arrayList = arrayInitialiserList(TokenKind.CloseParenthesis);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.ListIntrinsic, [keyword, open, arrayList, close]);
    }

    function unaryExpression(phraseType: PhraseKind) {

        const op = next();
        let vbl: Phrase | Token;

        switch (phraseType) {
            case PhraseKind.PrefixDecrementExpression:
            case PhraseKind.PrefixIncrementExpression:
                vbl = variable(variableAtom());
                break;
            default:
                vbl = expression(precedenceAssociativityTuple(op)[0]);
                break;
        }

        return Phrase.create(phraseType, [op, vbl]);

    }

    function anonymousFunctionHeader() {
        const children: (Phrase | Token)[] = [];
        const stat = optional(TokenKind.Static);
        if (stat) {
            children.push(stat);
        }
        children.push(next()); //function
        const amp = optional(TokenKind.Ampersand);
        if (amp) {
            children.push(amp);
        }
        children.push(expect(TokenKind.OpenParenthesis));

        if (isParameterStart(peek())) {
            children.push(delimitedList(
                PhraseKind.ParameterDeclarationList,
                parameterDeclaration,
                isParameterStart,
                TokenKind.Comma,
                [TokenKind.CloseParenthesis]
            ));
        }

        children.push(expect(TokenKind.CloseParenthesis));

        if (peek().tokenType === TokenKind.Use) {
            children.push(anonymousFunctionUseClause());
        }

        if (peek().tokenType === TokenKind.Colon) {
            children.push(returnType());
        }

        return Phrase.create(PhraseKind.AnonymousFunctionHeader, children);

    }

    function anonymousFunctionCreationExpression() {
        const header = anonymousFunctionHeader();
        const body = functionDeclarationBody();
        return Phrase.create(PhraseKind.AnonymousFunctionCreationExpression, [header, body]);
    }

    function isAnonymousFunctionUseVariableStart(t: Token) {
        return t.tokenType === TokenKind.VariableName || t.tokenType === TokenKind.Ampersand;
    }

    function anonymousFunctionUseClause() {
        const use = next();
        const open = expect(TokenKind.OpenParenthesis);
        const delimList = delimitedList(
            PhraseKind.ClosureUseList,
            anonymousFunctionUseVariable,
            isAnonymousFunctionUseVariableStart,
            TokenKind.Comma,
            [TokenKind.CloseParenthesis]
        );
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.AnonymousFunctionUseClause, [use, open, delimList, close]);
    }

    function anonymousFunctionUseVariable() {
        const amp = optional(TokenKind.Ampersand);
        const varName = expect(TokenKind.VariableName);
        return Phrase.create(PhraseKind.AnonymousFunctionUseVariable, amp ? [amp, varName] : [varName]);
    }

    function isTypeDeclarationStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Backslash:
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.Question:
            case TokenKind.Array:
            case TokenKind.Callable:
                return true;
            default:
                return false;
        }
    }

    function parameterDeclaration() {
        const children: (Phrase | Token)[] = [];

        if (isTypeDeclarationStart(peek())) {
            children.push(typeDeclaration());
        }

        const amp = optional(TokenKind.Ampersand);
        if (amp) {
            children.push(amp);
        }
        const ellip = optional(TokenKind.Ellipsis);
        if (ellip) {
            children.push(ellip);
        }
        children.push(expect(TokenKind.VariableName));

        if (peek().tokenType === TokenKind.Equals) {
            children.push(defaultArgumentSpecifier());
        }

        return Phrase.create(PhraseKind.ParameterDeclaration, children);
    }

    function defaultArgumentSpecifier(){
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseKind.DefaultArgumentSpecifier, [equals, expr]);
    }

    function variable(variableAtomNode: Phrase | Token) {

        let count = 0;

        while (true) {
            ++count;
            switch (peek().tokenType) {
                case TokenKind.ColonColon:
                    variableAtomNode = scopedAccessExpression(variableAtomNode);
                    continue;
                case TokenKind.Arrow:
                    variableAtomNode = propertyOrMethodAccessExpression(variableAtomNode);
                    continue;
                case TokenKind.OpenBracket:
                    variableAtomNode = subscriptExpression(variableAtomNode, TokenKind.CloseBracket);
                    continue;
                case TokenKind.OpenBrace:
                    variableAtomNode = subscriptExpression(variableAtomNode, TokenKind.CloseBrace);
                    continue;
                case TokenKind.OpenParenthesis:
                    variableAtomNode = functionCallExpression(variableAtomNode);
                    continue;
                default:
                    //only simple variable atoms qualify as variables on their own
                    if (count === 1 && (<Phrase>variableAtomNode).phraseType !== PhraseKind.SimpleVariable) {
                        variableAtomNode = Phrase.createParseError([variableAtomNode], peek());
                    }
                    break;
            }

            break;
        }

        return variableAtomNode;
    }

    function functionCallExpression(lhs: Phrase | Token) {
        const open = expect(TokenKind.OpenParenthesis);
        if (!isArgumentStart(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.FunctionCallExpression, [lhs, open, close]);
        }
        const argList = argumentList();
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.FunctionCallExpression, [lhs, open, argList, close]);
    }

    function scopedAccessExpression(lhs: Phrase | Token) {
        const op = next() //::
        const memberNamePhraseTypeTuple = scopedMemberName();
        const open = optional(TokenKind.OpenParenthesis);

        if (open) {
            if (!isArgumentStart(peek())) {
                const close = expect(TokenKind.CloseParenthesis);
                return Phrase.create(PhraseKind.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], open, close]);
            }

            const argList = argumentList();
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], open, argList, close]);
        } else if (memberNamePhraseTypeTuple[1] === PhraseKind.ScopedCallExpression) {
            //error
            let err = Phrase.createParseError([], peek(), TokenKind.OpenParenthesis);
            return Phrase.create(PhraseKind.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], err]);
        }

        return Phrase.create(memberNamePhraseTypeTuple[1], [lhs, op, memberNamePhraseTypeTuple[0]]);
    }

    function scopedMemberName(): [Phrase | Token, PhraseKind] {
        let t = peek();
        const tup: [Phrase, PhraseKind] = [undefined, PhraseKind.ScopedCallExpression];
        let name: Phrase | Token;

        switch (t.tokenType) {
            case TokenKind.OpenBrace:
                tup[1] = PhraseKind.ScopedCallExpression;
                name = encapsulatedExpression(TokenKind.OpenBrace, TokenKind.CloseBrace);
                break;
            case TokenKind.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                tup[1] = PhraseKind.ScopedPropertyAccessExpression;
                name = next();
                break;
            case TokenKind.Dollar:
                name = simpleVariable();
                tup[1] = PhraseKind.ScopedPropertyAccessExpression;
                break;
            default:
                if (t.tokenType === TokenKind.Name || isSemiReservedToken(t)) {
                    name = identifier();
                    tup[1] = PhraseKind.ClassConstantAccessExpression;
                } else {
                    //error
                    name = Phrase.createParseError([], t);
                }
                break;
        }

        tup[0] = Phrase.create(PhraseKind.ScopedMemberName, [name]);
        return tup;
    }

    function propertyAccessExpression(lhs: Phrase | Token) {
        const op = next(); //->
        const name = memberName();
        return Phrase.create(PhraseKind.PropertyAccessExpression, [lhs, op, name]);
    }

    function propertyOrMethodAccessExpression(lhs: Phrase | Token) {
        const op = next(); //->
        const name = memberName();
        const open = optional(TokenKind.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseKind.PropertyAccessExpression, [lhs, op, name]);
        }

        if (!isArgumentStart(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.MethodCallExpression, [lhs, op, name, open, close]);
        }

        const argList = argumentList();
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.MethodCallExpression, [lhs, op, name, open, argList, close]);
    }

    function memberName() {
        let name: Phrase | Token;

        switch (peek().tokenType) {
            case TokenKind.Name:
                name = next();
                break;
            case TokenKind.OpenBrace:
                name = encapsulatedExpression(TokenKind.OpenBrace, TokenKind.CloseBrace);
                break;
            case TokenKind.Dollar:
            case TokenKind.VariableName:
                name = simpleVariable();
                break;
            default:
                name = Phrase.createParseError([], peek());
                break;
        }

        return Phrase.create(PhraseKind.MemberName, [name]);
    }

    function subscriptExpression(lhs: Phrase | Token, closeTokenType: TokenKind) {
        const open = next(); // [ or {

        if (!isExpressionStart(peek())) {
            const close = expect(closeTokenType);
            return Phrase.create(PhraseKind.SubscriptExpression, [lhs, open, close]);
        }

        const expr = expression(0);
        const close = expect(closeTokenType);
        return Phrase.create(PhraseKind.SubscriptExpression, [lhs, open, expr, close]);
    }

    function argumentList() {
        return delimitedList(
            PhraseKind.ArgumentExpressionList,
            argumentExpression,
            isArgumentStart,
            TokenKind.Comma,
            [TokenKind.CloseParenthesis]
        );
    }

    function isArgumentStart(t: Token) {
        return t.tokenType === TokenKind.Ellipsis || isExpressionStart(t);
    }

    function variadicUnpacking() {
        const op = next(); //...
        const expr = expression(0);
        return Phrase.create(PhraseKind.VariadicUnpacking, [op, expr]);
    }

    function argumentExpression() {
        return peek().tokenType === TokenKind.Ellipsis ? variadicUnpacking() : expression(0);
    }

    function qualifiedName() {
        let t = peek();
        let name: Phrase;

        if (t.tokenType === TokenKind.Backslash) {
            t = next();
            name = namespaceName();
            return Phrase.create(PhraseKind.FullyQualifiedName, [t, name]);
        } else if (t.tokenType === TokenKind.Namespace) {
            t = next();
            const bslash = expect(TokenKind.Backslash);
            name = namespaceName();
            return Phrase.create(PhraseKind.RelativeQualifiedName, [t, bslash, name]);
        } else {
            name = namespaceName();
            return Phrase.create(PhraseKind.QualifiedName, [name]);
        }
    }

    function isQualifiedNameStart(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Backslash:
            case TokenKind.Name:
            case TokenKind.Namespace:
                return true;
            default:
                return false;
        }
    }

    function shortArrayCreationExpression() {
        const open = next(); //[
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenKind.CloseBracket);
            return Phrase.create(PhraseKind.ArrayCreationExpression, [open, close]);
        }
        const initList = arrayInitialiserList(TokenKind.CloseBracket);
        const close = expect(TokenKind.CloseBracket);
        return Phrase.create(PhraseKind.ArrayCreationExpression, [open, initList, close]);
    }

    function longArrayCreationExpression() {
        const keyword = next(); //array
        const open = expect(TokenKind.OpenParenthesis);

        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenKind.CloseParenthesis);
            return Phrase.create(PhraseKind.ArrayCreationExpression, [keyword, open, close]);
        }

        const initList = arrayInitialiserList(TokenKind.CloseParenthesis);
        const close = expect(TokenKind.CloseParenthesis);
        return Phrase.create(PhraseKind.ArrayCreationExpression, [keyword, open, initList, close]);
    }

    function isArrayElementStart(t: Token) {
        return t.tokenType === TokenKind.Ampersand || isExpressionStart(t);
    }

    /**
     * only call if there is at least one element or comma
     * @param breakOn 
     */
    function arrayInitialiserList(breakOn: TokenKind) {

        let t = peek();
        const children: (Phrase | Token)[] = [];

        let arrayInitialiserListRecoverSet = [breakOn, TokenKind.Comma];
        recoverSetStack.push(arrayInitialiserListRecoverSet);

        do {

            //an array can have empty elements
            if (isArrayElementStart(peek())) {
                children.push(arrayElement());
            }

            t = peek();

            if (t.tokenType === TokenKind.Comma) {
                children.push(next());
            } else if (t.tokenType !== breakOn) {
                //error
                //check for missing delimeter
                if (isArrayElementStart(t)) {
                    children.push(Phrase.createParseError([], t));
                    continue;
                } else {
                    //skip until recover token
                    const skipped = defaultSyncStrategy();
                    children.push(Phrase.createParseError(skipped, t));
                    t = peek();
                    if (t.tokenType === TokenKind.Comma) {
                        continue;
                    }
                }

                break;
            }

        } while (t.tokenType !== breakOn);

        recoverSetStack.pop();
        return Phrase.create(PhraseKind.ArrayInitialiserList, children);

    }

    function arrayValue() {
        const amp = optional(TokenKind.Ampersand)
        const expr = expression(0);
        return Phrase.create(PhraseKind.ArrayValue, amp ? [amp, expr] : [expr]);
    }

    function arrayKey() {
        const expr = expression(0);
        return Phrase.create(PhraseKind.ArrayKey, [expr]);
    }

    function arrayElement() {

        if (peek().tokenType === TokenKind.Ampersand) {
            const val = arrayValue();
            return Phrase.create(PhraseKind.ArrayElement, [val]);
        }

        let keyOrValue = arrayKey();
        const arrow = optional(TokenKind.FatArrow);

        if (!arrow) {
            keyOrValue.phraseType = PhraseKind.ArrayValue;
            return Phrase.create(PhraseKind.ArrayElement, [keyOrValue]);
        }

        const val = arrayValue();
        return Phrase.create(PhraseKind.ArrayElement, [keyOrValue, arrow, val]);

    }

    function encapsulatedExpression(openTokenType: TokenKind, closeTokenType: TokenKind) {
        const open = expect(openTokenType);
        const expr = expression(0);
        const close = expect(closeTokenType);
        return Phrase.create(PhraseKind.EncapsulatedExpression, [open, expr, close]);
    }

    function relativeScope() {
        const keyword = next();
        return Phrase.create(PhraseKind.RelativeScope, [keyword]);
    }

    function variableAtom(): Phrase | Token {

        let t = peek();
        switch (t.tokenType) {
            case TokenKind.VariableName:
            case TokenKind.Dollar:
                return simpleVariable();
            case TokenKind.OpenParenthesis:
                return encapsulatedExpression(TokenKind.OpenParenthesis, TokenKind.CloseParenthesis);
            case TokenKind.Array:
                return longArrayCreationExpression();
            case TokenKind.OpenBracket:
                return shortArrayCreationExpression();
            case TokenKind.StringLiteral:
                return next();
            case TokenKind.Static:
                return relativeScope();
            case TokenKind.Name:
            case TokenKind.Namespace:
            case TokenKind.Backslash:
                return qualifiedName();
            default:
                //error
                return Phrase.createParseError([], t);
        }

    }

    function simpleVariable() {
        const varNameOrDollar = expectOneOf([TokenKind.VariableName, TokenKind.Dollar]);

        if ((<Token>varNameOrDollar).tokenType !== TokenKind.Dollar) {
            return Phrase.create(PhraseKind.SimpleVariable, [varNameOrDollar]);
        }

        const t = peek();
        let varOrExpr: Phrase | Token;
        if (t.tokenType === TokenKind.OpenBrace) {
            varOrExpr = encapsulatedExpression(TokenKind.OpenBrace, TokenKind.CloseBrace);
        } else if (t.tokenType === TokenKind.Dollar || t.tokenType === TokenKind.VariableName) {
            varOrExpr = simpleVariable();
        } else {
            varOrExpr = Phrase.createParseError([], t);
        }

        return Phrase.create(PhraseKind.SimpleVariable, [varNameOrDollar, varOrExpr]);

    }

    function haltCompilerStatement() {
        const keyword = next(); // __halt_compiler
        const open = expect(TokenKind.OpenParenthesis);
        const close = expect(TokenKind.CloseParenthesis);
        const semicolon = expect(TokenKind.Semicolon);
        return Phrase.create(PhraseKind.HaltCompilerStatement, [keyword, open, close, semicolon]);
    }

    function namespaceUseDeclaration() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //use
        const kind = optionalOneOf([TokenKind.Function, TokenKind.Const]);
        if (kind) {
            children.push(kind);
        }
        const leadingBackslash = optional(TokenKind.Backslash);
        if (leadingBackslash) {
            children.push(leadingBackslash);
        }
        const nsNameNode = namespaceName();
        let t = peek();

        //should be \ but allow { to recover from missing \
        if (t.tokenType === TokenKind.Backslash || t.tokenType === TokenKind.OpenBrace) {
            children.push(nsNameNode);
            children.push(expect(TokenKind.Backslash));
            children.push(expect(TokenKind.OpenBrace));
            children.push(delimitedList(
                PhraseKind.NamespaceUseGroupClauseList,
                namespaceUseGroupClause,
                isNamespaceUseGroupClauseStartToken,
                TokenKind.Comma,
                [TokenKind.CloseBrace]
            ));
            children.push(expect(TokenKind.CloseBrace));
            children.push(expect(TokenKind.Semicolon));
            return Phrase.create(PhraseKind.NamespaceUseDeclaration, children);
        }

        children.push(delimitedList(
            PhraseKind.NamespaceUseClauseList,
            namespaceUseClauseFunction(nsNameNode),
            isNamespaceUseClauseStartToken,
            TokenKind.Comma,
            [TokenKind.Semicolon],
        ));

        children.push(expect(TokenKind.Semicolon));
        return Phrase.create(PhraseKind.NamespaceUseDeclaration, children);
    }

    function isNamespaceUseClauseStartToken(t: Token) {
        return t.tokenType === TokenKind.Name || t.tokenType === TokenKind.Backslash;
    }

    function namespaceUseClauseFunction(nsName: Phrase) {

        return () => {
            let name = nsName;

            if (name) {
                nsName = undefined;
            } else {
                name = namespaceName();
            }

            if (peek().tokenType !== TokenKind.As) {
                return Phrase.create(PhraseKind.NamespaceUseClause, [name]);
            }

            const alias = namespaceAliasingClause();
            return Phrase.create(PhraseKind.NamespaceUseClause, [name, alias]);
        };

    }

    function delimitedList(phraseType: PhraseKind, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, delimiter: TokenKind, breakOn?: TokenKind[]) {
        let t: Token;
        let delimitedListRecoverSet = breakOn ? breakOn.slice(0) : [];
        delimitedListRecoverSet.push(delimiter);
        recoverSetStack.push(delimitedListRecoverSet);
        const children: (Phrase | Token)[] = [];

        while (true) {

            children.push(elementFunction());
            t = peek();

            if (t.tokenType === delimiter) {
                children.push(next());
            } else if (!breakOn || breakOn.indexOf(t.tokenType) > -1) {
                break;
            } else {
                //error
                //check for missing delimeter
                if (elementStartPredicate(t)) {
                    children.push(Phrase.createParseError([], t));
                    continue;
                } else {
                    //skip until recover set
                    let skipped = defaultSyncStrategy();
                    children.push(Phrase.createParseError(skipped, t));
                    if (delimitedListRecoverSet.indexOf(peek().tokenType) > -1) {
                        continue;
                    }
                }

                break;
            }

        }

        recoverSetStack.pop();
        return Phrase.create(phraseType, children);
    }

    function isNamespaceUseGroupClauseStartToken(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Const:
            case TokenKind.Function:
            case TokenKind.Name:
                return true;
            default:
                return false;
        }
    }

    function namespaceUseGroupClause() {
        const kind = optionalOneOf([TokenKind.Function, TokenKind.Const]);
        const name = namespaceName();

        if (peek().tokenType !== TokenKind.As) {
            return Phrase.create(PhraseKind.NamespaceUseGroupClause, [kind, name]);
        }

        const alias = namespaceAliasingClause();
        return Phrase.create(PhraseKind.NamespaceUseGroupClause, [kind, name, alias]);
    }

    function namespaceAliasingClause() {
        const asToken = next();
        const name = expect(TokenKind.Name);
        return Phrase.create(PhraseKind.NamespaceAliasingClause, [asToken, name]);
    }

    function namespaceDefinitionHeader() {
        const ns = next(); //namespace

        if (peek().tokenType !== TokenKind.Name) {
            return Phrase.create(PhraseKind.NamespaceDefinitionHeader, [ns]);
        }

        const name = namespaceName();
        return Phrase.create(PhraseKind.NamespaceDefinitionHeader, [ns, name]);
    }

    function namespaceDefinitionBody() {
        const t = expectOneOf([TokenKind.Semicolon, TokenKind.OpenBrace]);

        if ((<Token>t).tokenType !== TokenKind.OpenBrace) {
            return Phrase.create(PhraseKind.NamespaceDefinitionBody, [t]);
        }

        const list = statementList([TokenKind.CloseBrace]);
        const close = expect(TokenKind.CloseBrace);
        return Phrase.create(PhraseKind.NamespaceDefinitionBody, [t, list, close]);
    }

    function namespaceDefinition() {
        const header = namespaceDefinitionHeader();
        const body = namespaceDefinitionBody();
        return Phrase.create(PhraseKind.NamespaceDefinition, [header, body]);
    }

    function namespaceName() {
        const children: (Phrase | Token)[] = [];
        children.push(expect(TokenKind.Name));

        while (peek().tokenType === TokenKind.Backslash && peek(1).tokenType === TokenKind.Name) {
            children.push(next(), next());
        }

        return Phrase.create(PhraseKind.NamespaceName, children);
    }

    function isReservedToken(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Include:
            case TokenKind.IncludeOnce:
            case TokenKind.Eval:
            case TokenKind.Require:
            case TokenKind.RequireOnce:
            case TokenKind.Or:
            case TokenKind.Xor:
            case TokenKind.And:
            case TokenKind.InstanceOf:
            case TokenKind.New:
            case TokenKind.Clone:
            case TokenKind.Exit:
            case TokenKind.If:
            case TokenKind.ElseIf:
            case TokenKind.Else:
            case TokenKind.EndIf:
            case TokenKind.Echo:
            case TokenKind.Do:
            case TokenKind.While:
            case TokenKind.EndWhile:
            case TokenKind.For:
            case TokenKind.EndFor:
            case TokenKind.ForEach:
            case TokenKind.EndForeach:
            case TokenKind.Declare:
            case TokenKind.EndDeclare:
            case TokenKind.As:
            case TokenKind.Try:
            case TokenKind.Catch:
            case TokenKind.Finally:
            case TokenKind.Throw:
            case TokenKind.Use:
            case TokenKind.InsteadOf:
            case TokenKind.Global:
            case TokenKind.Var:
            case TokenKind.Unset:
            case TokenKind.Isset:
            case TokenKind.Empty:
            case TokenKind.Continue:
            case TokenKind.Goto:
            case TokenKind.Function:
            case TokenKind.Const:
            case TokenKind.Return:
            case TokenKind.Print:
            case TokenKind.Yield:
            case TokenKind.List:
            case TokenKind.Switch:
            case TokenKind.EndSwitch:
            case TokenKind.Case:
            case TokenKind.Default:
            case TokenKind.Break:
            case TokenKind.Array:
            case TokenKind.Callable:
            case TokenKind.Extends:
            case TokenKind.Implements:
            case TokenKind.Namespace:
            case TokenKind.Trait:
            case TokenKind.Interface:
            case TokenKind.Class:
            case TokenKind.ClassConstant:
            case TokenKind.TraitConstant:
            case TokenKind.FunctionConstant:
            case TokenKind.MethodConstant:
            case TokenKind.LineConstant:
            case TokenKind.FileConstant:
            case TokenKind.DirectoryConstant:
            case TokenKind.NamespaceConstant:
                return true;
            default:
                return false;
        }
    }

    function isSemiReservedToken(t: Token) {
        switch (t.tokenType) {
            case TokenKind.Static:
            case TokenKind.Abstract:
            case TokenKind.Final:
            case TokenKind.Private:
            case TokenKind.Protected:
            case TokenKind.Public:
                return true;
            default:
                return isReservedToken(t);
        }
    }

    function isStatementStart(t: Token) {

        switch (t.tokenType) {
            case TokenKind.Namespace:
            case TokenKind.Use:
            case TokenKind.HaltCompiler:
            case TokenKind.Const:
            case TokenKind.Function:
            case TokenKind.Class:
            case TokenKind.Abstract:
            case TokenKind.Final:
            case TokenKind.Trait:
            case TokenKind.Interface:
            case TokenKind.OpenBrace:
            case TokenKind.If:
            case TokenKind.While:
            case TokenKind.Do:
            case TokenKind.For:
            case TokenKind.Switch:
            case TokenKind.Break:
            case TokenKind.Continue:
            case TokenKind.Return:
            case TokenKind.Global:
            case TokenKind.Static:
            case TokenKind.Echo:
            case TokenKind.Unset:
            case TokenKind.ForEach:
            case TokenKind.Declare:
            case TokenKind.Try:
            case TokenKind.Throw:
            case TokenKind.Goto:
            case TokenKind.Name:
            case TokenKind.Semicolon:
            case TokenKind.CloseTag:
            case TokenKind.Text:
            case TokenKind.OpenTag:
            case TokenKind.OpenTagEcho:
            case TokenKind.DocumentComment:
                return true;
            default:
                return isExpressionStart(t);
        }
    }

}
