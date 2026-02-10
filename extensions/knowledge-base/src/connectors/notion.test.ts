import { describe, expect, it } from "vitest";
import { sanitizePageTitle, extractPageTitle } from "./notion-helpers.js";

describe("Notion connector helpers", () => {
  it("sanitizes page titles for file names", () => {
    expect(sanitizePageTitle("My Notes / Q1")).toBe("My Notes _ Q1");
    expect(sanitizePageTitle("")).toBe("untitled");
  });

  it("extracts page title from properties", () => {
    const page = {
      properties: {
        Name: {
          type: "title",
          title: [{ plain_text: "Meeting Notes" }],
        },
      },
    };
    expect(extractPageTitle(page)).toBe("Meeting Notes");
  });

  it("returns untitled when no title property", () => {
    expect(extractPageTitle({ properties: {} })).toBe("untitled");
    expect(extractPageTitle({})).toBe("untitled");
  });
});
