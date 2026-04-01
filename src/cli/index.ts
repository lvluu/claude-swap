import { Command } from "commander";
import { VERSION } from "../version.js";
import { initCli } from "./init.js";
import {
  switchCommand,
  addCommand,
  removeCommand,
  defaultCommand,
} from "./commands/index.js";

const program = new Command();

program
  .name("ccs")
  .description("Claude Code Swap - Profile & Session Manager")
  .version(VERSION)
  .option("-q, --quiet", "Suppress output")
  .option("-j, --json", "Output as JSON")
  .option("--no-cache", "Skip cache")
  .option("--shell", "Output as shell exports");

program
  .command("switch [profile]")
  .description("Switch to a profile (interactive if no arg)")
  .option("-s, --session <id>", "Target session ID")
  .option("--shell", "Output as shell exports")
  .option("--persistent", "Write to shell config globally")
  .option("--local", "Write to .env in current directory")
  .action(async function (this: Command, profile: string | undefined) {
    await switchCommand(profile, this);
  });

program
  .command("add")
  .description("Add new profile (OAuth or manual token)")
  .option("--oauth", "Use OAuth flow via claude login")
  .option("--manual", "Manual token entry")
  .option("--from-env", "Use environment variables")
  .option("--token <token>", "API token")
  .option("--base-url <url>", "Custom API endpoint")
  .option("--name <name>", "Profile name/alias")
  .option("--email <email>", "Profile ID (email)")
  .action(async function (this: Command) {
    await addCommand(undefined, this as Command);
  });

program
  .command("remove <profile>")
  .description("Remove a profile")
  .option("-y, --force", "Skip confirmation prompt")
  .action(async (profile, cmd) => {
    await removeCommand(profile, cmd as Command);
  });

program
  .command("list")
  .description("List all profiles")
  .option("--show-endpoints", "Show custom endpoint indicators")
  .action((_opts) => {
    console.log("list command - implementation pending");
  });

program
  .command("default [profile]")
  .description("Set or show the default profile")
  .action(async (profile, cmd) => {
    await defaultCommand(profile, cmd as Command);
  });

program
  .command("export [file]")
  .description("Export profiles to JSON")
  .option("--encrypt", "Encrypt with password")
  .action((_file, _opts) => {
    console.log("export command - implementation pending");
  });

program
  .command("import <file>")
  .description("Import profiles from JSON")
  .action((_file) => {
    console.log("import command - implementation pending");
  });

program
  .command("quota [profile]")
  .description("Show or manage quotas")
  .option("--daily <limit>", "Set daily limit")
  .option("--monthly <limit>", "Set monthly limit")
  .action((_profile, _opts) => {
    console.log("quota command - implementation pending");
  });

program
  .command("stats [profile]")
  .description("Show usage statistics")
  .option("--hourly", "Hourly breakdown")
  .option("--daily", "Daily breakdown")
  .option("--export <format>", "Export as CSV or JSON")
  .action((_profile, _opts) => {
    console.log("stats command - implementation pending");
  });

program
  .command("current")
  .description("Show active profile and environment")
  .option("-s, --session <id>", "Target session ID")
  .option("--short", "Short output format")
  .action((_opts) => {
    console.log("current command - implementation pending");
  });

program
  .command("env [profile]")
  .description("Show environment variables for profile")
  .option("--shell", "Output as shell exports")
  .option("--json", "Output as JSON")
  .option("--copy", "Copy to clipboard")
  .option("--reveal", "Show full token")
  .action((_profile, _opts) => {
    console.log("env command - implementation pending");
  });

program
  .command("sessions")
  .description("List active terminal sessions")
  .option("--current", "Show current terminal session")
  .option("--clean", "Remove stale sessions")
  .option("--kill <session>", "Kill a specific session")
  .action((_opts) => {
    console.log("sessions command - implementation pending");
  });

program
  .command("doctor [profile]")
  .description("Check profile health")
  .option("--fix", "Auto-fix issues")
  .action((_profile, _opts) => {
    console.log("doctor command - implementation pending");
  });

program
  .command("backup")
  .description("Create backup of all profiles")
  .option("--encrypt", "Encrypt with password")
  .option("--cloud", "Backup to cloud")
  .action((_opts) => {
    console.log("backup command - implementation pending");
  });

program
  .command("restore <file>")
  .description("Restore from backup")
  .option("--latest", "Restore most recent backup")
  .action((_file, _opts) => {
    console.log("restore command - implementation pending");
  });

export { program };

// Initialize Encryption + Database before parsing
initCli().then(() => {
  program.parse();
}).catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
