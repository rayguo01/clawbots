import { describe, expect, it } from "vitest";
import { convertDocx } from "./docx.js";

describe("convertDocx", () => {
  it("is a function", () => {
    expect(typeof convertDocx).toBe("function");
  });

  it("rejects empty buffer", async () => {
    const emptyBuffer = Buffer.from("");
    await expect(convertDocx(emptyBuffer)).rejects.toThrow();
  });
});
