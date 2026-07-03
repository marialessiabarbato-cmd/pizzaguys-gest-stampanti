import type { InvoiceCustomer, InvoiceCustomerProfile } from "@pizzaguys/types";

export function profileToInvoiceCustomer(profile: InvoiceCustomerProfile): InvoiceCustomer {
  return {
    businessName: profile.businessName,
    vatNumber: profile.vatNumber,
    taxCode: profile.taxCode,
    sdiCode: profile.sdiCode,
    pec: profile.pec,
  };
}
