// Hearts rules and computer players. Pure functions, no DOM or network,
// so the same file runs in the browser and in the Node tests.
//
// Cards are two-character strings: rank + suit, e.g. "QS", "TH", "2C".

export const RANKS = '23456789TJQKA';
export const SUITS = ['C', 'D', 'S', 'H']; // hand sort order (alternates black/red)
export const SUIT_SYMBOL = { C: '♣', D: '♦', S: '♠', H: '♥' };

export const rv = (c) => RANKS.indexOf(c[0]);
export const su = (c) => c[1];
export const isRed = (c) => su(c) === 'H' || su(c) === 'D';
export const label = (c) => (c[0] === 'T' ? '10' : c[0]) + SUIT_SYMBOL[su(c)];

// Cards taken out so the deck deals evenly. 2♣ always stays in, so it always leads.
export const REMOVED = { 3: ['2D'], 4: [], 5: ['2D', '2S'] };

export function buildDeck(n) {
  if (!REMOVED[n]) throw new Error(`Hearts needs 3, 4 or 5 players, not ${n}`);
  const out = [];
  for (const s of SUITS) for (const r of RANKS) if (!REMOVED[n].includes(r + s)) out.push(r + s);
  return out;
}

export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(h) {
  return [...h].sort((a, b) => SUITS.indexOf(su(a)) - SUITS.indexOf(su(b)) || rv(a) - rv(b));
}

export function deal(n, rnd = Math.random) {
  const d = shuffle(buildDeck(n), rnd);
  const per = d.length / n;
  return [...Array(n)].map((_, i) => sortHand(d.slice(i * per, (i + 1) * per)));
}

// Passing cycle, as seat offsets: pass to seat (p + offset) % n. 0 = hold (no pass).
const PASS_CYCLE = { 3: [1, 2, 0], 4: [1, 3, 2, 0], 5: [1, 4, 2, 3, 0] };
export const passOffset = (n, handNo) => PASS_CYCLE[n][(handNo - 1) % PASS_CYCLE[n].length];
export function passLabel(n, off) {
  if (off === 0) return 'No pass';
  if (off === 1) return 'Pass left';
  if (off === n - 1) return 'Pass right';
  if (n === 4) return 'Pass across';
  return off === 2 ? 'Pass 2 to the left' : 'Pass 2 to the right';
}

export const isPointCard = (c) => su(c) === 'H' || c === 'QS';
export const trickPoints = (cards) => cards.filter((c) => su(c) === 'H').length + (cards.includes('QS') ? 13 : 0);

// ctx: { trick: [{p, c}], firstTrick: bool, heartsBroken: bool }
export function legalPlays(hand, { trick, firstTrick, heartsBroken }) {
  if (!trick.length) {
    if (firstTrick && hand.includes('2C')) return ['2C'];
    if (heartsBroken) return [...hand];
    const nonHearts = hand.filter((c) => su(c) !== 'H');
    return nonHearts.length ? nonHearts : [...hand];
  }
  const led = su(trick[0].c);
  const follow = hand.filter((c) => su(c) === led);
  if (follow.length) return follow;
  if (firstTrick) {
    // No points on the first trick, unless that's all you have.
    const safe = hand.filter((c) => !isPointCard(c));
    if (safe.length) return safe;
  }
  return [...hand];
}

export function trickWinner(trick) {
  const led = su(trick[0].c);
  let best = trick[0];
  for (const t of trick) if (su(t.c) === led && rv(t.c) > rv(best.c)) best = t;
  return best.p;
}

// taken: array (per player) of the cards they won this hand.
// Returns points per player for the hand, plus who shot the moon / took J♦.
export function scoreHand(taken, { jd = false } = {}) {
  let pts = taken.map(trickPoints);
  const moon = pts.findIndex((x) => x === 26);
  if (moon >= 0) pts = pts.map((_, i) => (i === moon ? 0 : 26));
  let jdBy = -1;
  if (jd) {
    jdBy = taken.findIndex((cards) => cards.includes('JD'));
    if (jdBy >= 0) pts[jdBy] -= 10;
  }
  return { pts, moon, jdBy };
}

export const gameOver = (totals, target) => Math.max(...totals) >= target;
export function winners(totals) {
  const low = Math.min(...totals);
  return totals.map((t, i) => (t === low ? i : -1)).filter((i) => i >= 0);
}

/* ---------------- computer players ---------------- */

const highest = (cs) => cs.reduce((a, b) => (rv(b) > rv(a) ? b : a));
const lowest = (cs) => cs.reduce((a, b) => (rv(b) < rv(a) ? b : a));

export function aiPass(hand, { jd = false } = {}) {
  const spades = hand.filter((c) => su(c) === 'S').length;
  const danger = (c) => {
    if (c === 'QS') return spades >= 5 ? 30 : 100;
    if (c === 'AS' || c === 'KS') return spades >= 5 ? 15 : 90;
    if (jd && c === 'JD') return -50;
    if (su(c) === 'H') return 20 + rv(c);
    return rv(c);
  };
  return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
}

export function aiPlay(hand, ctx, { jd = false } = {}) {
  const legal = legalPlays(hand, ctx);
  if (legal.length === 1) return legal[0];
  const { trick, n } = ctx;

  if (!trick.length) {
    // Lead low, and don't lead high spades into a possible Q♠.
    const safe = legal.filter((c) => !(su(c) === 'S' && rv(c) >= rv('QS')) && !(jd && c === 'JD'));
    const pool = safe.length ? safe : legal;
    const nonHearts = pool.filter((c) => su(c) !== 'H');
    return lowest(nonHearts.length ? nonHearts : pool);
  }

  const led = su(trick[0].c);
  const winCard = trick.find((t) => t.p === trickWinner(trick)).c;
  const last = trick.length === n - 1;
  const cards = trick.map((t) => t.c);

  if (su(legal[0]) === led) {
    if (led === 'S' && legal.includes('QS') && (cards.includes('KS') || cards.includes('AS'))) return 'QS';
    // Grab J♦ (−10) when it wins a trick that has no points in it.
    if (jd && led === 'D' && last && legal.includes('JD') && rv('JD') > rv(winCard) && trickPoints(cards) === 0) return 'JD';
    const under = legal.filter((c) => rv(c) < rv(winCard));
    if (under.length) return highest(under);
    const noQ = legal.filter((c) => c !== 'QS');
    const pool = noQ.length ? noQ : legal;
    return last ? highest(pool) : lowest(pool);
  }

  // Can't follow suit: dump the most dangerous card.
  for (const c of ['QS', 'AS', 'KS']) if (legal.includes(c)) return c;
  const hearts = legal.filter((c) => su(c) === 'H');
  if (hearts.length) return highest(hearts);
  const rest = legal.filter((c) => !(jd && c === 'JD'));
  return highest(rest.length ? rest : legal);
}
