#!/usr/bin/env python3
"""Giro test API autonomo — cloud + edge."""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid

CLOUD = "http://localhost:4000"
EDGE = "http://localhost:4100"

PASS: list[str] = []
FAIL: list[str] = []
WARN: list[str] = []


def ok(name: str) -> None:
    PASS.append(name)


def bad(name: str, detail: str) -> None:
    FAIL.append(f"{name}: {detail}")


def warn(name: str, detail: str) -> None:
    WARN.append(f"{name}: {detail}")


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
        with urllib.request.urlopen(r) as res:
            raw = res.read()
            return res.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw}


def expect_status(name: str, code: int, expected: int | set[int], body: dict) -> bool:
    exp = expected if isinstance(expected, set) else {expected}
    if code in exp:
        ok(name)
        return True
    bad(name, f"HTTP {code} — {body.get('error', body)}")
    return False


def test_cloud() -> str | None:
    print("\n=== CLOUD API ===")
    code, body = req(CLOUD, "GET", "/health")
    expect_status("cloud health", code, 200, body)

    code, body = req(CLOUD, "POST", "/api/v2/auth/login", {"email": "", "password": ""})
    expect_status("cloud login vuoto", code, 400, body)

    code, body = req(CLOUD, "POST", "/api/v2/auth/login", {
        "email": "admin@pizzaguys.it",
        "password": "PizzaGuys2026!",
    })
    if not expect_status("cloud login SuperAdmin", code, 200, body):
        return None
    token = body["token"]

    code, body = req(CLOUD, "GET", "/api/v2/auth/me", token=token)
    expect_status("cloud auth/me", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/dashboard", token=token)
    if expect_status("cloud dashboard", code, 200, body):
        if not body.get("kpi"):
            warn("cloud dashboard", "kpi mancante")

    code, body = req(CLOUD, "GET", "/api/v2/audit-logs?limit=5", token=token)
    expect_status("cloud audit logs", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/locations", token=token)
    expect_status("cloud locations", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/categories", token=token)
    expect_status("cloud categories", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/products", token=token)
    expect_status("cloud products", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/variant-groups", token=token)
    expect_status("cloud variant-groups", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/settings", token=token)
    expect_status("cloud settings", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/users", token=token)
    expect_status("cloud users", code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/dashboard", token="invalid-token")
    expect_status("cloud token invalido", code, 401, body)

    return token


def test_edge():
    print("\n=== EDGE API ===")
    code, body = req(EDGE, "GET", "/health")
    expect_status("edge health", code, 200, body)

    code, body = req(EDGE, "GET", "/api/status")
    if expect_status("edge status", code, 200, body):
        if body.get("status") != "ACTIVE":
            warn("edge status", f"stato {body.get('status')} — atteso ACTIVE")

    code, body = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "0000"})
    expect_status("edge PIN errato", code, 401, body)

    code, waiter = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "1234"})
    expect_status("edge PIN cameriere", code, 200, waiter)

    code, cashier = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "5678"})
    expect_status("edge PIN cassiere", code, 200, cashier)

    code, staff = req(EDGE, "GET", "/api/staff")
    expect_status("edge staff list", code, 200, staff)

    code, menu = req(EDGE, "GET", "/api/menu")
    expect_status("edge menu", code, 200, menu)
    products = menu.get("snapshot", {}).get("products", [])
    if len(products) < 10:
        warn("edge menu", f"solo {len(products)} prodotti")

    code, routing = req(EDGE, "GET", "/api/category-routing")
    expect_status("edge category routing", code, 200, routing)

    code, printers = req(EDGE, "GET", "/api/printers")
    expect_status("edge printers", code, 200, printers)

    code, tables = req(EDGE, "GET", "/api/tables/live")
    expect_status("edge tables live", code, 200, tables)
    sala = [t for t in tables if not t.get("isVirtual")]
    if not sala:
        bad("edge tables", "nessun tavolo sala")
        return

    table = sala[0]
    table_id = table["id"]
    product = products[0]
    price = float(product.get("basePrice", 0))
    for p in menu.get("snapshot", {}).get("prices", []):
        if p.get("productId") == product["id"] and p.get("channel") == "TABLE" and p.get("price"):
            price = float(p["price"])

    line_id = str(uuid.uuid4())
    order_body = {
        "tableId": table_id,
        "operatorId": waiter["id"],
        "operatorName": f"{waiter['firstName']} {waiter['lastName']}",
        "channel": "TABLE",
        "lines": [{
            "id": line_id,
            "productId": product["id"],
            "name": product.get("name", {}).get("it", "Test"),
            "quantity": 1,
            "unitPrice": price,
            "basePrice": price,
            "channel": "TABLE",
            "variants": [],
            "course": 1,
        }],
    }

    code, order = req(EDGE, "POST", "/api/orders", order_body)
    if not expect_status("edge crea ordine", code, {200, 201}, order):
        return
    order_id = order["id"]

    # submit senza body (come handheld/ComandaPanel)
    r = urllib.request.Request(f"{EDGE}/api/orders/{order_id}/submit", method="POST")
    try:
        with urllib.request.urlopen(r) as res:
            sub = json.loads(res.read())
            ok("edge SPEDITO")
    except urllib.error.HTTPError as e:
        bad("edge SPEDITO", f"HTTP {e.code} — {e.read().decode()[:200]}")

    code, bill = req(EDGE, "GET", f"/api/pos/tables/{table_id}/bill")
    if expect_status("edge bill", code, 200, bill):
        if bill.get("total", 0) <= 0:
            bad("edge bill", "totale zero")

    if bill.get("lines"):
        line = bill["lines"][0]
        code, disc = req(EDGE, "POST", f"/api/pos/tables/{table_id}/discount", {
            "lineId": line["id"],
            "discountPercent": 5,
        })
        expect_status("edge sconto 5% no PIN", code, 200, disc)

        code, disc2 = req(EDGE, "POST", f"/api/pos/tables/{table_id}/discount", {
            "lineId": line["id"],
            "discountPercent": 15,
            "managerPin": "5678",
        })
        expect_status("edge sconto 15% + PIN", code, 200, disc2)
        bill = disc2.get("bill", bill)

    code, shift = req(EDGE, "POST", "/api/shifts/start", {"staffId": cashier["id"]})
    expect_status("edge avvia turno", code, {200, 201}, shift)
    shift_id = shift.get("id")

    pay_total = bill.get("total", price)
    code, pay = req(EDGE, "POST", f"/api/pos/tables/{table_id}/pay", {
        "paymentMethod": "CASH",
        "amountReceived": pay_total + 5,
        "operatorId": cashier["id"],
        "operatorName": f"{cashier['firstName']} {cashier['lastName']}",
        "shiftId": shift_id,
        "splitMode": "FULL",
    })
    if expect_status("edge pagamento", code, 200, pay):
        if pay.get("status") != "FREE":
            bad("edge pagamento", f"stato tavolo {pay.get('status')}")

    code, pre = req(EDGE, "GET", "/api/closure/pre-check")
    if expect_status("edge closure pre-check", code, 200, pre):
        if "theoretical" not in pre:
            bad("edge closure", "theoretical mancante nel pre-check")
        else:
            ok("edge closure theoretical")

    code, kds = req(EDGE, "GET", "/api/kds/tickets")
    expect_status("edge kds tickets", code, 200, kds)


def main() -> int:
    print("Giro test autonomo Pizza Guys")
    test_cloud()
    test_edge()

    print("\n=== RIEPILOGO ===")
    print(f"OK:   {len(PASS)}")
    print(f"WARN: {len(WARN)}")
    print(f"FAIL: {len(FAIL)}")
    if WARN:
        print("\nAvvisi:")
        for w in WARN:
            print(f"  ⚠ {w}")
    if FAIL:
        print("\nErrori:")
        for f in FAIL:
            print(f"  ✗ {f}")
    else:
        print("\nNessun errore bloccante rilevato.")

    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
