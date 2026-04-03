import type { Command } from "commander";
import { importCommand } from "./import.js";

export async function restoreCommand(file: string, cmd: Command): Promise<void> {
  await importCommand(file, cmd);
}
