import { Command } from "commander";
import { VERSION } from "../version.js";
import { initCli } from "./init.js";
import {
  switchCommand,
  addCommand,
  removeCommand,
  defaultCommand,
  listCommand,
  envCommand,
  currentCommand,
  sessionsCommand,
  doctorCommand,
  quotaCommand,
  statsCommand,
  exportCommand,
  importCommand,
  backupCommand,
  restoreCommand,
  hookCommand,
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
  .action(async function (this: Command) {
    await listCommand(this);
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
  .option("--password <pw>", "Encryption password")
  .action(async (_file, _opts) => {
    await exportCommand(_file, _opts as Command);
  });

program
  .command("import <file>")
  .description("Import profiles from JSON")
  .option("--overwrite", "Overwrite existing profiles")
  .option("--skip", "Skip existing profiles")
  .option("--password <pw>", "Decryption password")
  .action(async (_file, _opts) => {
    await importCommand(_file, _opts as Command);
  });

program
  .command("quota [profile]")
  .description("Show or manage quotas")
  .option("--daily <limit>", "Set daily limit")
  .option("--monthly <limit>", "Set monthly limit")
  .action(async (_profile, _opts) => {
    await quotaCommand(_profile, _opts as Command);
  });

program
  .command("stats [profile]")
  .description("Show usage statistics")
  .option("--hourly", "Hourly breakdown")
  .option("--daily", "Daily breakdown")
  .option("--export <format>", "Export as CSV or JSON")
  .action(async (_profile, _opts) => {
    await statsCommand(_profile, _opts as Command);
  });

program
  .command("current")
  .description("Show active profile and environment")
  .option("-s, --session <id>", "Target session ID")
  .option("--short", "Short output format")
  .action(async (_opts) => {
    await currentCommand(_opts as Command);
  });

program
  .command("env [profile]")
  .description("Show environment variables for profile")
  .option("--shell", "Output as shell exports")
  .option("--json", "Output as JSON")
  .option("--copy", "Copy to clipboard")
  .option("--reveal", "Show full token")
  .action(async function (this: Command, profile: string | undefined) {
    await envCommand(profile, this);
  });

program
  .command("sessions")
  .description("List active terminal sessions")
  .option("--current", "Show current terminal session")
  .option("--clean", "Remove stale sessions")
  .option("--kill <session>", "Kill a specific session")
  .action(async (_opts) => {
    await sessionsCommand(_opts as Command);
  });

program
  .command("doctor [profile]")
  .description("Check profile health")
  .option("--fix", "Auto-fix issues")
  .action(async (_profile, _opts) => {
    await doctorCommand(_profile, _opts as Command);
  });

program
  .command("backup")
  .description("Create backup of all profiles")
  .option("--encrypt", "Encrypt with password")
  .option("--password <pw>", "Encryption password")
  .action(async (_opts) => {
    await backupCommand(_opts as Command);
  });

program
  .command("restore <file>")
  .description("Restore from backup")
  .option("--overwrite", "Overwrite existing profiles")
  .option("--skip", "Skip existing profiles")
  .option("--password <pw>", "Decryption password")
  .action(async (_file, _opts) => {
    await restoreCommand(_file, _opts as Command);
  });

program
  .command("hook <shell>")
  .description("Output or install shell integration hook")
  .option("--install", "Install the hook to the shell config")
  .option("--uninstall", "Remove the hook from the shell config")
  .action(async (_shell, _opts) => {
    await hookCommand(_shell, _opts as Command);
  });

export { program };

// Initialize Encryption + Database before parsing
initCli()
  .then(() => {
    program.parse();
  })
  .catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
