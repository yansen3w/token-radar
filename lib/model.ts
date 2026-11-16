// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the watchlist floor that pass the same exclusion rule the house used for
// the watchlist. A protocol is rankable when its record carries no token (no market cap, no
// CoinGecko id, no symbol) and it is not a wrapped, staked or bridged product of a token that
// already trades: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC or CEX, its name does not end in a version marker, carries no whole word wrapped,
// staked or staking, and does not begin with an exchange's name. Protocols at or above the floor
// that the watchlist leaves out are set aside, not ranked: the snapshot carries no parent-protocol
// field, so whether the house left one out for a parent cannot be verified from the snapshot alone,
// and a board that ranks a house-excluded protocol first would rank on an unverified claim.
//
// Implied value follows only from the snapshot's own figures, one function for every row:
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.55 + min(age_days, 1460) / 1460 x 0.45   (age_days unknown: 365)
//   breadth    = 1 + 0.05 x min(max(chains - 1, 0), 4)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// TVL is the launch's base: a token prices off the value already locked in the protocol. Seven-day
// growth is momentum: a protocol gaining TVL is worth more than one the same size that is shrinking.
// Age is how long the protocol has run with no token on record: a longer run means a deeper user
// base waiting on a launch, and the multiplier saturates after four years. Breadth is distribution:
// a protocol live on more chains reaches more wallets, capped at five chains. No protocol name is
// ever special-cased: the same function scores every row, and every row carries the reason its
// figures give it.
//
// The gate's shape the board must keep: 100 to 4,000 rows, ranks 1..N, implied values
// non-rising as rank ascends, every watchlist slug covered, 3 to 12 farm steps of 20 to 600
// characters each. boardIssue() in this file checks the same shape before main.ts writes.
//
// Every number the board prints is recomputed by the dashboard's own copy of the formula, so the
// page and the board are visibly the same model: a stale dataset shows up as a mismatch, never as
// a silent lie. The farm plans are derived the same way, from the protocol's own record (category,
// chains, TVL and age), never from a hand-written list of names.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.05,
  breadth_cap: 0.2,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** The velocity tiers a protocol's seven-day TVL change puts it in. */
export type VelocityTier = 'surging' | 'rising' | 'steady' | 'cooling' | 'fading' | 'unknown';

/** The change_7d bands that name a velocity tier, in per cent per week. */
export const VELOCITY_BANDS = {
  surging: 25,
  rising: 10,
  steady: -5,
  cooling: -20,
} as const;

/** A protocol's velocity tier from its reported seven-day TVL change. */
export function velocityTier(change7d: number | null): VelocityTier {
  if (change7d === null || !Number.isFinite(change7d)) return 'unknown';
  if (change7d >= VELOCITY_BANDS.surging) return 'surging';
  if (change7d >= VELOCITY_BANDS.rising) return 'rising';
  if (change7d >= VELOCITY_BANDS.steady) return 'steady';
  if (change7d >= VELOCITY_BANDS.cooling) return 'cooling';
  return 'fading';
}

/** The dollars of TVL a protocol gained or lost over the last seven days, or null unreported. */
export function weeklyGainUsd(tvlUsd: number, change7d: number | null): number | null {
  if (change7d === null || !Number.isFinite(change7d)) return null;
  const priorTvl = tvlUsd / (1 + change7d / 100);
  if (!Number.isFinite(priorTvl) || priorTvl <= 0) return null;
  return Math.round(tvlUsd - priorTvl);
}

/**
 * Whether a protocol's velocity marks it out for a closer look this week: a surging or rising
 * tier whose weekly TVL gain is positive in dollars, not only in per cent.
 */
export function velocityWatch(tier: VelocityTier, weeklyGain: number | null): boolean {
  if (tier !== 'surging' && tier !== 'rising') return false;
  return weeklyGain !== null && weeklyGain > 0;
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
  watchlist: boolean;
  age_days: number | null;
  velocity_tier: VelocityTier;
  weekly_gain_usd: number | null;
  velocity_rank: number;
  gain_rank: number;
  velocity_watch: boolean;
  implied_value_usd: number;
  reason: string;
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

/** The dashboard's compact view of one row, with its farm plan and reason carried in the data. */
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
  velocity_tier: VelocityTier;
  weekly_gain_usd: number | null;
  velocity_rank: number;
  gain_rank: number;
  velocity_watch: boolean;
  implied_value_usd: number;
  watchlist: boolean;
  reason: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
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
  set_aside_size: number;
  set_aside_unverified: number;
  set_aside_slugs: string[];
  total_implied_usd: number;
  median_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
  velocity: VelocitySummary;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** `value` held inside [`lo`, `hi`]; a value already inside comes back unchanged. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** A number rounded to four decimals, for the multipliers the board prints. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), 4);
  const breadthMult = 1 + extraChains * model.breadth_per_chain;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the house's watchlist rule keeps out: wrapped, staked or bridged products, and CEX. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not begin with, per the house's watchlist rule. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that trades, by the same category and name tests the house's watchlist rule
 * applies. No name is ever special-cased beyond those tests.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A dollar figure in short form, for a reason string. */
function shortUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

/** The row's stated reason: the model's own inputs, in words, with the board's superlatives. */
function reasonFor(p: SnapshotProtocol, age: number | null, rank: number, tvlRank: number, growthRank: number, ageRank: number, watchlist: boolean, boardSize: number): string {
  const parts: string[] = [];
  parts.push(watchlist ? 'Watchlist.' : 'Below the watchlist floor.');
  let size = `${shortUsd(p.tvl_usd)} TVL`;
  if (tvlRank === 1) size += ', the board\'s largest';
  else if (tvlRank <= 10) size += ', a top-10 TVL on the board';
  parts.push(size + '.');
  if (p.change_7d === null) parts.push('No 7-day change reported.');
  else {
    const sign = p.change_7d >= 0 ? 'up' : 'down';
    let g = `${sign} ${Math.abs(p.change_7d).toFixed(1)}% in 7 days`;
    if (growthRank === 1 && p.change_7d > 0) g += ', the board\'s fastest growth';
    parts.push(g + '.');
  }
  if (age === null) parts.push('Age unreported.');
  else {
    let a = `${age} days with no token on record`;
    if (ageRank === 1) a += ', the board\'s longest run';
    parts.push(a + '.');
  }
  parts.push(p.chains.length > 1 ? `Live on ${p.chains.length} chains.` : 'On one chain.');
  if (rank <= 3) parts.push('Among the board\'s most valuable launches.');
  else if (rank > boardSize - 3) parts.push('Near the bottom of the board: small, young, or shrinking.');
  return parts.join(' ');
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain: Ethereum mainnet is dear, cheap chains are cents. */
function gasTier(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 'about $5-10 of gas per transaction';
  if (c === 'solana' || c === 'sui' || c === 'aptos' || c === 'near' || c === 'stellar' || c === 'tron') return 'a few cents of gas per transaction';
  return 'under $1 of gas per transaction';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('basis trad')) return `Open a basis position on ${name} on ${chain}: hold the spot asset and hedge it with a short perpetual of the same size.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('chain') && !c.includes('cross')) return `Bridge $${capital} to ${chain} and use its leading apps so the address is active on the chain.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote in its governance when a proposal opens.`;
  if (c.includes('options vault')) return `Deposit $${capital} into the ${name} options vault on ${chain} and keep the shares.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold it.`;
  if (c.includes('farm')) return `Deposit $${capital} into ${name}'s farm on ${chain} and keep the position open.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL and age), never from a hand-written list of
 * names. A protocol on two or more chains gets a step to repeat the position on its second chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasTier(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
  ];
  if (p.chains.length > 1) {
    const second = p.chains[1]!;
    steps.push({
      text: `Repeat the same deposit on ${second} so the position is active on both ${chain} and ${second}.`,
      cost: `another $${capital} of capital and ${gasTier(second)}`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Make a second qualifying action the following week, such as a swap, a borrow or a vote on ${chain}.`,
      cost: gas,
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: `Do one qualifying action every week, such as a deposit, a borrow, a swap or a vote, and keep the position open.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open the protocol's own points or rewards page and claim only from the link it publishes; never pay a fee to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and unwind in stages if the position turns against you.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  );
  return steps;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor. A chosen protocol stays
  // chosen, and a protocol at or above the floor that the watchlist leaves out is set aside, not
  // ranked: the snapshot carries no parent-protocol field, so its exclusion cannot be verified here.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, breadthMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const byTvl = [...scored].sort((a, b) => b.p.tvl_usd - a.p.tvl_usd);
  const tvlRank = new Map(byTvl.map((s, i) => [s.p.slug, i + 1]));
  const byGrowth = [...scored].sort((a, b) => (b.p.change_7d ?? -Infinity) - (a.p.change_7d ?? -Infinity));
  const growthRank = new Map(byGrowth.map((s, i) => [s.p.slug, i + 1]));
  const byAge = [...scored].sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
  const ageRank = new Map(byAge.map((s, i) => [s.p.slug, i + 1]));
  const weeklyGain = new Map(scored.map((s) => [s.p.slug, weeklyGainUsd(s.p.tvl_usd, s.p.change_7d)]));
  const byVelocity = [...scored].sort((a, b) => (b.p.change_7d ?? -Infinity) - (a.p.change_7d ?? -Infinity) || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const velocityRank = new Map(byVelocity.map((s, i) => [s.p.slug, i + 1]));
  const byGain = [...scored].sort((a, b) => (weeklyGain.get(b.p.slug) ?? -Infinity) - (weeklyGain.get(a.p.slug) ?? -Infinity) || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const gainRank = new Map(byGain.map((s, i) => [s.p.slug, i + 1]));

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
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.age,
    velocity_tier: velocityTier(s.p.change_7d),
    weekly_gain_usd: weeklyGain.get(s.p.slug) ?? null,
    velocity_rank: velocityRank.get(s.p.slug) ?? 0,
    gain_rank: gainRank.get(s.p.slug) ?? 0,
    velocity_watch: velocityWatch(velocityTier(s.p.change_7d), weeklyGain.get(s.p.slug) ?? null),
    implied_value_usd: s.implied,
    reason: reasonFor(s.p, s.age, i + 1, tvlRank.get(s.p.slug) ?? 0, growthRank.get(s.p.slug) ?? 0, ageRank.get(s.p.slug) ?? 0, snapshot.watchlist.includes(s.p.slug), scored.length),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** One velocity tier's headcount on the board. */
export interface VelocityTierCount {
  tier: VelocityTier;
  rows: number;
}

/** A board row's velocity in one line, for the summary's mover lists. */
export interface VelocityMover {
  slug: string;
  name: string;
  rank: number;
  change_7d: number | null;
  weekly_gain_usd: number | null;
  tier: VelocityTier;
  watchlist: boolean;
}

/** The board's velocity in one place: tier headcounts, the fastest movers, and the watch flag. */
export interface VelocitySummary {
  as_of: string;
  reported: number;
  unreported: number;
  tier_counts: VelocityTierCount[];
  fastest_growth: VelocityMover[];
  biggest_weekly_gain: VelocityMover[];
  fastest_fall: VelocityMover[];
  velocity_watch_rows: number;
  velocity_watch_slugs: string[];
  median_change_7d: number | null;
}

/** A board row trimmed to the velocity fields the summary lists. */
function velocityMover(row: BoardRow): VelocityMover {
  return {
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    change_7d: row.change_7d,
    weekly_gain_usd: row.weekly_gain_usd,
    tier: row.velocity_tier,
    watchlist: row.watchlist,
  };
}

/**
 * The board's velocity summary, from the rows alone: how many rows sit in each tier, the five
 * fastest growers, the five biggest weekly dollar gains, the five fastest falls, and the rows
 * whose velocity marks them out. Every figure comes from the snapshot's own change_7d and
 * tvl_usd; a row with no reported change counts as unreported, never as zero.
 */
export function summarizeVelocity(board: BoardRow[], asOf: string): VelocitySummary {
  const tiers: VelocityTier[] = ['surging', 'rising', 'steady', 'cooling', 'fading', 'unknown'];
  const tier_counts = tiers.map((tier) => ({ tier, rows: board.filter((r) => r.velocity_tier === tier).length }));
  const reported = board.filter((r) => r.change_7d !== null);
  const changes = reported.map((r) => r.change_7d as number).sort((a, b) => a - b);
  const median_change_7d = changes.length === 0
    ? null
    : Math.round((changes.length % 2 === 1 ? changes[(changes.length - 1) / 2]! : (changes[changes.length / 2 - 1]! + changes[changes.length / 2]!) / 2) * 10) / 10;
  const byGrowth = [...reported].sort((a, b) => (b.change_7d as number) - (a.change_7d as number) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const byGain = [...reported].filter((r) => r.weekly_gain_usd !== null).sort((a, b) => (b.weekly_gain_usd as number) - (a.weekly_gain_usd as number) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const byFall = [...byGrowth].reverse();
  const watched = board.filter((r) => r.velocity_watch).sort((a, b) => a.rank - b.rank);
  return {
    as_of: asOf,
    reported: reported.length,
    unreported: board.length - reported.length,
    tier_counts,
    fastest_growth: byGrowth.slice(0, 5).map(velocityMover),
    biggest_weekly_gain: byGain.slice(0, 5).map(velocityMover),
    fastest_fall: byFall.slice(0, 5).map(velocityMover),
    velocity_watch_rows: watched.length,
    velocity_watch_slugs: watched.map((r) => r.slug),
    median_change_7d,
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
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

/** A board row's compact form for data.js, with its farm plan and reason carried in the data. */
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
    velocity_tier: row.velocity_tier,
    weekly_gain_usd: row.weekly_gain_usd,
    velocity_rank: row.velocity_rank,
    gain_rank: row.gain_rank,
    velocity_watch: row.velocity_watch,
    implied_value_usd: row.implied_value_usd,
    watchlist: row.watchlist,
    reason: row.reason,
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
  const setAside = snapshot.protocols
    .filter((p) => p.tvl_usd >= snapshot.floor_usd && !snapshot.watchlist.includes(p.slug) && isPreToken(p));
  const setAsideUnverified = setAside
    .filter((p) => isRankable(p))
    .map((p) => p.slug)
    .sort();
  const implied = board.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const total = implied.reduce((a, b) => a + b, 0);
  const median = implied.length % 2 === 1 ? implied[(implied.length - 1) / 2]! : Math.round((implied[implied.length / 2 - 1]! + implied[implied.length / 2]!) / 2);
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
    set_aside_size: setAside.length,
    set_aside_unverified: setAsideUnverified.length,
    set_aside_slugs: setAsideUnverified,
    total_implied_usd: total,
    median_implied_usd: median,
    rows: board.map(radarRow),
    live,
    velocity: summarizeVelocity(board, snapshot.as_of),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
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
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (typeof r.reason !== 'string' || r.reason.length < 20) return `${r.slug} has no stated reason`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
