import { describe, expect, it } from "vitest";
import { convertText } from "./text.js";

describe("convertText", () => {
  it("passes through plain text as-is", () => {
    const input = "Hello world\nLine two";
    expect(convertText(input)).toBe(input);
  });

  it("passes through markdown as-is", () => {
    const input = "# Heading\n\n- bullet\n- list";
    expect(convertText(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(convertText("")).toBe("");
  });
});
