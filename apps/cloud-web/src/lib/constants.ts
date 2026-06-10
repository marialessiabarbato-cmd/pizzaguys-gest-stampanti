export const EU_ALLERGENS = [
  { id: "glutine", label: "Glutine" },
  { id: "crostacei", label: "Crostacei" },
  { id: "uova", label: "Uova" },
  { id: "pesce", label: "Pesce" },
  { id: "arachidi", label: "Arachidi" },
  { id: "soia", label: "Soia" },
  { id: "latte", label: "Latte" },
  { id: "frutta_a_guscio", label: "Frutta a guscio" },
  { id: "sedano", label: "Sedano" },
  { id: "senape", label: "Senape" },
  { id: "sesamo", label: "Sesamo" },
  { id: "solfiti", label: "Solfiti" },
  { id: "lupini", label: "Lupini" },
  { id: "molluschi", label: "Molluschi" },
] as const;

export const SALES_CHANNELS = [
  { id: "TABLE", label: "Tavolo" },
  { id: "TAKEAWAY", label: "Asporto" },
  { id: "DELIVERY", label: "Delivery" },
] as const;

export const VAT_RATES = [4, 10, 22] as const;

export function localizedName(name: Record<string, string> | string): string {
  if (typeof name === "string") return name;
  return name.it ?? name.en ?? Object.values(name)[0] ?? "";
}
