-- Preserve the original context of uploaded recordings across interrupted transcription.
-- Replaces only the private composer RPC; no existing memories or clips are removed.
create or replace function public.photo_context_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare mid uuid:=(p_data->>'memoryId')::uuid;vid uuid:=(p_data->>'versionId')::uuid;inp jsonb:=p_data->'input';prior jsonb;next_data jsonb;key text:=inp->>'key';rev integer:=(inp->>'revision')::integer;txt text;rid text:=p_data->>'requestId';narr text:=inp->>'narrationId';recording text:=inp->>'recordingId';
begin
 perform 1 from public.memory_versions where memory_id=mid and id=vid and origin='source' for update;
 if not found then raise exception 'Source not found';end if;
 if p_action='list' then return coalesce((select jsonb_agg(data order by context_key) from public.memory_photo_contexts where memory_id=mid and version_id=vid),'[]');
 elsif p_action='save' then
  if key is null or not(key='story' or key ~ '^note:[0-9a-f-]{36}$') or rev is null or rev<0 or inp->>'text' is null or (inp->>'questionIndex')::integer not between 0 and 3 then raise exception 'Invalid context';end if;
  select data into prior from public.memory_photo_contexts where version_id=vid and context_key=key;
  if narr is not null and coalesce(prior->'appliedNarrations','[]') ? narr then return prior;end if;
  if coalesce((prior->>'revision')::integer,0)<>rev then raise exception 'Context changed';end if;
  if prior is null and (select count(*) from public.memory_photo_contexts where version_id=vid)>=16 then raise exception 'Too many contexts';end if;
  if recording is not null and not exists(select 1 from public.memory_narrations where memory_id=mid and id=recording::uuid) then raise exception 'Invalid recording';end if;
  txt:=rtrim(inp->>'text');
  if narr is not null then
   if not exists(select 1 from public.memory_narrations where memory_id=mid and id=narr::uuid and data->>'transcriptionStatus'='complete' and data->>'transcript'=inp->>'transcript') then raise exception 'Invalid recording';end if;
   txt:=concat_ws(E'\n\n',nullif(txt,''),nullif(btrim(inp->>'transcript'),''));
  end if;
  if length(txt)>(case when key='story' then 6000 else 500 end) then raise exception 'Text too long';end if;
  next_data:=jsonb_build_object('key',key,'revision',rev+1,'text',txt,'questionIndex',(inp->>'questionIndex')::integer,'appliedNarrations',coalesce(prior->'appliedNarrations','[]')||case when narr is null then '[]'::jsonb else jsonb_build_array(narr) end);
  if narr is null and coalesce(recording,prior->>'pendingNarrationId') is not null then next_data:=next_data||jsonb_build_object('pendingNarrationId',coalesce(recording,prior->>'pendingNarrationId'));end if;
  if inp ? 'region' then next_data:=next_data||jsonb_build_object('region',inp->'region');end if;
  if coalesce(narr,prior->>'narrationId') is not null then next_data:=next_data||jsonb_build_object('narrationId',coalesce(narr,prior->>'narrationId'));end if;
  insert into public.memory_photo_contexts values(mid,vid,key,next_data) on conflict(version_id,context_key) do update set data=excluded.data;
  if key='story' then update public.memories set story=txt,narration_id=coalesce((next_data->>'narrationId')::uuid,narration_id) where id=mid;end if;
  return next_data;
 elsif p_action='questions' then
  select data into prior from public.memory_photo_questions where version_id=vid;
  if prior->>'status'='pending' and (prior->>'expiresAt')::numeric <= extract(epoch from clock_timestamp())*1000 then prior:=prior||'{"status":"failed"}';end if;
  return prior;
 elsif p_action='claim' then
  select data into prior from public.memory_photo_questions where version_id=vid;
  if prior is not null and not(coalesce((p_data->>'retry')::boolean,false) and (prior->>'status'='failed' or (prior->>'status'='pending' and (prior->>'expiresAt')::numeric <= extract(epoch from clock_timestamp())*1000))) then return 'false';end if;
  next_data:=jsonb_build_object('status','pending','questions','[]'::jsonb,'requestId',rid,'expiresAt',extract(epoch from clock_timestamp()+interval '90 seconds')*1000);
  insert into public.memory_photo_questions values(mid,vid,next_data) on conflict(version_id) do update set data=excluded.data;
  return 'true';
 elsif p_action='finish' then
  update public.memory_photo_questions set data=data||jsonb_build_object('status',case when (p_data->>'failed')::boolean then 'failed' else 'complete' end,'questions',p_data->'questions') where version_id=vid and data->>'requestId'=rid and data->>'status'='pending';
  if not found then raise exception 'Questions changed';end if;return 'null';
 else raise exception 'Unknown context action';end if;
end $$;
revoke all on function public.photo_context_action(text,jsonb) from public,anon,authenticated;
grant execute on function public.photo_context_action(text,jsonb) to service_role;
