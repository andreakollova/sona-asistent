-- Sona Assistant - Supabase Schema

-- Tasks (Natalia's task system)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project text, -- woeva, fondre, szph, drixton, personal
  status text not null default 'open', -- open, in_progress, done
  priority text default 'normal', -- low, normal, high, urgent
  due_date date,
  recurrence text, -- daily, weekly, mon,wed,fri, etc.
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idx_tasks_status on tasks(status);
create index idx_tasks_project on tasks(project);
create index idx_tasks_due on tasks(due_date);

-- Conversation history (Sona's memory)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_name text,
  channel_id text not null,
  role text not null, -- user, assistant
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_conversations_channel on conversations(channel_id, created_at desc);
create index idx_conversations_user on conversations(user_id, created_at desc);

-- Bot state (mute mode, preferences, etc.)
create table bot_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Recurring tasks log (to prevent duplicates)
create table recurrence_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  created_for date not null,
  created_at timestamptz not null default now(),
  unique(task_id, created_for)
);
