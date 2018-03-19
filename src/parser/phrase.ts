/* Copyright (c) Ben Robert Mewburn 
 * Licensed under the ISC Licence.
 */

'use strict';

import { Token, TokenKind } from './lexer';

export const enum PhraseKind {
    Unknown = 1000,
    AdditiveExpression,
    AnonymousClassDeclaration,
    AnonymousClassDeclarationHeader,
    AnonymousFunctionCreationExpression,
    AnonymousFunctionHeader,
    AnonymousFunctionUseClause,
    AnonymousFunctionUseVariable,
    ArgumentExpressionList,
    ArrayCreationExpression,
    ArrayElement,
    ArrayInitialiserList,
    ArrayKey,
    ArrayValue,
    BitwiseExpression,
    BreakStatement,
    ByRefAssignmentExpression,
    CaseStatement,
    CaseStatementList,
    CastExpression,
    CatchClause,
    CatchClauseList,
    CatchNameList,
    ClassBaseClause,
    ClassConstantAccessExpression,
    ClassConstDeclaration,
    ClassConstElement,
    ClassConstElementList,
    ClassDeclaration,
    ClassDeclarationBody,
    ClassDeclarationHeader,
    ClassInterfaceClause,
    ClassMemberDeclarationList,
    ClassModifiers,
    ClassTypeDesignator,
    CloneExpression,
    ClosureUseList,
    CoalesceExpression,
    CompoundAssignmentExpression,
    CompoundStatement,
    TernaryExpression,
    ConstantAccessExpression,
    ConstDeclaration,
    ConstElement,
    ConstElementList,
    ContinueStatement,
    DeclareDirective,
    DeclareStatement,
    DefaultArgumentSpecifier,
    DefaultStatement,
    DocBlock,
    DoStatement,
    DoubleQuotedStringLiteral,
    EchoIntrinsic,
    ElseClause,
    ElseIfClause,
    ElseIfClauseList,
    EmptyIntrinsic,
    EncapsulatedExpression,
    EncapsulatedVariable,
    EncapsulatedVariableList,
    EqualityExpression,
    Error,
    ErrorControlExpression,
    EvalIntrinsic,
    ExitIntrinsic,
    ExponentiationExpression,
    ExpressionList,
    ExpressionStatement,
    FinallyClause,
    ForControl,
    ForeachCollection,
    ForeachKey,
    ForeachStatement,
    ForeachValue,
    ForEndOfLoop,
    ForExpressionGroup,
    ForInitialiser,
    ForStatement,
    FullyQualifiedName,
    FunctionCallExpression,
    FunctionDeclaration,
    FunctionDeclarationBody,
    FunctionDeclarationHeader,
    FunctionStaticDeclaration,
    FunctionStaticInitialiser,
    GlobalDeclaration,
    GotoStatement,
    HaltCompilerStatement,
    HeredocStringLiteral,
    Identifier,
    IfStatement,
    IncludeExpression,
    IncludeOnceExpression,
    InlineText,
    InstanceOfExpression,
    InstanceofTypeDesignator,
    InterfaceBaseClause,
    InterfaceDeclaration,
    InterfaceDeclarationBody,
    InterfaceDeclarationHeader,
    InterfaceMemberDeclarationList,
    IssetIntrinsic,
    ListIntrinsic,
    LogicalExpression,
    MemberModifierList,
    MemberName,
    MethodCallExpression,
    MethodDeclaration,
    MethodDeclarationBody,
    MethodDeclarationHeader,
    MethodReference,
    MultiplicativeExpression,
    NamedLabelStatement,
    NamespaceAliasingClause,
    NamespaceDefinition,
    NamespaceDefinitionHeader,
    NamespaceDefinitionBody,
    NamespaceName,
    NamespaceUseClause,
    NamespaceUseClauseList,
    NamespaceUseDeclaration,
    NamespaceUseGroupClause,
    NamespaceUseGroupClauseList,
    NullStatement,
    ObjectCreationExpression,
    ParameterDeclaration,
    ParameterDeclarationList,
    PostfixDecrementExpression,
    PostfixIncrementExpression,
    PrefixDecrementExpression,
    PrefixIncrementExpression,
    PrintIntrinsic,
    PropertyAccessExpression,
    PropertyDeclaration,
    PropertyElement,
    PropertyElementList,
    PropertyInitialiser,
    QualifiedName,
    QualifiedNameList,
    RelationalExpression,
    RelativeQualifiedName,
    RelativeScope,
    RequireExpression,
    RequireOnceExpression,
    ReturnStatement,
    ReturnType,
    ScopedCallExpression,
    ScopedMemberName,
    ScopedPropertyAccessExpression,
    ShellCommandExpression,
    ShiftExpression,
    SimpleAssignmentExpression,
    SimpleVariable,
    StatementList,
    StaticVariableDeclaration,
    StaticVariableDeclarationList,
    SubscriptExpression,
    SwitchStatement,
    ThrowStatement,
    TraitAdaptationList,
    TraitAlias,
    TraitDeclaration,
    TraitDeclarationBody,
    TraitDeclarationHeader,
    TraitMemberDeclarationList,
    TraitPrecedence,
    TraitUseClause,
    TraitUseSpecification,
    TryStatement,
    TypeDeclaration,
    UnaryOpExpression,
    UnsetIntrinsic,
    VariableList,
    VariableNameList,
    VariadicUnpacking,
    WhileStatement,
    YieldExpression,
    YieldFromExpression,
    TopStatementList
}

export interface Phrase {
    /**
     * Phrase type
     */
    phraseType: PhraseKind;

    /**
     * Phrase and token child nodes
     */
    children: (Phrase | Token)[];

}

export interface ParseError extends Phrase {

    /**
    * The token that prompted the parse error
    */
    unexpected: Token;

    /**
     * The expected token type
     */
    expected?: TokenType;

}

export namespace Phrase {
    export function create(type: PhraseKind, children: (Phrase | Token)[]) {
        return <Phrase>{ phraseType: type, children: children }
    }

    export function createParseError(children: (Phrase | Token)[], unexpected: Token, expected?: TokenKind) {
        const err = <ParseError>{
            phraseType: PhraseKind.Error,
            children: children,
            unexpected: unexpected
        }

        if(expected) {
            err.expected = expected;
        }
        return err;
    }
}

export function phraseTypeToString(type: PhraseKind) {

    switch (type) {
        case PhraseKind.Unknown:
            return 'Unknown';
        case PhraseKind.AdditiveExpression:
            return 'AdditiveExpression';
        case PhraseKind.AnonymousClassDeclaration:
            return 'AnonymousClassDeclaration';
        case PhraseKind.AnonymousClassDeclarationHeader:
            return 'AnonymousClassDeclarationHeader';
        case PhraseKind.AnonymousFunctionCreationExpression:
            return 'AnonymousFunctionCreationExpression';
        case PhraseKind.AnonymousFunctionHeader:
            return 'AnonymousFunctionHeader';
        case PhraseKind.AnonymousFunctionUseClause:
            return 'AnonymousFunctionUseClause';
        case PhraseKind.AnonymousFunctionUseVariable:
            return 'AnonymousFunctionUseVariable';
        case PhraseKind.ArgumentExpressionList:
            return 'ArgumentExpressionList';
        case PhraseKind.ArrayCreationExpression:
            return 'ArrayCreationExpression';
        case PhraseKind.ArrayElement:
            return 'ArrayElement';
        case PhraseKind.ArrayInitialiserList:
            return 'ArrayInitialiserList';
        case PhraseKind.ArrayKey:
            return 'ArrayKey';
        case PhraseKind.ArrayValue:
            return 'ArrayValue';
        case PhraseKind.BitwiseExpression:
            return 'BitwiseExpression';
        case PhraseKind.BreakStatement:
            return 'BreakStatement';
        case PhraseKind.ByRefAssignmentExpression:
            return 'ByRefAssignmentExpression';
        case PhraseKind.CaseStatement:
            return 'CaseStatement';
        case PhraseKind.CaseStatementList:
            return 'CaseStatementList';
        case PhraseKind.CastExpression:
            return 'CastExpression';
        case PhraseKind.CatchClause:
            return 'CatchClause';
        case PhraseKind.CatchClauseList:
            return 'CatchClauseList';
        case PhraseKind.CatchNameList:
            return 'CatchNameList';
        case PhraseKind.ClassBaseClause:
            return 'ClassBaseClause';
        case PhraseKind.ClassConstantAccessExpression:
            return 'ClassConstantAccessExpression';
        case PhraseKind.ClassConstDeclaration:
            return 'ClassConstDeclaration';
        case PhraseKind.ClassConstElement:
            return 'ClassConstElement';
        case PhraseKind.ClassConstElementList:
            return 'ClassConstElementList';
        case PhraseKind.ClassDeclaration:
            return 'ClassDeclaration';
        case PhraseKind.ClassDeclarationBody:
            return 'ClassDeclarationBody';
        case PhraseKind.ClassDeclarationHeader:
            return 'ClassDeclarationHeader';
        case PhraseKind.ClassInterfaceClause:
            return 'ClassInterfaceClause';
        case PhraseKind.ClassMemberDeclarationList:
            return 'ClassMemberDeclarationList';
        case PhraseKind.ClassModifiers:
            return 'ClassModifiers';
        case PhraseKind.ClassTypeDesignator:
            return 'ClassTypeDesignator';
        case PhraseKind.CloneExpression:
            return 'CloneExpression';
        case PhraseKind.ClosureUseList:
            return 'ClosureUseList';
        case PhraseKind.CoalesceExpression:
            return 'CoalesceExpression';
        case PhraseKind.CompoundAssignmentExpression:
            return 'CompoundAssignmentExpression';
        case PhraseKind.CompoundStatement:
            return 'CompoundStatement';
        case PhraseKind.TernaryExpression:
            return 'TernaryExpression';
        case PhraseKind.ConstantAccessExpression:
            return 'ConstantAccessExpression';
        case PhraseKind.ConstDeclaration:
            return 'ConstDeclaration';
        case PhraseKind.ConstElement:
            return 'ConstElement';
        case PhraseKind.ConstElementList:
            return 'ConstElementList';
        case PhraseKind.ContinueStatement:
            return 'ContinueStatement';
        case PhraseKind.DeclareDirective:
            return 'DeclareDirective';
        case PhraseKind.DeclareStatement:
            return 'DeclareStatement';
        case PhraseKind.DefaultArgumentSpecifier:
            return 'DefaultArgumentSpecifier';
        case PhraseKind.DefaultStatement:
            return 'DefaultStatement';
        case PhraseKind.DoStatement:
            return 'DoStatement';
        case PhraseKind.DoubleQuotedStringLiteral:
            return 'DoubleQuotedStringLiteral';
        case PhraseKind.EchoIntrinsic:
            return 'EchoIntrinsic';
        case PhraseKind.ElseClause:
            return 'ElseClause';
        case PhraseKind.ElseIfClause:
            return 'ElseIfClause';
        case PhraseKind.ElseIfClauseList:
            return 'ElseIfClauseList';
        case PhraseKind.EmptyIntrinsic:
            return 'EmptyIntrinsic';
        case PhraseKind.EncapsulatedExpression:
            return 'EncapsulatedExpression';
        case PhraseKind.EncapsulatedVariable:
            return 'EncapsulatedVariable';
        case PhraseKind.EncapsulatedVariableList:
            return 'EncapsulatedVariableList';
        case PhraseKind.EqualityExpression:
            return 'EqualityExpression';
        case PhraseKind.Error:
            return 'Error';
        case PhraseKind.ErrorControlExpression:
            return 'ErrorControlExpression';
        case PhraseKind.EvalIntrinsic:
            return 'EvalIntrinsic';
        case PhraseKind.ExitIntrinsic:
            return 'ExitIntrinsic';
        case PhraseKind.ExponentiationExpression:
            return 'ExponentiationExpression';
        case PhraseKind.ExpressionList:
            return 'ExpressionList';
        case PhraseKind.ExpressionStatement:
            return 'ExpressionStatement';
        case PhraseKind.FinallyClause:
            return 'FinallyClause';
        case PhraseKind.ForControl:
            return 'ForControl';
        case PhraseKind.ForeachCollection:
            return 'ForeachCollection';
        case PhraseKind.ForeachKey:
            return 'ForeachKey';
        case PhraseKind.ForeachStatement:
            return 'ForeachStatement';
        case PhraseKind.ForeachValue:
            return 'ForeachValue';
        case PhraseKind.ForEndOfLoop:
            return 'ForEndOfLoop';
        case PhraseKind.ForExpressionGroup:
            return 'ForExpressionGroup';
        case PhraseKind.ForInitialiser:
            return 'ForInitialiser';
        case PhraseKind.ForStatement:
            return 'ForStatement';
        case PhraseKind.FullyQualifiedName:
            return 'FullyQualifiedName';
        case PhraseKind.FunctionCallExpression:
            return 'FunctionCallExpression';
        case PhraseKind.FunctionDeclaration:
            return 'FunctionDeclaration';
        case PhraseKind.FunctionDeclarationHeader:
            return 'FunctionDeclarationHeader';
        case PhraseKind.FunctionDeclarationBody:
            return 'FunctionDeclarationBody';
        case PhraseKind.FunctionStaticDeclaration:
            return 'FunctionStaticDeclaration';
        case PhraseKind.FunctionStaticInitialiser:
            return 'FunctionStaticInitialiser';
        case PhraseKind.GlobalDeclaration:
            return 'GlobalDeclaration';
        case PhraseKind.GotoStatement:
            return 'GotoStatement';
        case PhraseKind.HaltCompilerStatement:
            return 'HaltCompilerStatement';
        case PhraseKind.HeredocStringLiteral:
            return 'HeredocStringLiteral';
        case PhraseKind.Identifier:
            return 'Identifier';
        case PhraseKind.IfStatement:
            return 'IfStatement';
        case PhraseKind.IncludeExpression:
            return 'IncludeExpression';
        case PhraseKind.IncludeOnceExpression:
            return 'IncludeOnceExpression';
        case PhraseKind.InlineText:
            return 'InlineText';
        case PhraseKind.InstanceOfExpression:
            return 'InstanceOfExpression';
        case PhraseKind.InstanceofTypeDesignator:
            return 'InstanceofTypeDesignator';
        case PhraseKind.InterfaceBaseClause:
            return 'InterfaceBaseClause';
        case PhraseKind.InterfaceDeclaration:
            return 'InterfaceDeclaration';
        case PhraseKind.InterfaceDeclarationBody:
            return 'InterfaceDeclarationBody';
        case PhraseKind.InterfaceDeclarationHeader:
            return 'InterfaceDeclarationHeader';
        case PhraseKind.InterfaceMemberDeclarationList:
            return 'InterfaceMemberDeclarationList';
        case PhraseKind.IssetIntrinsic:
            return 'IssetIntrinsic';
        case PhraseKind.ListIntrinsic:
            return 'ListIntrinsic';
        case PhraseKind.LogicalExpression:
            return 'LogicalExpression';
        case PhraseKind.MemberModifierList:
            return 'MemberModifierList';
        case PhraseKind.MemberName:
            return 'MemberName';
        case PhraseKind.MethodCallExpression:
            return 'MethodCallExpression';
        case PhraseKind.MethodDeclaration:
            return 'MethodDeclaration';
        case PhraseKind.MethodDeclarationBody:
            return 'MethodDeclarationBody';
        case PhraseKind.MethodDeclarationHeader:
            return 'MethodDeclarationHeader';
        case PhraseKind.MethodReference:
            return 'MethodReference';
        case PhraseKind.MultiplicativeExpression:
            return 'MultiplicativeExpression';
        case PhraseKind.NamedLabelStatement:
            return 'NamedLabelStatement';
        case PhraseKind.NamespaceAliasingClause:
            return 'NamespaceAliasingClause';
        case PhraseKind.NamespaceDefinition:
            return 'NamespaceDefinition';
        case PhraseKind.NamespaceName:
            return 'NamespaceName';
        case PhraseKind.NamespaceUseClause:
            return 'NamespaceUseClause';
        case PhraseKind.NamespaceUseClauseList:
            return 'NamespaceUseClauseList';
        case PhraseKind.NamespaceUseDeclaration:
            return 'NamespaceUseDeclaration';
        case PhraseKind.NamespaceUseGroupClause:
            return 'NamespaceUseGroupClause';
        case PhraseKind.NamespaceUseGroupClauseList:
            return 'NamespaceUseGroupClauseList';
        case PhraseKind.NullStatement:
            return 'NullStatement';
        case PhraseKind.ObjectCreationExpression:
            return 'ObjectCreationExpression';
        case PhraseKind.ParameterDeclaration:
            return 'ParameterDeclaration';
        case PhraseKind.ParameterDeclarationList:
            return 'ParameterDeclarationList';
        case PhraseKind.PostfixDecrementExpression:
            return 'PostfixDecrementExpression';
        case PhraseKind.PostfixIncrementExpression:
            return 'PostfixIncrementExpression';
        case PhraseKind.PrefixDecrementExpression:
            return 'PrefixDecrementExpression';
        case PhraseKind.PrefixIncrementExpression:
            return 'PrefixIncrementExpression';
        case PhraseKind.PrintIntrinsic:
            return 'PrintIntrinsic';
        case PhraseKind.PropertyAccessExpression:
            return 'PropertyAccessExpression';
        case PhraseKind.PropertyDeclaration:
            return 'PropertyDeclaration';
        case PhraseKind.PropertyElement:
            return 'PropertyElement';
        case PhraseKind.PropertyElementList:
            return 'PropertyElementList';
        case PhraseKind.PropertyInitialiser:
            return 'PropertyInitialiser';
        case PhraseKind.QualifiedName:
            return 'QualifiedName';
        case PhraseKind.QualifiedNameList:
            return 'QualifiedNameList';
        case PhraseKind.RelationalExpression:
            return 'RelationalExpression';
        case PhraseKind.RelativeQualifiedName:
            return 'RelativeQualifiedName';
        case PhraseKind.RelativeScope:
            return 'RelativeScope';
        case PhraseKind.RequireExpression:
            return 'RequireExpression';
        case PhraseKind.RequireOnceExpression:
            return 'RequireOnceExpression';
        case PhraseKind.ReturnStatement:
            return 'ReturnStatement';
        case PhraseKind.ReturnType:
            return 'ReturnType';
        case PhraseKind.ScopedCallExpression:
            return 'ScopedCallExpression';
        case PhraseKind.ScopedMemberName:
            return 'ScopedMemberName';
        case PhraseKind.ScopedPropertyAccessExpression:
            return 'ScopedPropertyAccessExpression';
        case PhraseKind.ShellCommandExpression:
            return 'ShellCommandExpression';
        case PhraseKind.ShiftExpression:
            return 'ShiftExpression';
        case PhraseKind.SimpleAssignmentExpression:
            return 'SimpleAssignmentExpression';
        case PhraseKind.SimpleVariable:
            return 'SimpleVariable';
        case PhraseKind.StatementList:
            return 'StatementList';
        case PhraseKind.StaticVariableDeclaration:
            return 'StaticVariableDeclaration';
        case PhraseKind.StaticVariableDeclarationList:
            return 'StaticVariableDeclarationList';
        case PhraseKind.SubscriptExpression:
            return 'SubscriptExpression';
        case PhraseKind.SwitchStatement:
            return 'SwitchStatement';
        case PhraseKind.ThrowStatement:
            return 'ThrowStatement';
        case PhraseKind.TraitAdaptationList:
            return 'TraitAdaptationList';
        case PhraseKind.TraitAlias:
            return 'TraitAlias';
        case PhraseKind.TraitDeclaration:
            return 'TraitDeclaration';
        case PhraseKind.TraitDeclarationBody:
            return 'TraitDeclarationBody';
        case PhraseKind.TraitDeclarationHeader:
            return 'TraitDeclarationHeader';
        case PhraseKind.TraitMemberDeclarationList:
            return 'TraitMemberDeclarationList';
        case PhraseKind.TraitPrecedence:
            return 'TraitPrecedence';
        case PhraseKind.TraitUseClause:
            return 'TraitUseClause';
        case PhraseKind.TraitUseSpecification:
            return 'TraitUseSpecification';
        case PhraseKind.TryStatement:
            return 'TryStatement';
        case PhraseKind.TypeDeclaration:
            return 'TypeDeclaration';
        case PhraseKind.UnaryOpExpression:
            return 'UnaryOpExpression';
        case PhraseKind.UnsetIntrinsic:
            return 'UnsetIntrinsic';
        case PhraseKind.VariableList:
            return 'VariableList';
        case PhraseKind.VariableNameList:
            return 'VariableNameList';
        case PhraseKind.VariadicUnpacking:
            return 'VariadicUnpacking';
        case PhraseKind.WhileStatement:
            return 'WhileStatement';
        case PhraseKind.YieldExpression:
            return 'YieldExpression';
        case PhraseKind.YieldFromExpression:
            return 'YieldFromExpression';
        case PhraseKind.DocBlock:
            return 'DocBlock';
        default:
            return '';
    }
}
