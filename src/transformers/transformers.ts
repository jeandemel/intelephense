/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import {Phrase, PhraseType, Token, TokenType} from 'php7parser';
import * as lsp from 'vscode-languageserver-types';

export interface NodeTransformer {
    tokenType?:TokenType;
    phraseType?:PhraseType;
    push(transform: NodeTransformer);
    onPopped?:()=>void;
}

export interface NamedPhrase extends Phrase {
    name:string;
}

export interface FqnPhrase extends Phrase {
    fqn:string;
}

export interface ScopedPhrase extends Phrase {
    scope:string;
}

export interface TypedPhrase extends Phrase {
    type:string;
}

export interface RangedPhrase extends Phrase {
    range:[number, number];
}