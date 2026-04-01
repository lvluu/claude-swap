import type { Command } from "commander";
import { randomUUID } from "crypto";
import { text } from "@clack/prompts";
import { getDatabase } from "../../core/storage.js";
import { encryptForStorage } from "../../core/encryption.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, warnSecurity, respond, respondError } from "../../utils/output.js";
import type { Profile } from "../../types/index.js";

export async function addCommand(
  _profileName: string | undefined | Command,
  cmd: Command,
): Promise<void> {
  touchSession();

  // When called from Commander action with no positional args, _profileName
  // is actually the Command instance; detect and reassign.
  const actualCmd = typeof _profileName === "object" ? _profileName : cmd;
  const flags = getFlags(actualCmd);
  const opts = actualCmd.opts();

  const tokenFromFlag = opts["token"] as string | undefined;
  const nameFromFlag = opts["name"] as string | undefined;
  const baseUrlFromFlag = opts["baseUrl"] as string | undefined;

  // Determine interactive vs non-interactive mode
  const interactive = !tokenFromFlag || !nameFromFlag;

  if (interactive && flags.json) {
    respondError(
      flags,
      "Interactive prompts unavailable in JSON mode. Provide all required flags: --token and --name.",
    );
  }

  let token = tokenFromFlag;
  let profileName = nameFromFlag;
  const baseUrl: string | undefined = baseUrlFromFlag;

  if (interactive) {
    warnSecurity(flags, "Token will be stored encrypted using machine-derived AES-256-GCM.");
    info(flags, "Interactive profile creation — provide the following:");

    const nameInput = await text({
      message: "Profile name:",
      defaultValue: "",
      validate: (v) => (v.trim().length === 0 ? "Name is required" : undefined),
    });
    profileName = String(nameInput).trim();

    const tokenInput = await text({
      message: "API token (sk-ant-...):",
      defaultValue: "",
      validate: (v) => (v.trim().length === 0 ? "Token is required" : undefined),
    });
    token = String(tokenInput).trim();
  }

  if (!profileName || !token) {
    respondError(flags, "Profile name and token are required. Use: ccs add --name <name> --token <token>");
  }

  // Validate uniqueness
  const db = getDatabase();
  const existing = db.getAllProfiles().find((p) => p.name === profileName);
  if (existing) {
    respondError(
      flags,
      `Profile "${profileName}" already exists. Use a different name or update it with: ccs add --update ${profileName}`,
    );
  }

  const encryptedToken = encryptForStorage(token as string);

  const now = Date.now();
  const profile: Profile = {
    id: randomUUID(),
    name: profileName as string,
    token_encrypted: encryptedToken,
    ...(baseUrl ? { base_url: baseUrl } : {}),
    auth_method: "manual",
    created_at: now,
    last_used: 0,
    use_count: 0,
    metadata: {},
    tags: [],
  };

  db.createProfile(profile);

  info(flags, `Profile "${profileName}" created successfully.`);
  respond(flags, { id: profile.id, name: profileName });
}
