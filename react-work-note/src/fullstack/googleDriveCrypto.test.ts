import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  },
}));

import { decryptSecret, encryptSecret } from "../../../app/google-drive/crypto";

describe("Google Drive token encryption", () => {
  it("round-trips a refresh token without storing plaintext", async () => {
    const plaintext = "refresh-token-for-work-note";
    const encrypted = await encryptSecret(plaintext);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(plaintext);
    await expect(decryptSecret(encrypted)).resolves.toBe(plaintext);
  });

  it("uses a unique IV for each encryption", async () => {
    const first = await encryptSecret("same-token");
    const second = await encryptSecret("same-token");
    expect(first).not.toBe(second);
  });

  it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptSecret("secret");
    const [version, iv, ciphertext] = encrypted.split(".");
    const tamperedCiphertext = `${ciphertext.startsWith("A") ? "B" : "A"}${ciphertext.slice(1)}`;
    await expect(decryptSecret(`${version}.${iv}.${tamperedCiphertext}`)).rejects.toThrow();
  });
});

