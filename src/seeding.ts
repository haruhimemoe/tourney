/**
 * @file src/seeding.ts
 * @desc Seeding: ranking qualifier results (sum of scores, or average rank per map) and the
 *       standard bracket order of seeds, so seeds 1 and 2 can only meet in the final.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** One entrant's qualifier scores, one per map; null when they have no score on it. */
export type QualifierRow = { entrantId: string; scores: readonly (number | null)[] };

/** A ranked entrant. `tied` is true when its value equals a neighbour's (order then follows input). */
export type QualifierSeed = { entrantId: string; seed: number; value: number; tied: boolean };

/** How qualifier rows are ranked. */
export type QualifierMethod = "sum" | "average-rank";

const mapRanks = (rows: readonly QualifierRow[], map: number): number[] => {
  const scores = rows.map((row) => row.scores[map] ?? null);
  return scores.map((score) => {
    if (score === null) return rows.length;
    return 1 + scores.filter((other) => other !== null && other > score).length;
  });
};

/**
 * @function rankQualifiers
 * @param rows {readonly QualifierRow[]} every entrant's scores, maps in the same order
 * @param method {QualifierMethod} "sum": total score, higher is better (null counts 0);
 *        "average-rank": mean rank over maps, lower is better (ties share a rank, null ranks last)
 * @returns {QualifierSeed[]} entrants by seed 1..n; equal values keep input order and are flagged
 */
export const rankQualifiers = (
  rows: readonly QualifierRow[],
  method: QualifierMethod,
): QualifierSeed[] => {
  const maps = Math.max(0, ...rows.map((row) => row.scores.length));
  const ranks = Array.from({ length: maps }, (_, map) => mapRanks(rows, map));
  const values = rows.map((row, i) =>
    method === "sum"
      ? row.scores.reduce<number>((sum, score) => sum + (score ?? 0), 0)
      : maps === 0
        ? 0
        : ranks.reduce((sum, list) => sum + (list[i] as number), 0) / maps,
  );
  const better = (a: number, b: number) => (method === "sum" ? b - a : a - b);
  const order = rows
    .map((row, i) => ({ entrantId: row.entrantId, value: values[i] as number, i }))
    .sort((a, b) => better(a.value, b.value) || a.i - b.i);
  return order.map((entry, i) => ({
    entrantId: entry.entrantId,
    seed: i + 1,
    value: entry.value,
    tied: order.some((other) => other !== entry && other.value === entry.value),
  }));
};

/**
 * @function seedPositions
 * @param n {number} a power of two, at least 2
 * @returns {number[]} seeds in bracket order: pairs (0,1), (2,3)... are the first round's
 *          matches, e.g. 8 gives 1, 8, 4, 5, 2, 7, 3, 6
 */
export const seedPositions = (n: number): number[] => {
  let order = [1, 2];
  while (order.length < n) {
    const total = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, total - seed]);
  }
  return order;
};
