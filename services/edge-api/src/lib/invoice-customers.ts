import { randomUUID } from "node:crypto";
import type { InvoiceCustomer, InvoiceCustomerProfile } from "@pizzaguys/types";
import { invoiceCustomerProfiles } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { eq, sql } from "drizzle-orm";

export function profileToInvoiceCustomer(profile: InvoiceCustomerProfile): InvoiceCustomer {
  return {
    businessName: profile.businessName,
    vatNumber: profile.vatNumber,
    taxCode: profile.taxCode,
    sdiCode: profile.sdiCode,
    pec: profile.pec,
  };
}

function rowToProfile(row: typeof invoiceCustomerProfiles.$inferSelect): InvoiceCustomerProfile {
  return {
    id: row.id,
    businessName: row.businessName,
    address: row.address ?? undefined,
    postalCode: row.postalCode ?? undefined,
    province: row.province ?? undefined,
    city: row.city ?? undefined,
    country: row.country,
    vatNumber: row.vatNumber ?? undefined,
    taxCode: row.taxCode ?? undefined,
    sdiCode: row.sdiCode ?? undefined,
    pec: row.pec ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    notes: row.notes ?? undefined,
    isActive: row.isActive,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listInvoiceCustomerProfiles(
  db: EdgeDatabase,
  query?: string,
): InvoiceCustomerProfile[] {
  const rows = db
    .select()
    .from(invoiceCustomerProfiles)
    .where(eq(invoiceCustomerProfiles.isActive, true))
    .all();

  const q = query?.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => {
        const haystack = [
          row.businessName,
          row.city,
          row.vatNumber,
          row.taxCode,
          row.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : rows;

  return filtered
    .sort((a, b) => a.businessName.localeCompare(b.businessName, "it"))
    .map(rowToProfile);
}

export function getInvoiceCustomerProfile(
  db: EdgeDatabase,
  id: string,
): InvoiceCustomerProfile | undefined {
  const row = db
    .select()
    .from(invoiceCustomerProfiles)
    .where(eq(invoiceCustomerProfiles.id, id))
    .get();
  return row ? rowToProfile(row) : undefined;
}

export function upsertInvoiceCustomerProfile(
  db: EdgeDatabase,
  data: Omit<InvoiceCustomerProfile, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
): InvoiceCustomerProfile {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(invoiceCustomerProfiles)
    .where(eq(invoiceCustomerProfiles.id, data.id))
    .get();

  const values = {
    id: data.id,
    businessName: data.businessName,
    address: data.address ?? null,
    postalCode: data.postalCode ?? null,
    province: data.province ?? null,
    city: data.city ?? null,
    country: data.country ?? "IT",
    vatNumber: data.vatNumber ?? null,
    taxCode: data.taxCode ?? null,
    sdiCode: data.sdiCode ?? null,
    pec: data.pec ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    notes: data.notes ?? null,
    isActive: data.isActive ?? true,
    source: data.source ?? "LOCAL",
    createdAt: existing?.createdAt ?? data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };

  if (existing) {
    db.update(invoiceCustomerProfiles).set(values).where(eq(invoiceCustomerProfiles.id, data.id)).run();
  } else {
    db.insert(invoiceCustomerProfiles).values(values).run();
  }

  return rowToProfile(
    db.select().from(invoiceCustomerProfiles).where(eq(invoiceCustomerProfiles.id, data.id)).get()!,
  );
}

export function applyInvoiceCustomersFromSnapshot(
  db: EdgeDatabase,
  customers: InvoiceCustomerProfile[] | undefined,
) {
  if (!customers?.length) return;

  for (const customer of customers) {
    const existing = db
      .select()
      .from(invoiceCustomerProfiles)
      .where(eq(invoiceCustomerProfiles.id, customer.id))
      .get();

    if (existing?.source === "LOCAL" && existing.updatedAt > (customer.updatedAt ?? "")) {
      continue;
    }

    upsertInvoiceCustomerProfile(db, {
      ...customer,
      source: "CLOUD",
      isActive: customer.isActive ?? true,
    });
  }
}

export function createLocalInvoiceCustomerProfile(
  db: EdgeDatabase,
  data: Omit<InvoiceCustomerProfile, "id" | "source" | "createdAt" | "updatedAt" | "isActive"> & {
    isActive?: boolean;
  },
): InvoiceCustomerProfile {
  return upsertInvoiceCustomerProfile(db, {
    id: randomUUID(),
    ...data,
    source: "LOCAL",
    isActive: data.isActive ?? true,
  });
}

export function countInvoiceCustomerProfiles(db: EdgeDatabase): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(invoiceCustomerProfiles)
    .get();
  return row?.count ?? 0;
}
