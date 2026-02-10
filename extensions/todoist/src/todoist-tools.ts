import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "openclaw/plugin-sdk";
import { todoistFetch } from "./todoist-api.js";

// ── Schemas ─────────────────────────────────────────────────

const ListTasksSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Filter by project ID." })),
  sectionId: Type.Optional(Type.String({ description: "Filter by section ID." })),
  label: Type.Optional(Type.String({ description: "Filter by label name." })),
  filter: Type.Optional(
    Type.String({
      description:
        'Todoist filter expression (e.g. "today", "overdue", "p1", "#Work"). Only used if projectId/sectionId/label are not set.',
    }),
  ),
});

const GetTaskSchema = Type.Object({
  taskId: Type.String({ description: "The task ID." }),
});

const CreateTaskSchema = Type.Object({
  content: Type.String({ description: "Task title/content." }),
  description: Type.Optional(Type.String({ description: "Task description (markdown)." })),
  projectId: Type.Optional(Type.String({ description: "Project ID to add to." })),
  sectionId: Type.Optional(Type.String({ description: "Section ID to add to." })),
  priority: Type.Optional(
    Type.Number({
      description: "Priority 1 (normal) to 4 (urgent).",
      minimum: 1,
      maximum: 4,
    }),
  ),
  dueString: Type.Optional(
    Type.String({ description: 'Due date in natural language (e.g. "tomorrow", "next Monday").' }),
  ),
  dueDate: Type.Optional(Type.String({ description: "Due date (YYYY-MM-DD)." })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Label names." })),
});

const UpdateTaskSchema = Type.Object({
  taskId: Type.String({ description: "The task ID to update." }),
  content: Type.Optional(Type.String({ description: "New title/content." })),
  description: Type.Optional(Type.String({ description: "New description." })),
  priority: Type.Optional(Type.Number({ description: "Priority 1-4.", minimum: 1, maximum: 4 })),
  dueString: Type.Optional(Type.String({ description: "New due date in natural language." })),
  dueDate: Type.Optional(Type.String({ description: "New due date (YYYY-MM-DD)." })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "New label names." })),
});

const CloseTaskSchema = Type.Object({
  taskId: Type.String({ description: "The task ID to complete." }),
});

const DeleteTaskSchema = Type.Object({
  taskId: Type.String({ description: "The task ID to delete." }),
});

const ListProjectsSchema = Type.Object({});

const CreateProjectSchema = Type.Object({
  name: Type.String({ description: "Project name." }),
  color: Type.Optional(Type.String({ description: "Project color (e.g. 'berry_red', 'blue')." })),
  parentId: Type.Optional(Type.String({ description: "Parent project ID for nesting." })),
});

const ListSectionsSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Filter by project ID." })),
});

const ListLabelsSchema = Type.Object({});

const ListCommentsSchema = Type.Object({
  taskId: Type.Optional(Type.String({ description: "Task ID to get comments for." })),
  projectId: Type.Optional(Type.String({ description: "Project ID to get comments for." })),
});

const CreateCommentSchema = Type.Object({
  taskId: Type.Optional(Type.String({ description: "Task ID to comment on." })),
  projectId: Type.Optional(Type.String({ description: "Project ID to comment on." })),
  content: Type.String({ description: "Comment text (markdown)." }),
});

// ── Tools ───────────────────────────────────────────────────

export function createTodoistTools(): AnyAgentTool[] {
  return [
    createListTasksTool(),
    createGetTaskTool(),
    createCreateTaskTool(),
    createUpdateTaskTool(),
    createCloseTaskTool(),
    createDeleteTaskTool(),
    createListProjectsTool(),
    createCreateProjectTool(),
    createListSectionsTool(),
    createListLabelsTool(),
    createListCommentsTool(),
    createCreateCommentTool(),
  ];
}

function createListTasksTool(): AnyAgentTool {
  return {
    label: "Todoist: List Tasks",
    name: "todoist_list_tasks",
    description:
      "List tasks from Todoist. Can filter by project, section, label, or filter expression.",
    parameters: ListTasksSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams();
      if (params.projectId) qs.set("project_id", String(params.projectId));
      if (params.sectionId) qs.set("section_id", String(params.sectionId));
      if (params.label) qs.set("label", String(params.label));
      if (params.filter && !params.projectId && !params.sectionId && !params.label) {
        qs.set("filter", String(params.filter));
      }
      const query = qs.toString();
      const res = await todoistFetch(`/tasks${query ? `?${query}` : ""}`);
      const tasks = (await res.json()) as TodoistTask[];
      return jsonResult({ tasks: tasks.map(formatTask), count: tasks.length });
    },
  };
}

function createGetTaskTool(): AnyAgentTool {
  return {
    label: "Todoist: Get Task",
    name: "todoist_get_task",
    description: "Get details of a single Todoist task by ID.",
    parameters: GetTaskSchema,
    execute: async (_toolCallId, args) => {
      const { taskId } = args as { taskId: string };
      const res = await todoistFetch(`/tasks/${encodeURIComponent(taskId)}`);
      const task = (await res.json()) as TodoistTask;
      return jsonResult({ task: formatTask(task) });
    },
  };
}

function createCreateTaskTool(): AnyAgentTool {
  return {
    label: "Todoist: Create Task",
    name: "todoist_create_task",
    description: "Create a new task in Todoist.",
    parameters: CreateTaskSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = { content: params.content };
      if (params.description) body.description = params.description;
      if (params.projectId) body.project_id = params.projectId;
      if (params.sectionId) body.section_id = params.sectionId;
      if (params.priority) body.priority = params.priority;
      if (params.dueString) body.due_string = params.dueString;
      if (params.dueDate) body.due_date = params.dueDate;
      if (params.labels) body.labels = params.labels;

      const res = await todoistFetch("/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const task = (await res.json()) as TodoistTask;
      return jsonResult({ created: true, task: formatTask(task) });
    },
  };
}

function createUpdateTaskTool(): AnyAgentTool {
  return {
    label: "Todoist: Update Task",
    name: "todoist_update_task",
    description: "Update an existing Todoist task.",
    parameters: UpdateTaskSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const taskId = encodeURIComponent(String(params.taskId));
      const body: Record<string, unknown> = {};
      if (params.content) body.content = params.content;
      if (params.description !== undefined) body.description = params.description;
      if (params.priority) body.priority = params.priority;
      if (params.dueString) body.due_string = params.dueString;
      if (params.dueDate) body.due_date = params.dueDate;
      if (params.labels) body.labels = params.labels;

      const res = await todoistFetch(`/tasks/${taskId}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const task = (await res.json()) as TodoistTask;
      return jsonResult({ updated: true, task: formatTask(task) });
    },
  };
}

function createCloseTaskTool(): AnyAgentTool {
  return {
    label: "Todoist: Close Task",
    name: "todoist_close_task",
    description: "Mark a Todoist task as complete.",
    parameters: CloseTaskSchema,
    execute: async (_toolCallId, args) => {
      const { taskId } = args as { taskId: string };
      await todoistFetch(`/tasks/${encodeURIComponent(taskId)}/close`, { method: "POST" });
      return jsonResult({ closed: true, taskId });
    },
  };
}

function createDeleteTaskTool(): AnyAgentTool {
  return {
    label: "Todoist: Delete Task",
    name: "todoist_delete_task",
    description: "Permanently delete a Todoist task.",
    parameters: DeleteTaskSchema,
    execute: async (_toolCallId, args) => {
      const { taskId } = args as { taskId: string };
      await todoistFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      return jsonResult({ deleted: true, taskId });
    },
  };
}

function createListProjectsTool(): AnyAgentTool {
  return {
    label: "Todoist: List Projects",
    name: "todoist_list_projects",
    description: "List all projects in Todoist.",
    parameters: ListProjectsSchema,
    execute: async () => {
      const res = await todoistFetch("/projects");
      const projects = (await res.json()) as TodoistProject[];
      return jsonResult({
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          parentId: p.parent_id,
          order: p.order,
          isFavorite: p.is_favorite,
        })),
        count: projects.length,
      });
    },
  };
}

function createCreateProjectTool(): AnyAgentTool {
  return {
    label: "Todoist: Create Project",
    name: "todoist_create_project",
    description: "Create a new project in Todoist.",
    parameters: CreateProjectSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = { name: params.name };
      if (params.color) body.color = params.color;
      if (params.parentId) body.parent_id = params.parentId;

      const res = await todoistFetch("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const project = (await res.json()) as TodoistProject;
      return jsonResult({
        created: true,
        project: { id: project.id, name: project.name, color: project.color },
      });
    },
  };
}

function createListSectionsTool(): AnyAgentTool {
  return {
    label: "Todoist: List Sections",
    name: "todoist_list_sections",
    description: "List sections, optionally filtered by project.",
    parameters: ListSectionsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = params.projectId
        ? `?project_id=${encodeURIComponent(String(params.projectId))}`
        : "";
      const res = await todoistFetch(`/sections${qs}`);
      const sections = (await res.json()) as TodoistSection[];
      return jsonResult({
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          projectId: s.project_id,
          order: s.order,
        })),
        count: sections.length,
      });
    },
  };
}

function createListLabelsTool(): AnyAgentTool {
  return {
    label: "Todoist: List Labels",
    name: "todoist_list_labels",
    description: "List all personal labels in Todoist.",
    parameters: ListLabelsSchema,
    execute: async () => {
      const res = await todoistFetch("/labels");
      const labels = (await res.json()) as TodoistLabel[];
      return jsonResult({
        labels: labels.map((l) => ({ id: l.id, name: l.name, color: l.color, order: l.order })),
        count: labels.length,
      });
    },
  };
}

function createListCommentsTool(): AnyAgentTool {
  return {
    label: "Todoist: List Comments",
    name: "todoist_list_comments",
    description: "List comments on a task or project.",
    parameters: ListCommentsSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const qs = new URLSearchParams();
      if (params.taskId) qs.set("task_id", String(params.taskId));
      if (params.projectId) qs.set("project_id", String(params.projectId));
      const query = qs.toString();
      if (!query) {
        return jsonResult({ error: "Either taskId or projectId is required." });
      }
      const res = await todoistFetch(`/comments?${query}`);
      const comments = (await res.json()) as TodoistComment[];
      return jsonResult({
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          postedAt: c.posted_at,
          taskId: c.task_id,
          projectId: c.project_id,
        })),
        count: comments.length,
      });
    },
  };
}

function createCreateCommentTool(): AnyAgentTool {
  return {
    label: "Todoist: Create Comment",
    name: "todoist_create_comment",
    description: "Add a comment to a task or project.",
    parameters: CreateCommentSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const body: Record<string, unknown> = { content: params.content };
      if (params.taskId) body.task_id = params.taskId;
      if (params.projectId) body.project_id = params.projectId;
      if (!params.taskId && !params.projectId) {
        return jsonResult({ error: "Either taskId or projectId is required." });
      }

      const res = await todoistFetch("/comments", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const comment = (await res.json()) as TodoistComment;
      return jsonResult({
        created: true,
        comment: { id: comment.id, content: comment.content, postedAt: comment.posted_at },
      });
    },
  };
}

// ── Types ───────────────────────────────────────────────────

type TodoistTask = {
  id?: string;
  content?: string;
  description?: string;
  project_id?: string;
  section_id?: string;
  priority?: number;
  due?: { date?: string; string?: string; datetime?: string; recurring?: boolean };
  labels?: string[];
  url?: string;
  is_completed?: boolean;
  created_at?: string;
};

type TodoistProject = {
  id?: string;
  name?: string;
  color?: string;
  parent_id?: string;
  order?: number;
  is_favorite?: boolean;
};

type TodoistSection = {
  id?: string;
  name?: string;
  project_id?: string;
  order?: number;
};

type TodoistLabel = {
  id?: string;
  name?: string;
  color?: string;
  order?: number;
};

type TodoistComment = {
  id?: string;
  content?: string;
  posted_at?: string;
  task_id?: string;
  project_id?: string;
};

function formatTask(t: TodoistTask) {
  return {
    id: t.id,
    content: t.content,
    description: t.description,
    projectId: t.project_id,
    sectionId: t.section_id,
    priority: t.priority,
    due: t.due
      ? {
          date: t.due.date,
          string: t.due.string,
          datetime: t.due.datetime,
          recurring: t.due.recurring,
        }
      : null,
    labels: t.labels,
    url: t.url,
    isCompleted: t.is_completed,
    createdAt: t.created_at,
  };
}
