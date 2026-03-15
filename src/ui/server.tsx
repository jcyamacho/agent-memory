import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { NotFoundError } from "../errors.ts";
import type { MemoryAdmin, MemoryRecord, MemoryRepository } from "../memory.ts";
import { Page } from "./components/page.tsx";
import { NO_WORKSPACE_FILTER } from "./constants.ts";

interface WebServerOptions {
  port: number;
}

const DEFAULT_LIST_LIMIT = 15;
const MAX_LIST_LIMIT = 100;

export const startWebServer = (repository: MemoryRepository & MemoryAdmin, options: WebServerOptions): Server => {
  const app = new Hono();

  app.get("/", async (c) => {
    const workspace = c.req.query("workspace") ?? null;
    const pageNum = Math.max(Number(c.req.query("page")) || 1, 1);
    const editingId = c.req.query("edit") ?? null;
    const showCreate = c.req.query("create") === "1";

    const isNoWorkspace = workspace === NO_WORKSPACE_FILTER;
    const wsFilter = workspace && !isNoWorkspace ? workspace : undefined;

    const page = await repository.findAll({
      workspace: wsFilter,
      workspaceIsNull: isNoWorkspace,
      offset: (pageNum - 1) * DEFAULT_LIST_LIMIT,
      limit: DEFAULT_LIST_LIMIT,
    });

    const workspaces = await repository.listWorkspaces();

    return c.html(
      <Page
        memories={page.items}
        workspaces={workspaces}
        selectedWorkspace={workspace}
        editingId={editingId}
        currentPage={pageNum}
        hasMore={page.hasMore}
        showCreate={showCreate}
      />,
    );
  });

  app.post("/memories", async (c) => {
    const form = await c.req.parseBody();
    const content = typeof form.content === "string" ? form.content.trim() : "";
    const workspace = typeof form.workspace === "string" ? form.workspace.trim() || undefined : undefined;

    if (content) {
      const now = new Date();
      await repository.save({ id: randomUUID(), content, workspace, createdAt: now, updatedAt: now });
    }

    const wsParam = workspace ? `/?workspace=${encodeURIComponent(workspace)}` : "/";
    return c.redirect(wsParam);
  });

  app.post("/memories/:id/update", async (c) => {
    const form = await c.req.parseBody();
    const content = typeof form.content === "string" ? form.content.trim() : "";
    const returnUrl = safeReturnUrl(form.returnUrl);

    if (content) {
      try {
        await repository.update(c.req.param("id"), content);
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }

    return c.redirect(returnUrl);
  });

  app.post("/memories/:id/delete", async (c) => {
    const form = await c.req.parseBody();
    const returnUrl = safeReturnUrl(form.returnUrl);

    try {
      await repository.delete(c.req.param("id"));
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }

    return c.redirect(returnUrl);
  });

  app.get("/api/workspaces", async (c) => {
    const workspaces = await repository.listWorkspaces();
    return c.json({ workspaces });
  });

  app.get("/api/memories", async (c) => {
    const workspace = c.req.query("workspace");
    const limitParam = c.req.query("limit");
    const limit = Math.min(Math.max(Number(limitParam) || DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const page = await repository.findAll({ workspace, offset, limit });
    return c.json({ items: page.items.map(toMemoryJson), hasMore: page.hasMore });
  });

  app.get("/api/memories/:id", async (c) => {
    const memory = await repository.findById(c.req.param("id"));
    if (!memory) return c.json({ error: "Memory not found." }, 404);
    return c.json(toMemoryJson(memory));
  });

  app.post("/api/memories", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON." }, 400);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return c.json({ error: "Content is required." }, 400);
    const workspace = typeof body.workspace === "string" ? body.workspace.trim() || undefined : undefined;
    const now = new Date();
    const memory = await repository.save({ id: randomUUID(), content, workspace, createdAt: now, updatedAt: now });
    return c.json(toMemoryJson(memory), 201);
  });

  app.patch("/api/memories/:id", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON." }, 400);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return c.json({ error: "Content is required." }, 400);
    try {
      const updated = await repository.update(c.req.param("id"), content);
      return c.json(toMemoryJson(updated));
    } catch (error) {
      if (error instanceof NotFoundError) return c.json({ error: "Memory not found." }, 404);
      throw error;
    }
  });

  app.delete("/api/memories/:id", async (c) => {
    try {
      await repository.delete(c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof NotFoundError) return c.json({ error: "Memory not found." }, 404);
      throw error;
    }
  });

  return serve({ fetch: app.fetch, port: options.port }) as Server;
};

const safeReturnUrl = (value: unknown): string => {
  if (typeof value === "string" && value.startsWith("/")) return value;
  return "/";
};

const toMemoryJson = (memory: MemoryRecord) => ({
  id: memory.id,
  content: memory.content,
  workspace: memory.workspace ?? null,
  created_at: memory.createdAt.toISOString(),
  updated_at: memory.updatedAt.toISOString(),
});
