import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const VALID_SECTIONS = [
  "core_identity",
  "values",
  "background",
  "skills",
  "communication_style",
  "goals",
  "knowledge_domains",
  "work_approach",
  "relationships_context",
  "interests",
] as const;

const SECTION_HEADERS: Record<string, string> = {
  core_identity: "## Core Identity",
  values: "## Values",
  background: "## Background",
  skills: "## Skills",
  communication_style: "## Communication Style",
  goals: "## Goals",
  knowledge_domains: "## Knowledge Domains",
  work_approach: "## Work Approach",
  relationships_context: "## Relationships Context",
  interests: "## Interests",
};

const USER_PROFILE_FILENAME = "user-profile.md";

const UpdateUserProfileSchema = Type.Object({
  section: Type.String({
    description:
      "The profile section to update: core_identity, values, background, skills, communication_style, goals, knowledge_domains, work_approach, relationships_context, interests",
  }),
  action: Type.String({
    description:
      "add (append new info), update (replace section content), remove (clear specific info)",
  }),
  content: Type.String({
    description:
      "The content to write. For 'add': new lines to append. For 'update': full replacement content for the section. For 'remove': remaining content after removal (empty string to clear).",
  }),
  reason: Type.String({
    description: "Why this update is being made (your reasoning based on the conversation).",
  }),
});

export function createUserProfileTool(options: {
  workspaceDir?: string;
}): AnyAgentTool | null {
  const workspaceDir = options?.workspaceDir;
  if (!workspaceDir) return null;

  return {
    label: "Update User Portrait",
    name: "update_user_profile",
    description:
      "Update the user's portrait file (user-profile.md) when you discover meaningful personal information during conversation. Use sparingly — only for significant new info like name, role, goals, preferences, or life changes. Do NOT call for trivial or transient info.",
    parameters: UpdateUserProfileSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const section = readStringParam(params, "section", { required: true });
      const action = readStringParam(params, "action", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const reason = readStringParam(params, "reason", { required: true });

      if (!VALID_SECTIONS.includes(section as (typeof VALID_SECTIONS)[number])) {
        return jsonResult({
          success: false,
          error: `Invalid section: ${section}. Valid: ${VALID_SECTIONS.join(", ")}`,
        });
      }
      if (!["add", "update", "remove"].includes(action)) {
        return jsonResult({
          success: false,
          error: `Invalid action: ${action}. Valid: add, update, remove`,
        });
      }

      const filePath = path.join(workspaceDir, USER_PROFILE_FILENAME);
      let fileContent: string;
      try {
        fileContent = await fs.readFile(filePath, "utf-8");
      } catch {
        return jsonResult({
          success: false,
          error: "user-profile.md not found in workspace. It will be created on next bootstrap.",
        });
      }

      const header = SECTION_HEADERS[section]!;
      const headerIndex = fileContent.indexOf(header);
      if (headerIndex === -1) {
        return jsonResult({
          success: false,
          error: `Section header "${header}" not found in user-profile.md.`,
        });
      }

      // Find the end of this section (next ## header or end of file)
      const afterHeader = headerIndex + header.length;
      const nextHeaderMatch = fileContent.slice(afterHeader).search(/\n## /);
      const sectionEnd =
        nextHeaderMatch === -1 ? fileContent.length : afterHeader + nextHeaderMatch;

      // Current section content (between header and next header)
      const currentSectionContent = fileContent.slice(afterHeader, sectionEnd);

      // Strip HTML comments from section content for clean operations
      const cleanContent = currentSectionContent.replace(/<!--[\s\S]*?-->/g, "").trim();

      let newSectionContent: string;
      switch (action) {
        case "add":
          newSectionContent = cleanContent
            ? `\n${cleanContent}\n${content}\n`
            : `\n${content}\n`;
          break;
        case "update":
          newSectionContent = `\n${content}\n`;
          break;
        case "remove":
          newSectionContent = content.trim() ? `\n${content}\n` : "\n";
          break;
        default:
          newSectionContent = `\n${content}\n`;
      }

      const updatedFile =
        fileContent.slice(0, afterHeader) + newSectionContent + fileContent.slice(sectionEnd);

      await fs.writeFile(filePath, updatedFile, "utf-8");

      return jsonResult({
        success: true,
        section,
        action,
        reason,
      });
    },
  };
}
