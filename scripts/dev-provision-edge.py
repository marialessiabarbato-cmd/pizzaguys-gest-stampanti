#!/usr/bin/env python3
"""Provisioning dell'Edge di sviluppo + operatori di test (idempotente).

  python3 scripts/dev-provision-edge.py

1. Se l'Edge è UNPROVISIONED: login SuperAdmin sul Cloud, rigenera il token della
   prima sede (Caserta dal seed menu) e lo passa a POST /api/provision dell'Edge.
2. Crea gli operatori di test che mancano (riconosciuti per email). I PIN sono quelli
   che si aspetta scripts/smoke-giro-test.py: 1234 cameriere, 5678 admin di sede
   (apre la cassa e vale come PIN manager).
3. Se non c'è nessuna sala crea "Interna"; aggiunge i tavoli T1–T4 che mancano.

Le modifiche a staff e sala richiedono la sessione dell'Admin di sede (PIN 5678): lo script
la apre con verify-pin. Su un Edge senza Admin di sede l'Edge le accetta comunque (primo avvio).

Solo per sviluppo locale: rigenerare il token invalida quello di un Edge già collegato.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

CLOUD = os.environ.get("CLOUD_API_URL", "http://localhost:4000")
EDGE = os.environ.get(
    "EDGE_API_URL", f"http://localhost:{os.environ.get('EDGE_API_PORT', '4100')}"
)
ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@pizzaguys.it")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "PizzaGuys2026!")

ADMIN_PIN = "5678"

# L'Admin di sede per primo: dopo di lui l'Edge chiede la sua sessione per le altre modifiche.
TEST_STAFF = [
    {"firstName": "Test", "lastName": "Admin", "email": "admin-sede@test.local",
     "role": "USER_ADMIN", "pin": ADMIN_PIN},
    {"firstName": "Test", "lastName": "Cameriere", "email": "cameriere@test.local",
     "role": "WAITER", "pin": "1234"},
    {"firstName": "Marco", "lastName": "Rossi", "email": "marco.rossi@test.local",
     "role": "WAITER", "pin": "1111"},
]

# smoke-giro-test.py usa 4 tavoli liberi per i flussi completi
TEST_TABLES = 4


def req(base: str, method: str, path: str, body=None, token: str | None = None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, raw.decode(errors="replace")


def admin_token() -> str | None:
    """Sessione dell'Admin di sede, se esiste già sull'Edge (verify-pin senza aprire il turno)."""
    code, body = req(EDGE, "POST", "/api/staff/verify-pin", {"pin": ADMIN_PIN})
    if code == 200 and body.get("role") == "USER_ADMIN":
        return body.get("token")
    return None


def fail(message: str) -> None:
    print(f"✗ {message}")
    sys.exit(1)


def provision() -> None:
    code, status = req(EDGE, "GET", "/api/status")
    if code != 200:
        fail(f"Edge non raggiungibile su {EDGE} (HTTP {code})")
    if status.get("status") == "ACTIVE":
        print(f"✓ Edge già provisionata: {status.get('locationName')}")
        return

    code, login = req(CLOUD, "POST", "/api/v2/auth/login",
                      {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if code != 200:
        fail(f"login SuperAdmin fallito (HTTP {code}): {login}")
    token = login["token"]

    code, locations = req(CLOUD, "GET", "/api/v2/locations", token=token)
    if code != 200 or not locations:
        fail("nessuna sede sul Cloud: lanciare prima pnpm db:seed:menu")
    location = locations[0]

    code, body = req(CLOUD, "POST", f"/api/v2/locations/{location['id']}/regenerate-token",
                     token=token)
    if code != 200:
        fail(f"rigenera token fallito (HTTP {code}): {body}")

    code, body = req(EDGE, "POST", "/api/provision", {"apiToken": body["apiToken"]})
    if code != 200:
        fail(f"provisioning Edge fallito (HTTP {code}): {body}")
    print(f"✓ Edge provisionata: {body.get('locationName')}")


def create_staff() -> None:
    token = admin_token()
    code, existing = req(EDGE, "GET", "/api/staff")
    if code != 200:
        fail(f"lista operatori fallita (HTTP {code})")
    emails = {member.get("email") for member in existing}
    for member in TEST_STAFF:
        label = f"{member['firstName']} {member['lastName']} ({member['role']}, PIN {member['pin']})"
        if member["email"] in emails:
            print(f"✓ Operatore già presente: {label}")
            continue
        code, body = req(EDGE, "POST", "/api/staff", member, token=token)
        if member["role"] == "USER_ADMIN" and not token:
            token = admin_token()
        if code == 201:
            print(f"✓ Operatore creato: {label}")
        elif code == 409:
            # dopo un reset l'Edge riprende lo staff dal Cloud, ma senza email
            print(f"✓ Operatore già presente (PIN in uso): {label}")
        else:
            print(f"⚠ {label}: HTTP {code} — {body}")


def create_room() -> None:
    token = admin_token()
    code, rooms = req(EDGE, "GET", "/api/rooms")
    if code != 200:
        fail(f"lista sale fallita (HTTP {code})")
    if rooms:
        room = rooms[0]
    else:
        code, room = req(EDGE, "POST", "/api/rooms", {"name": "Interna"}, token=token)
        if code not in (200, 201):
            fail(f"creazione sala fallita (HTTP {code}): {room}")
        print("✓ Sala creata: Interna")

    code, tables = req(EDGE, "GET", "/api/tables")
    if code != 200:
        fail(f"lista tavoli fallita (HTTP {code})")
    labels = {t.get("label") for t in tables if not t.get("isVirtual")}
    for i in range(1, TEST_TABLES + 1):
        label = f"T{i}"
        if label in labels:
            continue
        code, body = req(EDGE, "POST", "/api/tables",
                         {"roomId": room["id"], "label": label, "x": 40 + (i - 1) * 140, "y": 40},
                         token=token)
        if code not in (200, 201):
            fail(f"creazione tavolo {label} fallita (HTTP {code}): {body}")
        print(f"✓ Tavolo creato: {label}")
    print(f"✓ Sala {room.get('name')}: tavoli T1–T{TEST_TABLES}")


if __name__ == "__main__":
    provision()
    create_staff()
    create_room()
