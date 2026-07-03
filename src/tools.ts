import Anthropic from "@anthropic-ai/sdk";
import * as db from "./db";
import { webSearch } from "./search";

// Tool definitions for Claude
export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "query_tasks",
    description:
      "Query Natalia's tasks. Filter by project (woeva/fondre/szph/drixton/personal), status (open/in_progress/done), or due_before (YYYY-MM-DD).",
    input_schema: {
      type: "object" as const,
      properties: {
        project: { type: "string", description: "Project filter" },
        status: { type: "string", description: "Status filter" },
        due_before: {
          type: "string",
          description: "Show tasks due before this date (YYYY-MM-DD)",
        },
      },
      required: [],
    },
  },
  {
    name: "add_task",
    description:
      "Add a new task. Parse project, due date, priority, and recurrence from context.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        project: {
          type: "string",
          description: "Project: woeva, fondre, szph, drixton, personal",
        },
        due_date: { type: "string", description: "Due date YYYY-MM-DD" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description: "Priority level",
        },
        recurrence: {
          type: "string",
          description: "Recurrence pattern: daily, weekly, mon,wed,fri, etc.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as done by its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task UUID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's fields (title, project, status, priority, due_date, recurrence).",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task UUID" },
        title: { type: "string" },
        project: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        due_date: { type: "string" },
        recurrence: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for information. Use for news, trends, general knowledge questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        num: {
          type: "number",
          description: "Number of results (default 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_recent_context",
    description:
      "Get recent conversation history with Natalia (to maintain continuity).",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Number of recent messages (default 20)",
        },
      },
      required: [],
    },
  },
];

// Execute a tool call
export async function executeTool(
  name: string,
  input: Record<string, any>,
  context?: { slackApp?: any }
): Promise<string> {
  try {
    switch (name) {
      case "query_tasks": {
        const tasks = await db.queryTasks(input);
        if (tasks.length === 0) return "No tasks found matching filters.";
        return tasks
          .map(
            (t) =>
              `- [${t.id.slice(0, 8)}] ${t.title} | project: ${t.project || "none"} | priority: ${t.priority} | due: ${t.due_date || "none"} | status: ${t.status}`
          )
          .join("\n");
      }

      case "add_task": {
        const task = await db.addTask(input as Parameters<typeof db.addTask>[0]);
        return `Task created: "${task.title}" (id: ${task.id.slice(0, 8)}, project: ${task.project || "none"}, due: ${task.due_date || "none"}, priority: ${task.priority})`;
      }

      case "complete_task": {
        const task = await db.completeTask(input.task_id);
        return `Task completed: "${task.title}"`;
      }

      case "update_task": {
        const { task_id, ...updates } = input;
        const task = await db.updateTask(task_id, updates);
        return `Task updated: "${task.title}" (${Object.keys(updates).join(", ")} changed)`;
      }

      case "web_search": {
        const results = await webSearch(input.query, input.num || 5);
        if (results.length === 0) return "No results found.";
        return results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`)
          .join("\n\n");
      }

      case "get_recent_context": {
        const msgs = await db.getRecentContextGlobal(input.limit || 20);
        if (msgs.length === 0) return "No recent conversation history.";
        return msgs
          .map(
            (m) =>
              `[${m.created_at}] ${m.role === "user" ? m.user_name || "user" : "Sona"}: ${m.content.slice(0, 300)}`
          )
          .join("\n");
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    return `Error executing ${name}: ${err.message}`;
  }
}
