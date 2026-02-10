import { describe, expect, it } from "vitest";
import { resolveFileExtension, sanitizeFileName, isGoogleDocType } from "./google-drive-helpers.js";

describe("Google Drive connector helpers", () => {
  it("resolves extension from MIME type", () => {
    expect(resolveFileExtension("application/pdf")).toBe("pdf");
    expect(
      resolveFileExtension(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("docx");
    expect(resolveFileExtension("text/plain")).toBe("txt");
    expect(resolveFileExtension("text/markdown")).toBe("md");
  });

  it("detects Google Doc types", () => {
    expect(isGoogleDocType("application/vnd.google-apps.document")).toBe(true);
    expect(isGoogleDocType("application/vnd.google-apps.spreadsheet")).toBe(true);
    expect(isGoogleDocType("application/pdf")).toBe(false);
  });

  it("sanitizes file names for local paths", () => {
    expect(sanitizeFileName("My Report (2026).pdf")).toBe("My Report (2026).pdf");
    expect(sanitizeFileName("file/with\\slashes")).toBe("file_with_slashes");
    expect(sanitizeFileName("file:with*special?chars")).toBe("file_with_special_chars");
  });
});
