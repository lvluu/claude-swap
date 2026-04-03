import type { Command } from "commander";
import { getFlags, info } from "../../utils/output.js";
import { installShellHook, uninstallShellHook } from "../../core/shell-integration.js";

function bashFn(): string {
  return `function ccs() {
  local cmd="${"$"}1"
  if [ -z "${"$"}cmd" ]; then
    echo "Usage: ccs <command>"
    return 1
  fi
  shift
  eval "$(ccs env "${"$"}cmd" --shell "${"$"}@")"
}`;
}

function zshFn(): string {
  return `function ccs {
  local cmd="${"$"}1"
  if [ -z "${"$"}cmd" ]; then
    echo "Usage: ccs <command>"
    return 1
  fi
  shift
  eval "$(ccs env "${"$"}cmd" --shell "${"$"}@")"
}`;
}

function fishFn(): string {
  return `function ccs
  set -l cmd (string collect $argv)
  if test -z "${"$"}cmd"
    echo "Usage: ccs <command>"
    return 1
  end
  eval (ccs env $cmd --shell)
end`;
}

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

function getShellFn(shell: string): string | null {
  switch (shell) {
    case "bash":
      return bashFn();
    case "zsh":
      return zshFn();
    case "fish":
      return fishFn();
    default:
      return null;
  }
}

export async function hookCommand(shell: string, cmd: Command): Promise<void> {
  const flags = getFlags(cmd);
  const opts = cmd.opts();
  const install = (opts["install"] as boolean) ?? false;
  const uninstall = (opts["uninstall"] as boolean) ?? false;

  if (!SUPPORTED_SHELLS.includes(shell as SupportedShell)) {
    process.stderr.write(
      `Unsupported shell: ${shell}. Supported: ${SUPPORTED_SHELLS.join(", ")}\n`,
    );
    process.exit(2);
  }

  if (uninstall) {
    const removed = uninstallShellHook(shell);
    if (removed) {
      info(flags, `Uninstalled hook from ~/${shell}rc`);
    } else {
      info(flags, `No hook found in ~/${shell}rc`);
    }
    return;
  }

  if (install) {
    installShellHook(shell);
    info(flags, `Installed hook to ~/${shell}rc. Restart your shell or run: source ~/${shell}rc`);
    return;
  }

  // Default: output the shell function to stdout
  const fn = getShellFn(shell);
  if (fn) {
    process.stdout.write(fn + "\n");
  }
}
