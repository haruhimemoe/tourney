/**
 * @file src/result.ts
 * @desc Result and error shapes. Functions here return errors as values, never throw them.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** Why a call was refused. */
export type TourneyErrorCode =
  | "bad-input"
  | "bad-state"
  | "bad-side"
  | "bad-score"
  | "bad-slot"
  | "out-of-order"
  | "limit"
  | "not-found"
  | "closed";

/** A refusal: a code to switch on and a message for logs. */
export type TourneyError = { code: TourneyErrorCode; message: string };

/** Either the value or the reason it was refused. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: TourneyError };

/**
 * @function ok
 * @param value {T} the result
 * @returns {Result<T>} a success
 */
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * @function fail
 * @param code {TourneyErrorCode} why
 * @param message {string} for logs
 * @returns {Result<T>} a refusal
 */
export const fail = <T>(code: TourneyErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});
