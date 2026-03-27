import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

// Register games from disk (fs-based) before importing the router
import "../games/test-world.js";
import "../games/colossal-cave/index.js";
import "../games/the-aaru/index.js";

import { appRouter } from "./router.js";

const server = Fastify();

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter },
});

const port = Number(process.env["PORT"]) || 3001;

server.listen({ port, host: "0.0.0.0" }).then((address) => {
  console.log(`Server listening at ${address}`);
});
