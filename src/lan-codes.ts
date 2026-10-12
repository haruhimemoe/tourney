/**
 * @file src/lan-codes.ts
 * @desc Roommate pair codes: six symbols from a 32-symbol alphabet with no 0, O, 1 or I. The
 *       caller passes the random bytes, so codes stay testable and src/ keeps no randomness.
 *       Typed codes drop whitespace, hyphens and the Unicode dashes autocorrect puts in.
 * @author David @dvhsh (https://dvh.sh)
 * @created Mon Oct 12, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";

/** The symbols a pair code uses: 32 of them, with no 0, O, 1 or I to misread. */
export const PAIR_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Symbols in a pair code. */
export const PAIR_CODE_LENGTH = 6;

const PATTERN = new RegExp(`^[${PAIR_CODE_ALPHABET}]{${PAIR_CODE_LENGTH}}$`);

/** A stored pair code: exactly six symbols from the alphabet, already normalized. */
export const PairCodeSchema = z.string().regex(PATTERN);

/**
 * @function pairCode
 * @param bytes {ArrayLike<number>} random bytes, e.g. crypto.getRandomValues(new Uint8Array(6))
 * @returns {string} a code from the low five bits of the first six bytes (a missing byte reads 0)
 */
export const pairCode = (bytes: ArrayLike<number>): string =>
  Array.from({ length: PAIR_CODE_LENGTH }, (_, i) =>
    PAIR_CODE_ALPHABET.charAt((bytes[i] ?? 0) & 31),
  ).join("");

/**
 * @function normalizePairCode
 * @param input {string} a code as someone typed it, e.g. " abc-def "
 * @returns {string | null} the code uppercased without whitespace or dashes (the ASCII hyphen, and
 *          U+2010 to U+2015 and U+2212, which phones autocorrect it to), or null when that isn't
 *          a code
 */
export const normalizePairCode = (input: string): string | null => {
  // Whitespace, "-", U+2010 (hyphen) to U+2015 (horizontal bar), U+2212 (minus sign).
  const code = input.toUpperCase().replace(/[\s\u2010-\u2015\u2212-]/g, "");
  return PATTERN.test(code) ? code : null;
};
