/**
 * CBOE delayed-quotes API — free, no auth.
 * Provides full option chains with open_interest and precomputed greeks.
 */
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface CboeOption {
  expiry: string;       // YYYY-MM-DD
  type: "call" | "put";
  strike: number;
  oi: number;
  iv: number;           // decimal e.g. 0.42
  gamma: number;
  last: number;
}

// In-memory cache (5 min TTL)
const cache = new Map<string, { data: { spot: number; options: CboeOption[] }; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const OPT_RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;

function parseOptionSymbol(sym: string): { expiry: string; type: "call" | "put"; strike: number } | null {
  const m = OPT_RE.exec(sym);
  if (!m) return null;
  const [, , ymd, cp, strikeRaw] = m;
  return {
    expiry: `20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`,
    type: cp === "C" ? "call" : "put",
    strike: parseInt(strikeRaw, 10) / 1000,
  };
}

export async function getCboeChain(ticker: string): Promise<{ spot: number; options: CboeOption[] } | null> {
  const key = `cboe:${ticker.toUpperCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker.toUpperCase()}.json`;
    const { stdout } = await execFileAsync("/usr/bin/curl", [
      "-s", "-L", "--max-time", "15",
      "-H", "Accept: application/json",
      url,
    ], { encoding: "utf-8", timeout: 20000, maxBuffer: 30 * 1024 * 1024 });

    const json = JSON.parse(stdout);
    const data = json?.data;
    if (!data?.options || !Array.isArray(data.options)) return null;

    const spot = data.current_price ?? data.close ?? 0;
    if (spot <= 0) return null;

    const options: CboeOption[] = [];
    for (const entry of data.options) {
      const parsed = parseOptionSymbol(entry.option ?? "");
      if (!parsed) continue;
      options.push({
        expiry: parsed.expiry,
        type: parsed.type,
        strike: parsed.strike,
        oi: typeof entry.open_interest === "number" ? entry.open_interest : 0,
        iv: typeof entry.iv === "number" ? entry.iv : 0,
        gamma: typeof entry.gamma === "number" ? entry.gamma : 0,
        last: typeof entry.last_trade_price === "number" ? entry.last_trade_price : 0,
      });
    }

    const result = { spot, options };
    cache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}
