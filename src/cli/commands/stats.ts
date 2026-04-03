import type { Command } from "commander";
import { getDatabase } from "../../core/storage.js";
import { touchSession } from "../../core/session.js";
import { getFlags, info, respond, respondError } from "../../utils/output.js";

export async function statsCommand(profileName: string | undefined, cmd: Command): Promise<void> {
  touchSession();

  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const db = getDatabase();

  // Resolve profile
  const name = profileName ?? db.getSetting<string>("default_profile") ?? null;

  if (!name) {
    respondError(flags, "No profile specified and no default set. Use: ccs stats <profile>", 1);
  }

  const profiles = db.getAllProfiles();
  const profile = profiles.find((p) => p.name === name);

  if (!profile) {
    respondError(flags, `Profile not found: "${name}"`, 3);
  }

  const logs = db.getUsageLogs(profile!.id, 10000);

  // Group by hour: key = "YYYY-MM-DD HH:00"
  const byHour: Record<string, number> = {};
  // Group by day: key = "YYYY-MM-DD"
  const byDay: Record<string, number> = {};
  let totalTokens = 0;

  for (const log of logs) {
    totalTokens += log.tokens_used;

    const date = new Date(log.timestamp);
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`;
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    byHour[hourKey] = (byHour[hourKey] ?? 0) + log.tokens_used;
    byDay[dayKey] = (byDay[dayKey] ?? 0) + log.tokens_used;
  }

  const exportFormat = (opts["export"] as string | undefined) ?? null;
  const showHourly = exportFormat === "hourly" || ((opts["hourly"] as boolean) ?? false);
  const showDaily =
    exportFormat === "daily" || ((opts["daily"] as boolean | undefined) ?? false) === true;

  if (exportFormat === "csv") {
    console.log("timestamp,tokens,model");
    for (const log of logs) {
      const date = new Date(log.timestamp).toISOString();
      console.log(`${date},${log.tokens_used},${log.model}`);
    }
    return;
  }

  if (exportFormat === "json") {
    console.log(
      JSON.stringify({
        profile: profile!.name,
        total: totalTokens,
        count: logs.length,
        by_hour: byHour,
        by_day: byDay,
      }),
    );
    return;
  }

  if (flags.json) {
    respond(flags, {
      profile: profile!.name,
      total: totalTokens,
      count: logs.length,
    });
    return;
  }

  info(flags, `Stats for: ${profile!.name}`);
  info(flags, `  Total tokens: ${totalTokens.toLocaleString()}`);
  info(flags, `  Total requests: ${logs.length.toLocaleString()}`);

  if (showHourly) {
    info(flags, "  Breakdown by hour:");
    for (const [hour, tokens] of Object.entries(byHour).sort()) {
      info(flags, `    ${hour}  ${tokens.toLocaleString()}`);
    }
  } else if (showDaily) {
    info(flags, "  Breakdown by day:");
    for (const [day, tokens] of Object.entries(byDay).sort()) {
      info(flags, `    ${day}  ${tokens.toLocaleString()}`);
    }
  }
}
