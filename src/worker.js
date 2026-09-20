// Cloudflare Workers host. Everything portable lives in app.js; this file only wires
// the platform pieces: the assets binding and the Durable Object vote store.
import { createApp } from "./app.js";
export { FeedbackLog } from "./feedback.js";

export default {
  async fetch(request, env) {
    const stub = env.FEEDBACK?.getByName("votes");
    return createApp({ env, store: stub, serveStatic: (r) => env.ASSETS.fetch(r) }).handle(request);
  },
};
