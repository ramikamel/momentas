-- Private named reference photos and cached per-version object maps.
create table if not exists public.memory_references (
 id uuid primary key,memory_id uuid not null references public.memories(id),
 label text not null check(length(label) between 1 and 80),data jsonb not null,created_at timestamptz not null default now()
);
create unique index if not exists memory_references_named on public.memory_references(memory_id,lower(label));
create table if not exists public.memory_object_maps (
 memory_id uuid not null,version_id uuid primary key,status text not null check(status in ('pending','complete','failed')),
 request_id uuid not null,expires_at timestamptz not null,data jsonb not null,
 foreign key(memory_id,version_id) references public.memory_versions(memory_id,id)
);
alter table public.memory_references enable row level security;
alter table public.memory_object_maps enable row level security;
revoke all on public.memory_references,public.memory_object_maps from public,anon,authenticated;
grant select,insert,update,delete on public.memory_references,public.memory_object_maps to service_role;
create or replace function public.save_memory_reference(p_reference jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare mid uuid:=(p_reference->>'memoryId')::uuid;
begin
 perform 1 from public.memories where id=mid for update;if not found then raise exception 'Memory not found';end if;
 if (select count(*) from public.memory_references where memory_id=mid)>=4 then raise exception 'Up to four reference photos';end if;
 if p_reference is null or jsonb_typeof(p_reference) is distinct from 'object' or p_reference->>'kind' is null or p_reference->>'label' is null or p_reference->>'kind' not in ('person','place','object') or length(trim(p_reference->>'label')) not between 1 and 80 then raise exception 'Invalid reference';end if;
 insert into public.memory_references(id,memory_id,label,data) values((p_reference->>'id')::uuid,mid,trim(p_reference->>'label'),p_reference);
end $$;
create or replace function public.claim_memory_object_map(p_memory_id uuid,p_version_id uuid,p_request_id uuid,p_retry boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.memory_object_maps;d jsonb;
begin
 perform 1 from public.memory_versions where memory_id=p_memory_id and id=p_version_id for update;if not found then raise exception 'Image not found';end if;
 select * into m from public.memory_object_maps where version_id=p_version_id for update;
 if found then
  if m.status='pending' and m.expires_at<=clock_timestamp() then update public.memory_object_maps set status='failed',data=jsonb_set(data,'{status}','"failed"') where version_id=p_version_id;m.status:='failed';m.data:=jsonb_set(m.data,'{status}','"failed"');end if;
  if m.status<>'failed' or not coalesce(p_retry,false) then return jsonb_build_object('claimed',false,'map',m.data);end if;
 end if;
 d:=jsonb_build_object('memoryId',p_memory_id,'versionId',p_version_id,'status','pending','objects','[]'::jsonb,'updatedAt',clock_timestamp());
 insert into public.memory_object_maps(memory_id,version_id,status,request_id,expires_at,data) values(p_memory_id,p_version_id,'pending',p_request_id,clock_timestamp()+interval '180 seconds',d)
 on conflict(version_id) do update set status='pending',request_id=excluded.request_id,expires_at=excluded.expires_at,data=excluded.data;
 return jsonb_build_object('claimed',true,'map',d);
end $$;
create or replace function public.save_memory_object_map(p_memory_id uuid,p_version_id uuid,p_request_id uuid,p_objects jsonb,p_status text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status is null or p_status not in ('complete','failed') or jsonb_typeof(p_objects) is distinct from 'array' or jsonb_array_length(p_objects)>30 then raise exception 'Invalid object map';end if;
 update public.memory_object_maps set status=p_status,data=jsonb_build_object('memoryId',p_memory_id,'versionId',p_version_id,'status',p_status,'objects',p_objects,'updatedAt',clock_timestamp()) where memory_id=p_memory_id and version_id=p_version_id and request_id=p_request_id and status='pending';
 if not found then raise exception 'Object map changed';end if;
end $$;
create or replace function public.reserve_detail_outline_batch(p_memory_id uuid,p_version_id uuid,p_request_ids uuid[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer:=cardinality(p_request_ids);rid uuid;
begin
 perform pg_advisory_xact_lock(82402403);
 perform 1 from public.memory_versions where memory_id=p_memory_id and id=p_version_id;if not found then raise exception 'Image not found';end if;
 if n is null or n not between 1 and 6 or (select count(distinct x) from unnest(p_request_ids) x)<>n or exists(select 1 from public.memory_outline_requests where id=any(p_request_ids)) then raise exception 'Invalid outline batch';end if;
 if (select count(*) from public.memory_outline_requests)+n>120 or (select count(*) from public.memory_outline_requests where version_id=p_version_id)+n>20 then raise exception 'Outline request cap reached';end if;
 if exists(select 1 from public.memory_outline_requests where version_id=p_version_id and status='pending' and expires_at>clock_timestamp()) then raise exception 'Outline already pending';end if;
 foreach rid in array p_request_ids loop insert into public.memory_outline_requests(id,memory_id,version_id,status,expires_at) values(rid,p_memory_id,p_version_id,'pending',clock_timestamp()+interval '180 seconds');end loop;
end $$;
revoke all on function public.save_memory_reference(jsonb),public.claim_memory_object_map(uuid,uuid,uuid,boolean),public.save_memory_object_map(uuid,uuid,uuid,jsonb,text),public.reserve_detail_outline_batch(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.save_memory_reference(jsonb),public.claim_memory_object_map(uuid,uuid,uuid,boolean),public.save_memory_object_map(uuid,uuid,uuid,jsonb,text),public.reserve_detail_outline_batch(uuid,uuid,uuid[]) to service_role;
