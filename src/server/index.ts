import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
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
