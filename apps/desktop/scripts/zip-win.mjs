// Versione ZIP per il PC della cassa (quella usata nel locale): app Windows + LEGGIMI,
// script firewall, edge.env di esempio e cartella "dati" vuota, tutto in "PizzaGuys/".
// Da lanciare sul Mac dopo `pnpm turbo build`:  pnpm --filter @pizzaguys/desktop zip:win
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(app, "release");
const { version } = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
const run = (cmd) => execSync(cmd, { cwd: app, stdio: "inherit" });

console.log(`▸ Pizza Guys ${version}: preparo l'app`);
run("node scripts/stage.mjs");

console.log("▸ Costruisco l'app Windows (x64)");
run("npx electron-builder --config electron-builder.yml --win dir --x64 --projectDir .");
const unpacked = path.join(release, "win-unpacked");
if (!existsSync(path.join(unpacked, "Pizza Guys.exe"))) throw new Error("Build Windows non riuscita: manca Pizza Guys.exe");
const sqlite = path.join(unpacked, "resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node");
if (!existsSync(sqlite)) throw new Error("Manca il modulo SQLite per Windows (better_sqlite3.node)");

console.log("▸ Compongo la cartella PizzaGuys");
const out = path.join(release, "PizzaGuys");
rmSync(out, { recursive: true, force: true });
cpSync(unpacked, out, { recursive: true });
for (const f of readdirSync(path.join(app, "extras"))) cpSync(path.join(app, "extras", f), path.join(out, f));
mkdirSync(path.join(out, "dati"), { recursive: true });

const zipName = `PizzaGuys-${version}-win-x64.zip`;
rmSync(path.join(release, zipName), { force: true });
execSync(`zip -qry "${zipName}" PizzaGuys`, { cwd: release, stdio: "inherit" });
console.log(`✓ ${path.join(release, zipName)}`);
