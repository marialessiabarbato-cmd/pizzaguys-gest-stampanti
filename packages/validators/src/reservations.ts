import { z } from "zod";

export const reservationShiftSchema = z.enum([
  "LUNCH",
  "DINNER_1",
  "DINNER_2",
  "OTHER",
]);

export const reservationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "SEATED",
  "CANCELLED",
  "NO_SHOW",
]);

export const createReservationSchema = z.object({
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/),
  shift: reservationShiftSchema.optional(),
  customerName: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  guests: z.number().int().min(1).max(99),
  tableId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
  isWaitingList: z.boolean().optional(),
  operatorId: z.string().uuid().optional(),
  operatorName: z.string().max(80).optional(),
});

export const updateReservationSchema = z.object({
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  shift: reservationShiftSchema.optional(),
  customerName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  guests: z.number().int().min(1).max(99).optional(),
  tableId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  status: reservationStatusSchema.optional(),
  isWaitingList: z.boolean().optional(),
});

export const assignReservationTableSchema = z.object({
  tableId: z.string().uuid(),
});

export const arriveReservationSchema = z.object({
  openTable: z.boolean().optional(),
  operatorId: z.string().uuid().optional(),
  operatorName: z.string().max(80).optional(),
});

export const printReservationsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: reservationShiftSchema.or(z.literal("ALL")).optional(),
  roomId: z.string().uuid().optional(),
  operatorName: z.string().max(80).optional(),
});
