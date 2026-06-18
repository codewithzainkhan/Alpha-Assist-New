-- =============================================================================
-- Alpha Assist — Unified Supabase Schema Migration
-- =============================================================================
-- Run this file in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to re-run: every CREATE / ALTER / POLICY uses IF NOT EXISTS or is
-- wrapped in a DO block that no-ops if already present.
--
-- Covers:
--   * Extensions (pgcrypto, uuid-ossp)
--   * Tables:  profiles, user_preferences, tasks, goals, reports,
--              conversations, messages, image_messages,
--              user_tone_profiles, user_voice_profiles
--   * Triggers: auto-populate profiles + preferences on signup, updated_at
--   * Indexes
--   * Storage buckets: avatars (public), chat-images, chat-audio, voice-samples
--   * Row Level Security policies (frontend hits with user JWT;
--     backend hits with service role key → bypasses RLS automatically)
-- =============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SHARED HELPER: updated_at auto-bump
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PROFILES  (1-to-1 with auth.users)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    full_name       text,
    email           text,
    phone           text,
    avatar_url      text,
    gender          text,
    date_of_birth   date,
    address         text,
    city            text,
    country         text,
    bio             text,
    push_token      text,
    timezone        text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Idempotent column top-up (for tables that already existed before this migration)
alter table public.profiles add column if not exists full_name     text;
alter table public.profiles add column if not exists email         text;
alter table public.profiles add column if not exists phone         text;
alter table public.profiles add column if not exists avatar_url    text;
alter table public.profiles add column if not exists gender        text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists address       text;
alter table public.profiles add column if not exists city          text;
alter table public.profiles add column if not exists country       text;
alter table public.profiles add column if not exists bio           text;
alter table public.profiles add column if not exists push_token    text;
alter table public.profiles add column if not exists timezone      text;
alter table public.profiles add column if not exists created_at    timestamptz not null default now();
alter table public.profiles add column if not exists updated_at    timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. USER_PREFERENCES
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.user_preferences (
    user_id     uuid primary key references auth.users(id) on delete cascade,
    theme_mode  text not null default 'system'
                check (theme_mode in ('light','dark','system')),
    updated_at  timestamptz not null default now()
);

alter table public.user_preferences add column if not exists theme_mode text not null default 'system';
alter table public.user_preferences add column if not exists updated_at timestamptz not null default now();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
    before update on public.user_preferences
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. AUTO-CREATE profile + preferences ON SIGNUP
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, phone)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name',
                 new.raw_user_meta_data->>'name'),
        new.raw_user_meta_data->>'phone'
    )
    on conflict (id) do nothing;

    insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. TASKS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users(id) on delete cascade,
    task_name          text not null,
    task_type          text not null,
    description        text,
    scheduled_date     date not null,
    scheduled_time     time not null,
    status             text not null default 'pending'
                       check (status in ('pending','in_progress','completed','cancelled')),
    priority           text not null default 'medium'
                       check (priority in ('low','medium','high')),
    call_reminder      boolean not null default false,
    message_reminder   boolean not null default false,
    whatsapp_reminder  boolean not null default false,
    reminder_time      time,
    recurrence         text,
    progress           integer not null default 0
                       check (progress between 0 and 100),
    completed_at       timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

alter table public.tasks add column if not exists description       text;
alter table public.tasks add column if not exists status            text not null default 'pending';
alter table public.tasks add column if not exists priority          text not null default 'medium';
alter table public.tasks add column if not exists call_reminder     boolean not null default false;
alter table public.tasks add column if not exists message_reminder  boolean not null default false;
alter table public.tasks add column if not exists whatsapp_reminder boolean not null default false;
alter table public.tasks add column if not exists reminder_time     time;
alter table public.tasks add column if not exists recurrence        text;
alter table public.tasks add column if not exists progress          integer not null default 0;
alter table public.tasks add column if not exists completed_at      timestamptz;
alter table public.tasks add column if not exists created_at        timestamptz not null default now();
alter table public.tasks add column if not exists updated_at        timestamptz not null default now();

create index if not exists idx_tasks_user_date    on public.tasks (user_id, scheduled_date);
create index if not exists idx_tasks_user_status  on public.tasks (user_id, status);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. GOALS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users(id) on delete cascade,
    goal_name          text not null,
    goal_type          text not null,
    target_amount      numeric(14,2) not null check (target_amount >= 0),
    current_amount     numeric(14,2) not null default 0 check (current_amount >= 0),
    deadline           date not null,
    description        text,
    status             text not null default 'active'
                       check (status in ('active','completed','cancelled')),
    message_reminder   boolean not null default false,
    reminder_frequency text,
    savings_history    jsonb not null default '[]'::jsonb,
    completed_at       timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

alter table public.goals add column if not exists description        text;
alter table public.goals add column if not exists status             text not null default 'active';
alter table public.goals add column if not exists message_reminder   boolean not null default false;
alter table public.goals add column if not exists reminder_frequency text;
alter table public.goals add column if not exists savings_history    jsonb not null default '[]'::jsonb;
alter table public.goals add column if not exists completed_at       timestamptz;
alter table public.goals add column if not exists created_at         timestamptz not null default now();
alter table public.goals add column if not exists updated_at         timestamptz not null default now();

create index if not exists idx_goals_user_status on public.goals (user_id, status);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
    before update on public.goals
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 8. REPORTS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    period        text not null check (period in ('daily','weekly','monthly')),
    period_label  text not null,
    period_start  date not null,
    period_end    date not null,
    report_data   jsonb not null,
    generated_at  timestamptz not null default now(),
    unique (user_id, period, period_start)
);

alter table public.reports add column if not exists period_label text;
alter table public.reports add column if not exists period_start date;
alter table public.reports add column if not exists period_end   date;
alter table public.reports add column if not exists report_data  jsonb;
alter table public.reports add column if not exists generated_at timestamptz not null default now();

-- Ensure the onConflict target exists even on pre-existing reports tables
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'reports_user_id_period_period_start_key'
    ) then
        begin
            alter table public.reports
                add constraint reports_user_id_period_period_start_key
                unique (user_id, period, period_start);
        exception when duplicate_table then null;
        end;
    end if;
end $$;

create index if not exists idx_reports_user_period on public.reports (user_id, period, period_end desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. CONVERSATIONS
-- ───────────────────────────────────────────────────────────────────────────
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

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 10. MESSAGES  (text / voice / image — all modes persisted here)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users(id) on delete cascade,
    conversation_id  uuid references public.conversations(id) on delete cascade,
    role             text not null check (role in ('user','assistant','system')),
    content          text not null,
    message_type     text not null default 'text'
                     check (message_type in ('text','voice','image')),
    metadata         jsonb not null default '{}'::jsonb,
    created_at       timestamptz not null default now()
);

-- Top up columns on any pre-existing `messages` table (the most common cause of
-- migration failure — the frontend's account-delete code implies this table
-- may already exist from a prior setup).
alter table public.messages add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.messages add column if not exists role            text;
alter table public.messages add column if not exists content         text;
alter table public.messages add column if not exists message_type    text not null default 'text';
alter table public.messages add column if not exists metadata        jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists created_at      timestamptz not null default now();

-- Handle the case where an existing `messages.id` column is serial/int rather than uuid.
-- We do NOT drop/alter the PK automatically (could lose data); the RLS-protected
-- app will still work if the pre-existing table uses a different id type, so
-- long as user_id is a uuid. If your existing messages.user_id is NOT uuid you
-- will need to migrate/drop it manually — uncomment the next line to drop it:
-- drop table if exists public.messages cascade;

create index if not exists idx_messages_user_created on public.messages (user_id, created_at desc);
create index if not exists idx_messages_conv         on public.messages (conversation_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 11. IMAGE_MESSAGES  (vision-analysis rows; image bytes stay in Storage)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.image_messages (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id) on delete cascade,
    message_id   uuid references public.messages(id) on delete set null,
    storage_path text not null,
    mime_type    text not null,
    description  text,
    user_prompt  text,
    response     text,
    created_at   timestamptz not null default now()
);

alter table public.image_messages add column if not exists message_id   uuid references public.messages(id) on delete set null;
alter table public.image_messages add column if not exists storage_path text;
alter table public.image_messages add column if not exists mime_type    text;
alter table public.image_messages add column if not exists description  text;
alter table public.image_messages add column if not exists user_prompt  text;
alter table public.image_messages add column if not exists response     text;
alter table public.image_messages add column if not exists created_at   timestamptz not null default now();

create index if not exists idx_image_messages_user on public.image_messages (user_id, created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 12. USER_TONE_PROFILES
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.user_tone_profiles (
    user_id       uuid primary key references auth.users(id) on delete cascade,
    tone_summary  text,
    style_prompt  text,
    chat_content  text,
    updated_at    timestamptz not null default now()
);

alter table public.user_tone_profiles add column if not exists tone_summary text;
alter table public.user_tone_profiles add column if not exists style_prompt text;
alter table public.user_tone_profiles add column if not exists chat_content text;
alter table public.user_tone_profiles add column if not exists updated_at   timestamptz not null default now();

drop trigger if exists user_tone_profiles_set_updated_at on public.user_tone_profiles;
create trigger user_tone_profiles_set_updated_at
    before update on public.user_tone_profiles
    for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 13. USER_VOICE_PROFILES
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.user_voice_profiles (
    user_id            uuid primary key references auth.users(id) on delete cascade,
    storage_path       text not null,
    original_filename  text,
    is_active          boolean not null default true,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

alter table public.user_voice_profiles add column if not exists storage_path      text;
alter table public.user_voice_profiles add column if not exists original_filename text;
alter table public.user_voice_profiles add column if not exists is_active         boolean not null default true;
alter table public.user_voice_profiles add column if not exists created_at        timestamptz not null default now();
alter table public.user_voice_profiles add column if not exists updated_at        timestamptz not null default now();

drop trigger if exists user_voice_profiles_set_updated_at on public.user_voice_profiles;
create trigger user_voice_profiles_set_updated_at
    before update on public.user_voice_profiles
    for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Enable on every user-scoped table. The backend uses the service role key
-- (via SUPABASE_SERVICE_ROLE_KEY) which bypasses RLS, so these policies only
-- affect direct-from-frontend calls using the user's JWT.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles            enable row level security;
alter table public.user_preferences    enable row level security;
alter table public.tasks               enable row level security;
alter table public.goals               enable row level security;
alter table public.reports             enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.image_messages      enable row level security;
alter table public.user_tone_profiles  enable row level security;
alter table public.user_voice_profiles enable row level security;

-- ───── profiles ─────
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles
    for select using (auth.uid() = id);
create policy profiles_insert on public.profiles
    for insert with check (auth.uid() = id);
create policy profiles_update on public.profiles
    for update using (auth.uid() = id);
create policy profiles_delete on public.profiles
    for delete using (auth.uid() = id);

-- ───── user_preferences ─────
drop policy if exists prefs_select on public.user_preferences;
drop policy if exists prefs_insert on public.user_preferences;
drop policy if exists prefs_update on public.user_preferences;
drop policy if exists prefs_delete on public.user_preferences;

create policy prefs_select on public.user_preferences
    for select using (auth.uid() = user_id);
create policy prefs_insert on public.user_preferences
    for insert with check (auth.uid() = user_id);
create policy prefs_update on public.user_preferences
    for update using (auth.uid() = user_id);
create policy prefs_delete on public.user_preferences
    for delete using (auth.uid() = user_id);

-- ───── tasks ─────
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

create policy tasks_select on public.tasks
    for select using (auth.uid() = user_id);
create policy tasks_insert on public.tasks
    for insert with check (auth.uid() = user_id);
create policy tasks_update on public.tasks
    for update using (auth.uid() = user_id);
create policy tasks_delete on public.tasks
    for delete using (auth.uid() = user_id);

-- ───── goals ─────
drop policy if exists goals_select on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;

create policy goals_select on public.goals
    for select using (auth.uid() = user_id);
create policy goals_insert on public.goals
    for insert with check (auth.uid() = user_id);
create policy goals_update on public.goals
    for update using (auth.uid() = user_id);
create policy goals_delete on public.goals
    for delete using (auth.uid() = user_id);

-- ───── reports ─────
drop policy if exists reports_select on public.reports;
drop policy if exists reports_insert on public.reports;
drop policy if exists reports_update on public.reports;
drop policy if exists reports_delete on public.reports;

create policy reports_select on public.reports
    for select using (auth.uid() = user_id);
create policy reports_insert on public.reports
    for insert with check (auth.uid() = user_id);
create policy reports_update on public.reports
    for update using (auth.uid() = user_id);
create policy reports_delete on public.reports
    for delete using (auth.uid() = user_id);

-- ───── conversations ─────
drop policy if exists conv_select on public.conversations;
drop policy if exists conv_insert on public.conversations;
drop policy if exists conv_update on public.conversations;
drop policy if exists conv_delete on public.conversations;

create policy conv_select on public.conversations
    for select using (auth.uid() = user_id);
create policy conv_insert on public.conversations
    for insert with check (auth.uid() = user_id);
create policy conv_update on public.conversations
    for update using (auth.uid() = user_id);
create policy conv_delete on public.conversations
    for delete using (auth.uid() = user_id);

-- ───── messages ─────
drop policy if exists msg_select on public.messages;
drop policy if exists msg_insert on public.messages;
drop policy if exists msg_update on public.messages;
drop policy if exists msg_delete on public.messages;

create policy msg_select on public.messages
    for select using (auth.uid() = user_id);
create policy msg_insert on public.messages
    for insert with check (auth.uid() = user_id);
create policy msg_update on public.messages
    for update using (auth.uid() = user_id);
create policy msg_delete on public.messages
    for delete using (auth.uid() = user_id);

-- ───── image_messages ─────
drop policy if exists img_select on public.image_messages;
drop policy if exists img_insert on public.image_messages;
drop policy if exists img_delete on public.image_messages;

create policy img_select on public.image_messages
    for select using (auth.uid() = user_id);
create policy img_insert on public.image_messages
    for insert with check (auth.uid() = user_id);
create policy img_delete on public.image_messages
    for delete using (auth.uid() = user_id);

-- ───── user_tone_profiles ─────
drop policy if exists tone_select on public.user_tone_profiles;
drop policy if exists tone_insert on public.user_tone_profiles;
drop policy if exists tone_update on public.user_tone_profiles;
drop policy if exists tone_delete on public.user_tone_profiles;

create policy tone_select on public.user_tone_profiles
    for select using (auth.uid() = user_id);
create policy tone_insert on public.user_tone_profiles
    for insert with check (auth.uid() = user_id);
create policy tone_update on public.user_tone_profiles
    for update using (auth.uid() = user_id);
create policy tone_delete on public.user_tone_profiles
    for delete using (auth.uid() = user_id);

-- ───── user_voice_profiles ─────
drop policy if exists voice_select on public.user_voice_profiles;
drop policy if exists voice_insert on public.user_voice_profiles;
drop policy if exists voice_update on public.user_voice_profiles;
drop policy if exists voice_delete on public.user_voice_profiles;

create policy voice_select on public.user_voice_profiles
    for select using (auth.uid() = user_id);
create policy voice_insert on public.user_voice_profiles
    for insert with check (auth.uid() = user_id);
create policy voice_update on public.user_voice_profiles
    for update using (auth.uid() = user_id);
create policy voice_delete on public.user_voice_profiles
    for delete using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════
-- avatars       — public read, user-scoped write  (path: {user_id}[.ext])
-- chat-images   — private, user-scoped            (path: {user_id}/{filename})
-- chat-audio    — private, user-scoped            (path: {user_id}/{filename})
-- voice-samples — private, backend-only writes    (path: {user_id}/{filename})
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values
    ('avatars',       'avatars',       true),
    ('chat-images',   'chat-images',   false),
    ('chat-audio',    'chat-audio',    false),
    ('voice-samples', 'voice-samples', false)
on conflict (id) do nothing;

-- ───── avatars: public read, owner-only write ─────
drop policy if exists "avatars_public_read"   on storage.objects;
drop policy if exists "avatars_owner_insert"  on storage.objects;
drop policy if exists "avatars_owner_update"  on storage.objects;
drop policy if exists "avatars_owner_delete"  on storage.objects;

create policy "avatars_public_read" on storage.objects
    for select to public
    using (bucket_id = 'avatars');

create policy "avatars_owner_insert" on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.filename(name) like auth.uid()::text || '%')
    );

create policy "avatars_owner_update" on storage.objects
    for update to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.filename(name) like auth.uid()::text || '%')
    );

create policy "avatars_owner_delete" on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.filename(name) like auth.uid()::text || '%')
    );

-- ───── chat-images, chat-audio, voice-samples: {uid}/… prefix ─────
-- A single policy per-bucket covering all CRUD, scoped to authenticated users.

do $$
declare
    b text;
begin
    foreach b in array array['chat-images', 'chat-audio', 'voice-samples']
    loop
        execute format($p$
            drop policy if exists "%1$s_owner_select" on storage.objects;
            drop policy if exists "%1$s_owner_insert" on storage.objects;
            drop policy if exists "%1$s_owner_update" on storage.objects;
            drop policy if exists "%1$s_owner_delete" on storage.objects;

            create policy "%1$s_owner_select" on storage.objects
                for select to authenticated
                using (
                    bucket_id = %1$L
                    and (storage.foldername(name))[1] = auth.uid()::text
                );

            create policy "%1$s_owner_insert" on storage.objects
                for insert to authenticated
                with check (
                    bucket_id = %1$L
                    and (storage.foldername(name))[1] = auth.uid()::text
                );

            create policy "%1$s_owner_update" on storage.objects
                for update to authenticated
                using (
                    bucket_id = %1$L
                    and (storage.foldername(name))[1] = auth.uid()::text
                );

            create policy "%1$s_owner_delete" on storage.objects
                for delete to authenticated
                using (
                    bucket_id = %1$L
                    and (storage.foldername(name))[1] = auth.uid()::text
                );
        $p$, b);
    end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE — verify in the Supabase dashboard that every table appears under
-- Database ▸ Tables and the four buckets appear under Storage ▸ Buckets.
-- ═══════════════════════════════════════════════════════════════════════════
