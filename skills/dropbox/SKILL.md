---
name: dropbox
description: Read-only Dropbox file management — browse folders, search files, read text files, and get download links. 关键词：Dropbox文件、云盘、网盘、文件搜索、文件浏览、查看文档。
---

# Dropbox (Read-Only File Access)

You have read-only access to the user's Dropbox account through these tools:

- `dropbox_account` — User account info (name, email, plan)
- `dropbox_list_folder` — List files and folders in a directory
- `dropbox_search` — Search files by name
- `dropbox_read_text_file` — Read the content of a text file (max 1 MB)
- `dropbox_get_link` — Get a temporary download link for a file (valid 4 hours)
- `dropbox_get_metadata` — Get file or folder metadata (size, date, type)

## When to Use

Activate when the user asks about:

- Browsing files or folders in Dropbox
- Searching for a file in their cloud storage
- Reading the content of a document or text file
- Getting a download link for a file
- Checking file sizes or when files were last modified
- Anything related to Dropbox or "my cloud files"

## How to Respond

1. **For "what's in my Dropbox"** — use `dropbox_list_folder` with empty path for root. Summarize contents with folder/file icons and sizes.

2. **For "find file X"** — use `dropbox_search` with the query. Present matches with path, size, and date.

3. **For "show me the content of X"** — first check with `dropbox_get_metadata` if it's a text-based file and reasonable size, then use `dropbox_read_text_file`. For binary files (images, PDFs), offer a download link instead.

4. **For "download X" or "get link for X"** — use `dropbox_get_link` to provide a temporary download URL.

5. **For browsing deeper into folders** — use `dropbox_list_folder` with the full folder path.

6. **For file details** — use `dropbox_get_metadata` to show size, modification date, and type.

## Important Rules

- **This is read-only access** — you cannot upload, modify, delete, or move files. If the user asks to do so, explain this limitation.
- **Text file size limit is 1 MB** — for larger files, offer a download link via `dropbox_get_link`.
- **Paths start with "/"** — Dropbox paths look like "/Documents/report.txt". Root is "" (empty string) for list_folder.
- **Temporary links expire in 4 hours** — mention this when providing download links.
- When listing folders, show a concise summary with type icons (folder vs file), name, and size.

## Language

Respond in the same language as the user's message.
