import { describe, it, expect } from "bun:test";

describe("@maskor/processor", () => {
  it("processes items in queue order (FIFO)", () => {
    // Dummy: replace with real queue/worker tests once processor logic exists
    const queue: string[] = [];
    queue.push("job-1");
    queue.push("job-2");
    expect(queue.shift()).toBe("job-1");
    expect(queue.shift()).toBe("job-2");
  });

  it("handles an empty queue without throwing", () => {
    const queue: string[] = [];
    expect(() => queue.shift()).not.toThrow();
  });
});
