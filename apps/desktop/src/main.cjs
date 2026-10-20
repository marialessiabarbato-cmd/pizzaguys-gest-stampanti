// Pizza Guys — app desktop (Windows).
// Avvia l'Edge (processo separato), serve cassa/palmare/KDS in rete locale e apre la cassa.
"use strict";

const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { spawn, execSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const WEB_PORTS = { cassa: 5173, palmare: 5174, kds: 5175 };
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const BACKUP_KEEP = 14;

let win = null;
let edgeChild = null;
let quitting = false;
let restartDelay = 1000;
const servers = [];

// Versione ZIP: se accanto a "Pizza Guys.exe" c'è la cartella "dati", database, log e backup stanno lì
// (tutto in una sola cartella). Altrimenti si usa %APPDATA%\Pizza Guys (versione installata).
const portableData = path.join(path.dirname(process.execPath), "dati");
const dataDir = fs.existsSync(portableData) ? portableData : app.getPath("userData");
app.setPath("userData", dataDir);
const logDir = path.join(dataDir, "logs");
const backupDir = path.join(dataDir, "backup");
// edge.env accanto all'eseguibile (versione ZIP) ha la precedenza; altrimenti in %APPDATA% (versione installata).
const portableConfig = path.join(path.dirname(process.execPath), "edge.env");
const configPath = fs.existsSync(portableConfig) ? portableConfig : path.join(dataDir, "edge.env");
const dbPath = path.join(dataDir, "edge.sqlite");
const printDir = path.join(dataDir, "prints");

function ensureDirs() {
  for (const d of [dataDir, logDir, backupDir, printDir]) fs.mkdirSync(d, { recursive: true });
}

function log(line) {
  try {
    const f = path.join(logDir, "app.log");
    if (fs.existsSync(f) && fs.statSync(f).size > MAX_LOG_BYTES) fs.renameSync(f, f + ".old");
    fs.appendFileSync(f, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* il log non deve mai fermare l'app */
  }
}

// ── Configurazione ───────────────────────────────────────────────
function ensureConfig() {
  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(path.join(__dirname, "edge.env.template"), configPath);
    log("Creato edge.env dal template");
  }
}

function readConfig() {
  const out = {};
  for (const raw of fs.readFileSync(configPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

// ── Edge ─────────────────────────────────────────────────────────
// Un Edge rimasto attivo da una chiusura precedente terrebbe occupata la porta con la vecchia configurazione.
function killPortOwners(port) {
  if (process.platform !== "win32") return;
  try {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8", windowsHide: true });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING|IN ASCOLTO/i.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      if (cols[1] && cols[1].endsWith(":" + port)) pids.add(cols[cols.length - 1]);
    }
    for (const pid of pids) {
      if (String(process.pid) === pid) continue;
      log(`Porta ${port} occupata dal processo ${pid}: lo termino`);
      try { execSync(`taskkill /PID ${pid} /T /F`, { windowsHide: true }); } catch (e) { log(`taskkill ${pid} fallito: ${e.message}`); }
    }
  } catch (e) {
    log(`Controllo porta ${port} fallito: ${e.message}`);
  }
}

function stopEdge() {
  if (!edgeChild) return;
  const pid = edgeChild.pid;
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { windowsHide: true });
    else edgeChild.kill();
  } catch {
    try { edgeChild.kill(); } catch { /* già terminato */ }
  }
}

function startEdge() {
  if (quitting) return;
  const cfg = readConfig();
  killPortOwners(cfg.EDGE_API_PORT || 4100);
  const edgeFile = path.join(__dirname, "edge.mjs");
  const out = fs.openSync(path.join(logDir, "edge.log"), "a");
  const env = {
    ...process.env,
    ...cfg,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    EDGE_DB_PATH: dbPath,
    MOCK_PRINT_DIR: printDir,
  };
  delete env.KIOSK;
  edgeChild = spawn(process.execPath, [edgeFile], { env, stdio: ["ignore", out, out], windowsHide: true });
  const startedAt = Date.now();
  log(`Edge avviato (pid ${edgeChild.pid}) — CLOUD_API_URL=${cfg.CLOUD_API_URL || "(non impostato)"} — config: ${configPath}`);
  edgeChild.on("exit", (code, signal) => {
    log(`Edge terminato (code=${code}, signal=${signal})`);
    edgeChild = null;
    if (quitting) return;
    restartDelay = Date.now() - startedAt > 60_000 ? 1000 : Math.min(restartDelay * 2, 30_000);
    setTimeout(startEdge, restartDelay);
  });
}

function edgeUrl() {
  const cfg = readConfig();
  return `http://127.0.0.1:${cfg.EDGE_API_PORT || 4100}`;
}

function waitForEdge(timeoutMs = 60_000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.get(`${edgeUrl()}/api/status`, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => (Date.now() - t0 > timeoutMs ? resolve(false) : setTimeout(tick, 700));
    tick();
  });
}

// ── Web app statiche (cassa, palmare, KDS) ───────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json", ".txt": "text/plain",
};

function serveStatic(name, port) {
  const root = path.join(__dirname, "web", name);
  if (!fs.existsSync(root)) return;
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // fallback SPA, ma non per file con estensione (asset mancanti)
      if (path.extname(urlPath)) {
        res.writeHead(404).end();
        return;
      }
      file = path.join(root, "index.html");
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    headers["Cache-Control"] = file.endsWith("index.html") || ext === ".webmanifest" ? "no-cache" : "public, max-age=31536000, immutable";
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  server.on("error", (e) => log(`Server ${name}:${port} errore: ${e.message}`));
  server.listen(port, "0.0.0.0", () => log(`Servo ${name} su :${port}`));
  servers.push(server);
}

// ── Backup giornaliero del database ──────────────────────────────
async function backupDb(reason) {
  if (!fs.existsSync(dbPath)) return;
  try {
    const Database = require("better-sqlite3");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const dest = path.join(backupDir, `edge-${stamp}.sqlite`);
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    await db.backup(dest);
    db.close();
    const old = fs.readdirSync(backupDir).filter((f) => f.startsWith("edge-")).sort().reverse().slice(BACKUP_KEEP);
    for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });
    log(`Backup (${reason}) → ${dest}`);
  } catch (e) {
    log(`Backup fallito: ${e && e.message}`);
  }
}

function scheduleBackups() {
  setTimeout(() => backupDb("avvio"), 30_000);
  setInterval(() => {
    const h = new Date().getHours();
    if (h === 4) backupDb("notturno");
  }, 55 * 60 * 1000);
}

// ── Diagnostica ──────────────────────────────────────────────────
async function runDiagnostics() {
  const cfg = readConfig();
  const cloud = cfg.CLOUD_API_URL || "(non impostato)";
  const lines = [
    `Versione app: ${app.getVersion()}`,
    `Cartella dati: ${dataDir}`,
    `File configurazione: ${configPath} (${fs.existsSync(configPath) ? "presente" : "MANCANTE"})`,
    ...[path.join(path.dirname(process.execPath), "edge.env.txt"), path.join(dataDir, "edge.env.txt")]
      .filter((f) => fs.existsSync(f)).map((f) => `ATTENZIONE: esiste ${f} (nome sbagliato: deve chiamarsi edge.env, senza .txt)`),
    `CLOUD_API_URL letto: ${cloud}`,
    `Edge in esecuzione: ${edgeChild ? "sì (pid " + edgeChild.pid + ")" : "NO"}`,
    `Hardware: ${cfg.HARDWARE_BRIDGE_MODE || "mock"}`,
  ];
  // Stesso tipo di richiesta che fa l'Edge (fetch di Node) verso il Cloud
  const script = `const u=process.argv[1];const t=Date.now();fetch(u,{signal:AbortSignal.timeout(8000)}).then(r=>console.log('RISPOSTA '+r.status+' in '+(Date.now()-t)+' ms')).catch(e=>console.log('ERRORE '+e.message+(e.cause?' / '+(e.cause.code||e.cause.message):'')))`;
  try {
    const r = spawnSync(process.execPath, ["-e", script, cloud], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 15000, windowsHide: true,
    });
    lines.push(`Prova Cloud (da questo PC): ${(r.stdout || r.stderr || "nessuna risposta").trim()}`);
  } catch (e) {
    lines.push(`Prova Cloud: errore ${e.message}`);
  }
  lines.push(`Prova Edge locale: ${await new Promise((res) => {
    http.get(`${edgeUrl()}/api/status`, { timeout: 3000 }, (r) => { res("risponde " + r.statusCode); r.resume(); })
      .on("error", (e) => res("ERRORE " + e.message)).on("timeout", function () { this.destroy(); });
  })}`);
  const text = lines.join("\n");
  log("DIAGNOSTICA\n" + text);
  try { fs.writeFileSync(path.join(logDir, "diagnostica.txt"), text); } catch { /* ignora */ }
  await dialog.showMessageBox(win || undefined, { type: "info", title: "Diagnostica Pizza Guys", message: "Diagnostica", detail: text + "\n\n(salvata anche in logs\\diagnostica.txt)" });
}

// ── Finestra ─────────────────────────────────────────────────────
const LOADING = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#eee;font:22px system-ui"><div>Avvio di Pizza Guys…</div></body>',
)}`;

function createWindow() {
  const kiosk = String(readConfig().KIOSK).toLowerCase() === "true";
  win = new BrowserWindow({
    width: 1280, height: 800, show: false, backgroundColor: "#111111", title: "Pizza Guys",
    autoHideMenuBar: true, fullscreen: kiosk, kiosk,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => (kiosk ? win.show() : (win.maximize(), win.show())));
  win.loadURL(LOADING);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("closed", () => (win = null));
}

async function openCassa() {
  const ok = await waitForEdge();
  if (!win) return;
  if (!ok) {
    await dialog.showMessageBox(win, {
      type: "warning",
      message: "L'Edge non risponde",
      detail: `Controlla i log in: ${logDir}\nLa cassa verrà aperta comunque.`,
    });
  }
  win.loadURL(`http://localhost:${WEB_PORTS.cassa}`);
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Pizza Guys",
        submenu: [
          { label: "Ricarica cassa", accelerator: "F5", click: () => win && win.loadURL(`http://localhost:${WEB_PORTS.cassa}`) },
          { label: "Schermo intero", accelerator: "F11", click: () => win && win.setFullScreen(!win.isFullScreen()) },
          { label: "Modifica configurazione (edge.env)", accelerator: "CmdOrCtrl+Shift+C", click: () => shell.openPath(configPath) },
          { label: "Apri cartella log", accelerator: "CmdOrCtrl+Shift+L", click: () => shell.openPath(logDir) },
          { label: "Apri cartella backup", click: () => shell.openPath(backupDir) },
          { label: "Backup database adesso", click: () => backupDb("manuale") },
          { label: "Diagnostica", accelerator: "CmdOrCtrl+Shift+D", click: () => runDiagnostics() },
          { label: "Riavvia Edge", click: () => { stopEdge(); } },
          { type: "separator" },
          { label: "Esci", accelerator: "Alt+F4", click: () => app.quit() },
        ],
      },
    ]),
  );
}

// ── Ciclo di vita ────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    ensureDirs();
    ensureConfig();
    log(`Pizza Guys ${app.getVersion()} — dati in ${dataDir}`);
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
    for (const [name, port] of Object.entries(WEB_PORTS)) serveStatic(name, port);
    startEdge();
    buildMenu();
    createWindow();
    openCassa();
    scheduleBackups();
  });

  app.on("before-quit", () => {
    quitting = true;
    servers.forEach((s) => s.close());
    stopEdge();
  });
  app.on("will-quit", () => stopEdge());
  app.on("window-all-closed", () => app.quit());
}
