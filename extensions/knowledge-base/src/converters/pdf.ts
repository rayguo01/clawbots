import pdfParse from "pdf-parse";

/**
 * Extract text from a PDF buffer and return as markdown-ish plain text.
 * pdf-parse extracts the text layer; no OCR.
 */
export async function convertPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text.trim();
}
