// Prepara apps/desktop/stage: Edge in un solo file, web app compilate, main Electron e unica dipendenza nativa.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const root = path.resolve(app, "../..");
const stage = path.join(app, "stage");

const webApps = [
  ["edge-web", "cassa"],
  ["handheld-web", "palmare"],
  ["kds-web", "kds"],
];
for (const [dir] of webApps) {
  if (!existsSync(path.join(root, "apps", dir, "dist", "index.html"))) {
    throw new Error(`Manca apps/${dir}/dist: esegui prima la build (pnpm turbo build).`);
  }
}
if (!existsSync(path.join(root, "services/edge-api/dist/index.js"))) {
  throw new Error("Manca services/edge-api/dist: esegui prima la build.");
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 1. Edge in un file solo (better-sqlite3 resta esterno: è un modulo nativo).
await build({
  entryPoints: [path.join(root, "services/edge-api/dist/index.js")],
  outfile: path.join(stage, "edge.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["better-sqlite3"],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});

// 2. Web app compilate
for (const [dir, name] of webApps) {
  cpSync(path.join(root, "apps", dir, "dist"), path.join(stage, "web", name), { recursive: true });
}

// 3. Main Electron + template configurazione
cpSync(path.join(app, "src/main.cjs"), path.join(stage, "main.cjs"));
cpSync(path.join(app, "src/edge.env.template"), path.join(stage, "edge.env.template"));

// 4. package.json dell'app impacchettata: solo la dipendenza nativa
const sqliteVersion = JSON.parse(
  readFileSync(path.join(root, "packages/edge-db/package.json"), "utf8"),
).dependencies["better-sqlite3"];
const own = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(
    {
      name: "pizzaguys-gest",
      productName: "Pizza Guys",
      version: own.version,
      description: own.description,
      author: "Pizza Guys",
      main: "main.cjs",
      dependencies: { "better-sqlite3": sqliteVersion },
    },
    null,
    2,
  ),
);
execSync("npm install --omit=dev --no-audit --no-fund --ignore-scripts", { cwd: stage, stdio: "inherit" });
console.log("✓ stage pronto in", stage);
