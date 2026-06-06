import { router } from "./trpc";
import { signallabRouter } from "./routers/signallab";
import { watchlistRouter } from "./routers/watchlist";
import { channelRouter } from "./routers/channel";
import { videoRouter } from "./routers/video";
import { signalRouter } from "./routers/signal";
import { userPrefRouter } from "./routers/userPref";

export const appRouter = router({
  signallab: signallabRouter,
  watchlist: watchlistRouter,
  channel: channelRouter,
  video: videoRouter,
  signal: signalRouter,
  userPref: userPrefRouter,
});

export type AppRouter = typeof appRouter;
