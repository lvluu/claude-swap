import type { Command } from "commander";
import { encryptForStorage, decryptFromStorage, EncryptionError } from "../../core/encryption.js";
import { getDatabase } from "../../core/storage.js";
import { getFlags, info, error } from "../../utils/output.js";
import { getRcPath, hasMarkerBlock, installShellHook } from "../../core/shell-integration.js";
import { pruneStaleSessions } from "../../core/session.js";

interface DoctorIssue {
  message: string;
  exitCode: number;
}

interface DoctorFixed {
  message: string;
}

export async function doctorCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const doFix = (opts["fix"] as boolean) ?? false;
  const db = getDatabase();

  const issues: DoctorIssue[] = [];
  const fixed: DoctorFixed[] = [];

  // 1. Encryption round-trip
  try {
    const testValue = "ccs-doctor-test";
    const encrypted = encryptForStorage(testValue);
    const decrypted = decryptFromStorage(encrypted);
    if (decrypted !== testValue) {
      issues.push({ message: "Encryption round-trip mismatch", exitCode: 4 });
    }
  } catch (err) {
    if (err instanceof EncryptionError) {
      issues.push({ message: `Encryption failure: ${err.message}`, exitCode: 4 });
    } else {
      issues.push({ message: `Encryption failure: ${(err as Error).message}`, exitCode: 4 });
    }
  }

  // 2. Database integrity
  try {
    db.getAllProfiles();
  } catch (err) {
    issues.push({
      message: `Database integrity check failed: ${(err as Error).message}`,
      exitCode: 5,
    });
  }

  // 3. Shell hook
  const shell = process.env.SHELL?.split("/").pop() ?? "bash";
  const rcPath = getRcPath(shell);
  if (!hasMarkerBlock(rcPath)) {
    issues.push({ message: `Shell hook not installed for ${shell}`, exitCode: 6 });
    if (doFix) {
      try {
        installShellHook(shell);
        fixed.push({ message: `Installed shell hook for ${shell}` });
      } catch (err) {
        issues.push({
          message: `Failed to install shell hook: ${(err as Error).message}`,
          exitCode: 6,
        });
      }
    }
  }

  // 4. Default profile
  const defaultProfile = db.getSetting<string>("default_profile");
  if (defaultProfile === null || defaultProfile === "") {
    issues.push({ message: "No default profile set", exitCode: 2 });
    if (doFix) {
      const profiles = db.getAllProfiles();
      if (profiles.length > 0) {
        const first = profiles.at(0)!;
        db.setSetting("default_profile", first.name);
        fixed.push({ message: `Set default profile to "${first.name}"` });
      }
    }
  }

  // 5. Stale sessions
  const beforeSessions = db.getAllSessions().length;
  pruneStaleSessions();
  const afterSessions = db.getAllSessions().length;
  const staleCount = beforeSessions - afterSessions;
  if (staleCount > 0) {
    issues.push({ message: `${staleCount} stale session(s) found`, exitCode: 2 });
  }

  // 6. Profile-specific (if profile name given)
  if (profileName !== undefined) {
    const profiles = db.getAllProfiles();
    const profile = profiles.find((p) => p.name === profileName);
    if (!profile) {
      error(`Profile not found: ${profileName}`);
      process.exit(3);
    }
    try {
      decryptFromStorage(profile.token_encrypted);
    } catch (err) {
      if (err instanceof EncryptionError) {
        error(`Failed to decrypt token for profile "${profileName}": ${err.message}`);
        process.exit(4);
      }
      error(`Failed to decrypt token for profile "${profileName}": ${(err as Error).message}`);
      process.exit(4);
    }
  }

  // Print fixed items
  for (const f of fixed) {
    info(flags, `  + ${f.message}`);
  }

  // Print issues to stderr
  let highestExit = 0;
  for (const issue of issues) {
    error(`✗ ${issue.message}`);
    if (issue.exitCode > highestExit) highestExit = issue.exitCode;
  }

  if (issues.length > 0) {
    process.exit(highestExit);
  }

  info(flags, "✓ All checks passed.");
}
