import { getEncryption } from "../core/encryption.js";
import { Database } from "../core/storage.js";

export async function initCli(): Promise<void> {
  // Prime the Encryption singleton (derives machine key, loads machine-id from config dir).
  // Encryption.ts hard-codes its config dir path internally; getEncryption() triggers it.
  getEncryption();
  // Initialize the Database singleton (runs migrations, opens WAL-mode SQLite).
  await Database.initialize();
}
