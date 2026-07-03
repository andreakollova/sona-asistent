import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

export const supabase = createClient(config.supabase.url, config.supabase.key);

// ── Tasks ──

export interface Task {
  id: string;
  title: string;
  project: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  recurrence: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function queryTasks(filters: {
  project?: string;
  status?: string;
  due_before?: string;
}): Promise<Task[]> {
  let q = supabase.from("tasks").select("*");
  if (filters.project) q = q.eq("project", filters.project);
  if (filters.status) q = q.eq("status", filters.status);
  else q = q.neq("status", "done");
  if (filters.due_before) q = q.lte("due_date", filters.due_before);
  q = q.order("due_date", { ascending: true, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function addTask(task: {
  title: string;
  project?: string;
  due_date?: string;
  priority?: string;
  recurrence?: string;
}): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      project: task.project || null,
      priority: task.priority || "normal",
      due_date: task.due_date || null,
      recurrence: task.recurrence || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(
  taskId: string,
  updates: Partial<Pick<Task, "title" | "project" | "status" | "priority" | "due_date" | "recurrence">>
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Conversations ──

export async function saveMessage(msg: {
  user_id: string;
  user_name?: string;
  channel_id: string;
  role: "user" | "assistant";
  content: string;
}) {
  await supabase.from("conversations").insert(msg);
}

export async function getRecentContext(
  channelId: string,
  limit = 20
): Promise<{ role: string; content: string; user_name: string | null; created_at: string }[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, user_name, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

export async function getRecentContextGlobal(
  limit = 30
): Promise<{ role: string; content: string; user_name: string | null; channel_id: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, user_name, channel_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

// ── Bot State ──

export async function getState(key: string): Promise<any> {
  const { data } = await supabase
    .from("bot_state")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

export async function setState(key: string, value: any) {
  await supabase.from("bot_state").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}
