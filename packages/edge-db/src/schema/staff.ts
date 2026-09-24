import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const staffRoleEnum = ["USER_ADMIN", "CASHIER", "WAITER"] as const;

export const staff = sqliteTable("staff", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  role: text("role", { enum: staffRoleEnum }).notNull(),
  pinHash: text("pin_hash").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const staffShifts = sqliteTable("staff_shifts", {
  id: text("id").primaryKey(),
  staffId: text("staff_id")
    .notNull()
    .references(() => staff.id, { onDelete: "cascade" }),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
});
