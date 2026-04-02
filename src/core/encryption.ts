import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from "crypto";
import { readFileSync } from "fs";
import { homedir, hostname, platform, arch, cpus } from "os";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;
const ITERATIONS = 100_000;
const DIGEST = "sha512";

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

export class Encryption {
  private _machineFingerprint: string | null = null;

  private get machineFingerprint(): string {
    if (this._machineFingerprint) return this._machineFingerprint;

    const parts: string[] = [hostname(), platform(), arch(), String(cpus().length)];

    // Linux: use /etc/machine-id for stable per-machine id
    if (platform() === "linux") {
      try {
        const machineId = readFileSync("/etc/machine-id", "utf8").trim();
        parts.push(machineId);
      } catch {
        // fallback to hashed homedir
        parts.push(createHash("sha256").update(homedir()).digest("hex").slice(0, 32));
      }
    } else {
      parts.push(createHash("sha256").update(homedir()).digest("hex").slice(0, 32));
    }

    this._machineFingerprint = parts.join("|");
    return this._machineFingerprint;
  }

  private deriveKey(): Buffer {
    const salt = createHash("sha256").update(this.machineFingerprint).digest();
    return pbkdf2Sync("ccs-encryption-key", salt, ITERATIONS, KEY_LEN, DIGEST);
  }

  async encrypt(plaintext: string): Promise<string> {
    return this.encryptSync(plaintext);
  }

  encryptSync(plaintext: string): string {
    const key = this.deriveKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Format: base64(iv ‖ auth_tag ‖ ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  async decrypt(encryptedData: string): Promise<string> {
    return this.decryptSync(encryptedData);
  }

  decryptSync(encryptedData: string): string {
    const key = this.deriveKey();

    let buf: Buffer;
    try {
      buf = Buffer.from(encryptedData, "base64");
    } catch {
      throw new EncryptionError("Invalid base64 input");
    }

    if (buf.length < IV_LEN + AUTH_TAG_LEN) {
      throw new EncryptionError("Ciphertext too short");
    }

    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + AUTH_TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new EncryptionError("Decryption failed: auth tag mismatch or corrupted data");
    }
  }
}

let _instance: Encryption | null = null;

export function getEncryption(): Encryption {
  if (!_instance) _instance = new Encryption();
  return _instance;
}

export function encryptForStorage(plaintext: string): string {
  return getEncryption().encryptSync(plaintext);
}

export function decryptFromStorage(encryptedData: string): string {
  return getEncryption().decryptSync(encryptedData);
}
