import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/router.js";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});
