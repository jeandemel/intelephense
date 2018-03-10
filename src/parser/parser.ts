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
        TokenType.CloseTag,
        TokenType.OpenTagEcho,
        TokenType.Text,
        TokenType.OpenTag
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
        return tokenType === peek().tokenType ? next() : undefined;
    }

    function optionalOneOf(tokenTypes: TokenType[]) {
        return tokenTypes.indexOf(peek().tokenType) > -1 ? next() : undefined;
    }

    /**
     * skips over whitespace, comments and doc comments
     * @param allowDocComment doc comments returned when true
     */
    function next(allowDocComment?: boolean): Token {
        const t = tokenBuffer.length > 0 ? tokenBuffer.shift() : Lexer.lex();
        if (t.tokenType >= TokenType.Comment && (!allowDocComment || t.tokenType !== TokenType.DocumentComment)) {
            return next(allowDocComment);
        }
        return t;
    }

    function expect(tokenType: TokenType) {
        let t = peek();
        if (t.tokenType === tokenType) {
            return next();
        } else if (tokenType === TokenType.Semicolon && t.tokenType === TokenType.CloseTag) {
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

    function expectOneOf(tokenTypes: TokenType[]) {
        let t = peek();
        if (tokenTypes.indexOf(t.tokenType) > -1) {
            return next();
        } else if (tokenTypes.indexOf(TokenType.Semicolon) > -1 && t.tokenType === TokenType.CloseTag) {
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


    function list(phraseType: PhraseType, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, breakOn?: TokenType[], recoverSet?: TokenType[], allowDocComment?: boolean) {

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

        let mergedRecoverTokenTypeArray: TokenType[] = [];

        for (let n = recoverSetStack.length - 1; n >= 0; --n) {
            Array.prototype.push.apply(mergedRecoverTokenTypeArray, recoverSetStack[n]);
        }

        let mergedRecoverTokenTypeSet = new Set(mergedRecoverTokenTypeArray);
        let predicate: Predicate = (x) => { return mergedRecoverTokenTypeSet.has(x.tokenType); };
        return skip(predicate);

    }

    function topStatementList(breakOn: TokenType[]) {
        //@todo restrict some statements to top stmt list only
        const stmtList = statementList(breakOn);
        stmtList.phraseType = PhraseType.TopStatementList;
        return stmtList;
    }

    function statementList(breakOn: TokenType[]):Phrase {
        return list(
            PhraseType.StatementList,
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
            PhraseType.ConstElementList,
            constElement,
            isConstElementStartToken,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.ConstDeclaration, [keyword, list, semicolon]);
    }

    function isClassConstElementStartToken(t: Token) {
        return t.tokenType === TokenType.Name || isSemiReservedToken(t);
    }

    function isConstElementStartToken(t: Token) {
        return t.tokenType === TokenType.Name;
    }

    function constElement() {
        const name = expect(TokenType.Name);
        const equals = expect(TokenType.Equals);
        const expr = expression(0);
        return Phrase.create(PhraseType.ConstElement, [name, equals, expr]);
    }

    function expression(minPrecedence: number) {

        let precedence: number;
        let associativity: Associativity;
        let lhs = expressionAtom();
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
                lhs = ternaryExpression(lhs);
                op = peek();
                binaryPhraseType = binaryOpToPhraseType(op);
                continue;
            }

            op = next();

            if (binaryPhraseType === PhraseType.InstanceOfExpression) {
                rhs = typeDesignator(PhraseType.InstanceofTypeDesignator);
                lhs = Phrase.create(binaryPhraseType, [lhs, op, rhs]);
            } else if (
                binaryPhraseType === PhraseType.SimpleAssignmentExpression &&
                peek().tokenType === TokenType.Ampersand
            ) {
                const ampersand = next();
                rhs = expression(precedence);
                lhs = Phrase.create(PhraseType.ByRefAssignmentExpression, [lhs, op, ampersand, rhs]);
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
        let colon: Token | ParseError = optional(TokenType.Colon);
        let falseExpr: Phrase | Token;

        if (colon) {
            //short form
            falseExpr = expression(0);
            return Phrase.create(PhraseType.TernaryExpression, [testExpr, question, colon, falseExpr]);
        }

        const trueExpr = expression(0);
        colon = expect(TokenType.Colon);
        falseExpr = expression(0);
        return Phrase.create(PhraseType.TernaryExpression, [testExpr, question, trueExpr, colon, falseExpr]);
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
        return Phrase.create(PhraseType.ConstantAccessExpression, [qName]);
    }

    function postfixExpression(phraseType: PhraseType, variableNode: Phrase) {
        const op = next();
        return Phrase.create(phraseType, [variableNode, op]);
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
                return Phrase.createParseError([], t);
        }

    }

    function exitIntrinsic() {
        const keyword = next(); //exit or die
        const open = optional(TokenType.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseType.ExitIntrinsic, [keyword]);
        }

        if (!isExpressionStart(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.ExitIntrinsic, [keyword, open, close]);
        }
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.ExitIntrinsic, [keyword, open, expr, close]);
    }

    function issetIntrinsic() {
        const keyword = next(); //isset
        const open = expect(TokenType.OpenParenthesis);
        const list = variableList([TokenType.CloseParenthesis]);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.IssetIntrinsic, [keyword, open, list, close]);
    }

    function emptyIntrinsic() {
        const keyword = next(); //empty
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.EmptyIntrinsic, [keyword, open, expr, close]);
    }

    function evalIntrinsic() {
        const keyword = next(); //eval
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.EvalIntrinsic, [keyword, open, expr, close]);
    }

    function scriptInclusion(phraseType: PhraseType) {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(phraseType, [keyword, expr]);
    }

    function printIntrinsic() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(PhraseType.PrintIntrinsic, [keyword, expr]);
    }

    function yieldFromExpression() {
        const keyword = next();
        const expr = expression(0);
        return Phrase.create(PhraseType.YieldFromExpression, [keyword, expr]);
    }

    function yieldExpression() {
        const keyword = next();

        if (!isExpressionStart(peek())) {
            return Phrase.create(PhraseType.YieldExpression, [keyword]);
        }

        const keyOrValue = expression(0);
        const arrow = optional(TokenType.FatArrow);

        if (!arrow) {
            return Phrase.create(PhraseType.YieldExpression, [keyword, keyOrValue]);
        }

        const value = expression(0);
        return Phrase.create(PhraseType.YieldExpression, [keyword, keyOrValue, arrow, value]);
    }

    function shellCommandExpression() {
        const open = next(); //`
        const list = encapsulatedVariableList(TokenType.Backtick);
        const close = expect(TokenType.Backtick);
        return Phrase.create(PhraseType.ShellCommandExpression, [open, list, close]);
    }

    function doubleQuotedStringLiteral() {
        const open = next(); //"
        const list = encapsulatedVariableList(TokenType.DoubleQuote);
        const close = expect(TokenType.DoubleQuote);
        return Phrase.create(PhraseType.DoubleQuotedStringLiteral, [open, list, close]);
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
                return next();
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
        return Phrase.create(PhraseType.EncapsulatedVariable, [open, vble, close]);
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
                expr = Phrase.create(PhraseType.SimpleVariable, [varName]);
            }
        } else if (isExpressionStart(t)) {
            expr = expression(0);
        } else {
            expr = Phrase.createParseError([], t);
        }

        const close = expect(TokenType.CloseBrace);
        return Phrase.create(PhraseType.EncapsulatedVariable, [open, expr, close]);
    }

    function dollarCurlyEncapsulatedDimension() {
        const varName = next();
        const open = next(); // [
        const expr = expression(0);
        const close = expect(TokenType.CloseBracket);
        return Phrase.create(PhraseType.SubscriptExpression, [varName, open, expr, close]);
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
                    expr = Phrase.create(PhraseType.UnaryOpExpression, [minus, intLiteral]);
                }
                break;
            default:
                //error
                expr = Phrase.createParseError([], peek());
                break;
        }

        const close = expect(TokenType.CloseBracket);
        return Phrase.create(PhraseType.SubscriptExpression, [sv, open, expr, close]);
    }

    function encapsulatedProperty() {
        const sv = simpleVariable();
        const arrow = next(); //->
        const name = expect(TokenType.Name);
        return Phrase.create(PhraseType.PropertyAccessExpression, [sv, arrow, name]);
    }

    function heredocStringLiteral() {
        const startHeredoc = next();
        const list = encapsulatedVariableList(TokenType.EndHeredoc);
        const endHeredoc = expect(TokenType.EndHeredoc);
        return Phrase.create(PhraseType.HeredocStringLiteral, [startHeredoc, list, endHeredoc]);
    }

    function anonymousClassDeclaration() {
        const header = anonymousClassDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.ClassDeclarationBody, isClassMemberStart, classMemberDeclarationList
        );
        return Phrase.create(PhraseType.AnonymousClassDeclaration, [header, body]);
    }

    function anonymousClassDeclarationHeader() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //class
        const open = optional(TokenType.OpenParenthesis);

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

        return Phrase.create(PhraseType.AnonymousClassDeclarationHeader, children);
    }

    function classInterfaceClause() {
        const keyword = next(); //implements
        const list = qualifiedNameList([TokenType.OpenBrace]);
        return Phrase.create(PhraseType.ClassInterfaceClause, [keyword, list]);
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
        const t = next(true); //DocumentComment
        return Phrase.create(PhraseType.DocBlock, [t]);
    }

    function classMemberDeclaration() {

        let t = peek(0, true);

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
                        return Phrase.createParseError([modifiers], t);
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
        const use = next();
        const nameList = qualifiedNameList([TokenType.Semicolon, TokenType.OpenBrace]);
        const spec = traitUseSpecification();
        return Phrase.create(PhraseType.TraitUseClause, [use, nameList, spec]);
    }

    function traitUseSpecification() {
        const t = expectOneOf([TokenType.Semicolon, TokenType.OpenBrace]) as Token;

        if (t.tokenType !== TokenType.OpenBrace) {
            return Phrase.create(PhraseType.TraitUseSpecification, [t]);
        }

        if (!isTraitAdaptationStart(peek())) {
            const close = expect(TokenType.CloseBrace);
            return Phrase.create(PhraseType.TraitUseSpecification, [t, close]);
        }

        const adaptList = traitAdaptationList();
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(PhraseType.TraitUseSpecification, [t, adaptList, close]);
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

        const children: (Phrase | Token)[] = [];
        let t = peek();
        let t2 = peek(1);

        if (t.tokenType === TokenType.Namespace ||
            t.tokenType === TokenType.Backslash ||
            (t.tokenType === TokenType.Name &&
                (t2.tokenType === TokenType.ColonColon || t2.tokenType === TokenType.Backslash))) {

            children.push(methodReference());

            if (peek().tokenType === TokenType.InsteadOf) {
                children.push(next());
                return traitPrecedence(children);
            }

        } else if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {
            const ident = identifier();
            children.push(Phrase.create(PhraseType.MethodReference, [ident]));
        } else {
            //error
            return Phrase.createParseError([], t);
        }

        return traitAlias(children);
    }

    function traitAlias(children: (Phrase | Token)[]) {
        children.push(expect(TokenType.As));
        let t = peek();

        if (t.tokenType === TokenType.Name || isReservedToken(t)) {
            children.push(identifier());
        } else if (isMemberModifier(t)) {
            children.push(next());
            t = peek();
            if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {
                children.push(identifier());
            }
        } else {
            children.push(Phrase.createParseError([], t));
        }

        children.push(expect(TokenType.Semicolon));
        return Phrase.create(PhraseType.TraitAlias, children);
    }

    function traitPrecedence(children: (Phrase | Token)[]) {
        children.push(qualifiedNameList([TokenType.Semicolon]));
        children.push(expect(TokenType.Semicolon));
        return Phrase.create(PhraseType.TraitPrecedence, children);
    }

    function methodReference() {
        const name = qualifiedName();
        const op = expect(TokenType.ColonColon);
        const ident = identifier();
        return Phrase.create(PhraseType.MethodReference, [name, op, ident]);
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

        return Phrase.create(PhraseType.MethodDeclarationHeader, children);
    }

    function methodDeclaration(memberModifers?: Phrase) {
        const header = methodDeclarationHeader(memberModifers);
        const body = methodDeclarationBody();
        return Phrase.create(PhraseType.MethodDeclaration, [header, body]);
    }

    function methodDeclarationBody() {
        let body: Phrase | Token;

        if (peek().tokenType === TokenType.Semicolon) {
            body = next();
        } else {
            body = compoundStatement();
        }

        return Phrase.create(PhraseType.MethodDeclarationBody, [body]);
    }

    function identifier() {
        let ident: Phrase | Token = peek();

        if (ident.tokenType === TokenType.Name || isSemiReservedToken(ident)) {
            ident = next();
        } else {
            ident = Phrase.createParseError([], ident);
        }

        return Phrase.create(PhraseType.Identifier, [ident]);
    }

    function interfaceDeclaration() {
        const header = interfaceDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.InterfaceDeclarationBody, isClassMemberStart, interfaceMemberDeclarations
        );
        return Phrase.create(PhraseType.InterfaceDeclaration, [header, body]);
    }

    function typeDeclarationBody<T extends Phrase>(phraseType: PhraseType, elementStartPredicate: Predicate, listFunction: () => T) {
        const open = expect(TokenType.OpenBrace);

        if (!elementStartPredicate(peek())) {
            const close = expect(TokenType.CloseBrace);
            return Phrase.create(phraseType, [open, close]);
        }

        const l = listFunction();
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(phraseType, [open, l, close]);
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

        if (peek().tokenType !== TokenType.Extends) {
            return Phrase.create(PhraseType.InterfaceDeclarationHeader, [interfaceToken, name]);
        }

        const base = interfaceBaseClause();
        return Phrase.create(PhraseType.InterfaceDeclarationHeader, [interfaceToken, name, base]);
    }

    function interfaceBaseClause() {
        const ext = next(); //extends
        const list = qualifiedNameList([TokenType.OpenBrace]);
        return Phrase.create(PhraseType.InterfaceBaseClause, [ext, list]);
    }

    function traitDeclaration() {
        const header = traitDeclarationHeader();
        const body = typeDeclarationBody(
            PhraseType.TraitDeclarationBody, isClassMemberStart, traitMemberDeclarations
        );
        return Phrase.create(PhraseType.TraitDeclaration, [header, body]);
    }

    function traitDeclarationHeader() {
        const traitToken = next(); //trait
        const name = expect(TokenType.Name);
        return Phrase.create(PhraseType.TraitDeclarationHeader, [traitToken, name]);
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
        return Phrase.create(PhraseType.FunctionDeclaration, [header, body]);
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

        return Phrase.create(PhraseType.FunctionDeclarationHeader, children);
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
        return Phrase.create(PhraseType.ClassDeclaration, [header, body]);
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

        return Phrase.create(PhraseType.ClassDeclarationHeader, children);
    }

    function classBaseClause() {
        const ext = next(); //extends
        const name = qualifiedName();
        return Phrase.create(PhraseType.ClassBaseClause, [ext, name]);
    }

    function compoundStatement() {
        const open = expect(TokenType.OpenBrace);

        if (!isStatementStart(peek())) {
            const close = expect(TokenType.CloseBrace);
            return Phrase.create(PhraseType.CompoundStatement, [open, close]);
        }

        const stmtList = statementList([TokenType.CloseBrace]);
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(PhraseType.CompoundStatement, [open, stmtList, close]);
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

        let t = peek(0, true);

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
            case TokenType.OpenTagEcho:
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

        return Phrase.create(PhraseType.InlineText, children);
    }

    function nullStatement() {
        const semicolon = next(); //;
        return Phrase.create(PhraseType.NullStatement, [semicolon]);
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
            catchListOrFinally = Phrase.createParseError([], t);
        }

        if (peek().tokenType !== TokenType.Finally) {
            return Phrase.create(PhraseType.TryStatement, [tryToken, compound, catchListOrFinally]);
        }

        const finClause = finallyClause();
        return Phrase.create(PhraseType.TryStatement, [tryToken, compound, catchListOrFinally, finClause]);
    }

    function finallyClause() {
        const fin = next(); //finally
        const stmt = compoundStatement();
        return Phrase.create(PhraseType.FinallyClause, [fin, stmt]);
    }

    function catchClause() {
        const catchToken = next();
        const open = expect(TokenType.OpenParenthesis);
        const delimList = delimitedList(
            PhraseType.CatchNameList,
            qualifiedName,
            isQualifiedNameStart,
            TokenType.Bar,
            [TokenType.VariableName]
        );
        const varName = expect(TokenType.VariableName);
        const close = expect(TokenType.CloseParenthesis);
        const stmt = compoundStatement();
        return Phrase.create(PhraseType.CatchClause, [catchToken, open, delimList, varName, close, stmt]);
    }

    function declareDirective() {
        const name = expect(TokenType.Name);
        const equals = expect(TokenType.Equals);
        const literal = expectOneOf([TokenType.IntegerLiteral, TokenType.FloatingLiteral, TokenType.StringLiteral]);
        return Phrase.create(PhraseType.DeclareDirective, [name, equals, literal]);
    }

    function declareStatement() {

        const declareToken = next();
        const open = expect(TokenType.OpenParenthesis);
        const directive = declareDirective();
        const close = expect(TokenType.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            const colon = next(); //:
            const stmtList = statementList([TokenType.EndDeclare]);
            const end = expect(TokenType.EndDeclare);
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(PhraseType.DeclareStatement, [declareToken, open, directive, close, colon, stmtList, end, semicolon]);
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(PhraseType.DeclareStatement, [declareToken, open, directive, close, stmt]);
        } else if (t.tokenType === TokenType.Semicolon) {
            const semicolon = next();
            return Phrase.create(PhraseType.DeclareStatement, [declareToken, open, directive, close, semicolon]);
        } else {
            const err = Phrase.createParseError([], t);
            return Phrase.create(PhraseType.DeclareStatement, [declareToken, open, directive, close, err]);
        }
    }

    function switchStatement() {
        const keyword = next(); //switch
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);

        const colonOrBrace = expectOneOf([TokenType.Colon, TokenType.OpenBrace]);
        let tCase = peek();

        let stmtList: Phrase;
        if (tCase.tokenType === TokenType.Case || tCase.tokenType === TokenType.Default) {
            stmtList = caseStatements(
                (<Token>colonOrBrace).tokenType === TokenType.Colon ? TokenType.EndSwitch : TokenType.CloseBrace
            );
        }

        if ((<Token>colonOrBrace).tokenType === TokenType.Colon) {
            const endSwitch = expect(TokenType.EndSwitch);
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(
                PhraseType.SwitchStatement,
                stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, endSwitch, semicolon] :
                    [keyword, open, expr, close, colonOrBrace, endSwitch, semicolon],
            );
        } else {
            const braceClose = expect(TokenType.CloseBrace);
            return Phrase.create(
                PhraseType.SwitchStatement,
                stmtList ? [keyword, open, expr, close, colonOrBrace, stmtList, braceClose] :
                    [keyword, open, expr, close, colonOrBrace, braceClose],
            );
        }
    }

    function caseStatements(breakOn: TokenType) {
        let t: Token;
        const children: (Phrase | Token)[] = [];
        const caseBreakOn = [TokenType.Case, TokenType.Default];
        caseBreakOn.push(breakOn);
        recoverSetStack.push(caseBreakOn.slice(0));

        while (true) {

            t = peek();

            if (t.tokenType === TokenType.Case) {
                children.push(caseStatement(caseBreakOn));
            } else if (t.tokenType === TokenType.Default) {
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
        return Phrase.create(PhraseType.CaseStatementList, children);
    }

    function caseStatement(breakOn: TokenType[]) {
        const keyword = next(); //case
        const expr = expression(0);
        const colonOrSemicolon = expectOneOf([TokenType.Colon, TokenType.Semicolon]);

        if (!isStatementStart(peek())) {
            return Phrase.create(PhraseType.CaseStatement, [keyword, expr, colonOrSemicolon]);
        }

        const stmtList = statementList(breakOn);
        return Phrase.create(PhraseType.CaseStatement, [keyword, expr, colonOrSemicolon, stmtList]);
    }

    function defaultStatement(breakOn: TokenType[]) {
        const keyword = next(); //default
        const colonOrSemicolon = expectOneOf([TokenType.Colon, TokenType.Semicolon]);
        if (!isStatementStart(peek())) {
            return Phrase.create(PhraseType.CaseStatement, [keyword, colonOrSemicolon]);
        }

        const stmtList = statementList(breakOn);
        return Phrase.create(PhraseType.CaseStatement, [keyword, colonOrSemicolon, stmtList]);
    }

    function namedLabelStatement() {
        const name = next();
        const colon = next();
        return Phrase.create(PhraseType.NamedLabelStatement, [name, colon]);
    }

    function gotoStatement() {
        const keyword = next(); //goto
        const name = expect(TokenType.Name);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.GotoStatement, [keyword, name, semicolon]);
    }

    function throwStatement() {
        const keyword = next(); //throw
        const expr = expression(0);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.ThrowStatement, [keyword, expr, semicolon]);
    }

    function foreachCollection() {
        let expr = expression(0);
        return Phrase.create(PhraseType.ForeachCollection, [expr]);
    }

    function foreachKeyOrValue() {
        const expr = expression(0);
        const arrow = optional(TokenType.FatArrow);
        if (!arrow) {
            return Phrase.create(PhraseType.ForeachValue, [expr]);
        }
        return Phrase.create(PhraseType.ForeachKey, [expr, arrow]);
    }

    function foreachValue() {
        const amp = optional(TokenType.Ampersand);
        const expr = expression(0);
        return Phrase.create(PhraseType.ForeachValue, amp ? [amp, expr] : [expr]);
    }

    function foreachStatement() {
        const foreachToken = next(); //foreach
        const open = expect(TokenType.OpenParenthesis);
        const collection = foreachCollection();
        const asToken = expect(TokenType.As);
        const keyOrValue = peek().tokenType === TokenType.Ampersand ? foreachValue() : foreachKeyOrValue();
        let val: Phrase;

        if (keyOrValue.phraseType === PhraseType.ForeachKey) {
            val = foreachValue();
        }

        const close = expect(TokenType.CloseParenthesis);
        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            const colon = next();
            const stmtList = statementList([TokenType.EndForeach]);
            const endForeach = expect(TokenType.EndForeach);
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(
                PhraseType.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, colon, stmtList, endForeach, semicolon] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, colon, stmtList, endForeach, semicolon],
            );
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(
                PhraseType.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, stmt] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, stmt],
            );
        } else {
            const err = Phrase.createParseError([], t);
            return Phrase.create(
                PhraseType.ForeachStatement,
                val ? [foreachToken, open, collection, asToken, keyOrValue, val, close, err] :
                    [foreachToken, open, collection, asToken, keyOrValue, close, err],
            );
        }
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
        const keyword = next(); //unset
        const open = expect(TokenType.OpenParenthesis);
        const varList = variableList([TokenType.CloseParenthesis]);
        const close = expect(TokenType.CloseParenthesis);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.UnsetIntrinsic, [keyword, open, varList, close, semicolon]);
    }

    function expressionInitial() {
        return expression(0);
    }

    function echoIntrinsic() {
        const keyword = next(); //echo or <?=
        const exprList = delimitedList(
            PhraseType.ExpressionList,
            expressionInitial,
            isExpressionStart,
            TokenType.Comma
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.EchoIntrinsic, [keyword, exprList, semicolon]);
    }

    function isStaticVariableDclarationStart(t: Token) {
        return t.tokenType === TokenType.VariableName;
    }

    function functionStaticDeclaration() {
        const keyword = next(); //static
        const varList = delimitedList(
            PhraseType.StaticVariableDeclarationList,
            staticVariableDeclaration,
            isStaticVariableDclarationStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.FunctionStaticDeclaration, [keyword, varList, semicolon]);
    }

    function globalDeclaration() {
        const keyword = next(); //global
        const varList = delimitedList(
            PhraseType.VariableNameList,
            simpleVariable,
            isSimpleVariableStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.GlobalDeclaration, [keyword, varList, semicolon]);
    }

    function isSimpleVariableStart(t: Token) {
        return t.tokenType === TokenType.VariableName || t.tokenType === TokenType.Dollar;
    }

    function staticVariableDeclaration() {
        const varName = expect(TokenType.VariableName);

        if (peek().tokenType !== TokenType.Equals) {
            return Phrase.create(PhraseType.StaticVariableDeclaration, [varName]);
        }

        const init = functionStaticInitialiser();
        return Phrase.create(PhraseType.StaticVariableDeclaration, [varName, init]);

    }

    function functionStaticInitialiser() {
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseType.FunctionStaticInitialiser, [equals, expr]);
    }

    function continueStatement() {
        const keyword = next(); //break/continue
        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(PhraseType.ContinueStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.ContinueStatement, [keyword, expr, semicolon]);

    }

    function breakStatement() {
        const keyword = next(); //break/continue

        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(PhraseType.BreakStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.BreakStatement, [keyword, expr, semicolon]);
    }

    function returnStatement() {
        const keyword = next(); //return

        if (!isExpressionStart(peek())) {
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(PhraseType.ReturnStatement, [keyword, semicolon]);
        }

        const expr = expression(0);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.ReturnStatement, [keyword, expr, semicolon]);
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
        const children: (Phrase | Token)[] = [];
        const forToken = next();
        children.push(forToken);
        children.push(expect(TokenType.OpenParenthesis));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseType.ForInitialiser, [TokenType.Semicolon]));
        }

        children.push(expect(TokenType.Semicolon));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseType.ForControl, [TokenType.Semicolon]));
        }

        children.push(expect(TokenType.Semicolon));

        if (isExpressionStart(peek())) {
            children.push(forExpressionGroup(PhraseType.ForEndOfLoop, [TokenType.CloseParenthesis]));
        }

        children.push(expect(TokenType.CloseParenthesis));

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            children.push(next());
            children.push(statementList([TokenType.EndFor]));
            children.push(expect(TokenType.EndFor));
            children.push(expect(TokenType.Semicolon));
        } else if (isStatementStart(peek())) {
            children.push(statement());
        } else {
            children.push(Phrase.createParseError([], t));
        }

        return Phrase.create(PhraseType.ForStatement, children);
    }

    function doStatement() {
        const doToken = next(); // do
        const stmt = statement();
        const whileToken = expect(TokenType.While);
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.DoStatement, [doToken, stmt, whileToken, open, expr, close, semicolon]);
    }

    function whileStatement() {
        const whileToken = next(); //while
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);

        let t = peek();

        if (t.tokenType === TokenType.Colon) {
            const colon = next();
            const stmtList = statementList([TokenType.EndWhile]);
            const endWhile = expect(TokenType.EndWhile);
            const semicolon = expect(TokenType.Semicolon);
            return Phrase.create(
                PhraseType.WhileStatement,
                [whileToken, open, expr, close, colon, stmtList, endWhile, semicolon],
            );
        } else if (isStatementStart(t)) {
            const stmt = statement();
            return Phrase.create(
                PhraseType.WhileStatement,
                [whileToken, open, expr, close, stmt],
            );
        } else {
            //error
            const err = Phrase.createParseError([], t);
            return Phrase.create(
                PhraseType.WhileStatement,
                [whileToken, open, expr, close, err],
            );
        }
    }

    function elseIfClause1() {
        const keyword = next(); //elseif
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        const stmt = statement();
        return Phrase.create(PhraseType.ElseIfClause, [keyword, open, expr, close, stmt]);
    }

    function elseIfClause2() {
        const keyword = next(); //elseif
        const open = expect(TokenType.OpenParenthesis);
        const expr = expression(0);
        const close = expect(TokenType.CloseParenthesis);
        const colon = expect(TokenType.Colon);
        const stmtList = statementList([TokenType.EndIf, TokenType.Else, TokenType.ElseIf]);
        return Phrase.create(PhraseType.ElseIfClause, [keyword, open, expr, close, colon, stmtList]);
    }

    function elseClause1() {
        const keyword = next(); //else
        const stmt = statement();
        return Phrase.create(PhraseType.ElseClause, [keyword, stmt]);
    }

    function elseClause2() {
        const keyword = next(); //else
        const colon = expect(TokenType.Colon);
        const stmtList = statementList([TokenType.EndIf]);
        return Phrase.create(PhraseType.ElseClause, [keyword, colon, stmtList]);
    }

    function isElseIfClauseStart(t: Token) {
        return t.tokenType === TokenType.ElseIf;
    }

    function ifStatement() {

        const children: (Phrase | Token)[] = [];
        const ifToken = next();
        children.push(ifToken);
        children.push(expect(TokenType.OpenParenthesis));
        children.push(expression(0));
        children.push(expect(TokenType.CloseParenthesis));

        let t = peek();
        let elseIfClauseFunction = elseIfClause1;
        let elseClauseFunction = elseClause1;
        let expectEndIf = false;

        if (t.tokenType === TokenType.Colon) {
            children.push(next());
            children.push(statementList([TokenType.ElseIf, TokenType.Else, TokenType.EndIf]));
            elseIfClauseFunction = elseIfClause2;
            elseClauseFunction = elseClause2;
            expectEndIf = true;
        } else if (isStatementStart(t)) {
            children.push(statement());
        } else {
            children.push(Phrase.createParseError([], t));
        }

        if (peek().tokenType === TokenType.ElseIf) {
            children.push(list(
                PhraseType.ElseIfClauseList,
                elseIfClauseFunction,
                isElseIfClauseStart
            ));
        }

        if (peek().tokenType === TokenType.Else) {
            children.push(elseClauseFunction());
        }

        if (expectEndIf) {
            children.push(expect(TokenType.EndIf));
            children.push(expect(TokenType.Semicolon));
        }

        return Phrase.create(PhraseType.IfStatement, children);
    }

    function expressionStatement() {
        const expr = expression(0);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.ExpressionStatement, [expr, semicolon]);
    }

    function returnType() {
        const colon = next(); //:
        const typeDecl = typeDeclaration();
        return Phrase.create(PhraseType.ReturnType, [colon, typeDecl]);
    }

    function typeDeclaration() {
        const question = optional(TokenType.Question);
        let decl: Phrase | Token;

        switch (peek().tokenType) {
            case TokenType.Callable:
            case TokenType.Array:
                decl = next();
                break;
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                decl = qualifiedName();
                break;
            default:
                decl = Phrase.createParseError([], peek());
                break;
        }

        return Phrase.create(PhraseType.TypeDeclaration, question ? [question, decl] : [decl]);
    }

    function classConstDeclaration(modifiers?: Phrase) {
        const constToken = next();
        const delimList = delimitedList(
            PhraseType.ClassConstElementList,
            classConstElement,
            isClassConstElementStartToken,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(
            PhraseType.ClassConstDeclaration,
            modifiers ? [modifiers, constToken, delimList, semicolon] : [constToken, delimList, semicolon]
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
        const ident = identifier();
        const equals = expect(TokenType.Equals);
        const expr = expression(0);
        return Phrase.create(PhraseType.ClassConstElement, [ident, equals, expr]);
    }

    function isPropertyElementStart(t: Token) {
        return t.tokenType === TokenType.VariableName;
    }

    function propertyDeclaration(modifiersOrVar: Phrase | Token) {
        const delimList = delimitedList(
            PhraseType.PropertyElementList,
            propertyElement,
            isPropertyElementStart,
            TokenType.Comma,
            [TokenType.Semicolon]
        );
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.PropertyDeclaration, [modifiersOrVar, delimList, semicolon]);
    }

    function propertyElement() {
        const varName = expect(TokenType.VariableName);

        if (peek().tokenType !== TokenType.Equals) {
            return Phrase.create(PhraseType.PropertyElement, [varName]);
        }

        const initialiser = propertyInitialiser();
        return Phrase.create(PhraseType.PropertyElement, [varName, initialiser]);
    }

    function propertyInitialiser() {
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseType.PropertyInitialiser, [equals, expr]);
    }

    function memberModifierList() {
        let children: (Phrase | Token)[] = [];
        while (isMemberModifier(peek())) {
            children.push(next());
        }
        return Phrase.create(PhraseType.MemberModifierList, children);
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
        const newToken = next();
        if (peek().tokenType === TokenType.Class) {
            const anonClass = anonymousClassDeclaration();
            return Phrase.create(PhraseType.ObjectCreationExpression, [newToken, anonClass]);
        }

        const typeDes = typeDesignator(PhraseType.ClassTypeDesignator);
        const open = optional(TokenType.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseType.ObjectCreationExpression, [newToken, typeDes]);
        }

        if (!isArgumentStart(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.ObjectCreationExpression, [newToken, typeDes, open, close]);
        }

        const argList = argumentList();
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(
            PhraseType.ObjectCreationExpression,
            [newToken, typeDes, open, argList, close]
        );

    }

    function typeDesignator(phraseType: PhraseType) {

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
                    {
                        const op = next(); //::
                        const name = restrictedScopedMemberName();
                        part = Phrase.create(PhraseType.ScopedPropertyAccessExpression, [part, op, name]);
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
            case TokenType.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                name = next();
                break;
            case TokenType.Dollar:
                name = simpleVariable();
                break;
            default:
                name = Phrase.createParseError([], t);
                break;
        }

        return Phrase.create(PhraseType.ScopedMemberName, [name]);

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
                return Phrase.createParseError([], t);
        }

    }

    function cloneExpression() {
        const keyword = next(); //clone
        const expr = expression(0);
        return Phrase.create(PhraseType.CloneExpression, [keyword, expr]);
    }

    function isArrayElementStartOrComma(t: Token) {
        return isArrayElementStart(t) || t.tokenType === TokenType.Comma;
    }

    function listIntrinsic() {
        const keyword = next(); //list
        const open = expect(TokenType.OpenParenthesis);
        //list must not be empty in php7+ but allow it for backwards compatibility
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.ListIntrinsic, [keyword, open, close]);
        }

        const arrayList = arrayInitialiserList(TokenType.CloseParenthesis);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.ListIntrinsic, [keyword, open, arrayList, close]);
    }

    function unaryExpression(phraseType: PhraseType) {

        const op = next();
        let vbl: Phrase | Token;

        switch (phraseType) {
            case PhraseType.PrefixDecrementExpression:
            case PhraseType.PrefixIncrementExpression:
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
        const stat = optional(TokenType.Static);
        if (stat) {
            children.push(stat);
        }
        children.push(next()); //function
        const amp = optional(TokenType.Ampersand);
        if (amp) {
            children.push(amp);
        }
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

        if (peek().tokenType === TokenType.Use) {
            children.push(anonymousFunctionUseClause());
        }

        if (peek().tokenType === TokenType.Colon) {
            children.push(returnType());
        }

        return Phrase.create(PhraseType.AnonymousFunctionHeader, children);

    }

    function anonymousFunctionCreationExpression() {
        const header = anonymousFunctionHeader();
        const body = functionDeclarationBody();
        return Phrase.create(PhraseType.AnonymousFunctionCreationExpression, [header, body]);
    }

    function isAnonymousFunctionUseVariableStart(t: Token) {
        return t.tokenType === TokenType.VariableName || t.tokenType === TokenType.Ampersand;
    }

    function anonymousFunctionUseClause() {
        const use = next();
        const open = expect(TokenType.OpenParenthesis);
        const delimList = delimitedList(
            PhraseType.ClosureUseList,
            anonymousFunctionUseVariable,
            isAnonymousFunctionUseVariableStart,
            TokenType.Comma,
            [TokenType.CloseParenthesis]
        );
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.AnonymousFunctionUseClause, [use, open, delimList, close]);
    }

    function anonymousFunctionUseVariable() {
        const amp = optional(TokenType.Ampersand);
        const varName = expect(TokenType.VariableName);
        return Phrase.create(PhraseType.AnonymousFunctionUseVariable, amp ? [amp, varName] : [varName]);
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
        const children: (Phrase | Token)[] = [];

        if (isTypeDeclarationStart(peek())) {
            children.push(typeDeclaration());
        }

        const amp = optional(TokenType.Ampersand);
        if (amp) {
            children.push(amp);
        }
        const ellip = optional(TokenType.Ellipsis);
        if (ellip) {
            children.push(ellip);
        }
        children.push(expect(TokenType.VariableName));

        if (peek().tokenType === TokenType.Equals) {
            children.push(defaultArgumentSpecifier());
        }

        return Phrase.create(PhraseType.ParameterDeclaration, children);
    }

    function defaultArgumentSpecifier(){
        const equals = next();
        const expr = expression(0);
        return Phrase.create(PhraseType.DefaultArgumentSpecifier, [equals, expr]);
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
                    //only simple variable atoms qualify as variables on their own
                    if (count === 1 && (<Phrase>variableAtomNode).phraseType !== PhraseType.SimpleVariable) {
                        variableAtomNode = Phrase.createParseError([variableAtomNode], peek());
                    }
                    break;
            }

            break;
        }

        return variableAtomNode;
    }

    function functionCallExpression(lhs: Phrase | Token) {
        const open = expect(TokenType.OpenParenthesis);
        if (!isArgumentStart(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.FunctionCallExpression, [lhs, open, close]);
        }
        const argList = argumentList();
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.FunctionCallExpression, [lhs, open, argList, close]);
    }

    function scopedAccessExpression(lhs: Phrase | Token) {
        const op = next() //::
        const memberNamePhraseTypeTuple = scopedMemberName();
        const open = optional(TokenType.OpenParenthesis);

        if (open) {
            if (!isArgumentStart(peek())) {
                const close = expect(TokenType.CloseParenthesis);
                return Phrase.create(PhraseType.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], open, close]);
            }

            const argList = argumentList();
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], open, argList, close]);
        } else if (memberNamePhraseTypeTuple[1] === PhraseType.ScopedCallExpression) {
            //error
            let err = Phrase.createParseError([], peek(), TokenType.OpenParenthesis);
            return Phrase.create(PhraseType.ScopedCallExpression, [lhs, op, memberNamePhraseTypeTuple[0], err]);
        }

        return Phrase.create(memberNamePhraseTypeTuple[1], [lhs, op, memberNamePhraseTypeTuple[0]]);
    }

    function scopedMemberName(): [Phrase | Token, PhraseType] {
        let t = peek();
        const tup: [Phrase, PhraseType] = [undefined, PhraseType.ScopedCallExpression];
        let name: Phrase | Token;

        switch (t.tokenType) {
            case TokenType.OpenBrace:
                tup[1] = PhraseType.ScopedCallExpression;
                name = encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace);
                break;
            case TokenType.VariableName:
                //Spec says this should be SimpleVariable
                //leaving as a token as this avoids confusion between 
                //static property names and simple variables
                tup[1] = PhraseType.ScopedPropertyAccessExpression;
                name = next();
                break;
            case TokenType.Dollar:
                name = simpleVariable();
                tup[1] = PhraseType.ScopedPropertyAccessExpression;
                break;
            default:
                if (t.tokenType === TokenType.Name || isSemiReservedToken(t)) {
                    name = identifier();
                    tup[1] = PhraseType.ClassConstantAccessExpression;
                } else {
                    //error
                    name = Phrase.createParseError([], t);
                }
                break;
        }

        tup[0] = Phrase.create(PhraseType.ScopedMemberName, [name]);
        return tup;
    }

    function propertyAccessExpression(lhs: Phrase | Token) {
        const op = next(); //->
        const name = memberName();
        return Phrase.create(PhraseType.PropertyAccessExpression, [lhs, op, name]);
    }

    function propertyOrMethodAccessExpression(lhs: Phrase | Token) {
        const op = next(); //->
        const name = memberName();
        const open = optional(TokenType.OpenParenthesis);

        if (!open) {
            return Phrase.create(PhraseType.PropertyAccessExpression, [lhs, op, name]);
        }

        if (!isArgumentStart(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.MethodCallExpression, [lhs, op, name, open, close]);
        }

        const argList = argumentList();
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.MethodCallExpression, [lhs, op, name, open, argList, close]);
    }

    function memberName() {
        let name: Phrase | Token;

        switch (peek().tokenType) {
            case TokenType.Name:
                name = next();
                break;
            case TokenType.OpenBrace:
                name = encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace);
                break;
            case TokenType.Dollar:
            case TokenType.VariableName:
                name = simpleVariable();
                break;
            default:
                name = Phrase.createParseError([], peek());
                break;
        }

        return Phrase.create(PhraseType.MemberName, [name]);
    }

    function subscriptExpression(lhs: Phrase | Token, closeTokenType: TokenType) {
        const open = next(); // [ or {

        if (!isExpressionStart(peek())) {
            const close = expect(closeTokenType);
            return Phrase.create(PhraseType.SubscriptExpression, [lhs, open, close]);
        }

        const expr = expression(0);
        const close = expect(closeTokenType);
        return Phrase.create(PhraseType.SubscriptExpression, [lhs, open, expr, close]);
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
        const op = next(); //...
        const expr = expression(0);
        return Phrase.create(PhraseType.VariadicUnpacking, [op, expr]);
    }

    function argumentExpression() {
        return peek().tokenType === TokenType.Ellipsis ? variadicUnpacking() : expression(0);
    }

    function qualifiedName() {
        let t = peek();
        let name: Phrase;

        if (t.tokenType === TokenType.Backslash) {
            t = next();
            name = namespaceName();
            return Phrase.create(PhraseType.FullyQualifiedName, [t, name]);
        } else if (t.tokenType === TokenType.Namespace) {
            t = next();
            const bslash = expect(TokenType.Backslash);
            name = namespaceName();
            return Phrase.create(PhraseType.RelativeQualifiedName, [t, bslash, name]);
        } else {
            name = namespaceName();
            return Phrase.create(PhraseType.QualifiedName, [name]);
        }
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
        const open = next(); //[
        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenType.CloseBracket);
            return Phrase.create(PhraseType.ArrayCreationExpression, [open, close]);
        }
        const initList = arrayInitialiserList(TokenType.CloseBracket);
        const close = expect(TokenType.CloseBracket);
        return Phrase.create(PhraseType.ArrayCreationExpression, [open, initList, close]);
    }

    function longArrayCreationExpression() {
        const keyword = next(); //array
        const open = expect(TokenType.OpenParenthesis);

        if (!isArrayElementStartOrComma(peek())) {
            const close = expect(TokenType.CloseParenthesis);
            return Phrase.create(PhraseType.ArrayCreationExpression, [keyword, open, close]);
        }

        const initList = arrayInitialiserList(TokenType.CloseParenthesis);
        const close = expect(TokenType.CloseParenthesis);
        return Phrase.create(PhraseType.ArrayCreationExpression, [keyword, open, initList, close]);
    }

    function isArrayElementStart(t: Token) {
        return t.tokenType === TokenType.Ampersand || isExpressionStart(t);
    }

    /**
     * only call if there is at least one element or comma
     * @param breakOn 
     */
    function arrayInitialiserList(breakOn: TokenType) {

        let t = peek();
        const children: (Phrase | Token)[] = [];

        let arrayInitialiserListRecoverSet = [breakOn, TokenType.Comma];
        recoverSetStack.push(arrayInitialiserListRecoverSet);

        do {

            //an array can have empty elements
            if (isArrayElementStart(peek())) {
                children.push(arrayElement());
            }

            t = peek();

            if (t.tokenType === TokenType.Comma) {
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
                    if (t.tokenType === TokenType.Comma) {
                        continue;
                    }
                }

                break;
            }

        } while (t.tokenType !== breakOn);

        recoverSetStack.pop();
        return Phrase.create(PhraseType.ArrayInitialiserList, children);

    }

    function arrayValue() {
        const amp = optional(TokenType.Ampersand)
        const expr = expression(0);
        return Phrase.create(PhraseType.ArrayValue, amp ? [amp, expr] : [expr]);
    }

    function arrayKey() {
        const expr = expression(0);
        return Phrase.create(PhraseType.ArrayKey, [expr]);
    }

    function arrayElement() {

        if (peek().tokenType === TokenType.Ampersand) {
            const val = arrayValue();
            return Phrase.create(PhraseType.ArrayElement, [val]);
        }

        let keyOrValue = arrayKey();
        const arrow = optional(TokenType.FatArrow);

        if (!arrow) {
            keyOrValue.phraseType = PhraseType.ArrayValue;
            return Phrase.create(PhraseType.ArrayElement, [keyOrValue]);
        }

        const val = arrayValue();
        return Phrase.create(PhraseType.ArrayElement, [keyOrValue, arrow, val]);

    }

    function encapsulatedExpression(openTokenType: TokenType, closeTokenType: TokenType) {
        const open = expect(openTokenType);
        const expr = expression(0);
        const close = expect(closeTokenType);
        return Phrase.create(PhraseType.EncapsulatedExpression, [open, expr, close]);
    }

    function relativeScope() {
        const keyword = next();
        return Phrase.create(PhraseType.RelativeScope, [keyword]);
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
                return next();
            case TokenType.Static:
                return relativeScope();
            case TokenType.Name:
            case TokenType.Namespace:
            case TokenType.Backslash:
                return qualifiedName();
            default:
                //error
                return Phrase.createParseError([], t);
        }

    }

    function simpleVariable() {
        const varNameOrDollar = expectOneOf([TokenType.VariableName, TokenType.Dollar]);

        if ((<Token>varNameOrDollar).tokenType !== TokenType.Dollar) {
            return Phrase.create(PhraseType.SimpleVariable, [varNameOrDollar]);
        }

        const t = peek();
        let varOrExpr: Phrase | Token;
        if (t.tokenType === TokenType.OpenBrace) {
            varOrExpr = encapsulatedExpression(TokenType.OpenBrace, TokenType.CloseBrace);
        } else if (t.tokenType === TokenType.Dollar || t.tokenType === TokenType.VariableName) {
            varOrExpr = simpleVariable();
        } else {
            varOrExpr = Phrase.createParseError([], t);
        }

        return Phrase.create(PhraseType.SimpleVariable, [varNameOrDollar, varOrExpr]);

    }

    function haltCompilerStatement() {
        const keyword = next(); // __halt_compiler
        const open = expect(TokenType.OpenParenthesis);
        const close = expect(TokenType.CloseParenthesis);
        const semicolon = expect(TokenType.Semicolon);
        return Phrase.create(PhraseType.HaltCompilerStatement, [keyword, open, close, semicolon]);
    }

    function namespaceUseDeclaration() {
        const children: (Phrase | Token)[] = [];
        children.push(next()); //use
        const kind = optionalOneOf([TokenType.Function, TokenType.Const]);
        if (kind) {
            children.push(kind);
        }
        const leadingBackslash = optional(TokenType.Backslash);
        if (leadingBackslash) {
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
            return Phrase.create(PhraseType.NamespaceUseDeclaration, children);
        }

        children.push(delimitedList(
            PhraseType.NamespaceUseClauseList,
            namespaceUseClauseFunction(nsNameNode),
            isNamespaceUseClauseStartToken,
            TokenType.Comma,
            [TokenType.Semicolon],
        ));

        children.push(expect(TokenType.Semicolon));
        return Phrase.create(PhraseType.NamespaceUseDeclaration, children);
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

            if (peek().tokenType !== TokenType.As) {
                return Phrase.create(PhraseType.NamespaceUseClause, [name]);
            }

            const alias = namespaceAliasingClause();
            return Phrase.create(PhraseType.NamespaceUseClause, [name, alias]);
        };

    }

    function delimitedList(phraseType: PhraseType, elementFunction: () => Phrase | Token,
        elementStartPredicate: Predicate, delimiter: TokenType, breakOn?: TokenType[]) {
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
            return Phrase.create(PhraseType.NamespaceUseGroupClause, [kind, name]);
        }

        const alias = namespaceAliasingClause();
        return Phrase.create(PhraseType.NamespaceUseGroupClause, [kind, name, alias]);
    }

    function namespaceAliasingClause() {
        const asToken = next();
        const name = expect(TokenType.Name);
        return Phrase.create(PhraseType.NamespaceAliasingClause, [asToken, name]);
    }

    function namespaceDefinitionHeader() {
        const ns = next(); //namespace

        if (peek().tokenType !== TokenType.Name) {
            return Phrase.create(PhraseType.NamespaceDefinitionHeader, [ns]);
        }

        const name = namespaceName();
        return Phrase.create(PhraseType.NamespaceDefinitionHeader, [ns, name]);
    }

    function namespaceDefinitionBody() {
        const t = expectOneOf([TokenType.Semicolon, TokenType.OpenBrace]);

        if ((<Token>t).tokenType !== TokenType.OpenBrace) {
            return Phrase.create(PhraseType.NamespaceDefinitionBody, [t]);
        }

        const list = statementList([TokenType.CloseBrace]);
        const close = expect(TokenType.CloseBrace);
        return Phrase.create(PhraseType.NamespaceDefinitionBody, [t, list, close]);
    }

    function namespaceDefinition() {
        const header = namespaceDefinitionHeader();
        const body = namespaceDefinitionBody();
        return Phrase.create(PhraseType.NamespaceDefinition, [header, body]);
    }

    function namespaceName() {
        const children: (Phrase | Token)[] = [];
        children.push(expect(TokenType.Name));

        while (peek().tokenType === TokenType.Backslash && peek(1).tokenType === TokenType.Name) {
            children.push(next(), next());
        }

        return Phrase.create(PhraseType.NamespaceName, children);
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
