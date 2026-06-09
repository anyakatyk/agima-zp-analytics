import bcrypt from "bcryptjs";
import type { User } from "./types";
import { signToken, type JWTPayload } from "./auth-token";

// MVP: хранилище пользователей (в проде — БД)
const USERS: Array<User & { passwordHash: string }> = [
  {
    id: "1",
    email: "admin@agima.ru",
    passwordHash: "$2a$10$xVqYLQKJm0wWNKnEVPfENOeVnQeMjKqFvqYhE1WxH8F3K2J4L6Mn",
    name: "Администратор",
    role: "admin",
  },
  {
    id: "2",
    email: "hr@agima.ru",
    passwordHash: "$2a$10$xVqYLQKJm0wWNKnEVPfENOeVnQeMjKqFvqYhE1WxH8F3K2J4L6Mn",
    name: "HR Менеджер",
    role: "hr",
  },
  {
    id: "3",
    email: "manager@agima.ru",
    passwordHash: "$2a$10$xVqYLQKJm0wWNKnEVPfENOeVnQeMjKqFvqYhE1WxH8F3K2J4L6Mn",
    name: "Руководитель",
    role: "manager",
    department: "Разработка",
  },
];

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
  const record = USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (!record) return null;

  // MVP: все пароли — "password123"
  // В проде раскомментировать проверку:
  // const valid = await verifyPassword(password, record.passwordHash);
  // if (!valid) return null;
  const valid = password === "password123";
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
