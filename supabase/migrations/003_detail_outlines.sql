-- Durable, server-only budget for paid SAM calls. Existing memories/pins are unchanged.
create table if not exists public.memory_outline_requests (
 id uuid primary key, memory_id uuid not null, version_id uuid not null,
 status text not null check(status in ('pending','complete','failed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 foreign key(memory_id,version_id) references public.memory_versions(memory_id,id)
);
create index if not exists memory_outline_requests_version on public.memory_outline_requests(version_id,status);
alter table public.memory_outline_requests enable row level security;
revoke all on public.memory_outline_requests from public,anon,authenticated;
grant select,insert,update,delete on public.memory_outline_requests to service_role;
create or replace function public.reserve_detail_outline(p_memory_id uuid,p_version_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(82402403);
 perform 1 from public.memory_versions where memory_id=p_memory_id and id=p_version_id;
 if not found then raise exception 'Image not found';end if;
 if exists(select 1 from public.memory_outline_requests where id=p_request_id) then raise exception 'Outline request already used';end if;
 if (select count(*) from public.memory_outline_requests)>=120 or
    (select count(*) from public.memory_outline_requests where version_id=p_version_id)>=20 then raise exception 'Outline request cap reached';end if;
 if exists(select 1 from public.memory_outline_requests where version_id=p_version_id and status='pending' and expires_at>clock_timestamp()) then raise exception 'Outline already pending';end if;
 insert into public.memory_outline_requests(id,memory_id,version_id,status,expires_at) values(p_request_id,p_memory_id,p_version_id,'pending',clock_timestamp()+interval '120 seconds');
end $$;
create or replace function public.finish_detail_outline(p_memory_id uuid,p_version_id uuid,p_request_id uuid,p_success boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.memory_outline_requests set status=case when p_success then 'complete' else 'failed' end where id=p_request_id and memory_id=p_memory_id and version_id=p_version_id and status='pending';
end $$;
revoke all on function public.reserve_detail_outline(uuid,uuid,uuid),public.finish_detail_outline(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_detail_outline(uuid,uuid,uuid),public.finish_detail_outline(uuid,uuid,uuid,boolean) to service_role;
