import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respond, respondError, error } from "../../utils/output.js";

export async function quotaCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const db = getDatabase();

  // Resolve profile
  const name = profileName ?? db.getSetting<string>("default_profile") ?? null;

  if (!name) {
    respondError(flags, "No profile specified and no default set. Use: ccs quota <profile>", 1);
  }

  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === name);

  if (!profile) {
    respondError(flags, `Profile not found: "${name}"`, 3);
  }

  const dailyLimit = (opts["daily"] as number | null) ?? null;
  const monthlyLimit = (opts["monthly"] as number | null) ?? null;

  // Update limits if provided
  if (dailyLimit !== null || monthlyLimit !== null) {
    const existing = db.getQuota(profile!.id);
    db.createOrUpdateQuota({
      profile_id: profile!.id,
      daily_limit: dailyLimit ?? existing?.daily_limit ?? null,
      monthly_limit: monthlyLimit ?? existing?.monthly_limit ?? null,
      current_daily: existing?.current_daily ?? 0,
      current_monthly: existing?.current_monthly ?? 0,
      last_reset_daily: existing?.last_reset_daily ?? 0,
      last_reset_monthly: existing?.last_reset_monthly ?? 0,
    });
    info(flags, `Quota updated for ${profile!.name}.`);
  }

  // Compute live usage from usage logs
  const dayStart = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const monthStart = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const logs = db.getUsageLogs(profile!.id, 10000);
  let dailyUsed = 0;
  let monthlyUsed = 0;

  for (const log of logs) {
    if (log.timestamp >= dayStart) dailyUsed += log.tokens_used;
    if (log.timestamp >= monthStart) monthlyUsed += log.tokens_used;
  }

  const quota = db.getQuota(profile!.id);
  const dailyLimitVal = quota?.daily_limit ?? null;
  const monthlyLimitVal = quota?.monthly_limit ?? null;

  if (flags.json) {
    respond(flags, {
      profile: profile!.name,
      daily: { used: dailyUsed, limit: dailyLimitVal },
      monthly: { used: monthlyUsed, limit: monthlyLimitVal },
    });
    return;
  }

  info(flags, `Quota for: ${profile!.name}`);
  info(
    flags,
    `  Daily:   ${dailyUsed.toLocaleString()} / ${dailyLimitVal !== null ? dailyLimitVal.toLocaleString() : "∞"}${dailyLimitVal !== null ? ` (${dailyLimitVal.toLocaleString()})` : ""}`,
  );
  info(
    flags,
    `  Monthly: ${monthlyUsed.toLocaleString()} / ${monthlyLimitVal !== null ? monthlyLimitVal.toLocaleString() : "∞"}${monthlyLimitVal !== null ? ` (${monthlyLimitVal.toLocaleString()})` : ""}`,
  );

  if (dailyLimitVal !== null && dailyUsed > dailyLimitVal) {
    error(
      `Warning: Daily quota exceeded for ${profile!.name} (${dailyUsed.toLocaleString()} > ${dailyLimitVal.toLocaleString()})`,
    );
  }
  if (monthlyLimitVal !== null && monthlyUsed > monthlyLimitVal) {
    error(
      `Warning: Monthly quota exceeded for ${profile!.name} (${monthlyUsed.toLocaleString()} > ${monthlyLimitVal.toLocaleString()})`,
    );
  }
}
