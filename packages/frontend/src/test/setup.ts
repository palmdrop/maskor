import "@testing-library/jest-dom";
import { beforeEach, vi } from "vitest";

// Node >= 25 ships an experimental global `localStorage` that is `undefined` unless the process is
// started with `--localstorage-file`, and it shadows happy-dom's storage on the bare `localStorage`
// global — so every test touching `localStorage` (persisted-state hooks, focus mode) crashes on
// newer Node. Install an in-memory polyfill (happy-dom's window IS globalThis here, so the window's
// own storage is shadowed by the same undefined global and can't be delegated to).
if (globalThis.localStorage === undefined) {
  const storageBacking = new Map<string, string>();
  const storagePolyfill: Storage = {
    get length() {
      return storageBacking.size;
    },
    clear: () => storageBacking.clear(),
    getItem: (key: string) => storageBacking.get(key) ?? null,
    key: (index: number) => [...storageBacking.keys()][index] ?? null,
    removeItem: (key: string) => {
      storageBacking.delete(key);
    },
    setItem: (key: string, value: string) => {
      storageBacking.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storagePolyfill,
  });
}

// Safety net: tests must not hit the network. customFetch issues relative URLs
// (`/api/...`), which happy-dom resolves against its default origin
// (http://localhost:3000), turning an unmocked request into an opaque
// ECONNREFUSED. Replace fetch with a stub that throws at the call site so a
// missing mock is loud instead of silent. Tests that need fetch override this
// via vi.stubGlobal("fetch", ...) in their own beforeEach.
beforeEach(() => {
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = typeof input === "string" ? input : String(input);
    throw new Error(
      `Unmocked fetch in test: ${url}. Stub it with vi.stubGlobal("fetch", ...) or seed the query cache.`,
    );
  });
});
