import { bsGamma } from "./vol-math";

export interface GexContractInput {
  strike: number;
  type: "call" | "put";
  openInterest: number;
  iv: number; // decimal, e.g. 0.45
}

export interface GexLevel {
  strike: number;
  callGex: number; // dollars of gamma exposure per 1% move
  putGex: number;  // negative
  netGex: number;
}

export interface GexProfile {
  levels: GexLevel[];        // sorted ascending by strike
  flip: number | null;       // zero-gamma flip strike (interpolated)
  callWall: number | null;   // strike with max positive netGex
  putWall: number | null;    // strike with most negative netGex BELOW spot
  totalNetGex: number;
}

// Dealer convention: dealers are long calls (+gamma) and long puts customers sold...
// Standard simplification used by SpotGamma/SqueezeMetrics: calls contribute +gamma, puts contribute -gamma.
export function computeGexProfile(spot: number, T: number, contracts: GexContractInput[]): GexProfile {
  const byStrike = new Map<number, GexLevel>();
  for (const c of contracts) {
    if (!c.openInterest || c.openInterest <= 0 || !c.iv || c.iv <= 0) continue;
    const g = bsGamma(spot, c.strike, T, c.iv) * c.openInterest * 100 * spot * spot * 0.01;
    const lvl = byStrike.get(c.strike) ?? { strike: c.strike, callGex: 0, putGex: 0, netGex: 0 };
    if (c.type === "call") lvl.callGex += g; else lvl.putGex -= g;
    lvl.netGex = lvl.callGex + lvl.putGex;
    byStrike.set(c.strike, lvl);
  }
  const levels = [...byStrike.values()].sort((a, b) => a.strike - b.strike);

  // flip: cumulative netGex across strikes, find sign change, linear interpolation
  let flip: number | null = null;
  let cum = 0;
  let prevCum = 0;
  let prevStrike: number | null = null;
  for (const lvl of levels) {
    prevCum = cum;
    cum += lvl.netGex;
    if (prevStrike !== null && prevCum < 0 && cum >= 0) {
      const frac = prevCum !== 0 ? -prevCum / (cum - prevCum) : 0;
      flip = prevStrike + frac * (lvl.strike - prevStrike);
      break;
    }
    prevStrike = lvl.strike;
  }

  let callWall: number | null = null;
  let putWall: number | null = null;
  let maxPos = 0;
  let maxNeg = 0;
  for (const lvl of levels) {
    if (lvl.netGex > maxPos) { maxPos = lvl.netGex; callWall = lvl.strike; }
    if (lvl.strike < spot && lvl.netGex < maxNeg) { maxNeg = lvl.netGex; putWall = lvl.strike; }
  }

  return { levels, flip, callWall, putWall, totalNetGex: levels.reduce((a, l) => a + l.netGex, 0) };
}
