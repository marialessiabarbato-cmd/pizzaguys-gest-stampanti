import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncQueue = sqliteTable("sync_queue", {
  id: text("id").primaryKey(),
  operation: text("operation").notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["PENDING", "COMPLETED", "FAILED"] })
    .notNull()
    .default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});
