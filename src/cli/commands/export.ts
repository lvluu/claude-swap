import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { decryptFromStorage } from "../../core/encryption.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respondError } from "../../utils/output.js";
import { writeFileSync } from "fs";
import { createCipheriv, randomBytes, pbkdf2Sync } from "crypto";

export async function exportCommand(filePath: string | undefined, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const db = getDatabase();

  const profiles = db.getAllProfiles();

  if (profiles.length === 0) {
    respondError(flags, "No profiles to export", 1);
  }

  const doEncrypt = (opts["encrypt"] as boolean) ?? false;
  const password =
    (opts["password"] as string | undefined) ?? Bun.env["CCS_EXPORT_PASSWORD"] ?? null;

  if (doEncrypt && !password) {
    respondError(flags, "--encrypt requires --password <pw> or CCS_EXPORT_PASSWORD env var", 2);
  }

  const exportedProfiles = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    token: decryptFromStorage(p.token_encrypted),
    base_url: p.base_url ?? null,
    auth_method: p.auth_method,
    metadata: p.metadata,
  }));

  const exportData = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    profiles: exportedProfiles,
    settings: {} as Record<string, unknown>,
  };

  const outputPath = filePath ?? (doEncrypt ? "ccs-export.enc.json" : "ccs-export.json");

  let content: string;

  if (doEncrypt && password) {
    // PBKDF2-SHA512, 100K iterations
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const key = pbkdf2Sync(password, salt, 100_000, 32, "sha512");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = JSON.stringify(exportData);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([salt, iv, authTag, encrypted]);
    content = `CCS-BACKUP-v1:${payload.toString("base64")}`;
  } else {
    content = JSON.stringify(exportData, null, 2);
  }

  writeFileSync(outputPath, content, { mode: 0o600 });
  info(flags, `Exported ${profiles.length} profile(s) to ${outputPath}`);
}
