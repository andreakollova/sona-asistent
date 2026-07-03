import OpenAI from "openai";
import { config } from "./config";
import { executeTool } from "./tools";
import { buildSystemPrompt } from "./prompt";

const client = new OpenAI({ apiKey: config.openaiApiKey });

// OpenAI tool definitions
const openaiTools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_tasks",
      description:
        "Query Natalia's tasks. Filter by project (woeva/fondre/szph/drixton/personal), status (open/in_progress/done), or due_before (YYYY-MM-DD).",
      parameters: {
        type: "object",
        properties: {
          project: { type: "string", description: "Project filter" },
          status: { type: "string", description: "Status filter" },
          due_before: { type: "string", description: "Tasks due before date YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a new task. Parse project, due date, priority, and recurrence from context.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          project: { type: "string", description: "Project: woeva, fondre, szph, drixton, personal" },
          due_date: { type: "string", description: "Due date YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
          recurrence: { type: "string", description: "Recurrence: daily, weekly, mon,wed,fri" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as done by its ID.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Task UUID" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update a task's fields.",
      parameters: {
        type: "object",
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
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information, news, trends.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          num: { type: "number", description: "Number of results (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_context",
      description: "Get recent conversation history with Natalia.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of recent messages (default 20)" },
        },
      },
    },
  },
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

export async function chat(
  userMessage: string,
  conversationHistory: Message[],
  options: {
    mode: "reactive" | "proactive";
    slot?: "morning" | "midday" | "evening";
    useOpus?: boolean;
  }
): Promise<string> {
  const systemPrompt = buildSystemPrompt(options.mode, options.slot);
  const model = "gpt-4o";

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  let response = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    messages,
    tools: openaiTools,
  });

  let choice = response.choices[0];

  // Tool use loop
  while (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
    // Add assistant message with tool calls
    messages.push(choice.message);

    // Execute each tool call
    for (const toolCall of choice.message.tool_calls) {
      const fn = (toolCall as any).function;
      const args = JSON.parse(fn.arguments);
      const result = await executeTool(fn.name, args);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Get next response
    response = await client.chat.completions.create({
      model,
      max_tokens: 2048,
      messages,
      tools: openaiTools,
    });
    choice = response.choices[0];
  }

  return choice.message.content || "";
}
