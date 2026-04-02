import { describe, test, expect, beforeAll } from "bun:test";
import { Encryption, encryptForStorage, decryptFromStorage } from "../../src/core/encryption";

describe("Encryption", () => {
  let encryption: Encryption;

  beforeAll(() => {
    encryption = new Encryption();
  });

  test("encrypt produces different ciphertext each time", async () => {
    const token = "sk-ant-test-token-12345";
    const encrypted1 = await encryption.encrypt(token);
    const encrypted2 = await encryption.encrypt(token);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test("encrypt then decrypt roundtrip returns original token", async () => {
    const token = "sk-ant-test-token-abcdef";
    const encrypted = await encryption.encrypt(token);
    const decrypted = await encryption.decrypt(encrypted);
    expect(decrypted).toBe(token);
  });

  test("decrypt throws on tampered ciphertext", async () => {
    const encrypted = await encryption.encrypt("secret");
    const tampered = encrypted.slice(0, -5) + "XXXXX";
    expect(() => encryption.decryptSync(tampered)).toThrow();
  });

  test("decrypt throws on invalid base64", () => {
    expect(() => encryption.decryptSync("not-valid-base64!!!")).toThrow();
  });

  test("encrypt then decrypt with empty string", async () => {
    const encrypted = await encryption.encrypt("");
    const decrypted = await encryption.decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  test("encrypt then decrypt with unicode characters", async () => {
    const token = "sk-ant-🔐-token-日本語";
    const encrypted = await encryption.encrypt(token);
    const decrypted = await encryption.decrypt(encrypted);
    expect(decrypted).toBe(token);
  });

  test("encrypt then decrypt with long token (>200 chars)", async () => {
    const token = "sk-ant-" + "a".repeat(250);
    const encrypted = await encryption.encrypt(token);
    const decrypted = await encryption.decrypt(encrypted);
    expect(decrypted).toBe(token);
  });
});

describe("Storage helpers", () => {
  test("encryptForStorage and decryptFromStorage roundtrip", () => {
    const token = "sk-ant-storage-token";
    const stored = encryptForStorage(token);
    const retrieved = decryptFromStorage(stored);
    expect(retrieved).toBe(token);
    expect(stored).not.toContain(token);
  });

  test("encryptForStorage produces base64 output", () => {
    const stored = encryptForStorage("any-token");
    // Valid base64 characters only
    expect(/^[A-Za-z0-9+/]+=*$/.test(stored)).toBe(true);
  });

  test("decryptFromStorage throws EncryptionError on invalid input", () => {
    expect(() => decryptFromStorage("invalid")).toThrow();
  });
});
