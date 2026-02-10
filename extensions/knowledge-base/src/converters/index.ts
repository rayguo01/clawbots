import { convertDocx } from "./docx.js";
import { convertPdf } from "./pdf.js";
import { convertText } from "./text.js";

export type ConvertResult = {
  markdown: string;
  format: string;
};

/**
 * Convert document content to markdown based on its format.
 * Returns null if the format is unsupported.
 */
export async function convertToMarkdown(
  content: Buffer | string,
  format: string,
): Promise<ConvertResult | null> {
  switch (format) {
    case "md":
    case "txt":
    case "csv":
    case "json":
    case "xml":
    case "html":
    case "log":
      return {
        markdown: typeof content === "string" ? content : content.toString("utf-8"),
        format,
      };
    case "pdf": {
      const buffer = typeof content === "string" ? Buffer.from(content) : content;
      const markdown = await convertPdf(buffer);
      return { markdown, format: "pdf" };
    }
    case "docx": {
      const buffer = typeof content === "string" ? Buffer.from(content) : content;
      const markdown = await convertDocx(buffer);
      return { markdown, format: "docx" };
    }
    default:
      return null;
  }
}

export { convertText } from "./text.js";
export { convertPdf } from "./pdf.js";
export { convertDocx } from "./docx.js";
