type RichText = {
  plain_text?: string;
  type?: string;
};

type NotionBlock = {
  type: string;
  [key: string]: unknown;
};

function extractText(richText: RichText[] | undefined): string {
  if (!richText?.length) return "";
  return richText.map((rt) => rt.plain_text ?? "").join("");
}

function getBlockContent(block: NotionBlock): { rich_text?: RichText[]; [key: string]: unknown } {
  return (block[block.type] as { rich_text?: RichText[] }) ?? {};
}

function isListType(type: string): boolean {
  return type === "bulleted_list_item" || type === "numbered_list_item" || type === "to_do";
}

/**
 * Convert an array of Notion blocks to a markdown string.
 */
export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = [];
  let numberedIndex = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    const content = getBlockContent(block);
    const text = extractText(content.rich_text);

    // Reset numbered counter when leaving numbered_list_item
    if (block.type !== "numbered_list_item") {
      numberedIndex = 0;
    }

    switch (block.type) {
      case "paragraph":
        lines.push(text);
        break;

      case "heading_1":
        lines.push(`# ${text}`);
        break;

      case "heading_2":
        lines.push(`## ${text}`);
        break;

      case "heading_3":
        lines.push(`### ${text}`);
        break;

      case "bulleted_list_item":
        lines.push(`- ${text}`);
        break;

      case "numbered_list_item":
        numberedIndex++;
        lines.push(`${numberedIndex}. ${text}`);
        break;

      case "to_do": {
        const checked = (content as { checked?: boolean }).checked;
        lines.push(`- [${checked ? "x" : " "}] ${text}`);
        break;
      }

      case "code": {
        const language = (content as { language?: string }).language ?? "";
        lines.push(`\`\`\`${language}\n${text}\n\`\`\``);
        break;
      }

      case "quote":
        lines.push(`> ${text}`);
        break;

      case "divider":
        lines.push("---");
        break;

      case "callout":
        lines.push(`> ${text}`);
        break;

      case "toggle":
        lines.push(`**${text}**`);
        break;

      case "image": {
        const imageData = content as {
          file?: { url?: string };
          external?: { url?: string };
          caption?: RichText[];
        };
        const url = imageData.file?.url ?? imageData.external?.url ?? "";
        const caption = extractText(imageData.caption);
        lines.push(`![${caption}](${url})`);
        break;
      }

      case "bookmark": {
        const bookmarkData = content as { url?: string; caption?: RichText[] };
        const caption = extractText(bookmarkData.caption) || bookmarkData.url || "";
        lines.push(`[${caption}](${bookmarkData.url ?? ""})`);
        break;
      }

      default:
        // Unknown block type — extract text if available, skip otherwise
        if (text) lines.push(text);
        break;
    }
  }

  // Join with appropriate spacing:
  // List items of the same type get single newline, others get double newline
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === 0) {
      result.push(line);
      continue;
    }
    const prevBlock = blocks[i - 1];
    const currBlock = blocks[i];
    const isListContinuation =
      prevBlock &&
      currBlock &&
      isListType(prevBlock.type) &&
      isListType(currBlock.type) &&
      prevBlock.type === currBlock.type;

    if (isListContinuation) {
      result.push(line);
    } else {
      result.push("");
      result.push(line);
    }
  }

  return result.join("\n").trim();
}
