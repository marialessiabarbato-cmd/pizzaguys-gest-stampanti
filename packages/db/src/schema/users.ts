import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.js";

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "USER_ADMIN",
  "CASHIER",
  "WAITER",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: userRoleEnum("role").notNull(),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  pinHash: text("pin_hash"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
