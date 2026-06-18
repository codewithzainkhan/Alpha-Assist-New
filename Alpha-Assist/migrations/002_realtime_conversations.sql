-- =============================================================================
-- Migration 002 — Realtime + Conversations
-- =============================================================================
-- Run this in the Supabase SQL Editor after 001 (supabase_migration.sql).
-- Safe to re-run.
--
-- Changes:
--   1. conversations table (groups messages into named sessions)
--   2. conversation_id FK column on messages
--   3. Enable Supabase Realtime for tasks & goals (dashboard live stats)
-- =============================================================================

-- ── 1. Conversations ──────────────────────────────────────────────────────────
create table if not exists public.conversations (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    title       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table public.conversations add column if not exists title      text;
alter table public.conversations add column if not exists created_at timestamptz not null default now();
alter table public.conversations add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_conversations_user on public.conversations (user_id, updated_at desc);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();

-- RLS
alter table public.conversations enable row level security;

drop policy if exists "conversations_owner" on public.conversations;
create policy "conversations_owner" on public.conversations
    for all to authenticated
    using  (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ── 2. conversation_id on messages ───────────────────────────────────────────
alter table public.messages
    add column if not exists conversation_id uuid
    references public.conversations(id) on delete cascade;

create index if not exists idx_messages_conversation on public.messages (conversation_id);

-- ── 3. Realtime for dashboard live stats ─────────────────────────────────────
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.goals;
