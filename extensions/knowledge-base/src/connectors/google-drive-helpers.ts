const GOOGLE_DOC_EXPORT_TYPES: Record<string, { mimeType: string; ext: string }> = {
  "application/vnd.google-apps.document": { mimeType: "text/plain", ext: "txt" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "text/csv", ext: "csv" },
  "application/vnd.google-apps.presentation": { mimeType: "text/plain", ext: "txt" },
};

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "text/html": "html",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
};

export function resolveFileExtension(mimeType: string): string | undefined {
  return MIME_TO_EXT[mimeType];
}

export function isGoogleDocType(mimeType: string): boolean {
  return mimeType in GOOGLE_DOC_EXPORT_TYPES;
}

export function getGoogleDocExportType(
  mimeType: string,
): { mimeType: string; ext: string } | undefined {
  return GOOGLE_DOC_EXPORT_TYPES[mimeType];
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_");
}
