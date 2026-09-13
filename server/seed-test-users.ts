import { db } from "./db";
import { users, companies } from "@shared/schema";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function createTestUsers() {
  try {
    console.log("🌱 Creating test users...");

    // Create a test company first
    const [testCompany] = await db
      .insert(companies)
      .values({
        name: "TestTech Solutions",
        description: "A test company for development and testing purposes",
        industry: "Technology",
        location: "San Francisco, CA",
        email: "info@testtech.com",
        contactEmail: "contact@testtech.com",
        website: "https://testtech.com",
        colorTheme: "blue",
        certifications: ["ISO 9001", "ISO 27001"],
        capabilities: ["Software Development", "Cloud Solutions", "Data Analytics"],
        country: "United States",
        companySize: "50-100",
        servicesOffered: ["Custom Software", "Consulting", "Cloud Migration"],
        targetMarkets: ["Small Business", "Enterprise"],
      })
      .onConflictDoUpdate({
        target: companies.name,
        set: {
          description: "A test company for development and testing purposes",
          industry: "Technology",
          location: "San Francisco, CA",
        },
      })
      .returning();

    console.log("✅ Test company created:", testCompany?.name);

    // Create test company admin
    const adminPassword = await hashPassword("admin123");
    const adminId = nanoid();
    
    const [testAdmin] = await db
      .insert(users)
      .values({
        id: adminId,
        email: "admin@testtech.com",
        passwordHash: adminPassword,
        firstName: "Test",
        lastName: "Admin",
        role: "company_admin",
        companyId: testCompany?.id || null,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: adminPassword,
          firstName: "Test",
          lastName: "Admin",
          role: "company_admin",
          companyId: testCompany?.id || null,
        },
      })
      .returning();

    console.log("✅ Test company admin created:", testAdmin?.email);

    // Create test regular user
    const userPassword = await hashPassword("user123");
    const userId = nanoid();
    
    const [testUser] = await db
      .insert(users)
      .values({
        id: userId,
        email: "user@test.com",
        passwordHash: userPassword,
        firstName: "Test",
        lastName: "User",
        role: "public",
        companyId: null,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: userPassword,
          firstName: "Test",
          lastName: "User",
          role: "public",
        },
      })
      .returning();

    console.log("✅ Test regular user created:", testUser?.email);

    console.log("\n🎯 Test Accounts Created:");
    console.log("Company Admin:");
    console.log("  Email: admin@testtech.com");
    console.log("  Password: admin123");
    console.log("  Company: TestTech Solutions");
    console.log("");
    console.log("Regular User:");
    console.log("  Email: user@test.com");
    console.log("  Password: user123");

    return {
      admin: testAdmin,
      user: testUser,
      company: testCompany,
    };
  } catch (error) {
    console.error("❌ Error creating test users:", error);
    throw error;
  }
}