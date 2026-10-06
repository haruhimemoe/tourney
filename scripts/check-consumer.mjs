/**
 * @file scripts/check-consumer.mjs
 * @desc Installs the packed package with a given zod version into a throwaway project, then
 *       typechecks a consumer strictly (no skipLibCheck, so broken .d.ts can't hide as `any`) and
 *       runs it with an extended team schema. Proves the zod peer range's floor. Usage:
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
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
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
      files: ["consumer.ts"],
    }),
  );
  writeFileSync(
    path.join(dir, "consumer.ts"),
    `import { z } from "zod";
import { TeamSchema, createBracket, reportResult, champion, type Bracket, type Result, type TourneyErrorCode } from "@haruhimemoe/tourney";

const EgcTeam = TeamSchema.extend({ region: z.string() });
type EgcTeam = z.infer<typeof EgcTeam>;
const team: EgcTeam = EgcTeam.parse({ id: "t1", name: "Moss", tag: null, captainId: 1, roster: [1, 2, 3], subs: [], seed: 1, region: "WA" });
const created: Result<Bracket> = createBracket({ entrants: ["a", "b"], format: "single", bestOf: 3 });
if (!created.ok) throw new Error(created.error.message);
const done = reportResult(created.value, "M1", { scoreA: 2, scoreB: 0 });
if (!done.ok || champion(done.value) !== "a") throw new Error("champion");
// @ts-expect-error an unknown error code must not typecheck (it would if types were any)
const bad: TourneyErrorCode = "nonsense";
void [team, bad];
console.log("consumer: ok");
`,
  );
  run(path.join(root, "node_modules", ".bin", "tsc"), ["-p", dir]);
  run(process.execPath, ["--experimental-strip-types", "--no-warnings", "consumer.ts"]);
  console.log(`zod ${zod}: ok`);
} catch (error) {
  console.error(`zod ${zod}: FAILED\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
