#!/usr/bin/env python3
"""Giro test API autonomo — cloud + edge (copertura estesa)."""
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
WARN: list[str] = []


def ok(name: str) -> None:
    PASS.append(name)


def bad(name: str, detail: str) -> None:
    FAIL.append(f"{name}: {detail}")


def warn(name: str, detail: str) -> None:
    WARN.append(f"{name}: {detail}")


def req(
    base: str,
    method: str,
    path: str,
    body=None,
    token: str | None = None,
    *,
    raw: bool = False,
):
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
            content = res.read()
            if raw:
                return res.status, content
            return res.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read()
        if raw:
            return e.code, content
        try:
            return e.code, json.loads(content)
        except json.JSONDecodeError:
            return e.code, {"raw": content.decode(errors="replace")}


def expect_status(name: str, code: int, expected: int | set[int], body: dict) -> bool:
    exp = expected if isinstance(expected, set) else {expected}
    if code in exp:
        ok(name)
        return True
    bad(name, f"HTTP {code} — {body.get('error', body)}")
    return False


def submit_order(order_id: str) -> tuple[int, dict]:
    r = urllib.request.Request(f"{EDGE}/api/orders/{order_id}/submit", method="POST")
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw}


def product_price(menu: dict, product_id: str) -> float:
    snap = menu.get("snapshot", {})
    for p in snap.get("products", []):
        if p.get("id") == product_id:
            price = float(p.get("basePrice", 0))
            for pr in snap.get("prices", []):
                if (
                    pr.get("productId") == product_id
                    and pr.get("channel") == "TABLE"
                    and pr.get("price")
                ):
                    price = float(pr["price"])
            return price
    return 8.0


def free_tables(min_count: int = 1) -> list[dict]:
    _, tables = req(EDGE, "GET", "/api/tables/live")
    sala = [t for t in tables if not t.get("isVirtual") and t.get("status") == "FREE"]
    if len(sala) < min_count:
        warn("tavoli liberi", f"servono {min_count}, trovati {len(sala)}")
    return sala


def make_line(menu: dict, product: dict | None = None) -> dict:
    products = menu.get("snapshot", {}).get("products", [])
    p = product or products[0]
    price = product_price(menu, p["id"])
    name = p.get("name", {})
    if isinstance(name, dict):
        name = name.get("it", "Test")
    return {
        "id": str(uuid.uuid4()),
        "productId": p["id"],
        "name": name,
        "quantity": 1,
        "unitPrice": price,
        "basePrice": price,
        "channel": "TABLE",
        "variants": [],
        "course": 1,
    }


def create_order(
    table_id: str,
    waiter: dict,
    menu: dict,
    *,
    line_count: int = 1,
    submit: bool = False,
) -> tuple[dict | None, dict | None]:
    products = menu.get("snapshot", {}).get("products", [])
    if not products:
        bad("crea ordine", "menu senza prodotti")
        return None, None
    lines = [make_line(menu, products[i % len(products)]) for i in range(line_count)]
    op = f"{waiter['firstName']} {waiter['lastName']}"
    code, order = req(EDGE, "POST", "/api/orders", {
        "tableId": table_id,
        "operatorId": waiter["id"],
        "operatorName": op,
        "channel": "TABLE",
        "lines": lines,
    })
    if code not in (200, 201):
        bad("crea ordine", f"HTTP {code} {order}")
        return None, None
    if submit:
        sc, sub = submit_order(order["id"])
        if sc != 200:
            bad("SPEDITO", f"HTTP {sc} {sub}")
            return order, None
    return order, lines


def pay_table(
    table_id: str,
    cashier: dict,
    *,
    shift_id: str | None = None,
    payment_method: str = "CASH",
    amount_received: float | None = None,
    splits: list[dict] | None = None,
    split_mode: str = "FULL",
    check_id: str | None = None,
    document_type: str = "RECEIPT",
    invoice_customer: dict | None = None,
    full_meal: bool = False,
) -> dict:
    _, bill = req(EDGE, "GET", f"/api/pos/tables/{table_id}/bill")
    total = bill.get("total", 0)
    op = f"{cashier['firstName']} {cashier['lastName']}"
    body: dict = {
        "operatorId": cashier["id"],
        "operatorName": op,
        "splitMode": split_mode,
    }
    if shift_id:
        body["shiftId"] = shift_id
    if splits:
        body["paymentSplits"] = splits
    else:
        body["paymentMethod"] = payment_method
        if payment_method == "CASH":
            body["amountReceived"] = amount_received if amount_received is not None else total + 5
    if check_id:
        body["checkId"] = check_id
    if document_type != "RECEIPT":
        body["documentType"] = document_type
    if invoice_customer:
        body["invoiceCustomer"] = invoice_customer
    if full_meal:
        body["fullMealReceipt"] = True
    code, pay = req(EDGE, "POST", f"/api/pos/tables/{table_id}/pay", body)
    return {"code": code, "body": pay, "total": total}


# ── Cloud ────────────────────────────────────────────────────────────────────


def test_cloud() -> tuple[str | None, str | None]:
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
        return None, None
    token = body["token"]

    for path, name in [
        ("/api/v2/auth/me", "cloud auth/me"),
        ("/api/v2/dashboard", "cloud dashboard"),
        ("/api/v2/audit-logs?limit=5", "cloud audit logs"),
        ("/api/v2/locations", "cloud locations"),
        ("/api/v2/categories", "cloud categories"),
        ("/api/v2/products", "cloud products"),
        ("/api/v2/variant-groups", "cloud variant-groups"),
        ("/api/v2/settings", "cloud settings"),
        ("/api/v2/users", "cloud users"),
        ("/api/v2/invoices", "cloud invoices"),
        ("/api/v2/invoice-customers", "cloud invoice-customers"),
        ("/api/v2/reports/nightly/summary", "cloud nightly summary"),
        ("/api/v2/reports/email-config", "cloud email config"),
    ]:
        code, body = req(CLOUD, "GET", path, token=token)
        expect_status(name, code, 200, body)

    code, body = req(CLOUD, "GET", "/api/v2/dashboard", token="invalid-token")
    expect_status("cloud token invalido", code, 401, body)

    location_id = None
    _, locs = req(CLOUD, "GET", "/api/v2/locations", token=token)
    if isinstance(locs, list) and locs:
        location_id = locs[0]["id"]
        if locs[0].get("coverChargeAmount") is not None:
            ok("cloud sede coverChargeAmount")
        code, closures = req(
            CLOUD, "GET", f"/api/v2/locations/{location_id}/closures", token=token,
        )
        expect_status("cloud location closures", code, 200, closures)

        code, presets = req(
            CLOUD, "GET", f"/api/v2/locations/{location_id}/discount-presets", token=token,
        )
        expect_status("cloud discount-presets", code, 200, presets)

        code, vouchers = req(
            CLOUD, "GET", f"/api/v2/locations/{location_id}/meal-voucher-presets", token=token,
        )
        if code == 200:
            expect_status("cloud meal-voucher-presets", code, 200, vouchers)
        elif code == 500:
            warn("cloud meal-voucher-presets", "HTTP 500 — esegui pnpm db:migrate")
        else:
            bad("cloud meal-voucher-presets", f"HTTP {code}")

        if not vouchers:
            code, created = req(
                CLOUD, "POST",
                f"/api/v2/locations/{location_id}/meal-voucher-presets",
                {"label": "Smoke Ticket", "amount": 8, "sortOrder": 0},
                token=token,
            )
            if code in (200, 201):
                ok("cloud crea meal-voucher preset")
            else:
                warn("cloud meal-voucher preset", f"HTTP {code}")

        if not presets:
            code, created = req(
                CLOUD, "POST",
                f"/api/v2/locations/{location_id}/discount-presets",
                {"label": "Smoke 10%", "percent": 10, "sortOrder": 0},
                token=token,
            )
            if code in (200, 201):
                ok("cloud crea discount preset")
            else:
                warn("cloud discount preset", f"HTTP {code}")

    code, preview = req(CLOUD, "GET", "/api/v2/reports/nightly/preview", token=token, raw=True)
    if code == 200 and b"<html" in preview.lower():
        ok("cloud nightly preview HTML")
    else:
        bad("cloud nightly preview", f"HTTP {code}")

    test_cloud_admin_details(token, location_id)

    return token, location_id


def test_cloud_admin_details(token: str, location_id: str | None) -> None:
    print("\n=== CLOUD API — dettagli admin ===")
    fake_id = "00000000-0000-0000-0000-000000000000"

    _, customers = req(CLOUD, "GET", "/api/v2/invoice-customers", token=token)
    if isinstance(customers, list) and customers:
        cid = customers[0]["id"]
        code, detail = req(CLOUD, "GET", f"/api/v2/invoice-customers/{cid}", token=token)
        if expect_status("cloud invoice-customer dettaglio", code, 200, detail):
            if detail.get("businessName"):
                ok("cloud invoice-customer campi anagrafici")
    else:
        warn("cloud invoice-customer dettaglio", "nessun cliente in rubrica")

    code, missing = req(CLOUD, "GET", f"/api/v2/invoice-customers/{fake_id}", token=token)
    expect_status("cloud invoice-customer 404", code, 404, missing)

    _, inv_body = req(CLOUD, "GET", "/api/v2/invoices", token=token)
    invoices = inv_body.get("invoices", []) if isinstance(inv_body, dict) else []
    if invoices:
        iid = invoices[0]["id"]
        code, detail = req(CLOUD, "GET", f"/api/v2/invoices/{iid}", token=token)
        if expect_status("cloud invoice dettaglio", code, 200, detail):
            if detail.get("invoiceNumber"):
                ok("cloud invoice campi fattura")
    else:
        warn("cloud invoice dettaglio", "nessuna fattura in archivio")

    code, missing = req(CLOUD, "GET", f"/api/v2/invoices/{fake_id}", token=token)
    expect_status("cloud invoice 404", code, 404, missing)

    if not location_id:
        warn("cloud closure dettaglio", "sede non disponibile")
        return

    _, closures = req(
        CLOUD, "GET", f"/api/v2/locations/{location_id}/closures", token=token,
    )
    if isinstance(closures, list) and closures:
        clid = closures[0]["id"]
        code, detail = req(CLOUD, "GET", f"/api/v2/closures/{clid}", token=token)
        if expect_status("cloud closure dettaglio", code, 200, detail):
            if detail.get("locationName") and detail.get("closureDate"):
                ok("cloud closure campi report")
    else:
        warn("cloud closure dettaglio", "nessuna chiusura in archivio")

    code, missing = req(CLOUD, "GET", f"/api/v2/closures/{fake_id}", token=token)
    expect_status("cloud closure 404", code, 404, missing)

    smoke_label = f"Smoke patch {uuid.uuid4().hex[:6]}"
    code, created = req(
        CLOUD,
        "POST",
        f"/api/v2/locations/{location_id}/discount-presets",
        {"label": smoke_label, "percent": 5, "sortOrder": 99},
        token=token,
    )
    if code in (200, 201) and created.get("id"):
        pid = created["id"]
        code, patched = req(
            CLOUD,
            "PATCH",
            f"/api/v2/locations/{location_id}/discount-presets/{pid}",
            {"label": f"{smoke_label} OK"},
            token=token,
        )
        expect_status("cloud discount-preset patch", code, 200, patched)
        code, _ = req(
            CLOUD,
            "DELETE",
            f"/api/v2/locations/{location_id}/discount-presets/{pid}",
            token=token,
        )
        if code == 204:
            ok("cloud discount-preset delete")
        else:
            bad("cloud discount-preset delete", f"HTTP {code}")
    else:
        warn("cloud discount-preset patch/delete", f"create HTTP {code}")

    voucher_label = f"Smoke voucher {uuid.uuid4().hex[:6]}"
    code, created = req(
        CLOUD,
        "POST",
        f"/api/v2/locations/{location_id}/meal-voucher-presets",
        {"label": voucher_label, "amount": 9, "sortOrder": 99},
        token=token,
    )
    if code in (200, 201) and created.get("id"):
        vid = created["id"]
        code, patched = req(
            CLOUD,
            "PATCH",
            f"/api/v2/locations/{location_id}/meal-voucher-presets/{vid}",
            {"label": f"{voucher_label} OK"},
            token=token,
        )
        expect_status("cloud meal-voucher-preset patch", code, 200, patched)
        code, _ = req(
            CLOUD,
            "DELETE",
            f"/api/v2/locations/{location_id}/meal-voucher-presets/{vid}",
            token=token,
        )
        if code == 204:
            ok("cloud meal-voucher-preset delete")
        else:
            bad("cloud meal-voucher-preset delete", f"HTTP {code}")
    elif code == 500:
        warn("cloud meal-voucher-preset patch/delete", "HTTP 500 — esegui pnpm db:migrate")
    else:
        warn("cloud meal-voucher-preset patch/delete", f"create HTTP {code}")


# ── Edge base ────────────────────────────────────────────────────────────────


def test_edge_base() -> dict | None:
    print("\n=== EDGE API — base ===")
    ctx: dict = {}

    code, body = req(EDGE, "GET", "/health")
    expect_status("edge health", code, 200, body)

    code, body = req(EDGE, "GET", "/api/status")
    if expect_status("edge status", code, 200, body):
        if body.get("status") != "ACTIVE":
            warn("edge status", f"stato {body.get('status')} — atteso ACTIVE")

    code, body = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "0000"})
    expect_status("edge PIN errato", code, 401, body)

    code, waiter = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "1234"})
    if not expect_status("edge PIN cameriere", code, 200, waiter):
        return None
    ctx["waiter"] = waiter

    code, cashier = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": "5678"})
    if not expect_status("edge PIN cassiere", code, 200, cashier):
        return None
    ctx["cashier"] = cashier

    for path, name in [
        ("/api/staff", "edge staff list"),
        ("/api/category-routing", "edge category routing"),
        ("/api/printers", "edge printers"),
        ("/api/rooms", "edge rooms"),
        ("/api/tables", "edge tables"),
        ("/api/shifts", "edge shifts list"),
        ("/api/pos/payment-requests", "edge payment-requests"),
        ("/api/pos/counter-orders", "edge counter-orders"),
        ("/api/closure/last", "edge closure last"),
        ("/api/closure/history", "edge closure history"),
    ]:
        code, body = req(EDGE, "GET", path)
        expect_status(name, code, 200, body)

    code, menu = req(EDGE, "GET", "/api/menu")
    if not expect_status("edge menu", code, 200, menu):
        return None
    ctx["menu"] = menu
    products = menu.get("snapshot", {}).get("products", [])
    if len(products) < 10:
        warn("edge menu", f"solo {len(products)} prodotti")

    snap = menu.get("snapshot", {})
    if snap.get("discountPresets"):
        ok(f"edge sync discountPresets ({len(snap['discountPresets'])})")
    else:
        warn("edge discountPresets", "assenti nello snapshot — ri-provision o attendi heartbeat")
    if snap.get("mealVoucherPresets"):
        ok(f"edge sync mealVoucherPresets ({len(snap['mealVoucherPresets'])})")
    else:
        warn("edge mealVoucherPresets", "assenti nello snapshot")

    code, body = req(EDGE, "POST", "/api/print/test")
    expect_status("edge print test", code, 200, body)

    code, tables = req(EDGE, "GET", "/api/tables/live")
    if not expect_status("edge tables live", code, 200, tables):
        return None

    sala = [t for t in tables if not t.get("isVirtual")]
    if not sala:
        bad("edge tables", "nessun tavolo sala")
        return None

    code, shift = req(EDGE, "POST", "/api/shifts/start", {"staffId": cashier["id"]})
    expect_status("edge avvia turno", code, {200, 201}, shift)
    ctx["shift_id"] = shift.get("id")

    code, kds = req(EDGE, "GET", "/api/kds/tickets")
    expect_status("edge kds tickets", code, 200, kds)

    return ctx


# ── Edge flussi operativi ───────────────────────────────────────────────────


def test_edge_flows(ctx: dict) -> None:
    print("\n=== EDGE API — flussi operativi ===")
    waiter = ctx["waiter"]
    cashier = ctx["cashier"]
    menu = ctx["menu"]
    shift_id = ctx.get("shift_id")
    op_w = f"{waiter['firstName']} {waiter['lastName']}"
    op_c = f"{cashier['firstName']} {cashier['lastName']}"

    tables = free_tables(4)
    if len(tables) < 2:
        warn("flussi edge", "tavoli insufficienti — skip parziale")
        return

    t_lock = tables[0]["id"]
    t_order = tables[1]["id"]
    t_pre = tables[2]["id"] if len(tables) > 2 else tables[1]["id"]
    t_inv = tables[3]["id"] if len(tables) > 3 else tables[0]["id"]
    t_roman = tables[0]["id"]

    # Lock tavolo
    code, lock = req(EDGE, "POST", f"/api/tables/{t_lock}/lock", {
        "operatorId": waiter["id"],
        "operatorName": op_w,
        "guests": 2,
    })
    if expect_status("edge lock tavolo", code, 200, lock):
        code2, lock2 = req(EDGE, "POST", f"/api/tables/{t_lock}/lock", {
            "operatorId": cashier["id"],
            "operatorName": op_c,
            "guests": 2,
        })
        if code2 == 409:
            ok("edge lock rifiutato (secondo operatore)")
        else:
            bad("edge lock rifiutato", f"atteso 409, ricevuto {code2}")
        req(EDGE, "POST", f"/api/tables/{t_lock}/unlock", {"operatorId": waiter["id"]})

    # Ordine + SPEDITO + storno
    order, lines = create_order(t_order, waiter, menu, line_count=2, submit=True)
    if order and lines:
        code, st = req(EDGE, "POST", f"/api/orders/{order['id']}/storno", {
            "lineId": lines[0]["id"],
            "operatorId": waiter["id"],
            "operatorName": op_w,
        })
        expect_status("edge storno riga", code, 200, st)

        code, guests = req(EDGE, "PATCH", f"/api/tables/{t_order}/guests", {
            "guests": 2,
            "operatorId": waiter["id"],
        })
        expect_status("edge aggiorna coperti", code, 200, guests)

    # Preconto
    create_order(t_pre, waiter, menu, line_count=1, submit=True)
    code, pre = req(EDGE, "POST", f"/api/pos/tables/{t_pre}/prebill")
    expect_status("edge preconto", code, 200, pre)

    # Sconto riga + preset
    _, bill = req(EDGE, "GET", f"/api/pos/tables/{t_pre}/bill")
    if bill.get("lines"):
        lid = bill["lines"][0]["id"]
        code, d1 = req(EDGE, "POST", f"/api/pos/tables/{t_pre}/discount", {
            "lineId": lid, "discountPercent": 5,
        })
        expect_status("edge sconto 5%", code, 200, d1)
        code, d2 = req(EDGE, "POST", f"/api/pos/tables/{t_pre}/discount", {
            "lineId": lid, "discountPercent": 15, "managerPin": "5678",
        })
        expect_status("edge sconto 15% + PIN", code, 200, d2)

    presets = menu.get("snapshot", {}).get("discountPresets", [])
    if presets:
        p = presets[0]
        code, dp = req(EDGE, "POST", f"/api/pos/tables/{t_pre}/discount-preset", {
            "presetId": p["id"],
            "presetLabel": p.get("label", "Preset"),
            "percent": p.get("percent", 10),
        })
        expect_status("edge sconto preset", code, 200, dp)
        code, dc = req(EDGE, "POST", f"/api/pos/tables/{t_pre}/discount-clear")
        expect_status("edge annulla sconti", code, 200, dc)

    code, auth = req(EDGE, "POST", "/api/staff/authorize-discount", {
        "managerPin": "5678", "discountPercent": 12,
    })
    expect_status("edge authorize-discount", code, 200, auth)

    # Pagamento contanti tavolo pre
    pay = pay_table(t_pre, cashier, shift_id=shift_id)
    if pay["code"] == 200 and pay["body"].get("status") == "FREE":
        ok("edge pagamento contanti")
    else:
        bad("edge pagamento contanti", str(pay))

    # Fattura
    create_order(t_inv, waiter, menu, line_count=1, submit=True)
    pay = pay_table(
        t_inv, cashier, shift_id=shift_id, payment_method="POS",
        document_type="INVOICE",
        invoice_customer={
            "businessName": "Acme Ristorazione S.r.l.",
            "vatNumber": "12345678901",
            "sdiCode": "ABCDEFG",
        },
    )
    if pay["code"] == 200:
        ok("edge pagamento fattura")
        if pay["body"].get("invoice"):
            ok("edge invoice payload")
    else:
        bad("edge pagamento fattura", str(pay))

    # Pasto completo — solo con fattura (scontrino aggregato)
    t_meal = free_tables(1)
    if t_meal:
        tid = t_meal[0]["id"]
        create_order(tid, waiter, menu, submit=True)
        pay = pay_table(
            tid,
            cashier,
            shift_id=shift_id,
            payment_method="POS",
            document_type="INVOICE",
            invoice_customer={
                "businessName": "Pasto Completo Test S.r.l.",
                "vatNumber": "12345678901",
                "sdiCode": "ABCDEFG",
            },
            full_meal=True,
        )
        if pay["code"] == 200:
            ok("edge pagamento pasto completo (fattura)")
        else:
            bad("edge pasto completo", str(pay))
        # Regressione: su scontrino normale deve essere rifiutato
        t_meal2 = free_tables(1)
        if t_meal2:
            tid2 = t_meal2[0]["id"]
            create_order(tid2, waiter, menu, submit=True)
            pay2 = pay_table(tid2, cashier, shift_id=shift_id, payment_method="POS", full_meal=True)
            if pay2["code"] == 400:
                ok("edge pasto completo bloccato su RECEIPT")
            else:
                bad("edge pasto completo RECEIPT", f"atteso 400, got {pay2}")
            # cleanup se per caso pagato
            if pay2["code"] == 200:
                pass
            else:
                pay_table(tid2, cashier, shift_id=shift_id, payment_method="POS")

    # Pagamento misto buono + contanti
    t_mix = free_tables(1)
    if t_mix:
        tid = t_mix[0]["id"]
        create_order(tid, waiter, menu, submit=True)
        _, bill = req(EDGE, "GET", f"/api/pos/tables/{tid}/bill")
        total = bill.get("total", 0)
        if total > 0:
            voucher = min(8.0, total)
            remainder = round(total - voucher, 2)
            splits = [{"paymentMethod": "MEAL_VOUCHER", "amount": voucher}]
            if remainder > 0:
                splits.append({
                    "paymentMethod": "CASH",
                    "amount": remainder,
                    "amountReceived": remainder + 5,
                })
            pay = pay_table(tid, cashier, shift_id=shift_id, splits=splits)
            if pay["code"] == 200 and pay["body"].get("status") == "FREE":
                ok("edge pagamento misto buono+contanti")
            else:
                bad("edge pagamento misto", str(pay))

    # Split romano
    create_order(t_roman, waiter, menu, line_count=2, submit=True)
    code, roman = req(EDGE, "POST", f"/api/pos/tables/{t_roman}/split/roman", {"shares": 3})
    if expect_status("edge split romano", code, 200, roman):
        # Prima quota con POS + fattura (deve essere consentito)
        pay = pay_table(
            t_roman,
            cashier,
            shift_id=shift_id,
            payment_method="POS",
            split_mode="ROMAN",
            document_type="INVOICE",
            invoice_customer={
                "businessName": "Quota Romana S.r.l.",
                "vatNumber": "12345678901",
                "sdiCode": "ABCDEFG",
            },
        )
        if pay["code"] != 200 or not pay["body"].get("invoice"):
            bad("edge split romano + fattura", str(pay))
        else:
            ok("edge split romano + fattura")
            for i in range(2):
                pay = pay_table(
                    t_roman, cashier, shift_id=shift_id, payment_method="POS", split_mode="ROMAN",
                )
                if pay["code"] != 200:
                    bad(f"edge split romano quota {i+2}", str(pay))
                    break
            else:
                ok("edge split romano 3 quote")

    # Split analitico
    t_ana = free_tables(1)
    if t_ana:
        tid = t_ana[0]["id"]
        order, olines = create_order(tid, waiter, menu, line_count=2, submit=True)
        if order and olines and len(olines) >= 2:
            code, _ = req(EDGE, "POST", f"/api/pos/tables/{tid}/split/analytic", {"checkCount": 2})
            if code == 200:
                _, bill = req(EDGE, "GET", f"/api/pos/tables/{tid}/bill")
                checks = (bill.get("analyticSplit") or {}).get("checks", [])
                if len(checks) >= 2:
                    code, _ = req(EDGE, "POST", f"/api/pos/tables/{tid}/split/analytic", {
                        "checks": [
                            {"id": checks[0]["id"], "label": "1", "lineIds": [olines[0]["id"]]},
                            {"id": checks[1]["id"], "label": "2", "lineIds": [olines[1]["id"]]},
                        ],
                    })
                    if code == 200:
                        for chk in checks:
                            pay = pay_table(
                                tid, cashier, shift_id=shift_id,
                                payment_method="POS", split_mode="ANALYTIC", check_id=chk["id"],
                            )
                            if pay["code"] != 200:
                                bad("edge split analitico pay", str(pay))
                                break
                        else:
                            ok("edge split analitico 2 conti")
                    else:
                        bad("edge split analitico assign", f"HTTP {code}")
                else:
                    bad("edge split analitico", "checks mancanti nel bill")

    # Transfer parziale
    xfer_tables = free_tables(2)
    if len(xfer_tables) >= 2:
        src, dst = xfer_tables[0]["id"], xfer_tables[1]["id"]
        order, xlines = create_order(src, waiter, menu, line_count=3, submit=True)
        if order and xlines and len(xlines) >= 2:
            code, tr = req(EDGE, "POST", "/api/tables/transfer", {
                "sourceTableId": src,
                "targetTableId": dst,
                "lineIds": [xlines[0]["id"]],
                "operatorId": cashier["id"],
                "operatorName": op_c,
            })
            if code == 200 and tr.get("ok"):
                ok("edge transfer parziale")
                pay = pay_table(src, cashier, shift_id=shift_id)
                pay2 = pay_table(dst, cashier, shift_id=shift_id)
                if pay["code"] == 200 and pay2["code"] == 200:
                    ok("edge incasso dopo transfer parziale")
            else:
                bad("edge transfer parziale", f"{code} {tr}")

    # Merge tavoli
    merge_tables = free_tables(2)
    if len(merge_tables) >= 2:
        m1, m2 = merge_tables[0]["id"], merge_tables[1]["id"]
        create_order(m1, waiter, menu, submit=True)
        create_order(m2, waiter, menu, submit=True)
        code, mg = req(EDGE, "POST", "/api/tables/merge", {
            "sourceTableIds": [m2],
            "targetTableId": m1,
            "operatorId": cashier["id"],
            "operatorName": op_c,
        })
        if code == 200 and mg.get("ok"):
            ok("edge merge tavoli")
            pay = pay_table(m1, cashier, shift_id=shift_id)
            if pay["code"] == 200:
                ok("edge incasso dopo merge")
        else:
            bad("edge merge", f"{code} {mg}")

    # Asporto
    code, co = req(EDGE, "POST", "/api/pos/counter-orders", {
        "channel": "TAKEAWAY",
        "operatorId": waiter["id"],
        "operatorName": op_w,
        "customerName": "Smoke Cliente",
        "phone": "3331234567",
        "asap": True,
    })
    if code in (200, 201) and co.get("order"):
        asp_id = co["order"]["id"]
        ok("edge counter-order asporto")
        products = menu.get("snapshot", {}).get("products", [])
        line = make_line(menu, products[0])
        line["channel"] = "TAKEAWAY"
        code2, ord2 = req(EDGE, "POST", "/api/orders", {
            "tableId": asp_id,
            "operatorId": waiter["id"],
            "operatorName": op_w,
            "channel": "TAKEAWAY",
            "lines": [line],
        })
        if code2 in (200, 201):
            submit_order(ord2["id"])
            pay = pay_table(asp_id, cashier, shift_id=shift_id, payment_method="POS")
            if pay["code"] == 200:
                ok("edge asporto incassato")
            else:
                bad("edge asporto incasso", str(pay))
    else:
        bad("edge counter-order", f"{code} {co}")

    # Rubrica clienti fiscali edge
    code, ic = req(EDGE, "POST", "/api/invoice-customers", {
        "businessName": "Smoke Rubrica S.r.l.",
        "vatNumber": "98765432109",
        "sdiCode": "HGFEDCB",
        "city": "Caserta",
    })
    expect_status("edge invoice-customer create", code, {200, 201}, ic)


def test_reservations() -> None:
    print("\n=== EDGE API — prenotazioni ===")
    rid = None
    table_id = None

    code, body = req(EDGE, "GET", f"/api/reservations?date={TODAY}")
    if expect_status("reservations list", code, 200, body):
        if "summary" in body:
            ok("reservations summary")

    code, body = req(EDGE, "GET", f"/api/reservations/availability?date={TODAY}")
    expect_status("reservations availability", code, 200, body)

    code, body = req(EDGE, "POST", "/api/reservations", {
        "reservationDate": TODAY,
        "reservationTime": "20:30",
        "shift": "DINNER_1",
        "customerName": "Smoke Test",
        "guests": 2,
        "phone": "3331234567",
    })
    if code in (200, 201) and body.get("id"):
        ok("reservations create")
        rid = body["id"]
    else:
        bad("reservations create", f"{code} {body}")
        return

    code, body = req(EDGE, "GET", f"/api/reservations/{rid}")
    expect_status("reservations get", code, 200, body)

    code, body = req(EDGE, "PATCH", f"/api/reservations/{rid}", {"notes": "Smoke note"})
    expect_status("reservations patch", code, 200, body)

    code, body = req(EDGE, "POST", f"/api/reservations/{rid}/confirm", {})
    expect_status("reservations confirm", code, 200, body)

    free = free_tables(1)
    if free:
        table_id = free[0]["id"]
        code, body = req(EDGE, "POST", f"/api/reservations/{rid}/assign-table", {
            "tableId": table_id,
        })
        if code == 200:
            ok("reservations assign-table")
        else:
            warn("reservations assign-table", f"HTTP {code} {body.get('error')}")

    code, body = req(EDGE, "POST", f"/api/reservations/{rid}/arrive", {"openTable": False})
    if code == 200:
        ok("reservations arrive")
    else:
        warn("reservations arrive", f"HTTP {code}")

    code, body = req(EDGE, "POST", f"/api/reservations/{rid}/no-show", {})
    expect_status("reservations no-show", code, 200, body)

    code, body = req(EDGE, "POST", f"/api/reservations/{rid}/restore", {})
    expect_status("reservations restore", code, 200, body)

    code, body = req(EDGE, "POST", "/api/reservations/print", {
        "from": TODAY, "to": TODAY, "operatorName": "Smoke",
    })
    if code == 200 and body.get("ok"):
        ok(f"reservations print ({body.get('count', 0)} righe)")
    else:
        bad("reservations print", f"{code} {body}")

    if rid:
        req(EDGE, "DELETE", f"/api/reservations/{rid}")


def test_open_tables_and_fiscal(ctx: dict) -> None:
    print("\n=== EDGE API — tavoli aperti e documenti fiscali ===")
    cashier = ctx["cashier"]

    code, body = req(EDGE, "GET", "/api/pos/open-tables")
    if code == 200 and "rows" in body and "summary" in body:
        ok(f"open-tables ({len(body['rows'])} righe)")
    else:
        bad("open-tables", f"{code} {body}")

    code, body = req(EDGE, "GET", "/api/fiscal-documents?status=ACTIVE")
    if not expect_status("fiscal-documents list", code, 200, body):
        return

    docs = body.get("documents", [])
    if not docs:
        warn("fiscal-documents", "nessun documento — skip azioni")
        return

    doc = docs[0]
    doc_id = doc["id"]

    code, raw = req(EDGE, "GET", "/api/fiscal-documents/export.csv", raw=True)
    if code == 200 and b"," in raw:
        ok("fiscal-documents export.csv")
    else:
        bad("fiscal-documents export.csv", f"HTTP {code}")

    code, body = req(EDGE, "GET", f"/api/fiscal-documents/{doc_id}")
    expect_status("fiscal-documents get", code, 200, body)

    code, body = req(EDGE, "POST", f"/api/fiscal-documents/{doc_id}/reprint")
    expect_status("fiscal-documents reprint", code, 200, body)

    if doc.get("documentType") == "INVOICE" or doc.get("invoiceId"):
        code, body = req(EDGE, "POST", f"/api/fiscal-documents/{doc_id}/reprint-proforma")
        if code == 200:
            ok("fiscal-documents reprint-proforma")
        else:
            warn("fiscal-documents proforma", f"HTTP {code}")

    # Modifica pagamento su documento non critico (ultimo della lista)
    if len(docs) > 1:
        target = docs[-1]
        code, body = req(EDGE, "PATCH", f"/api/fiscal-documents/{target['id']}/payment", {
            "staffId": cashier["id"],
            "paymentMethod": "CASH",
        })
        if code == 200:
            ok("fiscal-documents cambio pagamento")
            req(EDGE, "PATCH", f"/api/fiscal-documents/{target['id']}/payment", {
                "staffId": cashier["id"],
                "paymentMethod": target.get("paymentMethod", "POS"),
            })
        else:
            warn("fiscal-documents cambio pagamento", f"HTTP {code}")


def test_closure(ctx: dict) -> None:
    print("\n=== EDGE API — chiusura ===")
    cashier = ctx["cashier"]

    # Libera asporto/delivery residui (anche ephemeral, assenti da /tables/live)
    _, counters = req(EDGE, "GET", "/api/pos/counter-orders")
    for co in counters if isinstance(counters, list) else []:
        cid = co.get("id")
        if not cid:
            continue
        _, bill = req(EDGE, "GET", f"/api/pos/tables/{cid}/bill")
        if bill.get("total", 0) > 0:
            pay = pay_table(cid, cashier, shift_id=ctx.get("shift_id"), payment_method="POS")
            if pay["code"] != 200:
                req(EDGE, "DELETE", f"/api/pos/counter-orders/{cid}")
        else:
            req(EDGE, "DELETE", f"/api/pos/counter-orders/{cid}")

    # Chiudi tavoli sala aperti (inclusi LOCKED in mano cameriere e virtuali)
    _, tables = req(EDGE, "GET", "/api/tables/live")
    for t in tables if isinstance(tables, list) else []:
        if t.get("status") == "FREE":
            continue
        tid = t["id"]
        _, bill = req(EDGE, "GET", f"/api/pos/tables/{tid}/bill")
        if bill.get("total", 0) > 0:
            pay_table(tid, cashier, shift_id=ctx.get("shift_id"), payment_method="POS")
        elif t.get("isVirtual") or bill.get("isVirtual"):
            req(EDGE, "DELETE", f"/api/pos/counter-orders/{tid}")

    # Fallback: eventuali residui segnalati dal pre-check
    _, pre0 = req(EDGE, "GET", "/api/closure/pre-check")
    for ot in (pre0.get("openTables") if isinstance(pre0, dict) else None) or []:
        tid = ot.get("tableId")
        if not tid:
            continue
        _, bill = req(EDGE, "GET", f"/api/pos/tables/{tid}/bill")
        if bill.get("total", 0) > 0:
            pay_table(tid, cashier, shift_id=ctx.get("shift_id"), payment_method="POS")
        else:
            req(EDGE, "DELETE", f"/api/pos/counter-orders/{tid}")

    # Chiudi turni aperti (close-blind se possibile, altrimenti end forzato)
    _, shifts = req(EDGE, "GET", "/api/shifts")
    for s in shifts if isinstance(shifts, list) else []:
        if not s.get("endedAt"):
            sid = s["id"]
            code, summary = req(EDGE, "GET", f"/api/shifts/{sid}/summary")
            closed = False
            if code == 200 and summary.get("canClose"):
                code2, close = req(EDGE, "POST", f"/api/shifts/{sid}/close-blind", {
                    "cashDeclared": summary.get("theoretical", {}).get("cash", 0),
                    "posDeclared": summary.get("theoretical", {}).get("pos", 0),
                })
                if code2 == 200:
                    ok(f"edge chiusura turno {sid[:8]}")
                    closed = True
            if not closed:
                code3, ended = req(EDGE, "POST", f"/api/shifts/{sid}/end")
                if code3 == 200:
                    ok(f"edge fine turno {sid[:8]}")
                else:
                    warn("closure shift end", f"{sid[:8]} HTTP {code3} {ended}")

    code, pre = req(EDGE, "GET", "/api/closure/pre-check")
    if expect_status("edge closure pre-check", code, 200, pre):
        if "theoretical" in pre:
            ok("edge closure theoretical")
        if not pre.get("canClose"):
            warn("closure", f"blocchi: {pre.get('blockers')}")

    for path, name in [
        ("/api/closure/daily-report", "closure daily-report JSON"),
        ("/api/closure/daily-report.txt", "closure daily-report txt"),
        ("/api/closure/daily-report.html", "closure daily-report html"),
    ]:
        code, body = req(EDGE, "GET", path, raw=(path.endswith(".txt") or path.endswith(".html")))
        if code == 200:
            ok(name)
        else:
            bad(name, f"HTTP {code}")

    code, raw = req(EDGE, "GET", "/api/closure/export.csv", raw=True)
    if code == 200:
        ok("closure export.csv")
    else:
        bad("closure export.csv", f"HTTP {code}")

    if pre.get("canClose"):
        code, z = req(EDGE, "POST", "/api/closure/z-report")
        if code == 200 and z.get("zNumber"):
            ok(f"edge Z-report #{z['zNumber']}")
            theo = z.get("theoretical", pre.get("theoretical", {}))
            code2, rec = req(EDGE, "POST", "/api/closure/reconcile", {
                "cashDeclared": theo.get("cash", 0),
                "posDeclared": theo.get("pos", 0),
            })
            if code2 == 200:
                ok("edge riconciliazione")
                code3, done = req(EDGE, "POST", "/api/closure/complete", {
                    "cashDeclared": theo.get("cash", 0),
                    "posDeclared": theo.get("pos", 0),
                    "operatorName": f"{cashier['firstName']} {cashier['lastName']}",
                    "operatorId": cashier["id"],
                })
                if code3 == 200:
                    ok("edge chiusura giornaliera completa")
                else:
                    warn("closure complete", f"HTTP {code3} {done.get('error')}")
            else:
                warn("closure reconcile", f"HTTP {code2}")
        else:
            warn("closure z-report", f"HTTP {code} {z.get('error')}")
    else:
        warn("closure z/complete", "pre-check non OK — skip chiusura giornaliera")


def main() -> int:
    print("Giro test autonomo Pizza Guys (esteso)")
    test_cloud()
    ctx = test_edge_base()
    if ctx:
        test_edge_flows(ctx)
        test_reservations()
        test_open_tables_and_fiscal(ctx)
        test_closure(ctx)

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
