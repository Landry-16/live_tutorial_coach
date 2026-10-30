import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { ClientMsg } from "../../shared/contracts.ts";
import { prepare } from "./prep.ts";
import { Session } from "./session.ts";
import { DATA_DIR, getStatus, isId, setStatus, tutorialDir } from "./store.ts";

const MAX_UPLOAD = 1024 ** 3; // Files API limit
const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.post("/api/tutorials", async (c) => {
  const body = await c.req.parseBody();
  const file = body.video;
  if (!(file instanceof File)) return c.json({ error: "send the tutorial as an mp4 in the 'video' field" }, 400);
  if (file.type !== "video/mp4") return c.json({ error: "only .mp4 is supported" }, 415);
  if (file.size > MAX_UPLOAD) return c.json({ error: "video is over 1 GB" }, 413);

  const id = randomUUID();
  await mkdir(tutorialDir(id), { recursive: true });
  await writeFile(`${tutorialDir(id)}/tutorial.mp4`, Buffer.from(await file.arrayBuffer()));
  setStatus(id)({ state: "processing", stage: "Starting" });
  void prepare(id, setStatus(id));
  return c.json({ id }, 202);
});

app.get("/api/tutorials/:id", (c) => {
  const id = c.req.param("id");
  const status = isId(id) ? getStatus(id) : undefined;
  return status ? c.json(status) : c.json({ error: "unknown tutorial" }, 404);
});

// tutorial.mp4 and ref/<step>.jpg, with range requests so the player can seek
app.use("/media/*", serveStatic({ root: DATA_DIR, rewriteRequestPath: (p) => p.replace(/^\/media/, "") }));

app.get("/ws/:id", upgradeWebSocket((c) => {
  const id = c.req.param("id")!;
  let session: Session | null = null;
  return {
    onOpen(_e, ws) {
      const status = isId(id) ? getStatus(id) : undefined;
      if (status?.state !== "ready") return ws.close(4004, "tutorial not ready");
      session = new Session(id, status.tutorial, (m) => ws.send(JSON.stringify(m)));
    },
    onMessage(e, ws) {
      if (typeof e.data === "string") {
        try {
          session?.onMessage(JSON.parse(e.data) as ClientMsg);
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "bad message" }));
        }
      } else {
        session?.onAudio(Buffer.from(e.data as ArrayBuffer));
      }
    },
    onClose() {
      session?.close();
    },
  };
}));

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, () => console.log(`coach server on http://localhost:${port}`));
injectWebSocket(server);
