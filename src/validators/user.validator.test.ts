import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { adminUpdateUserSchema, updateUserSchema } from "./user.validator.js";

describe("updateUserSchema (PUT /api/users/me — profil diri sendiri)", () => {
  it("rejects a payload that only carries role (privilege escalation attempt)", () => {
    const result = updateUserSchema.safeParse({ role: "admin" });

    expect(result.success).toBe(false);
    expect(() => updateUserSchema.parse({ role: "admin" })).toThrow(ZodError);
  });

  it("rejects a payload that only carries isActive", () => {
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(false);
  });

  it("drops role/isActive when they arrive next to a valid profile field", () => {
    const parsed = updateUserSchema.parse({
      name: "Alya Pratama",
      role: "admin",
      isActive: false,
    });

    expect(parsed).toEqual({ name: "Alya Pratama" });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("isActive");
  });

  it("accepts name and email updates", () => {
    expect(
      updateUserSchema.parse({
        name: "Alya",
        email: "ALYA@Example.com",
      }),
    ).toEqual({ name: "Alya", email: "alya@example.com" });
  });

  it("rejects an empty payload", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it("still validates field shapes (short name rejected)", () => {
    expect(updateUserSchema.safeParse({ name: "a" }).success).toBe(false);
  });
});

describe("adminUpdateUserSchema (PUT /api/users/:id — di belakang checkRole([admin]))", () => {
  it("keeps role & isActive updatable so admin role management stays alive", () => {
    expect(
      adminUpdateUserSchema.parse({ role: "admin", isActive: false }),
    ).toEqual({ role: "admin", isActive: false });
  });

  it("accepts profile-only updates", () => {
    expect(adminUpdateUserSchema.parse({ name: "Budi" })).toEqual({
      name: "Budi",
    });
  });

  it("rejects an empty payload", () => {
    expect(adminUpdateUserSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid role value", () => {
    expect(adminUpdateUserSchema.safeParse({ role: "superuser" }).success).toBe(
      false,
    );
  });
});
