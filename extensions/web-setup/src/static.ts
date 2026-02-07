import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function createStaticHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean> {
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Only handle /web paths and root redirect
    if (url.pathname === "/") {
      res.statusCode = 302;
      res.setHeader("Location", "/web");
      res.end();
      return true;
    }

    if (!url.pathname.startsWith("/web")) {
      return false;
    }

    let filePath = url.pathname.replace(/^\/web\/?/, "/");
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    const fullPath = path.join(PUBLIC_DIR, filePath);

    // Prevent path traversal
    if (!fullPath.startsWith(PUBLIC_DIR)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return true;
    }

    try {
      const stat = await fs.promises.stat(fullPath);
      if (!stat.isFile()) throw new Error("Not a file");
      const ext = path.extname(fullPath);
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      const stream = fs.createReadStream(fullPath);
      stream.pipe(res);
      return true;
    } catch {
      // SPA fallback: serve index.html for unmatched paths under /web
      if (filePath !== "/index.html") {
        try {
          const indexPath = path.join(PUBLIC_DIR, "index.html");
          await fs.promises.stat(indexPath);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          fs.createReadStream(indexPath).pipe(res);
          return true;
        } catch {
          // fall through
        }
      }
      res.statusCode = 404;
      res.end("Not Found");
      return true;
    }
  };
}
