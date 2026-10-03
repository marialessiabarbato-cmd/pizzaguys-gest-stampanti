#!/usr/bin/env python3
"""Smoke T19 — lo stato operativo dell'Edge sopravvive a un riavvio.

Apre tavoli in stati diversi (comanda in attesa con nota, tavolo bloccato, split,
preconto, asporto, incasso nel turno), riavvia l'Edge e verifica che tutto torni.

  python3 scripts/smoke-restart.py            # riavvio "pulito" (come un aggiornamento)
  python3 scripts/smoke-restart.py --crash    # spegnimento forzato (kill -9), poi riavvio

Riavvio pulito: `tsx watch` (touch di index.ts). Con --crash l'Edge va riavviato a mano
(in sviluppo rilanciare `pnpm dev`; in produzione lo fa systemd).
⚠ Stampa preconto e comande: puntare prima le stampanti al simulatore.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

EDGE = "http://localhost:4100"
ROOT = Path(__file__).resolve().parent.parent
EDGE_ENTRY = ROOT / "services" / "edge-api" / "src" / "index.ts"

PASS: list[str] = []
FAIL: list[str] = []


def req(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    r = urllib.request.Request(EDGE + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=10) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def check(name: str, cond: bool, detail: str = "") -> None:
    (PASS if cond else FAIL).append(name if cond else f"{name}: {detail}")
    print(f"  {'OK ' if cond else 'FAIL'} {name}" + ("" if cond else f" — {detail}"))


def edge_pid() -> str:
    out = subprocess.run(["lsof", "-tiTCP:4100", "-sTCP:LISTEN"], capture_output=True, text=True).stdout.split()
    return out[0] if out else ""


def restart_edge(crash: bool) -> None:
    before = edge_pid()
    if crash:
        # In produzione systemd riavvia l'Edge (Restart=on-failure). In sviluppo `tsx watch`
        # dopo un kill -9 resta bloccato: va riavviato `pnpm dev` a mano.
        print(f"  kill -9 {before} (spegnimento forzato)")
        subprocess.run(["kill", "-9", before])
        print("  → riavvia ora l'Edge (in sviluppo: ferma e rilancia `pnpm dev`). Attendo fino a 3 minuti...")
        wait_s = 180
    else:
        EDGE_ENTRY.touch()
        wait_s = 60
    for _ in range(wait_s):
        time.sleep(1)
        pid = edge_pid()
        if pid and pid != before:
            try:
                if req("GET", "/health")[0] == 200:
                    return
            except OSError:
                pass
    raise SystemExit(f"Edge non ripartito entro {wait_s} s")


def name_of(x) -> str:
    return x["name"] if isinstance(x["name"], str) else x["name"]["it"]


def main() -> int:
    crash = "--crash" in sys.argv
    print(f"=== T19 smoke riavvio Edge ({'crash' if crash else 'pulito'}) ===\n")

    _, waiter = req("POST", "/api/staff/verify-pin", {"pin": "1234"})
    _, cashier = req("POST", "/api/staff/verify-pin", {"pin": "5678"})
    _, shifts = req("GET", "/api/shifts")
    shift = next((s for s in shifts if s["staffId"] == cashier["id"]), None)
    if not shift:
        _, shift = req("POST", "/api/shifts/start", {"staffId": cashier["id"]})
    _, menu = req("GET", "/api/menu")
    products = menu["snapshot"]["products"]
    marg = next(p for p in products if name_of(p) == "Margherita")
    _, tables = req("GET", "/api/tables/live")
    free = [t for t in tables if not t.get("isVirtual") and t["status"] == "FREE"]
    if len(free) < 4:
        print("Servono almeno 4 tavoli liberi")
        return 1
    t_lock, t_split, t_bill, t_paid = free[:4]
    op_w = f"{waiter['firstName']} {waiter['lastName']}"
    op_c = f"{cashier['firstName']} {cashier['lastName']}"

    def send_order(table, course=1, hold=False, note=None):
        line = {"productId": marg["id"], "name": "Margherita", "quantity": 2, "unitPrice": 7,
                "variants": [], "course": course, "hold": hold}
        if note:
            line["notes"] = note
        _, o = req("POST", "/api/orders", {"tableId": table["id"], "operatorId": waiter["id"],
                                           "operatorName": op_w, "channel": "TABLE", "lines": [line]})
        req("POST", f"/api/orders/{o['id']}/submit", {})

    print("Preparazione:")
    send_order(t_lock, course=2, hold=True, note="ben cotta")  # resta bloccato dal cameriere
    send_order(t_split)
    req("POST", f"/api/pos/tables/{t_split['id']}/split/roman", {"shares": 2})
    send_order(t_bill)
    req("POST", f"/api/pos/tables/{t_bill['id']}/prebill", {})
    send_order(t_paid)
    _, bill = req("GET", f"/api/pos/tables/{t_paid['id']}/bill")
    req("POST", f"/api/pos/tables/{t_paid['id']}/pay", {"operatorId": cashier["id"], "operatorName": op_c,
                                                        "paymentMethod": "CASH", "amountReceived": bill["total"],
                                                        "shiftId": shift["id"]})
    _, co = req("POST", "/api/pos/counter-orders", {"channel": "TAKEAWAY", "operatorId": waiter["id"],
                                                    "operatorName": op_w, "customerName": "Smoke Riavvio",
                                                    "asap": True})
    counter = co["order"]

    def snapshot():
        _, live = req("GET", "/api/tables/live")
        by_id = {t["id"]: t for t in live}
        _, kds = req("GET", "/api/kds/tickets")
        _, summary = req("GET", f"/api/shifts/{shift['id']}/summary")
        _, counters = req("GET", "/api/pos/counter-orders")
        bills = {t["id"]: req("GET", f"/api/pos/tables/{t['id']}/bill")[1] for t in (t_lock, t_split, t_bill)}
        return {
            "status": {t["id"]: by_id[t["id"]]["status"] for t in (t_lock, t_split, t_bill, t_paid)},
            "totals": {k: v.get("total") for k, v in bills.items()},
            "roman": (bills[t_split["id"]].get("romanSplit") or {}).get("shares"),
            "kds": sorted((t["tableId"], t["course"], t["hold"]) for t in kds["tickets"]
                          if t["tableId"] in (t_lock["id"], t_split["id"], t_bill["id"])),
            "kds_note": [ln.get("notes") for t in kds["tickets"] if t["tableId"] == t_lock["id"] for ln in t["lines"]],
            "shift_cash": summary["theoretical"]["cash"],
            "counter": any(c["id"] == counter["id"] for c in counters),
        }

    before = snapshot()
    print(f"  stato prima: {before['status']} · turno contanti €{before['shift_cash']}")

    print("\nRiavvio Edge...")
    restart_edge(crash)

    print("\nVerifica dopo il riavvio:")
    after = snapshot()
    check("tavolo bloccato → occupato (blocco rilasciato)",
          before["status"][t_lock["id"]] == "LOCKED" and after["status"][t_lock["id"]] == "OCCUPIED",
          f"{before['status'][t_lock['id']]} → {after['status'][t_lock['id']]}")
    for t, label in ((t_split, "split"), (t_bill, "preconto"), (t_paid, "pagato")):
        check(f"stato tavolo {label} invariato", before["status"][t["id"]] == after["status"][t["id"]],
              f"{before['status'][t['id']]} → {after['status'][t['id']]}")
    check("conti dei tavoli invariati", before["totals"] == after["totals"], f"{before['totals']} → {after['totals']}")
    check("split alla romana ripristinato", after["roman"] == 2, str(after["roman"]))
    check("ticket KDS ripristinati (portata in attesa compresa)", before["kds"] == after["kds"] and len(after["kds"]) >= 3,
          f"{before['kds']} → {after['kds']}")
    check("nota del cameriere sul KDS", "ben cotta" in after["kds_note"], str(after["kds_note"]))
    check("incassi del turno conservati", after["shift_cash"] == before["shift_cash"] > 0,
          f"€{before['shift_cash']} → €{after['shift_cash']}")
    check("asporto aperto ripristinato", after["counter"], "non trovato")
    _, status = req("GET", "/api/status")
    restore = status.get("runtimeRestore") or {}
    check("avviso di ripristino per la cassa", restore.get("openTables", 0) >= 3, json.dumps(restore))

    print("\nPulizia:")
    for t in (t_lock, t_split, t_bill):
        req("POST", f"/api/pos/tables/{t['id']}/split/cancel", {})
        _, bill = req("GET", f"/api/pos/tables/{t['id']}/bill")
        code, _ = req("POST", f"/api/pos/tables/{t['id']}/pay", {"operatorId": cashier["id"], "operatorName": op_c,
                                                                 "paymentMethod": "CASH",
                                                                 "amountReceived": bill["total"],
                                                                 "shiftId": shift["id"]})
        print(f"  tavolo {t['label']} incassato: {code}")
    code, _ = req("DELETE", f"/api/pos/counter-orders/{counter['id']}")
    print(f"  asporto rimosso: {code}")

    print(f"\n=== Risultato: {len(PASS)} OK, {len(FAIL)} FAIL ===")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
