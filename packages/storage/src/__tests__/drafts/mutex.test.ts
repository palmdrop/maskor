import { describe, it, expect } from "bun:test";
import { withDraftMutex } from "../../drafts/mutex";
import { DraftError } from "../../drafts/errors";

describe("withDraftMutex", () => {
  it("blocks concurrent calls for the same vault", async () => {
    let release: () => void = () => {};
    const first = withDraftMutex("/vault-a", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "first-done";
    });

    // Yield so the first operation enters the mutex.
    await Promise.resolve();

    let error: unknown;
    try {
      await withDraftMutex("/vault-a", async () => "second-done");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DraftError);
    expect((error as DraftError).code).toBe("DRAFT_OPERATION_IN_PROGRESS");

    release();
    await expect(first).resolves.toBe("first-done");
  });

  it("allows different vaults to run concurrently", async () => {
    let release: () => void = () => {};
    const first = withDraftMutex("/vault-a", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "a";
    });

    await Promise.resolve();
    const second = await withDraftMutex("/vault-b", async () => "b");
    expect(second).toBe("b");

    release();
    await expect(first).resolves.toBe("a");
  });

  it("releases the mutex even when the operation throws", async () => {
    let error: unknown;
    try {
      await withDraftMutex("/vault-c", async () => {
        throw new Error("boom");
      });
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).message).toBe("boom");
    // The mutex must be free again now.
    const result = await withDraftMutex("/vault-c", async () => "recovered");
    expect(result).toBe("recovered");
  });
});
