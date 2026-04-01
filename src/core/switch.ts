import { getDatabase } from "./storage.js";
import { decryptFromStorage } from "./encryption.js";
import { touchSession } from "./session.js";
import { formatShell, writeLocalEnv } from "./env-output.js";
import { writeCcsrc } from "./shell-integration.js";
import type { Profile, SwitchMode } from "../types/index.js";
import type { CliFlags } from "../utils/output.js";

export interface SwitchContext {
  profile: Profile;
  token: string;
  sessionId: string;
  mode: SwitchMode;
}

export interface SwitchResult {
  context: SwitchContext;
  shellOutput: string | null; // null for local/persistent (those write files)
}

export async function activateProfile(
  profileName: string,
  mode: SwitchMode,
  _flags: CliFlags,
): Promise<SwitchResult> {
  const db = getDatabase();
  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === profileName);

  if (!profile) {
    throw new Error(`Profile not found: ${profileName}`);
  }

  let token: string;
  try {
    token = decryptFromStorage(profile.token_encrypted);
  } catch {
    throw new Error("Failed to decrypt profile token — encryption state may be corrupted");
  }

  const session = touchSession();
  db.updateSession(session.id, { profile_id: profile.id });
  db.updateProfile(profile.id, { last_used: Date.now(), use_count: profile.use_count + 1 });

  let shellOutput: string | null = null;

  switch (mode) {
    case "shell":
      shellOutput = formatShell(profile, token);
      break;
    case "local":
      writeLocalEnv(profile, token);
      break;
    case "persistent":
      writeCcsrc(profile.name);
      break;
  }

  return { context: { profile, token, sessionId: session.id, mode }, shellOutput };
}
