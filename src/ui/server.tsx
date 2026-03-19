import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { MemoryApi } from "../memory.ts";
import { createPageRoutes } from "./routes/page-routes.tsx";

interface WebServerOptions {
  port: number;
}

export function startWebServer(memory: MemoryApi, options: WebServerOptions): Server {
  const app = new Hono();
  app.route("/", createPageRoutes(memory));

  return serve({ fetch: app.fetch, port: options.port }) as Server;
}
