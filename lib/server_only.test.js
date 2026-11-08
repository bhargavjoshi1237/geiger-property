import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// PLAT-01h: modules holding server secrets import "server-only", and no "use client" module reaches one (next build would fail).

const ROOT = path.resolve(".");
const SOURCES = ["app", "components", "context", "lib", "utils", "proxy.js"];
const SECRET_MODULES = ["lib/supabase/admin.js", "lib/stripe/server.js", "lib/email/client.js", "lib/auth/staff.js", "lib/secrets/integration_secrets.js", "lib/chat/turn.js"];

const IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(rel, out = []) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isFile()) {
    if (/\.(m?js|jsx)$/.test(rel) && !/\.test\.m?js$/.test(rel)) out.push(rel);
    return out;
  }
  for (const name of readdirSync(abs)) if (name !== "node_modules") walk(path.join(rel, name), out);
  return out;
}

// A specifier resolved to a repo file (posix, relative to the root), or null for packages.
function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const cand of [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, path.join(base, "index.js"), path.join(base, "index.jsx")]) {
    const abs = path.join(ROOT, cand);
    if (existsSync(abs) && statSync(abs).isFile()) return path.normalize(cand).split(path.sep).join("/");
  }
  return null;
}

function graph() {
  const files = SOURCES.flatMap((s) => walk(s)).map((f) => f.split(path.sep).join("/"));
  const nodes = new Map();
  for (const file of files) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    const code = strip(src);
    const specs = [...code.matchAll(IMPORT)].map((m) => m[1] || m[2]);
    nodes.set(file, {
      client: /^\s*["']use client["']/.test(code),
      serverOnly: specs.includes("server-only"),
      deps: specs.map((s) => resolve(file, s)).filter(Boolean),
    });
  }
  return nodes;
}

// Every path from a "use client" module to a "server-only" one: [client, …, server-only module].
function clientLeaks(nodes) {
  const leaks = [];
  for (const [file, node] of nodes) {
    if (!node.client) continue;
    const seen = new Map([[file, null]]);
    const queue = [file];
    while (queue.length) {
      const cur = queue.shift();
      const n = nodes.get(cur);
      if (!n) continue;
      if (n.serverOnly) {
        const trail = [];
        for (let at = cur; at; at = seen.get(at)) trail.unshift(at);
        leaks.push(trail.join(" → "));
        continue;
      }
      for (const dep of n.deps) {
        if (seen.has(dep)) continue;
        seen.set(dep, cur);
        queue.push(dep);
      }
    }
  }
  return leaks;
}

test("server-only: the modules that hold secrets import it", () => {
  const nodes = graph();
  for (const file of SECRET_MODULES) {
    assert.ok(nodes.has(file), `${file} exists`);
    assert.ok(nodes.get(file).serverOnly, `${file} imports "server-only"`);
  }
});

test("server-only: no client module imports a server-only module, directly or through others", () => {
  assert.deepEqual(clientLeaks(graph()), []);
});

test("server-only: the scan follows aliases, relative paths and re-exports", () => {
  const nodes = new Map([
    ["a.jsx", { client: true, serverOnly: false, deps: ["b.js"] }],
    ["b.js", { client: false, serverOnly: false, deps: ["c.js"] }],
    ["c.js", { client: false, serverOnly: true, deps: [] }],
    ["d.js", { client: false, serverOnly: false, deps: ["c.js"] }],
  ]);
  assert.deepEqual(clientLeaks(nodes), ["a.jsx → b.js → c.js"]);
  const specs = [...strip(`import x from "@/lib/a";\nexport { y } from "./b";\nimport "server-only";\nconst z = await import("../c");`).matchAll(IMPORT)].map((m) => m[1] || m[2]);
  assert.deepEqual(specs, ["@/lib/a", "./b", "server-only", "../c"]);
});
