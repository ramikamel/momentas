-- Server-only persistence: clients have no table or RPC privileges.
create table public.memories (
 id uuid primary key, title text not null, author_name text not null, recipient_name text not null,
 story text not null, scene_plan jsonb, author_token_hash text not null,
 share_token_hash text unique, published_version_id uuid, published_caption text not null default '',
 published_title text not null default '', published_author_name text not null default '',
 published_recipient_name text not null default '', created_at timestamptz not null default now()
);
create table public.memory_versions (
 id uuid primary key, memory_id uuid not null references public.memories(id), parent_version_id uuid,
 image_path text not null unique, scene jsonb not null, instruction text, created_at timestamptz not null default now(),
 unique(memory_id,id), foreign key(memory_id,parent_version_id) references public.memory_versions(memory_id,id)
);
alter table public.memories add constraint published_version_ownership foreign key(id,published_version_id) references public.memory_versions(memory_id,id);
create table public.messages (
 id uuid primary key, memory_id uuid not null references public.memories(id), version_id uuid not null,
 role text not null check(role in ('recipient','storyteller')), display_name text not null, text text not null,
 parent_id uuid, created_at timestamptz not null default now(),
 unique(memory_id,version_id,id), foreign key(memory_id,version_id) references public.memory_versions(memory_id,id),
 foreign key(memory_id,version_id,parent_id) references public.messages(memory_id,version_id,id)
);
create table public.render_requests (
 id uuid primary key, memory_id uuid not null references public.memories(id),
 status text not null check(status in ('pending','complete','failed')),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 version_id uuid, foreign key(memory_id,version_id) references public.memory_versions(memory_id,id)
);
create index memory_versions_memory on public.memory_versions(memory_id,created_at);
create index messages_memory on public.messages(memory_id,created_at);
create index render_requests_memory on public.render_requests(memory_id,status);
alter table public.memories enable row level security;
alter table public.memory_versions enable row level security;
alter table public.messages enable row level security;
alter table public.render_requests enable row level security;
revoke all on public.memories,public.memory_versions,public.messages,public.render_requests from public,anon,authenticated;
grant select,insert,update,delete on public.memories,public.memory_versions,public.messages,public.render_requests to service_role;

create function public.reserve_render(p_memory_id uuid,p_request_id uuid,p_cap integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.render_requests; rendered public.memory_versions;
begin
 -- A single transaction lock makes the global budget check and insert atomic.
 perform pg_advisory_xact_lock(82402401);
 perform 1 from public.memories where id=p_memory_id for update;
 if not found then raise exception 'Memory not found'; end if;
 select * into prior from public.render_requests where id=p_request_id;
 if found then
  if prior.memory_id<>p_memory_id then raise exception 'Request belongs to another memory'; end if;
  if prior.status='complete' then
   select * into rendered from public.memory_versions where id=prior.version_id and memory_id=p_memory_id;
   return jsonb_build_object('kind','completed','version',to_jsonb(rendered));
  end if;
  raise exception 'Request already used';
 end if;
 if exists(select 1 from public.render_requests where memory_id=p_memory_id and status='pending' and expires_at>clock_timestamp()) then raise exception 'Render already pending'; end if;
 if p_cap is null or p_cap<1 or (select count(*) from public.render_requests)>=p_cap then raise exception 'Image request cap reached'; end if;
 insert into public.render_requests(id,memory_id,status,expires_at) values(p_request_id,p_memory_id,'pending',clock_timestamp()+interval '300 seconds');
 return jsonb_build_object('kind','reserved');
end $$;

create function public.complete_render(p_memory_id uuid,p_request_id uuid,p_version jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare reservation public.render_requests;
begin
 perform 1 from public.memories where id=p_memory_id for update;
 select * into reservation from public.render_requests where id=p_request_id and memory_id=p_memory_id for update;
 if not found or reservation.status<>'pending' or reservation.expires_at<=clock_timestamp() then raise exception 'Render reservation expired or inactive'; end if;
 if (p_version->>'memory_id')::uuid is distinct from p_memory_id then raise exception 'Version belongs to another memory'; end if;
 insert into public.memory_versions(id,memory_id,parent_version_id,image_path,scene,instruction,created_at)
 values((p_version->>'id')::uuid,p_memory_id,(p_version->>'parent_version_id')::uuid,p_version->>'image_path',p_version->'scene',p_version->>'instruction',(p_version->>'created_at')::timestamptz);
 update public.render_requests set status='complete',version_id=(p_version->>'id')::uuid where id=p_request_id;
end $$;

create function public.fail_render(p_memory_id uuid,p_request_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.memories where id=p_memory_id for update;
 update public.render_requests set status='failed' where id=p_request_id and memory_id=p_memory_id and status='pending';
end $$;

create function public.add_memory_message(p_message jsonb,p_expected_version uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version uuid;
begin
 select published_version_id into current_version from public.memories where id=(p_message->>'memory_id')::uuid for update;
 if not found then raise exception 'Memory not found'; end if;
 if p_expected_version is not null and current_version is distinct from p_expected_version then raise exception 'Published version changed'; end if;
 insert into public.messages(id,memory_id,version_id,role,display_name,text,parent_id,created_at)
 values((p_message->>'id')::uuid,(p_message->>'memory_id')::uuid,(p_message->>'version_id')::uuid,p_message->>'role',p_message->>'display_name',p_message->>'text',(p_message->>'parent_id')::uuid,(p_message->>'created_at')::timestamptz);
end $$;

create function public.update_memory(p_memory_id uuid,p_update jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.memories where id=p_memory_id for update;
 if not found then raise exception 'Memory not found'; end if;
 if p_update ? 'id' and (p_update->>'id')::uuid is distinct from p_memory_id then raise exception 'Cannot change memory ID'; end if;
 update public.memories set
 title=case when p_update ? 'title' then p_update->>'title' else title end,
 author_name=case when p_update ? 'author_name' then p_update->>'author_name' else author_name end,
 recipient_name=case when p_update ? 'recipient_name' then p_update->>'recipient_name' else recipient_name end,
 story=case when p_update ? 'story' then p_update->>'story' else story end,
 scene_plan=case when p_update ? 'scene_plan' then nullif(p_update->'scene_plan','null'::jsonb) else scene_plan end,
 author_token_hash=case when p_update ? 'author_token_hash' then p_update->>'author_token_hash' else author_token_hash end,
 share_token_hash=case when p_update ? 'share_token_hash' then p_update->>'share_token_hash' else share_token_hash end,
 published_version_id=case when p_update ? 'published_version_id' then (p_update->>'published_version_id')::uuid else published_version_id end,
 published_caption=case when p_update ? 'published_caption' then p_update->>'published_caption' else published_caption end,
 published_title=case when p_update ? 'published_title' then p_update->>'published_title' else published_title end,
 published_author_name=case when p_update ? 'published_author_name' then p_update->>'published_author_name' else published_author_name end,
 published_recipient_name=case when p_update ? 'published_recipient_name' then p_update->>'published_recipient_name' else published_recipient_name end,
 created_at=case when p_update ? 'created_at' then (p_update->>'created_at')::timestamptz else created_at end
 where id=p_memory_id;
end $$;

revoke all on function public.reserve_render(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.complete_render(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.fail_render(uuid,uuid) from public,anon,authenticated;
revoke all on function public.add_memory_message(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.update_memory(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_render(uuid,uuid,integer),public.complete_render(uuid,uuid,jsonb),public.fail_render(uuid,uuid),public.add_memory_message(jsonb,uuid),public.update_memory(uuid,jsonb) to service_role;
insert into storage.buckets(id,name,public,allowed_mime_types) values('memory-images','memory-images',false,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,allowed_mime_types=excluded.allowed_mime_types;
-- No storage.objects policies are created: only service-role requests can access this bucket.
