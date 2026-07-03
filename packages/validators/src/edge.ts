import { z } from "zod";
import { paymentSplitSchema } from "./meal-voucher-presets.js";
import { pinSchema } from "./auth.js";
import { invoiceCustomerSchema } from "./invoice.js";

export const provisionEdgeSchema = z.object({
  apiToken: z.string().min(32),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).optional(),
  applyCoverCharge: z.boolean().optional(),
});

export const createTableSchema = z.object({
  roomId: z.string().min(1).optional(),
  label: z.string().min(1).max(20),
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  defaultGuests: z.number().int().min(1).max(30).optional(),
  isVirtual: z.boolean().optional(),
  virtualType: z.enum(["ASPORTO", "DELIVERY"]).optional(),
});

export const updateTableSchema = createTableSchema.partial();

export const createPrinterSchema = z.object({
  name: z.string().min(1),
  workCenter: z.enum(["CUCINA", "PIZZERIA", "BAR", "CHEF"]),
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  enabled: z.boolean().optional(),
});

export const updatePrinterSchema = createPrinterSchema.partial();

export const categoryRoutingSchema = z.object({
  categoryId: z.string().uuid(),
  workCenter: z.enum(["CUCINA", "PIZZERIA", "BAR", "CHEF"]),
});

export const createStaffSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["USER_ADMIN", "CASHIER", "WAITER"]),
  pin: pinSchema,
});

export const updateStaffSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["USER_ADMIN", "CASHIER", "WAITER"]).optional(),
  pin: pinSchema.optional(),
  isActive: z.boolean().optional(),
});

export const startShiftSchema = z.object({
  staffId: z.string().uuid(),
});

export const orderLineVariantSchema = z.object({
  variantId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(["ADD", "REMOVE"]),
  priceDelta: z.number().min(0),
});

export const orderLineSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  basePrice: z.number().positive().optional(),
  channel: z.enum(["TABLE", "TAKEAWAY", "DELIVERY"]).default("TABLE"),
  notes: z.string().optional(),
  variants: z.array(orderLineVariantSchema).default([]),
  course: z.number().int().min(1).max(4).default(1),
  hold: z.boolean().default(false),
  dessertDefer: z.boolean().default(false),
  discountPercent: z.number().min(0).max(100).optional(),
  discountToken: z.string().optional(),
});

export const upsertOrderSchema = z.object({
  tableId: z.string().min(1),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  channel: z.enum(["TABLE", "TAKEAWAY", "DELIVERY"]).default("TABLE"),
  lines: z.array(orderLineSchema).min(1),
});

export const stornoLineSchema = z.object({
  lineId: z.string().uuid(),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  quantity: z.number().int().positive().optional(),
});

export const authorizeDiscountSchema = z.object({
  managerPin: z.string().regex(/^[0-9]{4}$/),
  discountPercent: z.number().min(1).max(100),
});

export const callCourseSchema = z.object({
  tableId: z.string().min(1),
  course: z.number().int().min(1).max(4),
});

export const releaseDessertSchema = z.object({
  tableId: z.string().min(1),
});

export const payTableSchema = z
  .object({
    paymentMethod: z.enum(["CASH", "POS", "MEAL_VOUCHER", "SATISPAY", "OTHER"]).optional(),
    paymentSplits: z.array(paymentSplitSchema).min(1).max(4).optional(),
    amountReceived: z.number().positive().optional(),
    operatorId: z.string().min(1),
    operatorName: z.string().min(1),
    paymentRequestId: z.string().uuid().optional(),
    shiftId: z.string().uuid().optional(),
    splitMode: z.enum(["FULL", "ROMAN", "ANALYTIC"]).default("FULL"),
    checkId: z.string().uuid().optional(),
    documentType: z.enum(["RECEIPT", "INVOICE", "TRAINING"]).default("RECEIPT"),
    invoiceCustomer: invoiceCustomerSchema.optional(),
    fullMealReceipt: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (!data.paymentMethod && !data.paymentSplits?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Metodo di pagamento o paymentSplits richiesti",
        path: ["paymentMethod"],
      });
    }
    if (data.documentType === "INVOICE" && !data.invoiceCustomer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dati cliente obbligatori per fattura",
        path: ["invoiceCustomer"],
      });
    }
    if (data.documentType !== "INVOICE" && data.invoiceCustomer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Dati cliente consentiti solo con documento Fattura",
        path: ["invoiceCustomer"],
      });
    }
    if (data.paymentSplits?.length && data.documentType === "INVOICE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pagamento misto non disponibile con fattura",
        path: ["paymentSplits"],
      });
    }
  });

export const romanSplitSchema = z.object({
  shares: z.number().int().min(2).max(20),
});

export const analyticSplitSchema = z.object({
  checkCount: z.number().int().min(2).max(10).optional(),
  checks: z
    .array(
      z.object({
        id: z.string().uuid(),
        label: z.string().min(1).max(40),
        lineIds: z.array(z.string().uuid()),
      }),
    )
    .min(2)
    .optional(),
});

export const closeBlindSchema = z.object({
  cashDeclared: z.number().min(0),
  posDeclared: z.number().min(0).default(0),
});

export const closureReconcileSchema = closeBlindSchema;

export const closureCompleteSchema = z.object({
  cashDeclared: z.number().min(0),
  posDeclared: z.number().min(0).default(0),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
});

export const applyPosDiscountSchema = z.object({
  lineId: z.string().uuid(),
  discountPercent: z.number().min(1).max(100),
  managerPin: z.string().regex(/^[0-9]{4}$/).optional(),
});

export const counterSaleSchema = z.object({
  channel: z.enum(["TAKEAWAY", "DELIVERY"]),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  lines: z.array(orderLineSchema).min(1),
});

export const createCounterOrderSchema = z
  .object({
    channel: z.enum(["TAKEAWAY", "DELIVERY"]),
    operatorId: z.string().min(1),
    operatorName: z.string().min(1),
    customerName: z.string().max(120).optional(),
    phone: z.string().max(30).optional(),
    address: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
    broker: z.string().max(80).optional(),
    asap: z.boolean().default(true),
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "DELIVERY" && !data.asap && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Orario consegna obbligatorio",
        path: ["scheduledAt"],
      });
    }
    if (!data.asap && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seleziona un orario o «Il prima possibile»",
        path: ["scheduledAt"],
      });
    }
  });

export const updateTableGuestsSchema = z.object({
  guests: z.number().int().min(1).max(99),
  operatorId: z.string().min(1),
});

export const transferTableSchema = z.object({
  sourceTableId: z.string().min(1),
  targetTableId: z.string().min(1),
  lineIds: z.array(z.string().uuid()).optional(),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  overridePin: z.string().regex(/^[0-9]{4}$/).optional(),
});

export const mergeTablesSchema = z.object({
  sourceTableIds: z.array(z.string().min(1)).min(1),
  targetTableId: z.string().min(1),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  overridePin: z.string().regex(/^[0-9]{4}$/).optional(),
});
