import { describe, test, expect, beforeAll } from "bun:test";
import {
  Encryption,
  encryptForStorage,
  decryptFromStorage,
  ensureMachineIdFile,
} from "../../src/core/encryption";

describe("Encryption", () => {
  let encryption: Encryption;

  beforeAll(() => {
    ensureMachineIdFile();
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
    // Valid base64 characters only (after v1: prefix)
    const body = stored.replace(/^v1:/, "");
    expect(/^[A-Za-z0-9+/]+=*$/.test(body)).toBe(true);
  });

  test("decryptFromStorage throws EncryptionError on invalid input", () => {
    expect(() => decryptFromStorage("invalid")).toThrow();
  });

  test("encryptForStorage returns ciphertext with v1: prefix", () => {
    const stored = encryptForStorage("test-token");
    expect(stored.startsWith("v1:")).toBe(true);
  });

  test("decryptFromStorage strips v1: prefix and returns original", () => {
    const token = "sk-ant-secret-" + "x".repeat(100);
    const stored = encryptForStorage(token);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptFromStorage(stored)).toBe(token);
  });

  test("decryptFromStorage handles legacy ciphertext without prefix", async () => {
    // Build a raw v0 ciphertext manually (iv+tag+ciphertext as base64, no prefix)
    // so we can verify backward compatibility with data encrypted before v1: was added.
    const { randomBytes, createCipheriv, createHash, pbkdf2Sync } = await import("crypto");
    const { getMachineIdPath } = await import("../../src/core/encryption");
    const machineId = (await Bun.file(getMachineIdPath()).text()).trim();
    const salt = createHash("sha256").update(machineId).digest();
    const key = pbkdf2Sync("ccs-encryption-key", salt, 100_000, 32, "sha512");
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update("legacy-token", "utf8"), cipher.final()]);
    const raw = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
    expect(raw.startsWith("v1:")).toBe(false);
    expect(decryptFromStorage(raw)).toBe("legacy-token");
  });
});

describe("ensureMachineIdFile", () => {
  test("creates machine-id file if missing", async () => {
    const { getMachineIdPath } = await import("../../src/core/encryption");
    const path = getMachineIdPath();
    const { existsSync, unlinkSync } = await import("fs");
    // Remove if exists from previous run
    if (existsSync(path)) unlinkSync(path);
    expect(existsSync(path)).toBe(false);
    const { ensureMachineIdFile } = await import("../../src/core/encryption");
    ensureMachineIdFile();
    expect(existsSync(path)).toBe(true);
    const content = await Bun.file(path).text();
    expect(content.startsWith("ccs-")).toBe(true);
  });

  test("is idempotent — no error if file already exists", async () => {
    const { ensureMachineIdFile } = await import("../../src/core/encryption");
    expect(() => ensureMachineIdFile()).not.toThrow();
  });
});
