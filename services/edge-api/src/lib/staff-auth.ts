import { staff } from "@pizzaguys/edge-db";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { EdgeDatabase } from "@pizzaguys/edge-db";

export interface VerifiedStaff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export async function verifyPin(
  db: EdgeDatabase,
  pin: string,
): Promise<VerifiedStaff | null> {
  if (!/^[0-9]{4}$/.test(pin)) return null;
  const members = db.select().from(staff).where(eq(staff.isActive, true)).all();
  for (const member of members) {
    const valid = await bcrypt.compare(pin, member.pinHash);
    if (valid) {
      return {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
      };
    }
  }
  return null;
}

export async function verifyManagerPin(
  db: EdgeDatabase,
  pin: string,
): Promise<VerifiedStaff | null> {
  const member = await verifyPin(db, pin);
  if (!member) return null;
  if (member.role === "WAITER") return null;
  return member;
}

export function getActiveStaffById(
  db: EdgeDatabase,
  staffId: string,
): VerifiedStaff | null {
  const member = db.select().from(staff).where(eq(staff.id, staffId)).get();
  if (!member?.isActive) return null;
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role,
  };
}
