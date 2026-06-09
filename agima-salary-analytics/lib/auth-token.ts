import { SignJWT, jwtVerify } from "jose";
import type { User, UserRole } from "./types";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);

export const COOKIE_NAME = "auth-token";

export type JWTPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
};

export async function signToken(user: User): Promise<string> {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
