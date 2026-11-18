// Token Launch Radar — the radar-2 model.
//
// A sealed DefiLlama snapshot goes in, a ranked board comes out. The board
// ranks the protocols that record no token, by the value a token would carry
// if the protocol's record stayed as it is. Nothing here forecasts whether or
// when a token appears: the implied value is this entry's own claim, built
// only from figures the snapshot itself carries — locked value, seven-day
// change in that value, how long the protocol has been tracked, and how many
// chains it runs on. No name is ever special-cased; one function scores them
// all.
//
//   base      = tvl_usd x 0.30
//   growth    = change_7d clamped to -50%..+150%
//   growthMul = 1 + (growth / 100) x 0.60
//   maturity  = 0.55 + 0.45 x ln(1 + age/90) / ln(1 + 1460/90)
//               age is days since listed_at; an unknown age counts as 365.
//               The logarithm means three years of running scores near the
//               top, while a young protocol is not crushed to zero.
//   breadth   = 1 + 0.04 x min(chains - 1, 5)          (at most 1.20)
//               Running on more chains means wider distribution.
//   implied   = max(1, round(base x growthMul x maturity x breadth))
//
// The board is the whole radar, uncapped: every watchlist slug, plus every
// other pre-token protocol the snapshot carries that passes the watchlist's
// own cleanliness rule (no wrapped, staked or bridged product, no exchange,
// no versioned pool). Protocols whose token already trades live in a separate
// view at the market's own value and are never mixed into the ranking.

/** One protocol entry: the ten fields the sealed input carries for each. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The snapshot document as a whole. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard exactly as they run here. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_span_days: number;
  maturity_scale_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_span_days: 1460,
  maturity_scale_days: 90,
  unknown_age_days: 365,
  breadth_step: 0.04,
  breadth_cap: 5,
};

/** The model's version label, named by the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the separate Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** One row in the dashboard's data file, farm plan included so the detail view needs no second fetch. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A protocol whose token already trades: the board shows the market's value for it, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the live set, and the model behind them. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** The snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const MS_PER_DAY = 86_400_000;

/** The number when it is finite, else the fallback. */
function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when a date is missing or unparseable. */
export function daysSince(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

/** The maturity multiplier for an age in days: logarithmic, floored, capped by the span. */
function maturityFactor(ageDays: number, model: ModelConstants): number {
  const scaled = Math.log(1 + Math.max(ageDays, 0) / model.maturity_scale_days);
  const span = Math.log(1 + model.maturity_span_days / model.maturity_scale_days);
  return model.maturity_floor + (1 - model.maturity_floor) * (scaled / span);
}

/** The growth multiplier for a clamped seven-day change in per cent. */
function growthFactor(growthPct: number, model: ModelConstants): number {
  return 1 + (growthPct / 100) * model.growth_weight;
}

/** The breadth multiplier for a chain count: a little more per extra chain, capped. */
function breadthFactor(chainCount: number, model: ModelConstants): number {
  return 1 + model.breadth_step * Math.min(Math.max(chainCount - 1, 0), model.breadth_cap);
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function scoreProtocol(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = daysSince(asOf, protocol.listed_at);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, numOr(protocol.change_7d, 0)));
  const growthMult = growthFactor(growthPct, model);
  const maturityMult = maturityFactor(age ?? model.unknown_age_days, model);
  const breadthMult = breadthFactor(protocol.chains.length, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * model.base_multiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A name ending in a release marker is a pool of another protocol, not a protocol of its own. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's rule keeps out: wrapped, staked or bridged products of a token that already trades. */
const KEPT_OUT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking inside a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name that starts with an exchange's name. */
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether the record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether the board may rank a protocol: pre-token, and clean under the same
 * rule that built the watchlist. Watchlist slugs are always ranked; this gate
 * applies only to the early rows the radar adds below the floor.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (KEPT_OUT_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_LEAD.test(p.name)) return false;
  return true;
}

/** The snapshot's protocols keyed by slug. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, carrying ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = indexBySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked, whatever its TVL.
  for (const slug of snapshot.watchlist) {
    const found = index.get(slug);
    if (found !== undefined) chosen.set(slug, found);
  }
  // The early radar: every other rankable pre-token protocol, richest first.
  // All of them, not a capped sample; a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, model);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4dp(s.growthMult),
      maturity_multiplier: round4dp(s.maturityMult),
      breadth_multiplier: round4dp(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: action, then cost and time, inside the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  const joined = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
  if (joined.length > 600) return joined.slice(0, 596) + '...';
  if (joined.length < 20) return joined + " Hold the position and check the protocol's own page.";
  return joined;
}

/** The first chain a protocol names, or a neutral phrase when it names none. */
function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The capital one farm position needs, from the protocol's own TVL. */
function capitalNeeded(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The hold window, from the protocol's age: younger protocols get longer to qualify. */
function holdWindow(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Whether the lowercased category contains any of the words. */
function catHas(c: string, ...words: string[]): boolean {
  return words.some((w) => c.includes(w));
}

/** The category's first action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (catHas(c, 'liquid staking', 'liquid restaking', 'restaked')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (catHas(c, 'lend', 'cdp', 'collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (catHas(c, 'dex', 'leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (catHas(c, 'bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (catHas(c, 'perpetual', 'derivative', 'options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (catHas(c, 'prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (catHas(c, 'curator', 'allocator', 'onchain capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (catHas(c, 'stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (catHas(c, 'rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (catHas(c, 'insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (catHas(c, 'yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (catHas(c, 'staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (catHas(c, 'farm')) return `Deposit $${capital} into ${name}'s main farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second, different action, so the plan is a routine and not one deposit. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (catHas(c, 'dex', 'leveraged farm')) return `Swap a small amount through ${name} on ${chain} once a week so the wallet shows trading activity as well as liquidity.`;
  if (catHas(c, 'lend', 'cdp', 'collateral')) return `Borrow a small amount against the supplied collateral on ${name} and repay it, so the wallet shows both sides of the market.`;
  if (catHas(c, 'bridge')) return `Bridge a small amount back through ${name} once, so the wallet shows two-way volume.`;
  if (catHas(c, 'perpetual', 'derivative', 'options')) return `Close the hedge and open a fresh one on ${name} once a week, keeping total margin near $${capital}.`;
  if (catHas(c, 'staking', 'restak')) return `Restake the receipt token's rewards through ${name} once a month instead of letting them sit idle.`;
  if (catHas(c, 'prediction')) return `Settle one market on ${name} and place a second small position, so the wallet shows repeat use.`;
  return `Use one more feature of ${name} on ${chain} — a swap, a vote or a second deposit — once a week.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan comes from the protocol's own record (category, chains, TVL, age),
 * never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const capital = capitalNeeded(p);
  const hold = holdWindow(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page from the link it publishes and check what counted.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Check the contract you interacted with on the chain explorer for ${chain} and revoke any approval you no longer need.`,
      cost: 'about $1 of gas per revoke',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's separate Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The value as a record, or a refusal naming what is wrong with it. */
function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`${what} is not an object`);
  return v as Record<string, unknown>;
}

/** A string field, or null when it is absent or not a string. */
function optString(o: Record<string, unknown>, key: string): string | null {
  return typeof o[key] === 'string' ? (o[key] as string) : null;
}

/** A finite-number field, or null when it is absent or not a finite number. */
function optNumber(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** A string list field, keeping only its string members. */
function strList(o: Record<string, unknown>, key: string): string[] {
  const v = o[key];
  return Array.isArray(v) ? v.filter((c): c is string => typeof c === 'string') : [];
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot file is not JSON');
  }
  const o = asRecord(raw, 'snapshot file');
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    const p = asRecord(v, `snapshot protocol ${i}`);
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: optString(p, 'category'),
      chains: strList(p, 'chains'),
      tvl_usd: p.tvl_usd,
      change_7d: optNumber(p, 'change_7d'),
      mcap_usd: optNumber(p, 'mcap_usd'),
      listed_at: optString(p, 'listed_at'),
      gecko_id: optString(p, 'gecko_id'),
      symbol: optString(p, 'symbol'),
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return 'window.RADAR=' + JSON.stringify(radar) + ';\n';
}
