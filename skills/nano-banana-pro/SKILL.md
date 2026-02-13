---
name: nano-banana-pro
description: Generate or edit images via Gemini 3 Pro Image (Nano Banana Pro). 关键词：生成图片、画图、修图、AI绘画、图片编辑、画一张、帮我做图。
homepage: https://ai.google.dev/
metadata:
  {
    "openclaw":
      {
        "emoji": "🍌",
        "requires": { "bins": ["uv"], "env": ["GEMINI_API_KEY"] },
        "primaryEnv": "GEMINI_API_KEY",
        "install":
          [
            {
              "id": "uv-brew",
              "kind": "brew",
              "formula": "uv",
              "bins": ["uv"],
              "label": "Install uv (brew)",
            },
          ],
      },
  }
---

# Nano Banana Pro (Gemini 3 Pro Image)

Use the bundled script to generate or edit images.

Generate

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "your image description" --filename "output.png" --resolution 1K
```

Edit (single image)

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "edit instructions" --filename "output.png" -i "/path/in.png" --resolution 2K
```

Multi-image composition (up to 14 images)

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "combine these into one scene" --filename "output.png" -i img1.png -i img2.png -i img3.png
```

Sending the image

After running the script, the stdout will contain a line like `IMAGE_PATH: /path/to/output.png`.
**You MUST use the message tool** to send the image back to the user:

```
message(action="send", filePath="/path/to/output.png", message="your caption")
```

Do NOT include the file path as text in your reply. Do NOT rely on MEDIA: tokens.
Always use the message tool with `filePath` to deliver images.

API key

- `GEMINI_API_KEY` env var
- Or set `skills."nano-banana-pro".apiKey` / `skills."nano-banana-pro".env.GEMINI_API_KEY` in `~/.openclaw/openclaw.json`

Notes

- Resolutions: `1K` (default), `2K`, `4K`.
- Use timestamps in filenames: `yyyy-mm-dd-hh-mm-ss-name.png`.
- Do not read the image back; report the saved path only.
