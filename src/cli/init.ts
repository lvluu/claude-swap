import { ensureMachineIdFile, getEncryption } from "../core/encryption.js";
import { Database } from "../core/storage.js";

export async function initCli(): Promise<void> {
  // Ensure machine-id file exists, printing recovery warning on first run.
  ensureMachineIdFile();
  // Prime the Encryption singleton (derives machine key from machine-id file).
  getEncryption();
  // Initialize the Database singleton (runs migrations, opens WAL-mode SQLite).
  await Database.initialize();
}
