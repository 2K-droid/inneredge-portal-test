// Inner Edge portal test: a private agent connection (MCP) on Netlify.
// Test data only. The secret is part of the address: /mcp/<secret>.
// The secret itself lives in the Netlify environment variable MCP_PATH_TOKEN, never in this file.
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const SERVER_INFO = { name: "inneredge-portal-test", version: "0.1.0" };
const LATEST_PROTOCOL = "2025-06-18";

const TOOLS = [
  {
    name: "add_test_item",
    description:
      "Save one test item in the Inner Edge portal test store. Test data only: never put client data or personal data here.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title, up to 200 characters." },
        note: { type: "string", description: "Optional note, up to 2000 characters." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "list_test_items",
    description: "List the most recent test items in the Inner Edge portal test store (up to 20). Read only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function store() {
  return getStore({ name: "portal-test", consistency: "strong" });
}

function tokenMatches(given) {
  const expected = Netlify.env.get("MCP_PATH_TOKEN");
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

function text(t) {
  return { content: [{ type: "text", text: t }] };
}

async function callTool(name, args) {
  if (name === "add_test_item") {
    const title = typeof args?.title === "string" ? args.title.trim() : "";
    const note = typeof args?.note === "string" ? args.note.trim() : "";
    if (!title) return { ...text("A title is required."), isError: true };
    if (title.length > 200 || note.length > 2000) {
      return { ...text("Too long: title up to 200 characters, note up to 2000."), isError: true };
    }
    const now = new Date().toISOString();
    const id = now.replace(/[-:.TZ]/g, "") + "-" + Math.random().toString(36).slice(2, 8);
    const item = { id, title, note, created_at: now };
    await store().setJSON("items/" + id, item);
    console.info("add_test_item", id);
    return text(`Saved test item ${id} at ${now}.`);
  }
  if (name === "list_test_items") {
    const { blobs } = await store().list({ prefix: "items/" });
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 20);
    const items = [];
    for (const key of keys) {
      const item = await store().get(key, { type: "json" });
      if (item) items.push(item);
    }
    console.info("list_test_items", items.length);
    return text(JSON.stringify({ count: items.length, items }, null, 2));
  }
  return null;
}

async function handleMessage(msg) {
  const isRequest = msg && typeof msg === "object" && "id" in msg && msg.id !== null;
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return isRequest ? fail(-32600, "Invalid request") : null;
  }
  if (!isRequest) return null; // notifications (for example notifications/initialized) need no answer

  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: msg.params?.protocolVersion || LATEST_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: "Inner Edge portal test. Test data only.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const result = await callTool(msg.params?.name, msg.params?.arguments || {});
      if (!result) return fail(-32602, `Unknown tool: ${msg.params?.name}`);
      return reply(result);
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export default async (req, context) => {
  if (!Netlify.env.get("MCP_PATH_TOKEN")) {
    return new Response("Not configured", { status: 503 });
  }
  if (!tokenMatches(context?.params?.token)) {
    return new Response("Not found", { status: 404 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const out = await handleMessage(body);
    return out ? Response.json(out) : new Response(null, { status: 202 });
  } catch (err) {
    console.error("mcp error", err);
    return Response.json(
      { jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32603, message: "Internal error" } },
      { status: 500 },
    );
  }
};

export const config = {
  path: "/mcp/:token",
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ["ip", "domain"] },
};
