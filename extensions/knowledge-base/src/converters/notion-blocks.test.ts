import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "./notion-blocks.js";

describe("blocksToMarkdown", () => {
  it("converts paragraph blocks", () => {
    const blocks = [
      {
        type: "paragraph",
        paragraph: {
          rich_text: [{ plain_text: "Hello world", type: "text" }],
        },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("Hello world");
  });

  it("converts heading blocks", () => {
    const blocks = [
      {
        type: "heading_1",
        heading_1: { rich_text: [{ plain_text: "Title", type: "text" }] },
      },
      {
        type: "heading_2",
        heading_2: { rich_text: [{ plain_text: "Subtitle", type: "text" }] },
      },
      {
        type: "heading_3",
        heading_3: { rich_text: [{ plain_text: "Section", type: "text" }] },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("# Title\n\n## Subtitle\n\n### Section");
  });

  it("converts bulleted list items", () => {
    const blocks = [
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ plain_text: "Item 1", type: "text" }] },
      },
      {
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ plain_text: "Item 2", type: "text" }] },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("- Item 1\n- Item 2");
  });

  it("converts numbered list items", () => {
    const blocks = [
      {
        type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ plain_text: "First", type: "text" }] },
      },
      {
        type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ plain_text: "Second", type: "text" }] },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("1. First\n2. Second");
  });

  it("converts to_do blocks", () => {
    const blocks = [
      {
        type: "to_do",
        to_do: {
          rich_text: [{ plain_text: "Task A", type: "text" }],
          checked: false,
        },
      },
      {
        type: "to_do",
        to_do: {
          rich_text: [{ plain_text: "Task B", type: "text" }],
          checked: true,
        },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("- [ ] Task A\n- [x] Task B");
  });

  it("converts code blocks", () => {
    const blocks = [
      {
        type: "code",
        code: {
          rich_text: [{ plain_text: "const x = 1;", type: "text" }],
          language: "javascript",
        },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("```javascript\nconst x = 1;\n```");
  });

  it("converts quote blocks", () => {
    const blocks = [
      {
        type: "quote",
        quote: { rich_text: [{ plain_text: "Wise words", type: "text" }] },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("> Wise words");
  });

  it("converts divider blocks", () => {
    const blocks = [{ type: "divider", divider: {} }];
    expect(blocksToMarkdown(blocks)).toBe("---");
  });

  it("handles empty rich_text gracefully", () => {
    const blocks = [
      {
        type: "paragraph",
        paragraph: { rich_text: [] },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("");
  });

  it("concatenates multiple rich_text segments", () => {
    const blocks = [
      {
        type: "paragraph",
        paragraph: {
          rich_text: [
            { plain_text: "Hello ", type: "text" },
            { plain_text: "world", type: "text" },
          ],
        },
      },
    ];
    expect(blocksToMarkdown(blocks)).toBe("Hello world");
  });
});
