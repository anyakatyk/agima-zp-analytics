import bcrypt from "bcryptjs";
import type { User } from "./types";
import { signToken, type JWTPayload } from "./auth-token";

type StoredUser = User & { passwordHash: string };

function getUsers(): StoredUser[] {
  const raw = process.env.APP_USERS_JSON;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed)
      ? parsed.filter((user) => user.email && user.passwordHash && user.role)
      : [];
  } catch {
    return [];
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function authenticate(
  email: string,
  password: string
): Promise<{ user: User; token: string } | null> {
  const record = getUsers().find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!record) return null;

  const valid = await verifyPassword(password, record.passwordHash);
  if (!valid) return null;

  const user: User = {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    department: record.department,
  };

  const token = await signToken(user);
  return { user, token };
}

export function getUserFromPayload(payload: JWTPayload): User {
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    department: payload.department,
  };
}

export { COOKIE_NAME, verifyToken } from "./auth-token";
