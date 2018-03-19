/* Copyright (c) Ben Robert Mewburn 
 * Licensed under the ISC Licence.
 */

'use strict';

import {PackedPosition} from '../types';

export const enum TokenKind {
    //Misc
    Unknown = 0,
    EndOfFile,

    //Keywords
    Abstract,
    Array,
    As,
    Break,
    Callable,
    Case,
    Catch,
    Class,
    ClassConstant,
    Clone,
    Const,
    Continue,
    Declare,
    Default,
    Do,
    Echo,
    Else,
    ElseIf,
    Empty,
    EndDeclare,
    EndFor,
    EndForeach,
    EndIf,
    EndSwitch,
    EndWhile,
    EndHeredoc,
    Eval,
    Exit,
    Extends,
    Final,
    Finally,
    For,
    ForEach,
    Function,
    Global,
    Goto,
    HaltCompiler,
    If,
    Implements,
    Include,
    IncludeOnce,
    InstanceOf,
    InsteadOf,
    Interface,
    Isset,
    List,
    And,
    Or,
    Xor,
    Namespace,
    New,
    Print,
    Private,
    Public,
    Protected,
    Require,
    RequireOnce,
    Return,
    Static,
    Switch,
    Throw,
    Trait,
    Try,
    Unset,
    Use,
    Var,
    While,
    Yield,
    YieldFrom,

    //keyword magic constants
    DirectoryConstant,
    FileConstant,
    LineConstant,
    FunctionConstant,
    MethodConstant,
    NamespaceConstant,
    TraitConstant,

    //literals
    StringLiteral,
    FloatingLiteral,
    EncapsulatedAndWhitespace,
    Text,
    IntegerLiteral,

    //Names
    Name,
    VariableName,

    //Operators and Punctuation
    Equals,
    Tilde,
    Colon,
    Semicolon,
    Exclamation,
    Dollar,
    ForwardSlash,
    Percent,
    Comma,
    AtSymbol,
    Backtick,
    Question,
    DoubleQuote,
    SingleQuote,
    LessThan,
    GreaterThan,
    Asterisk,
    AmpersandAmpersand,
    Ampersand,
    AmpersandEquals,
    CaretEquals,
    LessThanLessThan,
    LessThanLessThanEquals,
    GreaterThanGreaterThan,
    GreaterThanGreaterThanEquals,
    BarEquals,
    Plus,
    PlusEquals,
    AsteriskAsterisk,
    AsteriskAsteriskEquals,
    Arrow,
    OpenBrace,
    OpenBracket,
    OpenParenthesis,
    CloseBrace,
    CloseBracket,
    CloseParenthesis,
    QuestionQuestion,
    Bar,
    BarBar,
    Caret,
    Dot,
    DotEquals,
    CurlyOpen,
    MinusMinus,
    ForwardslashEquals,
    DollarCurlyOpen,
    FatArrow,
    ColonColon,
    Ellipsis,
    PlusPlus,
    EqualsEquals,
    GreaterThanEquals,
    EqualsEqualsEquals,
    ExclamationEquals,
    ExclamationEqualsEquals,
    LessThanEquals,
    Spaceship,
    Minus,
    MinusEquals,
    PercentEquals,
    AsteriskEquals,
    Backslash,
    BooleanCast,
    UnsetCast,
    StringCast,
    ObjectCast,
    IntegerCast,
    FloatCast,
    StartHeredoc,
    ArrayCast,
    OpenTag,
    OpenTagEcho,
    CloseTag,

    //Comments, whitespace
    Comment,
    DocumentComment,
    Whitespace
}

export const enum LexerMode {
    Initial,
    Scripting,
    LookingForProperty,
    DoubleQuotes,
    NowDoc,
    HereDoc,
    EndHereDoc,
    Backtick,
    VarOffset,
    LookingForVarName
}

export interface Token {
    /**
     * Token type
     */
    tokenType: TokenKind,
    /**
     * Offset within source were first char of token is found
     */
    offset: number,
    /**
     * Length of token string
     */
    length: number
    /**
     * Lexer mode prior to this token being read.
     */
    modeStack: LexerMode[],
}

export namespace Token {
    export function create(type: TokenKind, offset: number, length: number, modeStack: LexerMode[]): Token {
        return { tokenType: type, offset: offset, length: length, modeStack: modeStack };
    }
}

export namespace Lexer {

    interface LexerState {
        position: number;
        input: string;
        modeStack: LexerMode[];
        doubleQuoteScannedLength: number;
        heredocLabel: string,
        lineOffsets: number[]
    }

    var state: LexerState;

    export function setInput(text: string, lexerModeStack?: LexerMode[], position?: number) {
        state = {
            position: position > 0 ? position : 0,
            input: text,
            modeStack: lexerModeStack ? lexerModeStack : [LexerMode.Initial],
            doubleQuoteScannedLength: -1,
            heredocLabel: null,
            lineOffsets: [0]
        };
    }

    export function lineOffsets() {
        return state.lineOffsets;
    }

    export function lex(): Token {
        if (state.position >= state.input.length) {
            return {
                tokenType: TokenKind.EndOfFile,
                offset: state.position,
                length: 0,
                modeStack: state.modeStack
            };
        }

        let t: Token;

        switch (state.modeStack[state.modeStack.length - 1]) {
            case LexerMode.Initial:
                t = initial(state);
                break;

            case LexerMode.Scripting:
                t = scripting(state);
                break;

            case LexerMode.LookingForProperty:
                t = lookingForProperty(state);
                break;

            case LexerMode.DoubleQuotes:
                t = doubleQuotes(state);
                break;

            case LexerMode.NowDoc:
                t = nowdoc(state);
                break;

            case LexerMode.HereDoc:
                t = heredoc(state);
                break;

            case LexerMode.EndHereDoc:
                t = endHeredoc(state);
                break;

            case LexerMode.Backtick:
                t = backtick(state);
                break;

            case LexerMode.VarOffset:
                t = varOffset(state);
                break;

            case LexerMode.LookingForVarName:
                t = lookingForVarName(state);
                break;

            default:
                throw new Error('Unknown LexerMode');

        }

        return t ? t : lex();

    }

    /**
     * spec suggests that only extended ascii (cp > 0x7f && cp < 0x100) is valid but official lexer seems ok with all utf8
     * @param c 
     */
    function isLabelStart(c: string) {
        let cp = c.charCodeAt(0);
        return (cp > 0x40 && cp < 0x5b) || (cp > 0x60 && cp < 0x7b) || cp === 0x5f || cp > 0x7f;
    }

    /**
     * spec suggests that only extended ascii (cp > 0x7f && cp < 0x100) is valid but official lexer seems ok with all utf8
     * @param c 
     */
    function isLabelChar(c: string) {
        let cp = c.charCodeAt(0);
        return (cp > 0x2f && cp < 0x3a) || (cp > 0x40 && cp < 0x5b) || (cp > 0x60 && cp < 0x7b) || cp === 0x5f || cp > 0x7f;
    }

    function isWhitespace(c: string) {
        return c === ' ' || c === '\n' || c === '\r' || c === '\t';
    }

    function initial(s: LexerState): Token {

        let l = s.input.length;
        let c = s.input[s.position];
        let start = s.position;

        if (c === '<' && s.position + 1 < l && s.input[s.position + 1] === '?') {
            let tokenType = TokenKind.OpenTag;

            if (
                s.input.substr(s.position, 5).toLowerCase() === '<?php' &&
                s.position + 5 < l && isWhitespace(s.input[s.position + 5])
            ) {
                let ws = s.input[s.position + 5];
                if (ws === '\r' && s.position + 6 < l && s.input[s.position + 6] === '\n') {
                    s.position += 7;
                    s.lineOffsets.push(s.position);
                } else if(ws === '\r' || ws === '\n') {
                    s.position += 6;
                    s.lineOffsets.push(s.position);
                } else {
                    s.position += 6;
                }

            } else if (s.position + 2 < l && s.input[s.position + 2] === '=') {
                tokenType = TokenKind.OpenTagEcho;
                s.position += 3;
            }
            else {
                s.position += 2;
            }

            let t = { tokenType: tokenType, offset: start, length: s.position - start, modeStack: s.modeStack };
            s.modeStack = s.modeStack.slice(0, -1);
            s.modeStack.push(LexerMode.Scripting);
            return t;
        }

        while (s.position < l) {
            c = s.input[s.position];
            ++s.position;
            if (c === '<' && s.position < l && s.input[s.position] === '?') {
                --s.position;
                break;
            } else if(c === '\n') {
                s.lineOffsets.push(s.position);
            } else if(c === '\r') {
                if(s.position < l && s.input[s.position] === '\n') {
                    ++s.position;
                }
                s.lineOffsets.push(s.position);
            }
        }

        return { tokenType: TokenKind.Text, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function whitespace(s: LexerState) : Token {

        let c:string;
        let start = s.position;
        let l = s.input.length;
        let modeStack = s.modeStack;

        while (s.position < l && isWhitespace(c = s.input[s.position])) { 
            ++s.position;
            if(c === '\n') {
                s.lineOffsets.push(s.position);
            } else if(c === '\r') {
                if(s.position < l && s.input[s.position] === '\n') {
                    ++s.position;
                }
                s.lineOffsets.push(s.position);
            }
        }
        return { tokenType: TokenKind.Whitespace, offset: start, length: s.position - start, modeStack: modeStack };

    }

    function scripting(s: LexerState): Token {

        let c = s.input[s.position];
        let start = s.position;
        let l = s.input.length;
        let modeStack = s.modeStack;

        switch (c) {

            case ' ':
            case '\t':
            case '\n':
            case '\r':
                return whitespace(s);

            case '-':
                return scriptingMinus(s);

            case ':':
                if (++s.position < l && s.input[s.position] === ':') {
                    ++s.position;
                    return { tokenType: TokenKind.ColonColon, offset: start, length: 2, modeStack: modeStack };
                }
                return { tokenType: TokenKind.Colon, offset: start, length: 1, modeStack: modeStack };

            case '.':
                return scriptingDot(s);

            case '=':
                return scriptingEquals(s);

            case '+':
                return scriptingPlus(s);

            case '!':
                return scriptingExclamation(s);

            case '<':
                return scriptingLessThan(s);

            case '>':
                return scriptingGreaterThan(s);

            case '*':
                return scriptingAsterisk(s);

            case '/':
                return scriptingForwardSlash(s);

            case '%':
                if (++s.position < l && s.input[s.position] === '=') {
                    ++s.position;
                    return { tokenType: TokenKind.PercentEquals, offset: start, length: 2, modeStack: modeStack };
                }
                return { tokenType: TokenKind.Percent, offset: start, length: 1, modeStack: modeStack };

            case '&':
                return scriptingAmpersand(s);

            case '|':
                return scriptingBar(s);

            case '^':
                if (++s.position < l && s.input[s.position] === '=') {
                    ++s.position;
                    return { tokenType: TokenKind.CaretEquals, offset: start, length: 2, modeStack: modeStack };
                }
                return { tokenType: TokenKind.Caret, offset: start, length: 1, modeStack: modeStack };

            case ';':
                ++s.position;
                return { tokenType: TokenKind.Semicolon, offset: start, length: 1, modeStack: modeStack };

            case ',':
                ++s.position;
                return { tokenType: TokenKind.Comma, offset: start, length: 1, modeStack: modeStack };

            case '[':
                ++s.position;
                return { tokenType: TokenKind.OpenBracket, offset: start, length: 1, modeStack: modeStack };

            case ']':
                ++s.position;
                return { tokenType: TokenKind.CloseBracket, offset: start, length: 1, modeStack: modeStack };

            case '(':
                return scriptingOpenParenthesis(s);

            case ')':
                ++s.position;
                return { tokenType: TokenKind.CloseParenthesis, offset: start, length: 1, modeStack: modeStack };

            case '~':
                ++s.position;
                return { tokenType: TokenKind.Tilde, offset: start, length: 1, modeStack: modeStack };

            case '?':
                return scriptingQuestion(s);

            case '@':
                ++s.position;
                return { tokenType: TokenKind.AtSymbol, offset: start, length: 1, modeStack: modeStack };

            case '$':
                return scriptingDollar(s);

            case '#':
                ++s.position;
                return scriptingComment(s, start);

            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                return scriptingNumeric(s);

            case '{':
                ++s.position;
                s.modeStack = modeStack.slice(0);
                s.modeStack.push(LexerMode.Scripting);
                return { tokenType: TokenKind.OpenBrace, offset: start, length: 1, modeStack: modeStack };

            case '}':
                ++s.position;
                if (s.modeStack.length > 1) {
                    s.modeStack = s.modeStack.slice(0, -1);
                }
                return { tokenType: TokenKind.CloseBrace, offset: start, length: 1, modeStack: modeStack };

            case '`':
                ++s.position;
                s.modeStack = s.modeStack.slice(0, -1);
                s.modeStack.push(LexerMode.Backtick);
                return { tokenType: TokenKind.Backtick, offset: start, length: 1, modeStack: modeStack };

            case '\\':
                return scriptingBackslash(s);

            case '\'':
                return scriptingSingleQuote(s, start);

            case '"':
                return scriptingDoubleQuote(s, start);

            default:
                if (isLabelStart(c)) {
                    return scriptingLabelStart(s);
                } else {
                    ++s.position;
                    return { tokenType: TokenKind.Unknown, offset: start, length: 1, modeStack: s.modeStack };
                }

        }

    }

    function lookingForProperty(s: LexerState): Token {

        let start = s.position;
        let c = s.input[s.position];
        let l = s.input.length;
        let modeStack = s.modeStack;

        switch (c) {
            case ' ':
            case '\t':
            case '\n':
            case '\r':
                return whitespace(s);

            default:
                if (isLabelStart(c)) {
                    while (++s.position < l && isLabelChar(s.input[s.position])) { }
                    s.modeStack = s.modeStack.slice(0, -1);
                    return { tokenType: TokenKind.Name, offset: start, length: s.position - start, modeStack: modeStack };
                }

                if (c === '-' && s.position + 1 < l && s.input[s.position + 1] === '>') {
                    s.position += 2;
                    return { tokenType: TokenKind.Arrow, offset: start, length: 2, modeStack: modeStack };
                }

                s.modeStack = s.modeStack.slice(0, -1);
                return null;
        }

    }

    function doubleQuotes(s: LexerState) {

        let l = s.input.length;
        let c = s.input[s.position];
        let start = s.position;
        let modeStack = s.modeStack;
        let t: Token;

        switch (c) {
            case '$':
                if ((t = encapsulatedDollar(s))) {
                    return t;
                }
                break;

            case '{':
                if (s.position + 1 < l && s.input[s.position + 1] === '$') {
                    s.modeStack = s.modeStack.slice(0);
                    s.modeStack.push(LexerMode.Scripting);
                    ++s.position;
                    return { tokenType: TokenKind.CurlyOpen, offset: start, length: 1, modeStack: modeStack };
                }
                break;

            case '"':
                s.modeStack = s.modeStack.slice(0, -1);
                s.modeStack.push(LexerMode.Scripting);
                ++s.position;
                return { tokenType: TokenKind.DoubleQuote, offset: start, length: 1, modeStack: modeStack };

            default:
                break;

        }

        return doubleQuotesAny(s);
    }

    function nowdoc(s: LexerState) {

        //search for label
        let start = s.position;
        let n = start;
        let l = s.input.length;
        let c: string;
        let modeStack = s.modeStack;

        while (n < l) {
            c = s.input[n++];
            switch (c) {
                case '\r':
                    if (n < l && s.input[n] === '\n') {
                        ++n;
                    }
                /* fall through */
                case '\n':
                    /* Check for ending label on the next line */
                    if (n < l && s.heredocLabel === s.input.substr(n, s.heredocLabel.length)) {
                        let k = n + s.heredocLabel.length;

                        if (k < l && s.input[k] === ';') {
                            ++k;
                        }

                        if (k < l && (s.input[k] === '\n' || s.input[k] === '\r')) {

                            //set position to whitespace before label
                            let nl = s.input.slice(n - 2, n);
                            if (nl === '\r\n') {
                                n -= 2;
                            } else {
                                --n;
                            }

                            s.modeStack = s.modeStack.slice(0, -1);
                            s.modeStack.push(LexerMode.EndHereDoc);
                            break;

                        }
                    }
                    s.lineOffsets.push(n);
                /* fall through */
                default:
                    continue;
            }

            break;
        }

        s.position = n;
        return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: modeStack };

    }

    function heredoc(s: LexerState) {

        let l = s.input.length;
        let c = s.input[s.position];
        let start = s.position;
        let modeStack = s.modeStack;
        let t: Token;

        switch (c) {
            case '$':
                if ((t = encapsulatedDollar(s))) {
                    return t;
                }
                break;

            case '{':
                if (s.position + 1 < l && s.input[s.position + 1] === '$') {
                    s.modeStack = s.modeStack.slice(0);
                    s.modeStack.push(LexerMode.Scripting);
                    ++s.position;
                    return { tokenType: TokenKind.CurlyOpen, offset: start, length: 1, modeStack: modeStack };
                }
                break;

            default:
                break;

        }

        return heredocAny(s);

    }

    function backtick(s: LexerState) {

        let l = s.input.length;
        let c = s.input[s.position];
        let start = s.position;
        let modeStack = s.modeStack;
        let t: Token;

        switch (c) {
            case '$':
                if ((t = encapsulatedDollar(s))) {
                    return t;
                }
                break;

            case '{':
                if (s.position + 1 < l && s.input[s.position + 1] === '$') {
                    s.modeStack = s.modeStack.slice(0);
                    s.modeStack.push(LexerMode.Scripting);
                    ++s.position;
                    return { tokenType: TokenKind.CurlyOpen, offset: start, length: 1, modeStack: modeStack };
                }
                break;

            case '`':
                s.modeStack = s.modeStack.slice(0, -1);
                s.modeStack.push(LexerMode.Scripting);
                ++s.position;
                return { tokenType: TokenKind.Backtick, offset: start, length: 1, modeStack: modeStack };

            default:
                break;

        }

        return backtickAny(s);

    }

    function varOffset(s: LexerState) {

        let start = s.position;
        let c = s.input[s.position];
        let l = s.input.length;
        let modeStack = s.modeStack;

        switch (s.input[s.position]) {

            case '$':
                if (s.position + 1 < l && isLabelStart(s.input[s.position + 1])) {
                    ++s.position;
                    while (++s.position < l && isLabelChar(s.input[s.position])) { }
                    return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: s.modeStack };
                }
                break;

            case '[':
                ++s.position;
                return { tokenType: TokenKind.OpenBracket, offset: start, length: 1, modeStack: s.modeStack };

            case ']':
                s.modeStack = s.modeStack.slice(0, -1);
                ++s.position;
                return { tokenType: TokenKind.CloseBracket, offset: start, length: 1, modeStack: s.modeStack };

            case '-':
                ++s.position;
                return { tokenType: TokenKind.Minus, offset: start, length: 1, modeStack: s.modeStack };

            default:
                if (c >= '0' && c <= '9') {
                    return varOffsetNumeric(s);
                } else if (isLabelStart(c)) {
                    while (++s.position < l && isLabelChar(s.input[s.position])) { }
                    return { tokenType: TokenKind.Name, offset: start, length: s.position - start, modeStack: s.modeStack };
                }
                break;

        }

        //unexpected char
        s.modeStack = s.modeStack.slice(0, -1);
        ++s.position;
        return { tokenType: TokenKind.Unknown, offset: start, length: 1, modeStack: modeStack };

    }

    function lookingForVarName(s: LexerState) {

        let start = s.position;
        let l = s.input.length;
        let modeStack = s.modeStack;

        if (isLabelStart(s.input[s.position])) {
            let k = s.position + 1;
            while (++k < l && isLabelChar(s.input[k])) { }
            if (k < l && (s.input[k] === '[' || s.input[k] === '}')) {
                s.modeStack = s.modeStack.slice(0, -1);
                s.modeStack.push(LexerMode.Scripting);
                s.position = k;
                return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: modeStack };
            }
        }

        s.modeStack = s.modeStack.slice(0, -1);
        s.modeStack.push(LexerMode.Scripting);
        return undefined;

    }

    function varOffsetNumeric(s: LexerState) {

        let start = s.position;
        let c = s.input[s.position];
        let l = s.input.length;

        if (c === '0') {
            let k = s.position + 1;
            if (k < l && s.input[k] === 'b' && ++k < l && (s.input[k] === '1' || s.input[k] === '0')) {
                while (++k < l && (s.input[k] === '1' || s.input[k] === '0')) { }
                s.position = k;
                return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            }

            if (k < l && s.input[k] === 'x' && ++k < l && isHexDigit(s.input[k])) {
                while (++k < l && isHexDigit(s.input[k])) { }
                s.position = k;
                return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            }
        }

        while (++s.position < l && s.input[s.position] >= '0' && s.input[s.position] <= '9') { }
        return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function backtickAny(s: LexerState) {

        let n = s.position;
        let c: string;
        let start = n;
        let l = s.input.length;

        if (s.input[n] === '\\' && n < l) {
            ++n;
        }

        while (n < l) {
            c = s.input[n++];
            switch (c) {
                case '`':
                    break;
                case '$':
                    if (n < l && (isLabelStart(s.input[n]) || s.input[n] === '{')) {
                        break;
                    }
                    continue;
                case '{':
                    if (n < l && s.input[n] === '$') {
                        break;
                    }
                    continue;
                case '\r':
                    if(n < l && s.input[n] === '\n') {
                        ++n;
                    }
                    /* fall through */
                case '\n':
                    s.lineOffsets.push(n);
                    continue;
                case '\\':
                    if (n < l && s.input[n] !== '\r' && s.input[n] !== '\n') {
                        ++n;
                    }
                /* fall through */
                default:
                    continue;
            }

            --n;
            break;
        }

        s.position = n;
        return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function heredocAny(s: LexerState) {

        let start = s.position;
        let n = start;
        let c: string;
        let l = s.input.length;
        let modeStack = s.modeStack;

        while (n < l) {
            c = s.input[n++];
            switch (c) {
                case '\r':
                    if (n < l && s.input[n] === '\n') {
                        ++n;
                    }
                /* fall through */
                case '\n':
                    /* Check for ending label on the next line */
                    if (n < l && s.input.slice(n, n + s.heredocLabel.length) === s.heredocLabel) {
                        let k = n + s.heredocLabel.length;

                        if (k < l && s.input[k] === ';') {
                            ++k;
                        }

                        if (k < l && (s.input[k] === '\n' || s.input[k] === '\r')) {
                            let nl = s.input.slice(n - 2, n);
                            if (nl === '\r\n') {
                                n -= 2
                            } else {
                                --n;
                            }

                            s.position = n;
                            s.modeStack = s.modeStack.slice(0, -1);
                            s.modeStack.push(LexerMode.EndHereDoc);
                            return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: modeStack };
                        }
                    }
                    s.lineOffsets.push(n);
                    continue;
                case '$':
                    if (n < l && (isLabelStart(s.input[n]) || s.input[n] === '{')) {
                        break;
                    }
                    continue;
                case '{':
                    if (n < l && s.input[n] === '$') {
                        break;
                    }
                    continue;
                case '\\':
                    if (n < l && s.input[n] !== '\n' && s.input[n] !== '\r') {
                        ++n;
                    }
                /* fall through */
                default:
                    continue;
            }

            --n;
            break;
        }

        s.position = n;
        return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: modeStack };
    }

    function endHeredoc(s: LexerState) {

        let start = s.position;
        //consume ws
        ++s.position;
        if(s.position < s.input.length && s.input[s.position] === '\n') {
            ++s.position;
        }
        s.lineOffsets.push(s.position);
        s.position += s.heredocLabel.length;
        s.heredocLabel = undefined;
        let t = { tokenType: TokenKind.EndHeredoc, offset: start, length: s.position - start, modeStack: s.modeStack };
        s.modeStack = s.modeStack.slice(0, -1);
        s.modeStack.push(LexerMode.Scripting);
        return t;

    }

    function doubleQuotesAny(s: LexerState) {

        let start = s.position;

        if (s.doubleQuoteScannedLength > 0) {
            //already know position
            s.position = s.doubleQuoteScannedLength;
            s.doubleQuoteScannedLength = -1
        } else {
            //find new pos
            let n = s.position;
            let l = s.input.length;
            ++n;

            if (s.input[s.position] === '\\' && n + 1 < l) {
                ++n;
            }

            let c: string;
            while (n < l) {
                c = s.input[n++];
                switch (c) {
                    case '"':
                        break;
                    case '$':
                        if (n < l && (isLabelStart(s.input[n]) || s.input[n] == '{')) {
                            break;
                        }
                        continue;
                    case '{':
                        if (n < l && s.input[n] === '$') {
                            break;
                        }
                        continue;
                    case '\r':
                        if(n < l && s.input[n] === '\n') {
                            ++n;
                        }
                        /* fall through */
                    case '\n':
                        s.lineOffsets.push(n);
                        continue;
                    case '\\':
                        if (n < l && s.input[n] !== '\n' && s.input[n] !== '\r') {
                            ++n;
                        }
                    /* fall through */
                    default:
                        continue;
                }

                --n;
                break;
            }

            s.position = n;
        }

        return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function encapsulatedDollar(s: LexerState): Token {

        let start = s.position;
        let l = s.input.length;
        let k = s.position + 1;
        let modeStack = s.modeStack;

        if (k >= l) {
            return undefined;
        }

        if (s.input[k] === '{') {
            s.position += 2;
            s.modeStack = s.modeStack.slice(0);
            s.modeStack.push(LexerMode.LookingForVarName);
            return { tokenType: TokenKind.DollarCurlyOpen, offset: start, length: 2, modeStack: modeStack };
        }

        if (!isLabelStart(s.input[k])) {
            return undefined;
        }

        while (++k < l && isLabelChar(s.input[k])) { }

        if (k < l && s.input[k] === '[') {
            s.modeStack = s.modeStack.slice(0);
            s.modeStack.push(LexerMode.VarOffset);
            s.position = k;
            return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: modeStack };
        }

        if (k < l && s.input[k] === '-') {
            let n = k + 1;
            if (n < l && s.input[n] === '>' && ++n < l && isLabelStart(s.input[n])) {
                s.modeStack = s.modeStack.slice(0);
                s.modeStack.push(LexerMode.LookingForProperty);
                s.position = k;
                return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: modeStack };
            }
        }

        s.position = k;
        return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: modeStack };

    }

    function scriptingDoubleQuote(s: LexerState, start: number): Token {

        //optional \ consumed
        //consume until unescaped "
        //if ${LABEL_START}, ${, {$ found or no match return " and consume none 
        ++s.position;
        let n = s.position;
        let c: string;
        let l = s.input.length;

        while (n < l) {
            c = s.input[n++];
            switch (c) {
                case '"':
                    s.position = n;
                    return { tokenType: TokenKind.StringLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
                case '$':
                    if (n < l && (isLabelStart(s.input[n]) || s.input[n] === '{')) {
                        break;
                    }
                    continue;
                case '{':
                    if (n < l && s.input[n] === '$') {
                        break;
                    }
                    continue;
                case '\r':
                    if (n < l && s.input[n] === '\n') {
                        ++n;
                    }
                /* fall through */
                case '\n':
                    s.lineOffsets.push(n);
                    continue;
                case '\\':
                    if (n < l && s.input[n] !== '\n' && s.input[n] !== '\r') {
                        ++n;
                    }
                /* fall through */
                default:
                    continue;
            }

            --n;
            break;
        }

        s.doubleQuoteScannedLength = n;
        let modeStack = s.modeStack;
        s.modeStack = s.modeStack.slice(0, -1);
        s.modeStack.push(LexerMode.DoubleQuotes);
        return { tokenType: TokenKind.DoubleQuote, offset: start, length: s.position - start, modeStack: modeStack };

    }

    function scriptingSingleQuote(s: LexerState, start: number): Token {
        //optional \ already consumed
        //find first unescaped '
        let l = s.input.length;
        let c: string;
        ++s.position;
        while (s.position < l) {
            c = s.input[s.position];
            ++s.position;

            if (c === '\'') {
                return { tokenType: TokenKind.StringLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            } else if (c === '\\' && s.position < l && s.input[s.position] !== '\r' && s.input[s.position] !== '\n') {
                ++s.position;
            } else if (c === '\r') {
                if (s.position < l && s.input[s.position] === '\n') {
                    ++s.position;
                }
                s.lineOffsets.push(s.position);
            } else if (c === '\n') {
                s.lineOffsets.push(s.position);
            }
        }

        return { tokenType: TokenKind.EncapsulatedAndWhitespace, offset: start, length: s.position - start, modeStack: s.modeStack };
    }

    function scriptingBackslash(s: LexerState): Token {

        //single quote, double quote and heredoc open have optional \

        let start = s.position;
        ++s.position;
        let t: Token;

        if (s.position < s.input.length) {
            switch (s.input[s.position]) {
                case '\'':
                    return scriptingSingleQuote(s, start);

                case '"':
                    return scriptingDoubleQuote(s, start);

                case '<':
                    t = scriptingHeredoc(s, start);
                    if (t) {
                        return t;
                    }

                default:
                    break;
            }
        }

        return { tokenType: TokenKind.Backslash, offset: start, length: 1, modeStack: s.modeStack };

    }

    const endHeredocLabelRegExp = /^;?(?:\r\n|\n|\r)/;
    function scriptingHeredoc(s: LexerState, start: number) {

        //pos is on first <
        let l = s.input.length;
        let k = s.position;

        let labelStart: number;
        let labelEnd: number;

        for (let kPlus3 = k + 3; k < kPlus3; ++k) {
            if (k >= l || s.input[k] !== '<') {
                return undefined;
            }
        }

        while (k < l && (s.input[k] === ' ' || s.input[k] === '\t')) {
            ++k;
        }

        let quote: string;
        if (k < l && (s.input[k] === '\'' || s.input[k] === '"')) {
            quote = s.input[k];
            ++k;
        }

        labelStart = k;

        if (k < l && isLabelStart(s.input[k])) {
            while (++k < l && isLabelChar(s.input[k])) { }
        } else {
            return undefined;
        }

        labelEnd = k;

        if (quote) {
            if (k < l && s.input[k] === quote) {
                ++k;
            } else {
                return undefined;
            }
        }

        if (k < l) {
            if (s.input[k] === '\r') {
                ++k;
                if (s.input[k] === '\n') {
                    ++k;
                }
            } else if (s.input[k] === '\n') {
                ++k;
            } else {
                return undefined;
            }
        }

        s.position = k;
        s.lineOffsets.push(k);
        s.heredocLabel = s.input.slice(labelStart, labelEnd);
        let t = { tokenType: TokenKind.StartHeredoc, offset: start, length: s.position - start, modeStack: s.modeStack };
        s.modeStack = s.modeStack.slice(0, -1);

        if (quote === '\'') {
            s.modeStack.push(LexerMode.NowDoc);
        } else {
            s.modeStack.push(LexerMode.HereDoc);
        }

        //check for end on next line
        if (
            s.input.substr(s.position, s.heredocLabel.length) === s.heredocLabel &&
            s.input.substr(s.position + s.heredocLabel.length, 3).search(endHeredocLabelRegExp) >= 0
        ) {
            s.modeStack.pop();
            s.modeStack.push(LexerMode.EndHereDoc);
        }

        return t;

    }

    function scriptingLabelStart(s: LexerState): Token {

        let l = s.input.length;
        let start = s.position;
        while (++s.position < l && isLabelChar(s.input[s.position])) { }

        let text = s.input.slice(start, s.position);
        let tokenType = 0;

        if (text[0] === '_') {

            switch (text) {
                case '__CLASS__':
                    tokenType = TokenKind.ClassConstant;
                    break;
                case '__TRAIT__':
                    tokenType = TokenKind.TraitConstant;
                    break;
                case '__FUNCTION__':
                    tokenType = TokenKind.FunctionConstant;
                    break;
                case '__METHOD__':
                    tokenType = TokenKind.MethodConstant;
                    break;
                case '__LINE__':
                    tokenType = TokenKind.LineConstant;
                    break;
                case '__FILE__':
                    tokenType = TokenKind.FileConstant;
                    break;
                case '__DIR__':
                    tokenType = TokenKind.DirectoryConstant;
                    break;
                case '__NAMESPACE__':
                    tokenType = TokenKind.NamespaceConstant;
                    break;
                default:
                    break;
            }

            if (tokenType > 0) {
                return { tokenType: tokenType, offset: start, length: s.position - start, modeStack: s.modeStack };
            }
        }

        text = text.toLowerCase();

        switch (text) {
            case 'exit':
                tokenType = TokenKind.Exit;
                break;
            case 'die':
                tokenType = TokenKind.Exit;
                break;
            case 'function':
                tokenType = TokenKind.Function;
                break;
            case 'const':
                tokenType = TokenKind.Const;
                break;
            case 'return':
                tokenType = TokenKind.Return;
                break;
            case 'yield':
                return scriptingYield(s, start);
            case 'try':
                tokenType = TokenKind.Try;
                break;
            case 'catch':
                tokenType = TokenKind.Catch;
                break;
            case 'finally':
                tokenType = TokenKind.Finally;
                break;
            case 'throw':
                tokenType = TokenKind.Throw;
                break;
            case 'if':
                tokenType = TokenKind.If;
                break;
            case 'elseif':
                tokenType = TokenKind.ElseIf;
                break;
            case 'endif':
                tokenType = TokenKind.EndIf;
                break;
            case 'else':
                tokenType = TokenKind.Else;
                break;
            case 'while':
                tokenType = TokenKind.While;
                break;
            case 'endwhile':
                tokenType = TokenKind.EndWhile;
                break;
            case 'do':
                tokenType = TokenKind.Do;
                break;
            case 'for':
                tokenType = TokenKind.For;
                break;
            case 'endfor':
                tokenType = TokenKind.EndFor;
                break;
            case 'foreach':
                tokenType = TokenKind.ForEach;
                break;
            case 'endforeach':
                tokenType = TokenKind.EndForeach;
                break;
            case 'declare':
                tokenType = TokenKind.Declare;
                break;
            case 'enddeclare':
                tokenType = TokenKind.EndDeclare;
                break;
            case 'instanceof':
                tokenType = TokenKind.InstanceOf;
                break;
            case 'as':
                tokenType = TokenKind.As;
                break;
            case 'switch':
                tokenType = TokenKind.Switch;
                break;
            case 'endswitch':
                tokenType = TokenKind.EndSwitch;
                break;
            case 'case':
                tokenType = TokenKind.Case;
                break;
            case 'default':
                tokenType = TokenKind.Default;
                break;
            case 'break':
                tokenType = TokenKind.Break;
                break;
            case 'continue':
                tokenType = TokenKind.Continue;
                break;
            case 'goto':
                tokenType = TokenKind.Goto;
                break;
            case 'echo':
                tokenType = TokenKind.Echo;
                break;
            case 'print':
                tokenType = TokenKind.Print;
                break;
            case 'class':
                tokenType = TokenKind.Class;
                break;
            case 'interface':
                tokenType = TokenKind.Interface;
                break;
            case 'trait':
                tokenType = TokenKind.Trait;
                break;
            case 'extends':
                tokenType = TokenKind.Extends;
                break;
            case 'implements':
                tokenType = TokenKind.Implements;
                break;
            case 'new':
                tokenType = TokenKind.New;
                break;
            case 'clone':
                tokenType = TokenKind.Clone;
                break;
            case 'var':
                tokenType = TokenKind.Var;
                break;
            case 'eval':
                tokenType = TokenKind.Eval;
                break;
            case 'include_once':
                tokenType = TokenKind.IncludeOnce;
                break;
            case 'include':
                tokenType = TokenKind.Include;
                break;
            case 'require_once':
                tokenType = TokenKind.RequireOnce;
                break;
            case 'require':
                tokenType = TokenKind.Require;
                break;
            case 'namespace':
                tokenType = TokenKind.Namespace;
                break;
            case 'use':
                tokenType = TokenKind.Use;
                break;
            case 'insteadof':
                tokenType = TokenKind.InsteadOf;
                break;
            case 'global':
                tokenType = TokenKind.Global;
                break;
            case 'isset':
                tokenType = TokenKind.Isset;
                break;
            case 'empty':
                tokenType = TokenKind.Empty;
                break;
            case '__halt_compiler':
                tokenType = TokenKind.HaltCompiler;
                break;
            case 'static':
                tokenType = TokenKind.Static;
                break;
            case 'abstract':
                tokenType = TokenKind.Abstract;
                break;
            case 'final':
                tokenType = TokenKind.Final;
                break;
            case 'private':
                tokenType = TokenKind.Private;
                break;
            case 'protected':
                tokenType = TokenKind.Protected;
                break;
            case 'public':
                tokenType = TokenKind.Public;
                break;
            case 'unset':
                tokenType = TokenKind.Unset;
                break;
            case 'list':
                tokenType = TokenKind.List;
                break;
            case 'array':
                tokenType = TokenKind.Array;
                break;
            case 'callable':
                tokenType = TokenKind.Callable;
                break;
            case 'or':
                tokenType = TokenKind.Or;
                break;
            case 'and':
                tokenType = TokenKind.And;
                break;
            case 'xor':
                tokenType = TokenKind.Xor;
                break;
            default:
                break;
        }

        if (!tokenType) {
            tokenType = TokenKind.Name;
        }

        return { tokenType: tokenType, offset: start, length: s.position - start, modeStack: s.modeStack };
    }

    function scriptingYield(s: LexerState, start: number) {
        //pos will be after yield keyword
        //check for from

        let l = s.input.length;
        let k = s.position;

        if (k < l && isWhitespace(s.input[k])) {
            let lineOffsets = [];
            let c:string;
            
            while (k < l && isWhitespace(c = s.input[k])) { 
                ++k;
                if(c === '\n') {
                    lineOffsets.push(k);
                } else if(c === '\r') {
                    if(k < l && s.input[k] === '\n') {
                        ++k;
                    }
                    lineOffsets.push(k);
                }
            }

            if (s.input.substr(k, 4).toLowerCase() === 'from') {
                s.position = k + 4;
                if(lineOffsets.length > 0) {
                    Array.prototype.push.apply(s.lineOffsets, lineOffsets);
                }
                return { tokenType: TokenKind.YieldFrom, offset: start, length: s.position - start, modeStack: s.modeStack };
            }

        }

        return { tokenType: TokenKind.Yield, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function scriptingQuestion(s: LexerState): Token {

        let l = s.input.length;
        let start = s.position;

        ++s.position;
        if (s.position < l) {
            if (s.input[s.position] === '?') {
                ++s.position;
                return { tokenType: TokenKind.QuestionQuestion, offset: start, length: 2, modeStack: s.modeStack };
            } else if (s.input[s.position] === '>') {
                ++s.position;
                let modeStack = s.modeStack;
                s.modeStack = s.modeStack.slice(0, -1);
                s.modeStack.push(LexerMode.Initial);
                return { tokenType: TokenKind.CloseTag, offset: start, length: s.position - start, modeStack: modeStack };
            }
        }
        return { tokenType: TokenKind.Question, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingDollar(s: LexerState): Token {
        let start = s.position;
        let k = s.position;
        let l = s.input.length;
        ++k;

        if (k < l && isLabelStart(s.input[k])) {
            while (++k < l && isLabelChar(s.input[k])) { }
            s.position = k;
            return { tokenType: TokenKind.VariableName, offset: start, length: s.position - start, modeStack: s.modeStack };
        }

        ++s.position;
        return { tokenType: TokenKind.Dollar, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingOpenParenthesis(s: LexerState): Token {

        let start = s.position;
        let k = start;
        let l = s.input.length;

        //check for cast tokens
        ++k;
        while (k < l && (s.input[k] === ' ' || s.input[k] === '\t')) {
            ++k;
        }

        let keywordStart = k;
        while (k < l && ((s.input[k] >= 'A' && s.input <= 'Z') || (s.input[k] >= 'a' && s.input <= 'z'))) {
            ++k;
        }
        let keywordEnd = k;

        while (k < l && (s.input[k] === ' ' || s.input[k] === '\t')) {
            ++k;
        }

        //should have a ) here if valid cast token
        if (k < l && s.input[k] === ')') {
            let keyword = s.input.slice(keywordStart, keywordEnd).toLowerCase();
            let tokenType = 0;
            switch (keyword) {
                case 'int':
                case 'integer':
                    tokenType = TokenKind.IntegerCast;
                    break;

                case 'real':
                case 'float':
                case 'double':
                    tokenType = TokenKind.FloatCast;
                    break;

                case 'string':
                case 'binary':
                    tokenType = TokenKind.StringCast;
                    break;

                case 'array':
                    tokenType = TokenKind.ArrayCast;
                    break;

                case 'object':
                    tokenType = TokenKind.ObjectCast;
                    break;

                case 'bool':
                case 'boolean':
                    tokenType = TokenKind.BooleanCast;
                    break;

                case 'unset':
                    tokenType = TokenKind.UnsetCast;
                    break;

                default:
                    break;
            }

            if (tokenType > 0) {
                s.position = k + 1;
                return { tokenType: tokenType, offset: start, length: s.position - start, modeStack: s.modeStack };
            }

        }

        ++s.position;
        return { tokenType: TokenKind.OpenParenthesis, offset: start, length: 1, modeStack: s.modeStack };

    }

    function isHexDigit(c: string) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }

    function scriptingNumeric(s: LexerState): Token {

        let start = s.position;
        let l = s.input.length;
        let k = s.position;

        if (s.input[s.position] === '0' && ++k < l) {
            if (s.input[k] === 'b' && ++k < l && (s.input[k] === '0' || s.input[k] === '1')) {
                while (++k < l && (s.input[k] === '0' || s.input[k] === '1')) { }
                s.position = k;
                return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            }
            k = s.position + 1;
            if (s.input[k] === 'x' && ++k < l && isHexDigit(s.input[k])) {
                while (++k < l && isHexDigit(s.input[k])) { }
                s.position = k;
                return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            }
        }

        while (++s.position < l && s.input[s.position] >= '0' && s.input[s.position] <= '9') { }

        if (s.input[s.position] === '.') {
            ++s.position;
            return scriptingNumericStartingWithDotOrE(s, start, true);
        } else if (s.input[s.position] === 'e' || s.input[s.position] === 'E') {
            return scriptingNumericStartingWithDotOrE(s, start, false);
        }

        return { tokenType: TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function scriptingNumericStartingWithDotOrE(s: LexerState, start: number, hasDot: boolean): Token {

        let l = s.input.length;
        while (s.position < l && s.input[s.position] >= '0' && s.input[s.position] <= '9') {
            ++s.position;
        }

        if (s.position < l && (s.input[s.position] === 'e' || s.input[s.position] === 'E')) {
            let k = s.position + 1;
            if (k < l && (s.input[k] === '+' || s.input[k] === '-')) {
                ++k;
            }
            if (k < l && s.input[k] >= '0' && s.input[k] <= '9') {
                while (++k < l && s.input[k] >= '0' && s.input[k] <= '9') { }
                s.position = k;
                return { tokenType: TokenKind.FloatingLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };
            }
        }

        return { tokenType: hasDot ? TokenKind.FloatingLiteral : TokenKind.IntegerLiteral, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function scriptingBar(s: LexerState): Token {
        let start = s.position;
        ++s.position;

        if (s.position < s.input.length) {
            switch (s.input[s.position]) {
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.BarEquals, offset: start, length: 2, modeStack: s.modeStack };

                case '|':
                    ++s.position;
                    return { tokenType: TokenKind.BarBar, offset: start, length: 2, modeStack: s.modeStack };

                default:
                    break;
            }
        }

        return { tokenType: TokenKind.Bar, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingAmpersand(s: LexerState): Token {

        let start = s.position;
        ++s.position;

        if (s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.AmpersandEquals, offset: start, length: 2, modeStack: s.modeStack };

                case '&':
                    ++s.position;
                    return { tokenType: TokenKind.AmpersandAmpersand, offset: start, length: 2, modeStack: s.modeStack };

                default:
                    break;
            }

        }

        return { tokenType: TokenKind.Ampersand, offset: start, length: 1, modeStack: s.modeStack };

    }

    function scriptingInlineCommentOrDocBlock(s: LexerState): Token {

        // /* already read

        let tokenType = TokenKind.Comment;
        let start = s.position - 2;
        let l = s.input.length;
        let c:string;

        if (s.position < l && s.input[s.position] === '*' && s.position + 1 < l && s.input[s.position + 1] !== '/') {
            ++s.position;
            tokenType = TokenKind.DocumentComment;
        }

        //find comment end */
        while (s.position < l) {
            c = s.input[s.position];
            ++s.position;
            if (c === '*' && s.position < l && s.input[s.position] === '/') {
                ++s.position;
                break;
            } else if(c === '\r') {
                if(s.position < l && s.input[s.position] === '\n') {
                    ++s.position;
                }
                s.lineOffsets.push(s.position);
            } else if(c === '\n') {
                s.lineOffsets.push(s.position);
            }
        }

        //todo WARN unterminated comment
        return { tokenType: tokenType, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function scriptingForwardSlash(s: LexerState) {

        let start = s.position;
        ++s.position;

        if (s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.ForwardslashEquals, offset: start, length: 2, modeStack: s.modeStack };

                case '*':
                    ++s.position;
                    return scriptingInlineCommentOrDocBlock(s);

                case '/':
                    ++s.position;
                    return scriptingComment(s, start);

                default:
                    break;
            }

        }

        return { tokenType: TokenKind.ForwardSlash, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingComment(s: LexerState, start: number) {
        //s.position will be on first char after # or //
        //find first newline or closing tag

        let l = s.input.length;
        let c: string;

        while (s.position < l) {
            c = s.input[s.position];
            ++s.position;
            if (
                c === '\n' ||
                c === '\r' ||
                (c === '?' && s.position < l && s.input[s.position] === '>')
            ) {
                --s.position;
                break;
            }
        }

        return { tokenType: TokenKind.Comment, offset: start, length: s.position - start, modeStack: s.modeStack };

    }

    function scriptingAsterisk(s: LexerState) {
        let start = s.position;

        if (++s.position < s.input.length) {
            switch (s.input[s.position]) {
                case '*':
                    ++s.position;
                    if (s.position < s.input.length && s.input[s.position] === '=') {
                        ++s.position;
                        return { tokenType: TokenKind.AsteriskAsteriskEquals, offset: start, length: 3, modeStack: s.modeStack };
                    }
                    return { tokenType: TokenKind.AsteriskAsterisk, offset: start, length: 2, modeStack: s.modeStack };

                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.AsteriskEquals, offset: start, length: 2, modeStack: s.modeStack };

                default:
                    break;
            }
        }

        return { tokenType: TokenKind.Asterisk, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingGreaterThan(s: LexerState) {
        let start = s.position;

        if (++s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '>':
                    ++s.position;
                    if (s.position < s.input.length && s.input[s.position] === '=') {
                        ++s.position;
                        return { tokenType: TokenKind.GreaterThanGreaterThanEquals, offset: start, length: 3, modeStack: s.modeStack };
                    }
                    return { tokenType: TokenKind.GreaterThanGreaterThan, offset: start, length: 2, modeStack: s.modeStack };
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.GreaterThanEquals, offset: start, length: 2, modeStack: s.modeStack };
                default:
                    break;
            }
        }

        return { tokenType: TokenKind.GreaterThan, offset: start, length: 1, modeStack: s.modeStack };

    }

    function scriptingLessThan(s: LexerState) {

        let start = s.position;

        if (++s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '>':
                    ++s.position;
                    return { tokenType: TokenKind.ExclamationEquals, offset: start, length: 2, modeStack: s.modeStack };

                case '<':
                    ++s.position;
                    if (s.position < s.input.length) {
                        if (s.input[s.position] === '=') {
                            ++s.position;
                            return { tokenType: TokenKind.LessThanLessThanEquals, offset: start, length: 3, modeStack: s.modeStack };
                        } else if (s.input[s.position] === '<') {
                            //go back to first <
                            s.position -= 2;
                            let heredoc = scriptingHeredoc(s, start);
                            if (heredoc) {
                                return heredoc;
                            } else {
                                s.position += 2;
                            }
                        }

                    }
                    return { tokenType: TokenKind.LessThanLessThan, offset: start, length: 2, modeStack: s.modeStack };
                case '=':
                    ++s.position;
                    if (s.position < s.input.length && s.input[s.position] === '>') {
                        ++s.position;
                        return { tokenType: TokenKind.Spaceship, offset: start, length: 3, modeStack: s.modeStack };
                    }
                    return { tokenType: TokenKind.LessThanEquals, offset: start, length: 2, modeStack: s.modeStack };

                default:
                    break;

            }

        }

        return { tokenType: TokenKind.LessThan, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingExclamation(s: LexerState) {

        let start = s.position;

        if (++s.position < s.input.length && s.input[s.position] === '=') {
            if (++s.position < s.input.length && s.input[s.position] === '=') {
                ++s.position;
                return { tokenType: TokenKind.ExclamationEqualsEquals, offset: start, length: 3, modeStack: s.modeStack };
            }
            return { tokenType: TokenKind.ExclamationEquals, offset: start, length: 2, modeStack: s.modeStack };
        }

        return { tokenType: TokenKind.Exclamation, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingPlus(s: LexerState) {

        let start = s.position;

        if (++s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.PlusEquals, offset: start, length: 2, modeStack: s.modeStack };
                case '+':
                    ++s.position;
                    return { tokenType: TokenKind.PlusPlus, offset: start, length: 2, modeStack: s.modeStack };
                default:
                    break;

            }

        }

        return { tokenType: TokenKind.Plus, offset: start, length: 1, modeStack: s.modeStack };

    }

    function scriptingEquals(s: LexerState) {

        let start = s.position;

        if (++s.position < s.input.length) {
            switch (s.input[s.position]) {
                case '=':
                    if (++s.position < s.input.length && s.input[s.position] === '=') {
                        ++s.position;
                        return { tokenType: TokenKind.EqualsEqualsEquals, offset: start, length: 3, modeStack: s.modeStack };
                    }
                    return { tokenType: TokenKind.EqualsEquals, offset: start, length: 2, modeStack: s.modeStack };
                case '>':
                    ++s.position;
                    return { tokenType: TokenKind.FatArrow, offset: start, length: 2, modeStack: s.modeStack };
                default:
                    break;
            }
        }

        return { tokenType: TokenKind.Equals, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingDot(s: LexerState) {
        let start = s.position;

        if (++s.position < s.input.length) {
            let c = s.input[s.position];
            if (c === '=') {
                ++s.position;
                return { tokenType: TokenKind.DotEquals, offset: start, length: 2, modeStack: s.modeStack };
            } else if (c === '.' && s.position + 1 < s.input.length && s.input[s.position + 1] === '.') {
                s.position += 2;
                return { tokenType: TokenKind.Ellipsis, offset: start, length: 3, modeStack: s.modeStack };
            } else if (c >= '0' && c <= '9') {
                //float
                return scriptingNumericStartingWithDotOrE(s, start, true);
            }
        }
        return { tokenType: TokenKind.Dot, offset: start, length: 1, modeStack: s.modeStack };
    }

    function scriptingMinus(s: LexerState) {

        let start = s.position;
        let modeStack = s.modeStack;

        if (++s.position < s.input.length) {

            switch (s.input[s.position]) {
                case '>':
                    ++s.position;
                    s.modeStack = s.modeStack.slice(0);
                    s.modeStack.push(LexerMode.LookingForProperty);
                    return { tokenType: TokenKind.Arrow, offset: start, length: 2, modeStack: modeStack };
                case '-':
                    ++s.position;
                    return { tokenType: TokenKind.MinusMinus, offset: start, length: 2, modeStack: modeStack };
                case '=':
                    ++s.position;
                    return { tokenType: TokenKind.MinusEquals, offset: start, length: 2, modeStack: modeStack };
                default:
                    break;
            }

        }

        return { tokenType: TokenKind.Minus, offset: start, length: 1, modeStack: s.modeStack };
    }

}

export function tokenTypeToString(type: TokenKind) {
    switch (type) {
        case TokenKind.Unknown:
            return 'Unknown';
        case TokenKind.EndOfFile:
            return 'EndOfFile';
        case TokenKind.Abstract:
            return 'Abstract';
        case TokenKind.Array:
            return 'Array';
        case TokenKind.As:
            return 'As';
        case TokenKind.Break:
            return 'Break';
        case TokenKind.Callable:
            return 'Callable';
        case TokenKind.Case:
            return 'Case';
        case TokenKind.Catch:
            return 'Catch';
        case TokenKind.Class:
            return 'Class';
        case TokenKind.ClassConstant:
            return 'ClassConstant';
        case TokenKind.Clone:
            return 'Clone';
        case TokenKind.Const:
            return 'Const';
        case TokenKind.Continue:
            return 'Continue';
        case TokenKind.Declare:
            return 'Declare';
        case TokenKind.Default:
            return 'Default';
        case TokenKind.Do:
            return 'Do';
        case TokenKind.Echo:
            return 'Echo';
        case TokenKind.Else:
            return 'Else';
        case TokenKind.ElseIf:
            return 'ElseIf';
        case TokenKind.Empty:
            return 'Empty';
        case TokenKind.EndDeclare:
            return 'EndDeclare';
        case TokenKind.EndFor:
            return 'EndFor';
        case TokenKind.EndForeach:
            return 'EndForeach';
        case TokenKind.EndIf:
            return 'EndIf';
        case TokenKind.EndSwitch:
            return 'EndSwitch';
        case TokenKind.EndWhile:
            return 'EndWhile';
        case TokenKind.EndHeredoc:
            return 'EndHeredoc';
        case TokenKind.Eval:
            return 'Eval';
        case TokenKind.Exit:
            return 'Exit';
        case TokenKind.Extends:
            return 'Extends';
        case TokenKind.Final:
            return 'Final';
        case TokenKind.Finally:
            return 'Finally';
        case TokenKind.For:
            return 'For';
        case TokenKind.ForEach:
            return 'ForEach';
        case TokenKind.Function:
            return 'Function';
        case TokenKind.Global:
            return 'Global';
        case TokenKind.Goto:
            return 'Goto';
        case TokenKind.HaltCompiler:
            return 'HaltCompiler';
        case TokenKind.If:
            return 'If';
        case TokenKind.Implements:
            return 'Implements';
        case TokenKind.Include:
            return 'Include';
        case TokenKind.IncludeOnce:
            return 'IncludeOnce';
        case TokenKind.InstanceOf:
            return 'InstanceOf';
        case TokenKind.InsteadOf:
            return 'InsteadOf';
        case TokenKind.Interface:
            return 'Interface';
        case TokenKind.Isset:
            return 'Isset';
        case TokenKind.List:
            return 'List';
        case TokenKind.And:
            return 'And';
        case TokenKind.Or:
            return 'Or';
        case TokenKind.Xor:
            return 'Xor';
        case TokenKind.Namespace:
            return 'Namespace';
        case TokenKind.New:
            return 'New';
        case TokenKind.Print:
            return 'Print';
        case TokenKind.Private:
            return 'Private';
        case TokenKind.Public:
            return 'Public';
        case TokenKind.Protected:
            return 'Protected';
        case TokenKind.Require:
            return 'Require';
        case TokenKind.RequireOnce:
            return 'RequireOnce';
        case TokenKind.Return:
            return 'Return';
        case TokenKind.Static:
            return 'Static';
        case TokenKind.Switch:
            return 'Switch';
        case TokenKind.Throw:
            return 'Throw';
        case TokenKind.Trait:
            return 'Trait';
        case TokenKind.Try:
            return 'Try';
        case TokenKind.Unset:
            return 'Unset';
        case TokenKind.Use:
            return 'Use';
        case TokenKind.Var:
            return 'Var';
        case TokenKind.While:
            return 'While';
        case TokenKind.Yield:
            return 'Yield';
        case TokenKind.YieldFrom:
            return 'YieldFrom';
        case TokenKind.DirectoryConstant:
            return 'DirectoryConstant';
        case TokenKind.FileConstant:
            return 'FileConstant';
        case TokenKind.LineConstant:
            return 'LineConstant';
        case TokenKind.FunctionConstant:
            return 'FunctionConstant';
        case TokenKind.MethodConstant:
            return 'MethodConstant';
        case TokenKind.NamespaceConstant:
            return 'NamespaceConstant';
        case TokenKind.TraitConstant:
            return 'TraitConstant';
        case TokenKind.StringLiteral:
            return 'StringLiteral';
        case TokenKind.FloatingLiteral:
            return 'FloatingLiteral';
        case TokenKind.EncapsulatedAndWhitespace:
            return 'EncapsulatedAndWhitespace';
        case TokenKind.Text:
            return 'Text';
        case TokenKind.IntegerLiteral:
            return 'IntegerLiteral';
        case TokenKind.Name:
            return 'Name';
        case TokenKind.VariableName:
            return 'VariableName';
        case TokenKind.Equals:
            return 'Equals';
        case TokenKind.Tilde:
            return 'Tilde';
        case TokenKind.Colon:
            return 'Colon';
        case TokenKind.Semicolon:
            return 'Semicolon';
        case TokenKind.Exclamation:
            return 'Exclamation';
        case TokenKind.Dollar:
            return 'Dollar';
        case TokenKind.ForwardSlash:
            return 'ForwardSlash';
        case TokenKind.Percent:
            return 'Percent';
        case TokenKind.Comma:
            return 'Comma';
        case TokenKind.AtSymbol:
            return 'AtSymbol';
        case TokenKind.Backtick:
            return 'Backtick';
        case TokenKind.Question:
            return 'Question';
        case TokenKind.DoubleQuote:
            return 'DoubleQuote';
        case TokenKind.SingleQuote:
            return 'SingleQuote';
        case TokenKind.LessThan:
            return 'LessThan';
        case TokenKind.GreaterThan:
            return 'GreaterThan';
        case TokenKind.Asterisk:
            return 'Asterisk';
        case TokenKind.AmpersandAmpersand:
            return 'AmpersandAmpersand';
        case TokenKind.Ampersand:
            return 'Ampersand';
        case TokenKind.AmpersandEquals:
            return 'AmpersandEquals';
        case TokenKind.CaretEquals:
            return 'CaretEquals';
        case TokenKind.LessThanLessThan:
            return 'LessThanLessThan';
        case TokenKind.LessThanLessThanEquals:
            return 'LessThanLessThanEquals';
        case TokenKind.GreaterThanGreaterThan:
            return 'GreaterThanGreaterThan';
        case TokenKind.GreaterThanGreaterThanEquals:
            return 'GreaterThanGreaterThanEquals';
        case TokenKind.BarEquals:
            return 'BarEquals';
        case TokenKind.Plus:
            return 'Plus';
        case TokenKind.PlusEquals:
            return 'PlusEquals';
        case TokenKind.AsteriskAsterisk:
            return 'AsteriskAsterisk';
        case TokenKind.AsteriskAsteriskEquals:
            return 'AsteriskAsteriskEquals';
        case TokenKind.Arrow:
            return 'Arrow';
        case TokenKind.OpenBrace:
            return 'OpenBrace';
        case TokenKind.OpenBracket:
            return 'OpenBracket';
        case TokenKind.OpenParenthesis:
            return 'OpenParenthesis';
        case TokenKind.CloseBrace:
            return 'CloseBrace';
        case TokenKind.CloseBracket:
            return 'CloseBracket';
        case TokenKind.CloseParenthesis:
            return 'CloseParenthesis';
        case TokenKind.QuestionQuestion:
            return 'QuestionQuestion';
        case TokenKind.Bar:
            return 'Bar';
        case TokenKind.BarBar:
            return 'BarBar';
        case TokenKind.Caret:
            return 'Caret';
        case TokenKind.Dot:
            return 'Dot';
        case TokenKind.DotEquals:
            return 'DotEquals';
        case TokenKind.CurlyOpen:
            return 'CurlyOpen';
        case TokenKind.MinusMinus:
            return 'MinusMinus';
        case TokenKind.ForwardslashEquals:
            return 'ForwardslashEquals';
        case TokenKind.DollarCurlyOpen:
            return 'DollarCurlyOpen';
        case TokenKind.FatArrow:
            return 'FatArrow';
        case TokenKind.ColonColon:
            return 'ColonColon';
        case TokenKind.Ellipsis:
            return 'Ellipsis';
        case TokenKind.PlusPlus:
            return 'PlusPlus';
        case TokenKind.EqualsEquals:
            return 'EqualsEquals';
        case TokenKind.GreaterThanEquals:
            return 'GreaterThanEquals';
        case TokenKind.EqualsEqualsEquals:
            return 'EqualsEqualsEquals';
        case TokenKind.ExclamationEquals:
            return 'ExclamationEquals';
        case TokenKind.ExclamationEqualsEquals:
            return 'ExclamationEqualsEquals';
        case TokenKind.LessThanEquals:
            return 'LessThanEquals';
        case TokenKind.Spaceship:
            return 'Spaceship';
        case TokenKind.Minus:
            return 'Minus';
        case TokenKind.MinusEquals:
            return 'MinusEquals';
        case TokenKind.PercentEquals:
            return 'PercentEquals';
        case TokenKind.AsteriskEquals:
            return 'AsteriskEquals';
        case TokenKind.Backslash:
            return 'Backslash';
        case TokenKind.BooleanCast:
            return 'BooleanCast';
        case TokenKind.UnsetCast:
            return 'UnsetCast';
        case TokenKind.StringCast:
            return 'StringCast';
        case TokenKind.ObjectCast:
            return 'ObjectCast';
        case TokenKind.IntegerCast:
            return 'IntegerCast';
        case TokenKind.FloatCast:
            return 'FloatCast';
        case TokenKind.StartHeredoc:
            return 'StartHeredoc';
        case TokenKind.ArrayCast:
            return 'ArrayCast';
        case TokenKind.OpenTag:
            return 'OpenTag';
        case TokenKind.OpenTagEcho:
            return 'OpenTagEcho';
        case TokenKind.CloseTag:
            return 'CloseTag';
        case TokenKind.Comment:
            return 'Comment';
        case TokenKind.DocumentComment:
            return 'DocumentComment';
        case TokenKind.Whitespace:
            return 'Whitespace';
    }
}