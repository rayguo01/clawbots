import mammoth from "mammoth";

/**
 * Convert a DOCX buffer to markdown using mammoth.
 * mammoth produces clean HTML; we convert to simple markdown.
 */
export async function convertDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToMarkdown({ buffer });
  return result.value.trim();
}
