-- Enable pgvector extension
create extension if not exists vector;

-- Documents table for RAG
create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  content    text not null,
  embedding  vector(1536),
  source     text,
  created_at timestamptz not null default now()
);

-- IVFFlat index for fast cosine similarity search
create index if not exists documents_embedding_idx
  on public.documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.documents enable row level security;

-- RLS: service role bypasses this; anon/authed users can only see their own docs
create policy "Users see own documents"
  on public.documents for select
  using (user_id = auth.uid());

-- Similarity search function called via supabase.rpc()
create or replace function match_documents(
  query_embedding vector(1536),
  match_count     int     default 3,
  filter_user_id  uuid    default null,
  min_similarity  float   default 0.5
)
returns table (
  id         uuid,
  content    text,
  source     text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    source,
    1 - (embedding <=> query_embedding) as similarity
  from public.documents
  where
    embedding is not null
    and (filter_user_id is null or user_id = filter_user_id)
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count;
$$;
