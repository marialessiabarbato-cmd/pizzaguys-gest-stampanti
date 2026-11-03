// Identificativo della build delle app web (cassa, palmare, KDS): versione dell'app desktop
// + commit. Lo usano i device nel collegamento all'Edge: la cassa avvisa se un palmare o un
// KDS gira con una build diversa (pagina vecchia rimasta in memoria, app non aggiornata).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildId() {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).version;
  } catch {
    /* package.json non leggibile: resta 0.0.0 */
  }
  let commit = "dev";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    /* fuori da git (es. sorgenti copiati): basta la versione */
  }
  return `${version}+${commit}`;
}
