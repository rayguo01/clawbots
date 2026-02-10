export function sanitizePageTitle(title: string): string {
  const sanitized = title.replace(/[/\\:*?"<>|]/g, "_").trim();
  return sanitized || "untitled";
}

export function extractPageTitle(page: { properties?: Record<string, unknown> }): string {
  if (!page.properties) return "untitled";
  for (const prop of Object.values(page.properties)) {
    const p = prop as { type?: string; title?: Array<{ plain_text?: string }> };
    if (p.type === "title" && p.title?.length) {
      return p.title.map((t) => t.plain_text ?? "").join("");
    }
  }
  return "untitled";
}
