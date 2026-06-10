import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workCenterEnum = ["CUCINA", "PIZZERIA", "BAR", "CHEF"] as const;
export type WorkCenter = (typeof workCenterEnum)[number];

export const printers = sqliteTable("printers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  workCenter: text("work_center", { enum: workCenterEnum }).notNull(),
  host: text("host").notNull().default("127.0.0.1"),
  port: integer("port").notNull().default(9100),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const categoryRouting = sqliteTable("category_routing", {
  categoryId: text("category_id").primaryKey(),
  workCenter: text("work_center", { enum: workCenterEnum }).notNull(),
});
