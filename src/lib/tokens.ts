import { encode } from 'gpt-tokenizer'

/**
 * Token count for `text` using OpenAI's tokenizer (o200k/cl100k).
 *
 * Exact for OpenAI models; for other providers it's a close proxy (their
 * tokenizers differ slightly). Server-side only — the encoder tables are heavy.
 * Falls back to a ~4-chars/token estimate if encoding throws. Use only when the
 * real text is in hand; aggregates store length, not text, so they estimate via
 * `tokensFromChars`.
 */
export function countTokens(text: string): number {
  try {
    return encode(text).length
  } catch {
    return Math.ceil(text.length / 4)
  }
}
