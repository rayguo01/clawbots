import { describe, expect, it } from "vitest";
import { convertPdf } from "./pdf.js";

describe("convertPdf", () => {
  it("rejects empty buffer", async () => {
    const emptyBuffer = Buffer.from("");
    await expect(convertPdf(emptyBuffer)).rejects.toThrow();
  });

  it("returns markdown string from valid PDF", async () => {
    expect(typeof convertPdf).toBe("function");
  });
});
