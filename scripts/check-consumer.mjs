/**
 * @file scripts/check-consumer.mjs
 * @desc Installs the packed package with a given zod version into a throwaway project, then
 *       typechecks a consumer strictly (no skipLibCheck, so broken .d.ts can't hide as `any`) and
 *       runs it with extended schemas, first without @haruhimemoe/osu (an optional peer), then
 *       the /mp subpath with it. Proves the zod peer range's floor. Usage:
 *       node scripts/check-consumer.mjs <zod version> (after `bun run build`). Needs the registry.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tsconfig = (file) => ({
  compilerOptions: {
    strict: true,
    exactOptionalPropertyTypes: true,
    noEmit: true,
    skipLibCheck: false,
    module: "nodenext",
    moduleResolution: "nodenext",
    target: "ES2023",
    lib: ["ES2023", "DOM"],
    types: [],
  },
  files: [file],
});

const CONSUMER = `import { z } from "zod";
import { TeamSchema, createBracket, reportResult, champion, placements, checkPickBans, PickBanRulesSchema, type Bracket, type Result, type TourneyErrorCode } from "@haruhimemoe/tourney";

const EgcTeam = TeamSchema.extend({ region: z.string() });
type EgcTeam = z.infer<typeof EgcTeam>;
const team: EgcTeam = EgcTeam.parse({ id: "t1", name: "Moss", tag: null, captainId: 1, roster: [1, 2, 3], subs: [], seed: 1, region: "WA" });
const created: Result<Bracket> = createBracket({ entrants: ["a", "b", "c"], format: "single", bestOf: 3, thirdPlace: true });
if (!created.ok) throw new Error(created.error.message);
let bracket = created.value;
for (const code of ["M2", "M4"]) {
  const next = reportResult(bracket, code, { scoreA: 2, scoreB: 0 });
  if (!next.ok) throw new Error(code);
  bracket = next.value;
}
if (champion(bracket) !== "a" || placements(bracket)[2]?.place !== 3) throw new Error("placements");
const rules = PickBanRulesSchema.extend({ note: z.string() }).parse({ protects: 0, bans: 0, tiebreaker: null, note: "split", phases: [{ action: "ban", count: 2, swap: false }] });
const state = checkPickBans([], { pool: { slots: [{ mod: "NM", index: 1 }] }, rules, bestOf: 1, first: { ban: "a", pick: "b" } });
if (!state.ok || state.value.next?.action !== "ban") throw new Error("phases");
// @ts-expect-error an unknown error code must not typecheck (it would if types were any)
const bad: TourneyErrorCode = "nonsense";
void [team, bad];
console.log("consumer: ok");
`;

const MP = `import { fromOsuMatch, type FromOsuResult } from "@haruhimemoe/tourney/mp";
import type { OsuMatch } from "@haruhimemoe/osu";

const osu: OsuMatch = { id: 1, name: "x", startTime: "", endTime: null, events: [], users: [], firstEventId: 1, latestEventId: 1 };
const read = fromOsuMatch(osu, { pool: { slots: [] }, sides: { a: { players: [1] }, b: { players: [2], team: "blue" } }, bestOf: 3 });
if (!read.ok) throw new Error(read.error.message);
const out: FromOsuResult = read.value;
void out;
console.log("mp consumer: ok");
`;

const zod = process.argv[2];
if (!zod) throw new Error("usage: node scripts/check-consumer.mjs <zod version>");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = mkdtempSync(path.join(tmpdir(), "tourney-consumer-"));
const run = (command, args, cwd = dir) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  const tarball = run("npm", ["pack", "--silent", "--pack-destination", dir], root).trim();
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", private: true }));
  run("npm", [
    "install",
    "--silent",
    "--no-audit",
    "--no-fund",
    path.join(dir, tarball),
    `zod@${zod}`,
    "@haruhimemoe/pool@0.3.0",
    "@haruhimemoe/time@0.1.0",
  ]);
  const tsc = path.join(root, "node_modules", ".bin", "tsc");
  const check = (file) => {
    writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify(tsconfig(file)));
    run(tsc, ["-p", dir]);
    run(process.execPath, ["--experimental-strip-types", "--no-warnings", file]);
  };
  // The root entry typechecks and runs without @haruhimemoe/osu installed (an optional peer).
  writeFileSync(path.join(dir, "consumer.ts"), CONSUMER);
  check("consumer.ts");
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", "@haruhimemoe/osu@0.5.0"]);
  writeFileSync(path.join(dir, "mp.ts"), MP);
  check("mp.ts");
  console.log(`zod ${zod}: ok`);
} catch (error) {
  console.error(`zod ${zod}: FAILED\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
