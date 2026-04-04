import { describe, it, expect } from "bun:test";

describe("@maskor/storage", () => {
  it("can read and write a temporary file", async () => {
    // Dummy: replace with real vault read/write once storage layer exists
    const tmp = `${import.meta.dir}/tmp-sanity.txt`;
    await Bun.write(tmp, "hello");
    const content = await Bun.file(tmp).text();
    expect(content).toBe("hello");
    // cleanup
    await Bun.$`rm ${tmp}`.quiet();
  });
});
