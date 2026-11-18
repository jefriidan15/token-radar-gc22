// Token Launch Radar — the program's entry point. Node 22, standard library only.
//
// It takes the sealed snapshot, scores every pre-token protocol with the
// radar-2 model, and writes everything the entry hands in: the ranked board,
// the dashboard's data file, the dashboard itself, the screenshots, and the
// dossier the judge reads. Run it like this from the repository root:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
//
// The grader runs it with /input mounted and /output writable; outside that
// container MAKEFUN_OUTPUT_DIR stands in for /output and --input names the
// snapshot file or the directory holding it. The run is deterministic — the
// same snapshot always writes the same bytes — because nothing here reads a
// clock, the network, or a random number.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** How much source text the dossier carries, and the scorer's screenshot limits. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const SHOT_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after `--name`, in `--name value` or `--name=value` form, else the fallback. */
function flagValue(name: string, fallback: string): string {
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a === `--${name}` && i + 1 < process.argv.length) return process.argv[i + 1]!;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

/** The snapshot file: --input names it directly, or the directory holding snapshot.json. */
function snapshotPath(): string {
  const given = flagValue('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

/** Where the outputs go: --output wins, then MAKEFUN_OUTPUT_DIR, then /output. */
function outputDir(): string {
  return flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

/** Copy a directory's plain files into `dst`, skipping dot-names; returns the names copied. */
function copyDir(src: string, dst: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dst, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(src)) {
    if (name.startsWith('.')) continue;
    const from = join(src, name);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(dst, name));
    names.push(name);
  }
  return names;
}

/** Fail with a message on stderr and exit code 1. */
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const snapshotFile = snapshotPath();
if (!existsSync(snapshotFile)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}

const outDir = outputDir();
const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

const dashboardFiles = copyDir(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shotFiles = copyDir(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles.length < 3) {
  fail(`screenshots/ holds ${shotFiles.length} image${shotFiles.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shotFiles) {
  if (!SHOT_NAME_RE.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier goes last: the scorer rebuilds it from this output and compares the bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: SHOT_LIMIT,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (${dashboardFiles.length} files), ${join(outDir, 'screenshots')} (${shotFiles.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
