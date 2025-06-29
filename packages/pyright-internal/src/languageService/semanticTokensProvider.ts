import {
    CancellationToken,
    SemanticTokenModifiers,
    SemanticTokenTypes,
    SemanticTokens,
    SemanticTokensBuilder,
} from 'vscode-languageserver';
import { throwIfCancellationRequested } from '../common/cancellationUtils';
import { ProgramView } from '../common/extensibility';
import { convertOffsetsToRange } from '../common/positionUtils';
import { Uri } from '../common/uri/uri';
import { ParseFileResults } from '../parser/parser';
import { SemanticTokensWalker } from '../analyzer/semanticTokensWalker';
import { Token } from '../parser/tokenizerTypes';

export enum CustomSemanticTokenTypes {
    selfParameter = 'selfParameter',
    clsParameter = 'clsParameter',
}

export enum CustomSemanticTokenModifiers {
    builtin = 'builtin', // parity with pylance
}

export const tokenTypes: string[] = [
    SemanticTokenTypes.class,
    SemanticTokenTypes.parameter,
    SemanticTokenTypes.typeParameter,
    SemanticTokenTypes.function,
    SemanticTokenTypes.method,
    SemanticTokenTypes.decorator,
    SemanticTokenTypes.property,
    SemanticTokenTypes.namespace,
    SemanticTokenTypes.variable,
    SemanticTokenTypes.type,
    SemanticTokenTypes.keyword,
    SemanticTokenTypes.operator,
    SemanticTokenTypes.string,
    SemanticTokenTypes.number,
    SemanticTokenTypes.comment,
    SemanticTokenTypes.regexp,
    SemanticTokenTypes.enumMember,
    SemanticTokenTypes.struct,
    SemanticTokenTypes.event,
    SemanticTokenTypes.interface,
    SemanticTokenTypes.enum,
    SemanticTokenTypes.macro,
    SemanticTokenTypes.label,
    CustomSemanticTokenTypes.selfParameter,
    CustomSemanticTokenTypes.clsParameter,
];

export const tokenModifiers: string[] = [
    SemanticTokenModifiers.definition,
    SemanticTokenModifiers.declaration,
    SemanticTokenModifiers.async,
    SemanticTokenModifiers.readonly,
    SemanticTokenModifiers.defaultLibrary,
    SemanticTokenModifiers.modification,
    SemanticTokenModifiers.static,
    SemanticTokenModifiers.abstract,
    SemanticTokenModifiers.deprecated,
    SemanticTokenModifiers.documentation,
    CustomSemanticTokenModifiers.builtin,
];

export const SemanticTokensProviderLegend = {
    tokenTypes: tokenTypes,
    tokenModifiers: tokenModifiers,
};

function encodeTokenType(type: string): number {
    const idx = tokenTypes.indexOf(type);
    if (idx === -1) {
        throw new Error(`Unknown token type: ${type}`);
    }
    return idx;
}

function encodeTokenModifiers(modifiers: string[]): number {
    let data = 0;
    for (const t of modifiers) {
        const idx = tokenModifiers.indexOf(t);
        if (idx === undefined) {
            continue;
        }
        data |= 1 << idx;
    }
    return data;
}

export class SemanticTokensProvider {
    private readonly _parseResults: ParseFileResults | undefined;

    constructor(private _program: ProgramView, private _fileUri: Uri, private _token: CancellationToken) {
        this._parseResults = this._program.getParseResults(this._fileUri);
    }

    onSemanticTokens(): SemanticTokens {
        const builder = new SemanticTokensBuilder();
        if (!this._parseResults) {
            return builder.build();
        }

        const tokens = this._parseResults.tokenizerOutput.tokens;
        const tokensArray: Token[] = [];
        for (let i = 0; i < tokens.count; i++) {
            tokensArray.push(tokens.getItemAt(i));
        }

        const walker = new SemanticTokensWalker(
            this._program.evaluator!,
            tokensArray,
            true // true = comprehensive tokens (include syntax tokens)
        );
        
        walker.walk(this._parseResults.parserOutput.parseTree);

        throwIfCancellationRequested(this._token);

        walker.items.sort((a, b) => a.start - b.start);

        for (const item of walker.items) {
            const range = convertOffsetsToRange(
                item.start,
                item.start + item.length,
                this._parseResults.tokenizerOutput.lines
            );
            builder.push(
                range.start.line,
                range.start.character,
                item.length,
                encodeTokenType(item.type),
                encodeTokenModifiers(item.modifiers)
            );
        }

        return builder.build();
    }
}
