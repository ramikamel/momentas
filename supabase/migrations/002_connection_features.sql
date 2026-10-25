-- Additive connection features. Run once after 001. All data remains server-only.
begin;
alter table public.memories add column narration_id uuid, add column current_publication_id uuid;
create table public.memory_narrations (
 id uuid primary key, memory_id uuid not null references public.memories(id),
 audio_path text not null unique, data jsonb not null, created_at timestamptz not null default now(), unique(memory_id,id)
);
create table public.memory_publications (
 id uuid primary key, memory_id uuid not null references public.memories(id), version_id uuid not null,
 narration_id uuid, data jsonb not null, created_at timestamptz not null default now(),
 unique(memory_id,id), unique(memory_id,version_id,id),
 foreign key(memory_id,version_id) references public.memory_versions(memory_id,id),
 foreign key(memory_id,narration_id) references public.memory_narrations(memory_id,id)
);
alter table public.memories add foreign key(id,narration_id) references public.memory_narrations(memory_id,id),
 add foreign key(id,current_publication_id) references public.memory_publications(memory_id,id);
create table public.memory_version_pins (
 memory_id uuid not null, version_id uuid not null, pins jsonb not null default '[]',
 primary key(memory_id,version_id), foreign key(memory_id,version_id) references public.memory_versions(memory_id,id)
);
create table public.perspective_links (
 id uuid primary key, original_memory_id uuid not null unique references public.memories(id),
 original_publication_id uuid not null, contribution_memory_id uuid unique references public.memories(id),
 contribution_publication_id uuid, data jsonb not null,
 foreign key(original_memory_id,original_publication_id) references public.memory_publications(memory_id,id),
 foreign key(contribution_memory_id,contribution_publication_id) references public.memory_publications(memory_id,id),
 check(contribution_memory_id is null or contribution_memory_id<>original_memory_id)
);
create unique index perspective_invite_hash on public.perspective_links((data->>'inviteTokenHash'));
create unique index perspective_comparison_hash on public.perspective_links((data->>'comparisonTokenHash'));
create table public.connection_requests (
 id uuid primary key, kind text not null check(kind in ('voice','comparison')), resource_id uuid not null,
 status text not null check(status in ('pending','complete','failed')), expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index connection_requests_resource on public.connection_requests(kind,resource_id,status);
alter table public.messages add column publication_id uuid, add column pin_id uuid,
 add foreign key(memory_id,version_id,publication_id) references public.memory_publications(memory_id,version_id,id);
-- Backfill existing published memories without altering any share capability.
do $$ declare m public.memories; pid uuid; begin
 for m in select * from public.memories where published_version_id is not null loop
  pid:=gen_random_uuid();
  insert into public.memory_publications(id,memory_id,version_id,data) values(pid,m.id,m.published_version_id,
   jsonb_build_object('id',pid,'memoryId',m.id,'versionId',m.published_version_id,'title',m.published_title,'authorName',m.published_author_name,'recipientName',m.published_recipient_name,'caption',m.published_caption,'pins','[]'::jsonb,'narrationId',null,'createdAt',m.created_at));
  update public.memories set current_publication_id=pid where id=m.id;
 end loop;
end $$;

create function public.connection_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.memories; p public.memory_publications; l public.perspective_links;
 n public.memory_narrations; r public.connection_requests; parent public.messages;
 mid uuid; vid uuid; nid uuid; pid uuid; rid uuid; request_id uuid; request_kind text; cap integer;
 v_payload jsonb; result jsonb; pins jsonb; pin jsonb; scene jsonb; detail jsonb; parts text[]; target uuid;
begin
 -- One short transaction serializes check+write operations, including global budgets.
 perform pg_advisory_xact_lock(82402402);
 if p_action='publish' then
  mid:=(p_data->>'memoryId')::uuid; vid:=(p_data->>'versionId')::uuid;
  select * into m from public.memories where id=mid for update; if not found then raise exception 'Memory not found'; end if;
  perform 1 from public.memory_versions where memory_id=mid and id=vid; if not found then raise exception 'Version not found'; end if;
  nid:=case when (p_data->>'includeNarration')::boolean then m.narration_id else null end;
  if nid is not null then perform 1 from public.memory_narrations where id=nid and memory_id=mid; if not found then raise exception 'Invalid narration ownership'; end if; end if;
  select coalesce(jsonb_agg(x-'detailPath'),'[]'::jsonb) into pins from public.memory_version_pins v cross join lateral jsonb_array_elements(v.pins) x where v.memory_id=mid and v.version_id=vid;
  pid:=gen_random_uuid();v_payload:=jsonb_build_object('id',pid,'memoryId',mid,'versionId',vid,'title',m.title,'authorName',m.author_name,'recipientName',m.recipient_name,'caption',p_data->>'caption','pins',pins,'narrationId',nid,'createdAt',clock_timestamp());
  insert into public.memory_publications(id,memory_id,version_id,narration_id,data) values(pid,mid,vid,nid,v_payload);
  update public.memories set current_publication_id=pid,published_version_id=vid,published_caption=p_data->>'caption',published_title=m.title,published_author_name=m.author_name,published_recipient_name=m.recipient_name,share_token_hash=p_data->>'shareTokenHash' where id=mid;
  return v_payload;
 elsif p_action='pins' then
  mid:=(p_data->>'memoryId')::uuid;vid:=(p_data->>'versionId')::uuid;pins:=p_data->'pins';
  select v.scene->'plan' into scene from public.memory_versions v where v.memory_id=mid and v.id=vid; if not found then raise exception 'Version not found'; end if;
  if jsonb_typeof(pins)<>'array' or jsonb_array_length(pins)>5 then raise exception 'Too many or invalid pins'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(pins) x)<>jsonb_array_length(pins) then raise exception 'Invalid duplicate pins'; end if;
  for pin in select * from jsonb_array_elements(pins) loop
   if (pin->>'detailPath') !~ '^(setting|perspective|(people|details|feelings)\.[0-9]+)$' then raise exception 'Invalid detail path'; end if;
   parts:=string_to_array(pin->>'detailPath','.');detail:=scene#>parts;
   if jsonb_typeof(pin->'x') is distinct from 'number' or jsonb_typeof(pin->'y') is distinct from 'number' or (pin->>'x')::numeric not between 0 and 1 or (pin->>'y')::numeric not between 0 and 1 then raise exception 'Invalid pin position'; end if;
   if detail is null or coalesce(length(pin->>'sourceQuote'),0) not between 1 and 500 or strpos(detail->>'sourceQuote',pin->>'sourceQuote')=0 or detail->>'text' is distinct from pin->>'label' then raise exception 'Invalid quote or label'; end if;
   perform (pin->>'id')::uuid;
  end loop;
  insert into public.memory_version_pins(memory_id,version_id,pins) values(mid,vid,pins) on conflict(memory_id,version_id) do update set pins=excluded.pins;
  return pins;
 elsif p_action='narration' then
  v_payload:=p_data->'narration';nid:=(v_payload->>'id')::uuid;mid:=(v_payload->>'memoryId')::uuid;
  if (v_payload->>'durationMs')::numeric not between 1000 and 60000 or v_payload->>'audioPath' !~ ('^'||mid::text||'/[a-zA-Z0-9_-]+\.wav$') or v_payload->>'transcriptionStatus'<>'idle' or v_payload->'transcript'<>'null'::jsonb then raise exception 'Invalid narration'; end if;
  insert into public.memory_narrations(id,memory_id,audio_path,data) values(nid,mid,v_payload->>'audioPath',v_payload);
  return v_payload;
 elsif p_action='link' then
  v_payload:=p_data->'link';mid:=(v_payload->>'originalMemoryId')::uuid;
  select * into l from public.perspective_links where original_memory_id=mid; if found then return l.data; end if;
  pid:=(v_payload->>'originalPublicationId')::uuid;
  perform 1 from public.memories where id=mid and current_publication_id=pid; if not found then raise exception 'Publication changed'; end if;
  if coalesce(length(v_payload->>'eventLabel'),0) not between 1 and 120 then raise exception 'Invalid event label'; end if;
  insert into public.perspective_links(id,original_memory_id,original_publication_id,data) values((v_payload->>'id')::uuid,mid,pid,v_payload); return v_payload;
 elsif p_action='claim' then
  rid:=(p_data->>'linkId')::uuid;select * into l from public.perspective_links where id=rid for update; if not found then raise exception 'Perspective not found'; end if;
  if l.contribution_memory_id is not null then return to_jsonb(l.contribution_memory_id); end if;
  v_payload:=p_data->'candidateMemory';mid:=(v_payload->>'id')::uuid;
  insert into public.memories(id,title,author_name,recipient_name,story,scene_plan,author_token_hash) values(mid,v_payload->>'title',v_payload->>'authorName',v_payload->>'recipientName','',null,v_payload->>'authorTokenHash');
  update public.perspective_links set contribution_memory_id=mid,data=jsonb_set(data,'{contributionMemoryId}',to_jsonb(mid)) where id=rid;return to_jsonb(mid);
 elsif p_action='attach' then
  rid:=(p_data->>'linkId')::uuid;mid:=(p_data->>'memoryId')::uuid;pid:=(p_data->>'publicationId')::uuid;
  select * into l from public.perspective_links where id=rid for update; if not found then raise exception 'Perspective not found'; end if;
  if l.contribution_memory_id is distinct from mid then raise exception 'Invalid contribution ownership'; end if;
  if l.contribution_publication_id is not null then if l.contribution_publication_id<>pid then raise exception 'Comparison is frozen'; end if;return 'null';end if;
  perform 1 from public.memories where id=mid and current_publication_id=pid; if not found then raise exception 'Publication changed'; end if;
  update public.perspective_links set contribution_publication_id=pid,data=jsonb_set(data,'{contributionPublicationId}',to_jsonb(pid)) where id=rid;return 'null';
 elsif p_action in ('reserve','complete','fail') then
  request_kind:=p_data->>'kind';target:=(p_data->>'resourceId')::uuid;request_id:=(p_data->>'requestId')::uuid;
  if request_kind='voice' then select * into n from public.memory_narrations where id=target for update;
  elsif request_kind='comparison' then select * into l from public.perspective_links where id=target for update;
  else raise exception 'Invalid request kind';end if;
  if not found then raise exception 'Resource not found';end if;
  select * into r from public.connection_requests where id=request_id for update;
  if p_action='reserve' then
   if found then if r.kind<>request_kind or r.resource_id<>target then raise exception 'Request belongs to another resource';end if;if r.status='complete' then return '"completed"';end if;raise exception 'Request already used';end if;
   if request_kind='voice' and n.data->'transcript'<>'null'::jsonb then raise exception 'Transcript already complete';end if;
   if request_kind='comparison' and l.contribution_publication_id is null then raise exception 'Comparison not ready';end if;
   cap:=(p_data->>'cap')::integer;
   if cap is null or cap<1 or (select count(*) from public.connection_requests c where c.kind=request_kind)>=cap then raise exception 'Connection request cap reached';end if;
   if exists(select 1 from public.connection_requests c where c.kind=request_kind and resource_id=target and status='pending' and expires_at>clock_timestamp()) then raise exception 'Request already pending';end if;
   insert into public.connection_requests(id,kind,resource_id,status,expires_at) values(request_id,request_kind,target,'pending',clock_timestamp()+interval '300 seconds');
   if request_kind='voice' then update public.memory_narrations set data=jsonb_set(data,'{transcriptionStatus}','"pending"') where id=target;else update public.perspective_links set data=jsonb_set(data,'{synthesisStatus}','"pending"') where id=target;end if;
   return '"reserved"';
  end if;
  if not found or r.kind<>request_kind or r.resource_id<>target or r.status<>'pending' then raise exception 'Reservation inactive';end if;
  if p_action='fail' then
   update public.connection_requests set status='failed' where id=request_id;
   if request_kind='voice' then update public.memory_narrations set data=jsonb_set(data,'{transcriptionStatus}','"failed"') where id=target;else update public.perspective_links set data=jsonb_set(data,'{synthesisStatus}','"failed"') where id=target;end if;return 'null';
  end if;
  if r.expires_at<=clock_timestamp() then raise exception 'Reservation expired';end if;
  result:=p_data->'result';
  if request_kind='voice' then
   if jsonb_typeof(result->'transcript')<>'string' or coalesce(length(result->>'transcript'),0)=0 or n.data->'transcript'<>'null'::jsonb then raise exception 'Invalid transcript';end if;
   update public.memory_narrations set data=data||jsonb_build_object('transcript',result->>'transcript','transcriptionStatus','complete') where id=target;
  else
   if l.contribution_publication_id is null or jsonb_typeof(result->'synthesis')<>'object' then raise exception 'Invalid comparison';end if;
   update public.perspective_links set data=data||jsonb_build_object('synthesis',result->'synthesis','synthesisStatus','complete') where id=target;
  end if;
  update public.connection_requests set status='complete' where id=request_id;return 'null';
 elsif p_action='message' then
  v_payload:=p_data->'message';pid:=(p_data->'guard'->>'publicationId')::uuid;
  select * into p from public.memory_publications where id=pid;
  if not found or p.memory_id<>(v_payload->>'memoryId')::uuid or p.version_id<>(v_payload->>'versionId')::uuid or pid is distinct from (v_payload->>'publicationId')::uuid then raise exception 'Invalid message publication';end if;
  if p_data->'guard'->>'kind'='current' then
   perform 1 from public.memories where id=p.memory_id and current_publication_id=pid for update;if not found then raise exception 'Publication changed';end if;
  elsif p_data->'guard'->>'kind'='comparison' then
   select * into l from public.perspective_links where id=(p_data->'guard'->>'linkId')::uuid;
   if not found or l.contribution_publication_id is null or pid not in (l.original_publication_id,l.contribution_publication_id) then raise exception 'Publication outside comparison';end if;
  else raise exception 'Invalid message guard';end if;
  if v_payload->>'pinId' is not null and not exists(select 1 from jsonb_array_elements(p.data->'pins') x where x->>'id'=v_payload->>'pinId') then raise exception 'Pin not found';end if;
  insert into public.messages(id,memory_id,version_id,publication_id,pin_id,role,display_name,text,parent_id,created_at) values((v_payload->>'id')::uuid,p.memory_id,p.version_id,pid,(v_payload->>'pinId')::uuid,v_payload->>'role',v_payload->>'displayName',v_payload->>'text',(v_payload->>'parentId')::uuid,(v_payload->>'createdAt')::timestamptz);return 'null';
 end if;
 raise exception 'Invalid connection action';
end $$;
-- Extend the existing draft update safely; keep all legacy fields and immutable owner ID.
create or replace function public.update_memory(p_memory_id uuid,p_update jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.memories where id=p_memory_id for update;if not found then raise exception 'Memory not found';end if;
 if p_update ? 'id' and (p_update->>'id')::uuid is distinct from p_memory_id then raise exception 'Cannot change memory ID';end if;
 update public.memories set
 title=case when p_update ? 'title' then p_update->>'title' else title end,
 author_name=case when p_update ? 'author_name' then p_update->>'author_name' else author_name end,
 recipient_name=case when p_update ? 'recipient_name' then p_update->>'recipient_name' else recipient_name end,
 story=case when p_update ? 'story' then p_update->>'story' else story end,
 scene_plan=case when p_update ? 'scene_plan' then nullif(p_update->'scene_plan','null'::jsonb) else scene_plan end,
 narration_id=case when p_update ? 'narration_id' then (p_update->>'narration_id')::uuid else narration_id end,
 published_version_id=case when p_update ? 'published_version_id' then (p_update->>'published_version_id')::uuid else published_version_id end,
 published_caption=case when p_update ? 'published_caption' then p_update->>'published_caption' else published_caption end,
 published_title=case when p_update ? 'published_title' then p_update->>'published_title' else published_title end,
 published_author_name=case when p_update ? 'published_author_name' then p_update->>'published_author_name' else published_author_name end,
 published_recipient_name=case when p_update ? 'published_recipient_name' then p_update->>'published_recipient_name' else published_recipient_name end,
 share_token_hash=case when p_update ? 'share_token_hash' then p_update->>'share_token_hash' else share_token_hash end
 where id=p_memory_id;
end $$;
create or replace function public.add_memory_message(p_message jsonb,p_expected_version uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version uuid; par public.messages;begin
 select published_version_id into current_version from public.memories where id=(p_message->>'memory_id')::uuid for update;
 if not found then raise exception 'Memory not found';end if;
 if p_expected_version is not null and current_version is distinct from p_expected_version then raise exception 'Published version changed';end if;
 if p_message->>'parent_id' is not null then
  select * into par from public.messages where id=(p_message->>'parent_id')::uuid and memory_id=(p_message->>'memory_id')::uuid and version_id=(p_message->>'version_id')::uuid;
  if not found or par.publication_id is distinct from (p_message->>'publication_id')::uuid or par.pin_id is distinct from (p_message->>'pin_id')::uuid then raise exception 'Invalid reply context';end if;
 end if;
 insert into public.messages(id,memory_id,version_id,role,display_name,text,parent_id,created_at,publication_id,pin_id) values((p_message->>'id')::uuid,(p_message->>'memory_id')::uuid,(p_message->>'version_id')::uuid,p_message->>'role',p_message->>'display_name',p_message->>'text',(p_message->>'parent_id')::uuid,(p_message->>'created_at')::timestamptz,(p_message->>'publication_id')::uuid,(p_message->>'pin_id')::uuid);
end $$;
alter table public.memory_publications enable row level security;
alter table public.memory_narrations enable row level security;
alter table public.memory_version_pins enable row level security;
alter table public.perspective_links enable row level security;
alter table public.connection_requests enable row level security;
revoke all on public.memory_publications,public.memory_narrations,public.memory_version_pins,public.perspective_links,public.connection_requests from public,anon,authenticated;
grant select,insert,update,delete on public.memory_publications,public.memory_narrations,public.memory_version_pins,public.perspective_links,public.connection_requests to service_role;
revoke all on function public.connection_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.connection_action(text,jsonb) to service_role;
insert into storage.buckets(id,name,public,allowed_mime_types) values('memory-audio','memory-audio',false,array['audio/wav']) on conflict(id) do update set public=false,allowed_mime_types=excluded.allowed_mime_types;
commit;
