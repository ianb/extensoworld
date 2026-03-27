import { resolve } from "node:path";
import type { RuntimeStorage } from "./storage.js";
import { FileStorage } from "./storage-file.js";

let storage: RuntimeStorage | null = null;

/** Get the current runtime storage instance */
export function getStorage(): RuntimeStorage {
  if (!storage) {
    storage = new FileStorage(resolve(process.cwd(), "data"));
  }
  return storage;
}

/** Set the runtime storage instance (for D1, testing, etc.) */
export function setStorage(s: RuntimeStorage): void {
  storage = s;
}
