import { z } from "zod";
import { pinSchema } from "./auth.js";

export const provisionEdgeSchema = z.object({
  apiToken: z.string().min(32),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).optional(),
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
  managerPin: z.string().regex(/^[0-9]{4}$/),
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

export const payTableSchema = z.object({
  paymentMethod: z.enum(["CASH", "POS", "MEAL_VOUCHER", "SATISPAY", "OTHER"]),
  amountReceived: z.number().positive().optional(),
  operatorId: z.string().min(1),
  operatorName: z.string().min(1),
  paymentRequestId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  splitMode: z.enum(["FULL", "ROMAN", "ANALYTIC"]).default("FULL"),
  checkId: z.string().uuid().optional(),
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
