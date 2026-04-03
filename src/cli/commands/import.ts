import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { createDecipheriv, pbkdf2Sync } from "crypto";
import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { encryptForStorage } from "../../core/encryption.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";
import type { ExportData, Profile } from "../../types/index.js";

const PBKDF2_ITERS = 100_000;

function decryptWithPassword(envelope: string, password: string): string {
  const buf = Buffer.from(envelope, "base64");
  const salt = buf.subarray(0, 32);
  const iv = buf.subarray(32, 48);
  const authTag = buf.subarray(48, 64);
  const ciphertext = buf.subarray(64);
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERS, 32, "sha512");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return pt.toString("utf8");
}

export async function importCommand(file: string, cmd: Command): Promise<void> {
  touchSession();
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const overwrite = (opts["overwrite"] as boolean) ?? false;
  const skip = (opts["skip"] as boolean) ?? false;
  const password = (opts["password"] as string | undefined) ?? Bun.env["CCS_IMPORT_PASSWORD"];

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    respondError(flags, `Cannot read file: ${file}`, 1);
  }

  let data: ExportData;

  if (raw.startsWith("CCS-BACKUP-v1:")) {
    if (!password) {
      respondError(
        flags,
        "Encrypted backup requires --password <pw> or CCS_IMPORT_PASSWORD env var",
        2,
      );
    }
    try {
      const decrypted = decryptWithPassword(raw.slice("CCS-BACKUP-v1:".length), password!);
      data = JSON.parse(decrypted) as ExportData;
    } catch {
      respondError(flags, "Decryption failed — wrong password or corrupted data", 4);
    }
  } else {
    try {
      data = JSON.parse(raw) as ExportData;
    } catch {
      respondError(flags, "Invalid JSON file", 1);
    }
  }

  const db = getDatabase();
  let imported = 0;
  let skipped = 0;

  for (const ep of data.profiles) {
    const existing = db.getAllProfiles().find((p) => p.name === ep.name);
    if (existing) {
      if (skip) {
        skipped++;
        continue;
      }
      if (!overwrite) {
        console.error(
          `Profile "${ep.name}" already exists — skipping. Use --overwrite to replace.`,
        );
        skipped++;
        continue;
      }
      db.deleteProfile(existing.id);
    }

    const encryptedToken = encryptForStorage(ep.token);
    const profile: Profile = {
      id: ep.id ?? randomUUID(),
      name: ep.name,
      token_encrypted: encryptedToken,
      auth_method: (ep.auth_method as "oauth" | "manual" | "env") ?? "manual",
      created_at: Date.now(),
      last_used: 0,
      use_count: 0,
      metadata: ep.metadata ?? {},
      tags: [],
    };
    if (ep.base_url != null) profile.base_url = ep.base_url;
    db.createProfile(profile);
    imported++;
  }

  info(flags, `Imported ${imported} profile(s), skipped ${skipped}.`);
  respond(flags, { imported, skipped });
}
