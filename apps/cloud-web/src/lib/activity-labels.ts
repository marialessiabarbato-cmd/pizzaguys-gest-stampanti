const LABELS: Record<string, string> = {
  "location.create": "Nuova sede configurata",
  "location.update": "Dati sede aggiornati",
  "location.regenerate_token": "Credenziali di collegamento sede rigenerate",
  "location.revoke_token": "Collegamento sede revocato",
  "invoice_customer.create": "Cliente fiscale aggiunto alla rubrica",
  "meal_voucher_preset.create": "Buono pasto rapido creato",
  "discount_preset.create": "Sconto rapido in cassa creato",
  DAILY_CLOSURE_SYNC: "Chiusura giornaliera ricevuta dalla sede",
  ELECTRONIC_INVOICE_SYNC: "Fattura elettronica registrata dalla cassa",
  NIGHTLY_REPORT_MANUAL: "Report notturno inviato manualmente",
  NIGHTLY_REPORT_SENT: "Report notturno inviato automaticamente",
  NIGHTLY_REPORT_FAILED: "Invio report notturno non riuscito",
  "user_admin.create": "Utente amministratore sede creato",
  "user_admin.update": "Utente amministratore sede aggiornato",
  "user_admin.delete": "Utente amministratore sede rimosso",
  "settings.update": "Impostazioni globali aggiornate",
  "variant_group.delete": "Gruppo varianti eliminato dal menu",
  "category.create": "Categoria menu creata",
  "category.delete": "Categoria menu eliminata",
  "product.delete": "Prodotto eliminato dal menu",
};

export function activityLabel(operation: string): string {
  return LABELS[operation] ?? "Operazione di sistema";
}

export function locationStatusLabel(status: string): string {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "DESYNC":
      return "In sincronizzazione";
    case "OFFLINE":
      return "Offline";
    default:
      return status;
  }
}
