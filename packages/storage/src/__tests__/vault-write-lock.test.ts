import { describe, it, expect } from "bun:test";
import { withVaultWriteLock } from "../utils/vault-write-lock";

describe("withVaultWriteLock", () => {
  it("serializes operations on the same vault in FIFO order", async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};

    const first = withVaultWriteLock("/vault-fifo", async () => {
      order.push("first:start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first:end");
    });

    // Queue the second op before the first releases.
    const second = withVaultWriteLock("/vault-fifo", async () => {
      order.push("second:start");
      order.push("second:end");
    });

    // Yield so the first op enters the lock.
    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("does not block operations on a different vault", async () => {
    let releaseFirst: () => void = () => {};
    const first = withVaultWriteLock("/vault-a", async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      return "a";
    });

    await Promise.resolve();
    const second = await withVaultWriteLock("/vault-b", async () => "b");
    expect(second).toBe("b");

    releaseFirst();
    await expect(first).resolves.toBe("a");
  });

  it("propagates the original error to the caller but keeps the chain flowing", async () => {
    let firstError: unknown;
    try {
      await withVaultWriteLock("/vault-error", async () => {
        throw new Error("boom");
      });
    } catch (caught) {
      firstError = caught;
    }
    expect((firstError as Error).message).toBe("boom");

    // The chain must still accept subsequent operations.
    const result = await withVaultWriteLock("/vault-error", async () => "recovered");
    expect(result).toBe("recovered");
  });
});
