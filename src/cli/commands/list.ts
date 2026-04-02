import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respond } from "../../utils/output.js";

const DEFAULT_KEY = "default_profile";

export interface ListProfile {
  id: string;
  name: string;
  auth_method: string;
  base_url: string | null;
  last_used: number;
  use_count: number;
  tags: string[];
  is_default: boolean;
  is_active: boolean;
}

export async function listCommand(cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const showEndpoints = (opts["showEndpoints"] as boolean) ?? false;

  const db = getDatabase();
  const profiles = db.getAllProfiles();
  const defaultProfile = db.getSetting<string>(DEFAULT_KEY);

  // Determine which profile is currently active for this terminal
  const activeSession = Bun.env.CCS_SESSION_ID ? db.getSessionById(Bun.env.CCS_SESSION_ID) : null;
  const activeProfileId = activeSession?.profile_id ?? null;

  const listed: ListProfile[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    auth_method: p.auth_method,
    base_url: p.base_url ?? null,
    last_used: p.last_used,
    use_count: p.use_count,
    tags: p.tags,
    is_default: p.name === defaultProfile,
    is_active: p.id === activeProfileId,
  }));

  if (flags.json) {
    respond(flags, listed);
    return;
  }

  if (listed.length === 0) {
    info(flags, "No profiles found. Use: ccs add --name <name> --token <token>");
    return;
  }

  for (const p of listed) {
    const parts: string[] = [];

    if (p.is_active) parts.push("*");
    if (p.is_default) parts.push("(default)");

    const suffix = parts.length > 0 ? ` ${parts.join(" ")}` : "";
    let line = `  ${p.name}${suffix}`;

    if (showEndpoints && p.base_url) {
      line += ` [${p.base_url}]`;
    }

    if (p.tags.length > 0) {
      line += ` #${p.tags.join(", #")}`;
    }

    info(flags, line);
  }
}
