/**
 * Stores chat turns in the browser under the verified account and workspace scope.
 * @package @vxtpl/app
 * @layer Presentation
 * @category Persistence
 * @author AI-Generated
 * @date 2026-11-27
 */

import type { TurnVerification } from "./types";

const STORE = "turns";
const SCOPE_INDEX = "by-scope";

export type SavedTurn = Exclude<TurnVerification, { state: "pending" }> & {
  id: string;
  createdAt: number;
  prompt: string;
};

type StoredTurn = { scopeKey: string; turn: SavedTurn };

function openHistory(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("vxtpl-chat-history", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["scopeKey", "turn.id"] });
      store.createIndex(SCOPE_INDEX, "scopeKey");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Chat history database is blocked"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function historyOperation<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openHistory();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = execute(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Chat history transaction canceled"));
    });
  } finally {
    database.close();
  }
}

export async function readChatHistory(scopeKey: string): Promise<SavedTurn[]> {
  const records: StoredTurn[] = await historyOperation("readonly", (store) => store.index(SCOPE_INDEX).getAll(scopeKey));
  return records.map(({ turn }) => turn).sort((left, right) =>
    left.createdAt - right.createdAt || left.id.localeCompare(right.id),
  );
}

export async function saveChatTurn(scopeKey: string, turn: SavedTurn): Promise<void> {
  const record: StoredTurn = { scopeKey, turn };
  await historyOperation("readwrite", (store) => store.add(record));
}
