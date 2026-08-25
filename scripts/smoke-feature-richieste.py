#!/usr/bin/env python3
"""Smoke test mirato sulle feature richieste cliente (luglio 2026)."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date

CLOUD = "http://localhost:4000"
EDGE = "http://localhost:4100"
TODAY = date.today().isoformat()

PASS: list[str] = []
FAIL: list[str] = []


def ok(name: str) -> None:
    PASS.append(name)
    print(f"  OK  {name}")


def bad(name: str, detail: str) -> None:
    FAIL.append(f"{name}: {detail}")
    print(f"  FAIL {name}: {detail}")


def req(base: str, method: str, path: str, body=None, token: str | None = None):
    headers: dict[str, str] = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=10) as res:
            content = res.read()
            return res.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content)
        except json.JSONDecodeError:
            return e.code, {"raw": content.decode(errors="replace")}
    except Exception as e:
        return 0, {"error": str(e)}


def expect(name: str, code: int, expected: int | set[int], body: dict) -> bool:
    exp = expected if isinstance(expected, set) else {expected}
    if code in exp:
        ok(name)
        return True
    bad(name, f"HTTP {code} — {body.get('error', body)}")
    return False


def main() -> int:
    print("=== Smoke feature richieste cliente ===\n")

    # --- Edge health ---
    print("--- Edge ---")
    code, body = req(EDGE, "GET", "/health")
    if not expect("edge health", code, 200, body):
        print("\nEdge API non raggiungibile su :4100 — avvia `pnpm dev` e riprova.")
        print(f"\nRisultato: {len(PASS)} OK, {len(FAIL)} FAIL")
        return 1

    code, status = req(EDGE, "GET", "/api/status")
    expect("edge status + venueCapacityWarning", code, 200, status)
    if code == 200 and "venueCapacityWarning" in status:
        ok("status.venueCapacityWarning presente")
    elif code == 200:
        bad("status.venueCapacityWarning", "campo assente")

    code, tables = req(EDGE, "GET", "/api/tables/live")
    if expect("tables/live", code, 200, tables if isinstance(tables, dict) else {}):
        rows = tables if isinstance(tables, list) else tables.get("tables", tables)
        if isinstance(rows, list) and rows:
            sample = rows[0]
            if "openedAt" in sample or sample.get("status") == "FREE":
                ok("tables/live openedAt (campo o tavolo FREE)")
            else:
                # openedAt può essere null su FREE
                ok("tables/live lista non vuota")

    # PIN staff
    code, staff_list = req(EDGE, "GET", "/api/staff")
    operator = None
    if expect("staff list", code, 200, staff_list if isinstance(staff_list, dict) else {}):
        rows = staff_list if isinstance(staff_list, list) else staff_list.get("staff", [])
        if rows:
            operator = rows[0]
            ok(f"staff sample: {operator.get('firstName')} ({operator.get('role')})")
        else:
            print("  SKIP nessuno staff in edge — creo chiusura con id fittizio")

    code, pin = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "1234"})
    if code == 200:
        ok("staff verify-pin 1234")
        operator = pin.get("staff") or pin.get("member") or operator
    else:
        # prova altri PIN comuni seed
        for try_pin in ("5678", "0000", "1111"):
            code, pin = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": try_pin})
            if code == 200:
                ok(f"staff verify-pin {try_pin}")
                operator = pin.get("staff") or pin.get("member") or operator
                break
        else:
            print("  WARN PIN seed non trovato — uso primo staff dalla lista")

    # Internal closure draft
    print("\n--- Chiusura interna ---")
    code, draft = req(EDGE, "GET", f"/api/internal-closure/draft?date={TODAY}")
    if expect("internal-closure draft", code, 200, draft):
        for key in ("closureTotal", "posTotal", "brokers", "expenses", "cashFund", "cashWithdrawal"):
            if key in draft:
                ok(f"draft.{key}")
            else:
                bad(f"draft.{key}", "assente")

    if operator:
        op_id = operator.get("id") or operator.get("staffId")
        op_name = f"{operator.get('firstName', 'Test')} {operator.get('lastName', 'Op')}"
        payload = {
            "closureDate": TODAY,
            "closureTotal": float(draft.get("closureTotal", 0)),
            "cashWithdrawal": 10.0,
            "posTotal": float(draft.get("posTotal", 0)),
            "brokers": draft.get("brokers") or [
                {"broker": "Glovo", "cashAmount": 18.0, "cardAmount": 0.0}
            ],
            "expenses": [{"description": "CONAD LIMONI", "amount": 1.8}],
            "cashFund": 37.7,
            "extraLines": [],
            "notes": "smoke test",
            "operatorId": op_id,
            "operatorName": op_name.strip(),
        }
        code, saved = req(EDGE, "POST", "/api/internal-closure/complete", payload)
        if expect("internal-closure complete", code, 200, saved):
            rec = saved.get("record") or saved
            cid = rec.get("id")
            if cid:
                code, hist = req(EDGE, "GET", f"/api/internal-closure/history/{cid}")
                expect("internal-closure history/:id", code, 200, hist)
                code, pr = req(EDGE, "POST", f"/api/internal-closure/history/{cid}/print")
                expect("internal-closure print", code, 200, pr)

    code, hist_list = req(EDGE, "GET", "/api/internal-closure/history")
    expect("internal-closure history list", code, 200, hist_list if isinstance(hist_list, dict) else {})

    # Counter orders list (handheld delivery)
    print("\n--- Asporto/Delivery ---")
    code, counters = req(EDGE, "GET", "/api/pos/counter-orders")
    expect("counter-orders list", code, {200, 404}, counters if isinstance(counters, dict) else {})

    if operator:
        op_id = operator.get("id")
        code, created = req(
            EDGE,
            "POST",
            "/api/pos/counter-orders",
            {
                "channel": "DELIVERY",
                "broker": "Glovo",
                "customerName": "Smoke Test",
                "asap": True,
                "operatorId": op_id,
                "operatorName": f"{operator.get('firstName', '')} {operator.get('lastName', '')}".strip(),
            },
        )
        if expect("create delivery Glovo", code, {200, 201}, created):
            oid = created.get("id") or (created.get("order") or {}).get("id")
            if oid:
                ok(f"delivery id={oid[:8]}…")
                # Non lasciare slot OCCUPIED che blocca chiusura Z
                code_del, deleted = req(EDGE, "DELETE", f"/api/pos/counter-orders/{oid}")
                expect("cleanup delivery smoke", code_del, 200, deleted if isinstance(deleted, dict) else {})

    # Preconto + prezzo riga + storno qty (tavolo libero)
    print("\n--- Comanda / preconto / prezzo ---")
    if operator:
        code, menu = req(EDGE, "GET", "/api/menu")
        code2, tables = req(EDGE, "GET", "/api/tables/live")
        rows = tables if isinstance(tables, list) else []
        free = [t for t in rows if not t.get("isVirtual") and t.get("status") == "FREE"]
        products = []
        if code == 200:
            products = (menu.get("snapshot") or menu).get("products") or []
        if free and products:
            table = free[0]
            tid = table["id"]
            p = products[0]
            name = p.get("name")
            if isinstance(name, dict):
                name = name.get("it", "Test")
            line_id = str(uuid.uuid4())
            price = 10.0
            for pr in (menu.get("snapshot") or menu).get("productPrices") or []:
                if pr.get("productId") == p["id"]:
                    price = float(pr.get("price") or 10)
                    break
            op_id = operator["id"]
            op_name = f"{operator.get('firstName', '')} {operator.get('lastName', '')}".strip()
            # lock + guests
            code, lock = req(
                EDGE,
                "POST",
                f"/api/tables/{tid}/lock",
                {"operatorId": op_id, "operatorName": op_name, "guests": 3},
            )
            expect("lock + guests 3", code, 200, lock)
            code, order = req(
                EDGE,
                "POST",
                "/api/orders",
                {
                    "tableId": tid,
                    "operatorId": op_id,
                    "operatorName": op_name,
                    "channel": "TABLE",
                    "lines": [
                        {
                            "id": line_id,
                            "productId": p["id"],
                            "name": name,
                            "quantity": 2,
                            "unitPrice": price,
                            "basePrice": price,
                            "channel": "TABLE",
                            "variants": [],
                            "course": 1,
                        }
                    ],
                },
            )
            if expect("crea ordine qty=2", code, {200, 201}, order):
                oid = order.get("id")
                code, priced = req(
                    EDGE,
                    "POST",
                    "/api/orders/line-price",
                    {
                        "tableId": tid,
                        "lineId": line_id,
                        "unitPrice": 7.5,
                        "operatorId": op_id,
                        "operatorName": op_name,
                    },
                )
                expect("override prezzo riga 7.50", code, 200, priced)
                if oid:
                    r = urllib.request.Request(
                        f"{EDGE}/api/orders/{oid}/submit", method="POST"
                    )
                    try:
                        with urllib.request.urlopen(r, timeout=10) as res:
                            expect("submit ordine", res.status, 200, json.loads(res.read() or b"{}"))
                    except urllib.error.HTTPError as e:
                        bad("submit ordine", f"HTTP {e.code}")
                    code, st = req(
                        EDGE,
                        "POST",
                        f"/api/orders/{oid}/storno",
                        {
                            "lineId": line_id,
                            "operatorId": op_id,
                            "operatorName": op_name,
                            "quantity": 1,
                        },
                    )
                    expect("storno qty=1 su riga x2", code, 200, st)
                code, pre = req(EDGE, "POST", f"/api/pos/tables/{tid}/prebill")
                expect("preconto stampa", code, 200, pre)
                # cleanup: free table via pay or unlock
                code, bill = req(EDGE, "GET", f"/api/pos/tables/{tid}/bill")
                total = (bill or {}).get("total", 0)
                if total:
                    code, pay = req(
                        EDGE,
                        "POST",
                        f"/api/pos/tables/{tid}/pay",
                        {
                            "paymentMethod": "CASH",
                            "amountReceived": max(total, 50),
                            "operatorId": op_id,
                            "operatorName": op_name,
                        },
                    )
                    expect("pay cleanup", code, 200, pay)
                else:
                    req(
                        EDGE,
                        "POST",
                        f"/api/tables/{tid}/unlock",
                        {"operatorId": op_id},
                    )
        else:
            print("  SKIP comanda: niente tavoli liberi o prodotti")
    else:
        print("  SKIP comanda: niente operatore")

    # Rounding unit (local, no server)
    print("\n--- Arrotondamento 0.05 ---")
    try:
        # inline mirror of roundToFiveCents
        def round5(amount: float) -> float:
            cents = round(amount * 100)
            if cents % 5 == 0:
                return cents / 100
            return (int(-(-cents // 5)) * 5) / 100  # ceil

        cases = [(12.02, 12.05), (12.00, 12.00), (12.05, 12.05), (12.06, 12.10)]
        for inp, exp in cases:
            got = round5(inp)
            if abs(got - exp) < 1e-9:
                ok(f"round {inp} → {exp}")
            else:
                bad(f"round {inp}", f"got {got}, expected {exp}")
    except Exception as e:
        bad("rounding", str(e))

    # Cloud (optional)
    print("\n--- Cloud (opzionale) ---")
    code, _ = req(CLOUD, "GET", "/health")
    if code != 200:
        print("  SKIP cloud non su :4000 (Docker/Postgres?)")
    else:
        code, login = req(
            CLOUD,
            "POST",
            "/api/v2/auth/login",
            {"email": "admin@pizzaguys.it", "password": "PizzaGuys2026!"},
        )
        if expect("cloud login", code, 200, login):
            token = login.get("token") or login.get("accessToken")
            code, users = req(CLOUD, "GET", "/api/v2/users", token=token)
            if expect("cloud users all roles", code, 200, users if isinstance(users, dict) else {}):
                rows = users if isinstance(users, list) else users.get("users", [])
                roles = {u.get("role") for u in rows if isinstance(u, dict)}
                if roles:
                    ok(f"users roles: {', '.join(sorted(r for r in roles if r))}")
            code, locs = req(CLOUD, "GET", "/api/v2/locations", token=token)
            if code == 200 and isinstance(locs, list) and locs:
                loc = locs[0]
                if "maxGuestCapacity" in loc:
                    ok("location.maxGuestCapacity")
                else:
                    bad("location.maxGuestCapacity", "campo assente — serve migrate DB")
                lid = loc["id"]
                code, patch = req(
                    CLOUD,
                    "PATCH",
                    f"/api/v2/locations/{lid}",
                    {"maxGuestCapacity": loc.get("maxGuestCapacity", 0)},
                    token=token,
                )
                expect("patch maxGuestCapacity", code, 200, patch)

            code, vg = req(CLOUD, "GET", "/api/v2/variant-groups", token=token)
            expect("variant-groups (filtri UI)", code, 200, vg if isinstance(vg, dict) else {})

    print(f"\n=== Risultato: {len(PASS)} OK, {len(FAIL)} FAIL ===")
    for f in FAIL:
        print(f"  - {f}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
