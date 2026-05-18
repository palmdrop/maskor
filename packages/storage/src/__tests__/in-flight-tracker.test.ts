import { describe, it, expect } from "bun:test";
import { createInFlightTracker } from "../watcher/utils/in-flight-tracker";

describe("createInFlightTracker", () => {
  it("wait() resolves immediately when count is zero", async () => {
    const tracker = createInFlightTracker();
    let resolved = false;
    await tracker.wait().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
  });

  it("wait() blocks until in-flight count returns to zero", async () => {
    const tracker = createInFlightTracker();
    tracker.enter();

    let drained = false;
    const waitPromise = tracker.wait().then(() => {
      drained = true;
    });

    // Yield to the microtask queue — wait() must still be pending.
    await Promise.resolve();
    expect(drained).toBe(false);

    tracker.exit();
    await waitPromise;
    expect(drained).toBe(true);
  });

  it("wait() resolves after all concurrent enters have exited", async () => {
    const tracker = createInFlightTracker();
    tracker.enter();
    tracker.enter();
    tracker.enter();
    expect(tracker.count()).toBe(3);

    let drained = false;
    const waitPromise = tracker.wait().then(() => {
      drained = true;
    });

    tracker.exit();
    await Promise.resolve();
    expect(drained).toBe(false);

    tracker.exit();
    await Promise.resolve();
    expect(drained).toBe(false);

    tracker.exit();
    await waitPromise;
    expect(drained).toBe(true);
  });

  it("multiple waiters all resolve once drained", async () => {
    const tracker = createInFlightTracker();
    tracker.enter();

    const flags = [false, false, false];
    const promises = flags.map((_, index) =>
      tracker.wait().then(() => {
        flags[index] = true;
      }),
    );

    tracker.exit();
    await Promise.all(promises);
    expect(flags).toEqual([true, true, true]);
  });

  it("exit() guards against going negative", () => {
    const tracker = createInFlightTracker();
    tracker.exit();
    tracker.exit();
    expect(tracker.count()).toBe(0);
  });
});
