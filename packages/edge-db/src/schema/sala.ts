import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  applyCoverCharge: integer("apply_cover_charge", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const tables = sqliteTable("tables", {
  id: text("id").primaryKey(),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull().default(80),
  height: real("height").notNull().default(80),
  defaultGuests: integer("default_guests").notNull().default(2),
  isVirtual: integer("is_virtual", { mode: "boolean" }).notNull().default(false),
  virtualType: text("virtual_type", { enum: ["ASPORTO", "DELIVERY"] }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
