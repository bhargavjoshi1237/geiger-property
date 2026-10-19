// Node module hooks so the generator can import app code as-is: resolves the
// `@/` root alias and extensionless specifiers, and transpiles .jsx with the
// project's TypeScript compiler. Used via `node --import <this file> …`.
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROOT_URL = pathToFileURL(ROOT).href;
const HAS_EXT = /\.(c|m)?jsx?$/;

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href;
    const local = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
    if (local && !HAS_EXT.test(spec)) {
      for (const cand of [`${spec}.js`, `${spec}.jsx`, `${spec}/index.js`]) {
        try {
          return next(cand, ctx);
        } catch {
          // try the next candidate
        }
      }
    }
    return next(spec, ctx);
  },
  // App sources are ESM without "type": "module"; .jsx is transpiled first.
  load(url, ctx, next) {
    const appFile = url.startsWith(ROOT_URL) && !url.includes("/node_modules/") && /\.jsx?$/.test(url);
    if (!appFile) return next(url, ctx);
    const file = fileURLToPath(url);
    let source = readFileSync(file, "utf8");
    if (url.endsWith(".jsx")) {
      source = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
    }
    return { format: "module", source, shortCircuit: true };
  },
});
