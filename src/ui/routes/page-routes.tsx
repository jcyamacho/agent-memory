import { type Context, Hono } from "hono";
import { NotFoundError, ValidationError } from "../../errors.ts";
import type { MemoryApi } from "../../memory.ts";
import { Page } from "../components/page.tsx";
import { NO_WORKSPACE_FILTER } from "../constants.ts";

const DEFAULT_LIST_LIMIT = 15;

export function createPageRoutes(memory: MemoryApi): Hono {
  const app = new Hono();

  async function renderPage(c: Context) {
    const workspace = c.req.query("workspace") ?? null;
    const pageNum = Math.max(Number(c.req.query("page")) || 1, 1);
    const editingId = c.req.query("edit") ?? null;
    const showCreate = c.req.query("create") === "1";

    const isNoWorkspace = workspace === NO_WORKSPACE_FILTER;
    const wsFilter = workspace && !isNoWorkspace ? workspace : undefined;

    const page = await memory.list({
      workspace: wsFilter,
      global: isNoWorkspace,
      offset: (pageNum - 1) * DEFAULT_LIST_LIMIT,
      limit: DEFAULT_LIST_LIMIT,
    });

    const workspaces = await memory.listWorkspaces();

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
  }

  async function createMemory(c: Context) {
    const form = await c.req.parseBody();
    const content = typeof form.content === "string" ? form.content : "";
    const workspace = typeof form.workspace === "string" ? form.workspace : undefined;

    try {
      await memory.create({ content, workspace });
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }
    }

    const wsParam = workspace?.trim() ? `/?workspace=${encodeURIComponent(workspace.trim())}` : "/";
    return c.redirect(wsParam);
  }

  async function updateMemory(c: Context) {
    const form = await c.req.parseBody();
    const content = typeof form.content === "string" ? form.content : "";
    const returnUrl = safeReturnUrl(form.returnUrl);
    const id = c.req.param("id") ?? "";

    try {
      await memory.update({ id, content });
    } catch (error) {
      if (!(error instanceof NotFoundError) && !(error instanceof ValidationError)) throw error;
    }

    return c.redirect(returnUrl);
  }

  async function deleteMemory(c: Context) {
    const form = await c.req.parseBody();
    const returnUrl = safeReturnUrl(form.returnUrl);
    const id = c.req.param("id") ?? "";

    try {
      await memory.delete({ id });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }

    return c.redirect(returnUrl);
  }

  app.get("/", renderPage);
  app.post("/memories", createMemory);
  app.post("/memories/:id/update", updateMemory);
  app.post("/memories/:id/delete", deleteMemory);

  return app;
}

function safeReturnUrl(value: unknown): string {
  if (typeof value === "string" && value.startsWith("/")) return value;
  return "/";
}
