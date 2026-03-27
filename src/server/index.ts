import { resolve } from "node:path";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { setStorage } from "./storage-instance.js";
import { FileStorage } from "./storage-file.js";
import { appRouter } from "./router.js";
import { handleCommandStream } from "./command-stream.js";

// Register games from disk (fs-based)
import "../games/test-world.js";
import "../games/colossal-cave/index.js";
import "../games/the-aaru/index.js";

// Configure file-based storage
setStorage(new FileStorage(resolve(process.cwd(), "data")));

const server = Fastify();

server.post("/api/command", async (req, reply) => {
  const webRequest = new Request("http://localhost/api/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body),
  });
  const response = await handleCommandStream(webRequest);
  reply.header("content-type", "application/x-ndjson");
  reply.header("transfer-encoding", "chunked");
  reply.header("cache-control", "no-cache");
  reply.send(response.body);
});

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter },
});

const port = Number(process.env["PORT"]) || 3001;

server.listen({ port, host: "0.0.0.0" }).then((address) => {
  console.log(`Server listening at ${address}`);
});
