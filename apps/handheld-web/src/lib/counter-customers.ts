import type { InvoiceCustomerProfile } from "@pizzaguys/types";

export interface CounterCustomerSelection {
  name: string;
  phone?: string;
  address?: string;
}

export function formatProfileAddress(
  profile: Pick<InvoiceCustomerProfile, "address" | "postalCode" | "city" | "province">,
): string {
  const line1 = profile.address?.trim();
  const line2 = [profile.postalCode, profile.city, profile.province].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ");
}

export function profileToCounterCustomer(profile: InvoiceCustomerProfile): CounterCustomerSelection {
  return {
    name: profile.businessName,
    phone: profile.phone,
    address: formatProfileAddress(profile) || undefined,
  };
}

export function dedupeRecentCustomers(
  orders: Array<{ customerName?: string | null; phone?: string | null; address?: string | null }>,
): CounterCustomerSelection[] {
  const seen = new Set<string>();
  const result: CounterCustomerSelection[] = [];

  for (const order of [...orders].reverse()) {
    const name = order.customerName?.trim();
    if (!name) continue;
    const key = (order.phone?.trim() || name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      phone: order.phone?.trim() || undefined,
      address: order.address?.trim() || undefined,
    });
  }

  return result;
}

export function matchesCustomerQuery(customer: CounterCustomerSelection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [customer.name, customer.phone, customer.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
