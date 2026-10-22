// Small key-value interface so payees/history logic can be tested with an in-memory store.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Encrypted on the device. Keys: letters, digits, ".", "-", "_". Values should stay under ~2 KB.
export const secureStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

// One change at a time, in the order started. Each store reads, changes and writes back its data;
// without a queue, two changes at the same moment could each write over the other.
// A failed job rejects only its own caller; the next job still runs.
export function createWriteQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job); // tail never rejects (see below)
    tail = result.catch(() => {});
    return result;
  };
}

export const asyncStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
