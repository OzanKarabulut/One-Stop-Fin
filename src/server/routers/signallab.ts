import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { getQuotes, getOptionChain, getHistoricalPrices } from "../services/yahoo-finance";
import { blackScholes, calculateCSPReturn } from "../services/black-scholes";
import { annualizedVolatility, calculateDailyReturns, round } from "../services/math-engine";
import { OZAN_TICKERS } from "../services/tickers";

export const signallabRouter = router({
  tickers: publicProcedure.query(() => OZAN_TICKERS),

  quotes: publicProcedure
    .input(z.object({ symbols: z.array(z.string()).optional() }))
    .query(async ({ input }) => {
      const symbols = input.symbols?.length ? input.symbols : OZAN_TICKERS.slice(0, 10);
      return getQuotes(symbols);
    }),

  optionChain: publicProcedure
    .input(z.object({ symbol: z.string(), expDate: z.string().optional() }))
    .query(async ({ input }) => getOptionChain(input.symbol, input.expDate)),

  cspScreener: publicProcedure
    .input(z.object({ symbols: z.array(z.string()).optional(), maxDte: z.number().default(45) }))
    .query(async ({ input }) => {
      const symbols = input.symbols?.length ? input.symbols : OZAN_TICKERS;
      const quotes = await getQuotes(symbols);
      const results = [];

      for (const quote of quotes.slice(0, 15)) {
        if (!quote.regularMarketPrice) continue;
        const chain = await getOptionChain(quote.symbol);
        if (!chain) continue;

        const targetStrike = quote.regularMarketPrice * 0.9;
        const eligiblePuts = chain.puts.filter(
          (p) => p.strike <= targetStrike && p.bid > 0
        );

        for (const put of eligiblePuts.slice(0, 3)) {
          const dte = Math.max(1, Math.ceil((new Date(put.expiration).getTime() - Date.now()) / 86400000));
          if (dte > input.maxDte) continue;
          const cspReturn = calculateCSPReturn({ premium: put.bid, strikePrice: put.strike, daysToExpiry: dte });
          results.push({
            symbol: quote.symbol,
            price: round(quote.regularMarketPrice),
            strike: put.strike,
            bid: put.bid,
            dte,
            ...cspReturn,
          });
        }
      }
      return results.sort((a, b) => b.annualized - a.annualized);
    }),

  aiPick: publicProcedure.query(async () => {
    const quotes = await getQuotes(OZAN_TICKERS.slice(0, 10));
    return quotes
      .filter((q) => q.regularMarketChangePercent !== undefined)
      .map((q) => ({
        symbol: q.symbol,
        price: round(q.regularMarketPrice || 0),
        change: round(q.regularMarketChangePercent || 0),
        signal: (q.regularMarketChangePercent || 0) > 2 ? "STRONG_BUY" :
                (q.regularMarketChangePercent || 0) > 0 ? "BUY" :
                (q.regularMarketChangePercent || 0) < -2 ? "STRONG_SELL" : "SELL",
      }))
      .sort((a, b) => b.change - a.change);
  }),

  manualAnalysis: publicProcedure
    .input(z.object({ symbol: z.string(), strikePrice: z.number(), daysToExpiry: z.number(), riskFreeRate: z.number().default(0.05) }))
    .query(async ({ input }) => {
      const history = await getHistoricalPrices(input.symbol, "3mo", "1d");
      const prices = history.map((h: { close: number }) => h.close).filter(Boolean);
      const returns = calculateDailyReturns(prices);
      const vol = annualizedVolatility(returns);
      const currentPrice = prices[prices.length - 1] || 0;

      const bs = blackScholes({
        stockPrice: currentPrice,
        strikePrice: input.strikePrice,
        timeToExpiry: input.daysToExpiry / 365,
        riskFreeRate: input.riskFreeRate,
        volatility: vol,
      });

      return { currentPrice: round(currentPrice), volatility: round(vol, 4), ...bs, history };
    }),

  marketOverview: publicProcedure.query(async () => {
    const indices = await getQuotes(["^GSPC", "^IXIC", "^VIX", "^DJI", "BTC-USD"]);
    return indices.map((q) => ({
      symbol: q.symbol?.replace("^", "") || "",
      name: q.shortName || q.symbol || "",
      price: round(q.regularMarketPrice || 0),
      change: round(q.regularMarketChange || 0),
      changePct: round(q.regularMarketChangePercent || 0),
    }));
  }),
});
