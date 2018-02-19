/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import {Phrase, PhraseType} from '../parser/phrase';
import{Token, TokenType} from '../parser/lexer';
import {PackedRange} from '../types';
import {Reference} from '../reference';
import * as lsp from 'vscode-languageserver-types';

export interface NodeTransformer {
    tokenType?:TokenType;
    phraseType?:PhraseType;
    node:Phrase|Token;
    push(transform: NodeTransformer);
}

export interface ReferencePhrase extends Phrase {
    reference:Reference;
}
