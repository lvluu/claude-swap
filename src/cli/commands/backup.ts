import { writeFileSync, mkdirSync } from "fs";
import { randomBytes, pbkdf2Sync, createCipheriv } from "crypto";
import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { decryptFromStorage } from "../../core/encryption.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";
import type { ExportData, ExportedProfile } from "../../types/index.js";

const BACKUP_DIR = `${Bun.env.HOME}/.config/ccs/backups`;
const PBKDF2_ITERS = 100_000;

function encryptWithPassword(plaintext: string, password: string): string {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERS, 32, "sha512");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, ct]).toString("base64");
}

export async function backupCommand(cmd: Command): Promise<void> {
  touchSession();
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const encrypt = (opts["encrypt"] as boolean) ?? false;
  const password = (opts["password"] as string | undefined) ?? Bun.env["CCS_BACKUP_PASSWORD"];

  const db = getDatabase();
  const profiles = db.getAllProfiles();

  const exportedProfiles: ExportedProfile[] = profiles.map((p) => {
    const token = decryptFromStorage(p.token_encrypted);
    return {
      id: p.id,
      name: p.name,
      token,
      base_url: p.base_url ?? null,
      auth_method: p.auth_method,
      metadata: p.metadata,
    };
  });

  const exportData: ExportData = {
    version: "1.0.0",
    exported_at: new Date().toISOString(),
    profiles: exportedProfiles,
    settings: {},
  };

  const json = JSON.stringify(exportData, null, 2);
  let output: string;
  let ext: string;

  if (encrypt) {
    if (!password) {
      respondError(
        flags,
        "Password-based encryption requires --password <pw> or CCS_BACKUP_PASSWORD env var",
        2,
      );
    }
    output = "CCS-BACKUP-v1:" + encryptWithPassword(json, password!);
    ext = "ccs";
  } else {
    output = json;
    ext = "json";
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `ccs-backup-${dateStr}T${timeStr}.${ext}`;
  const fullPath = `${BACKUP_DIR}/${filename}`;

  writeFileSync(fullPath, output, { mode: 0o600 });
  info(flags, `Backup created: ${fullPath}`);
  respond(flags, { path: fullPath, profiles: exportedProfiles.length });
}
