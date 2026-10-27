import { describe, expect, it } from "vitest";
import { loginSchema, loginFormDefaults } from "./validation";

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "dev@example.com", password: "password123" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing email", () => {
    const result = loginSchema.safeParse({ email: "", password: "password123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Email is required");
    }
  });

  it("rejects an invalid email format", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "password123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("valid email");
    }
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = loginSchema.safeParse({ email: "dev@example.com", password: "short" });
    expect(result.success).toBe(false);
  });

  it("provides sensible form defaults", () => {
    expect(loginFormDefaults).toEqual({ email: "", password: "" });
  });
});
