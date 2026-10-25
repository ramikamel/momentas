-- Private photographs a storyteller attaches so image generation can match a person or place.
create table if not exists public.memory_visual_references (
  id uuid primary key,
  memory_id uuid not null references public.memories(id),
  name text not null,
  kind text not null check (kind in ('person', 'place')),
  image_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists memory_visual_references_memory on public.memory_visual_references(memory_id, created_at);
alter table public.memory_visual_references enable row level security;
revoke all on public.memory_visual_references from public, anon, authenticated;
grant select, insert, update, delete on public.memory_visual_references to service_role;
