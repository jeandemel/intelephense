/* Copyright (c) Ben Robert Mewburn
 * Licensed under the ISC Licence.
 */

'use strict';

import {Phrase, PhraseKind} from '../parser/phrase';
import{Token, TokenKind} from '../parser/lexer';
import {PackedRange} from '../types';
import {Reference} from '../symbol/symbol';
import * as lsp from 'vscode-languageserver-types';
import {PhpDoc} from '../phpDoc';

export interface NodeTransformer {
    node:Phrase|Token;
    push(transform: NodeTransformer);
}

export interface ReferencePhrase extends Phrase {
    reference:Reference;
}

export interface PhpDocPhrase extends Phrase {
    doc:PhpDoc;
}
