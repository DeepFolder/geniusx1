import jwt from "jsonwebtoken";

const TEST_JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Test-contract roles for minting JWTs.
 *
 * Production roles in users.role (shared/schema.ts):
 *   "public", "company_admin", "admin"
 *
 * "member" is the test-contract role for a basic authenticated company
 * member. It may be stored as "public" or another value in production,
 * but tests can mint tokens with role "member" to verify middleware
 * behaviour for routes that allow any authenticated user.
 */
export type TestRole = "admin" | "company_admin" | "member" | "public";

export interface TestTokenPayload {
  id: string;
  email: string;
  role: TestRole;
  companyId?: number;
  iat?: number;
  exp?: number;
}

export function mintTestToken(
  role: TestRole,
  userId: string = `test-user-${role}`,
  overrides: Partial<TestTokenPayload> = {},
): string {
  const payload: TestTokenPayload = {
    id: userId,
    email: `${userId}@test.example`,
    role,
    ...overrides,
  };

  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: "1h" });
}

export function mintAdminToken(userId = "test-admin-001"): string {
  return mintTestToken("admin", userId);
}

export function mintCompanyAdminToken(
  userId = "test-company-admin-001",
  companyId = 1,
): string {
  return mintTestToken("company_admin", userId, { companyId });
}

/** Mints a JWT for a basic company member (authenticated, non-admin user). */
export function mintMemberToken(
  userId = "test-member-001",
  companyId = 1,
): string {
  return mintTestToken("member", userId, { companyId });
}

export function mintPublicToken(userId = "test-public-001"): string {
  return mintTestToken("public", userId);
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
