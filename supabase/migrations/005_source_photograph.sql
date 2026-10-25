-- Private immutable source photographs. Apply only after migration004 review.
alter table public.memory_versions add column if not exists origin text not null default 'generated' check (origin in ('source','generated'));
create table public.source_uploads (
 id uuid primary key,
 memory_id uuid not null references public.memories(id) on delete cascade,
 record jsonb not null,
 created_at timestamptz not null default now(),
 check (record->>'id'=id::text and record->>'memoryId'=memory_id::text),
 check (record->>'status' in ('pending','validating','ready','failed'))
);
create table public.source_photos (
 memory_id uuid primary key references public.memories(id) on delete cascade,
 version_id uuid unique not null references public.memory_versions(id),
 record jsonb not null,
 check (record->>'memoryId'=memory_id::text and record->>'versionId'=version_id::text)
);
alter table public.source_uploads enable row level security;
alter table public.source_photos enable row level security;
revoke all on public.source_uploads, public.source_photos from anon, authenticated;
grant all on public.source_uploads, public.source_photos to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('memory-sources','memory-sources',false,12582912,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=12582912,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.source_claim(p_mid uuid,p_id uuid,p_claim uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u jsonb; ms bigint:=floor(extract(epoch from clock_timestamp())*1000);
begin
 select record into u from source_uploads where memory_id=p_mid and id=p_id for update;
 if u is null then raise exception 'Upload not found'; end if;
 if u->>'status'='ready' then return u; end if;
 if (u->>'expiresAt')::bigint<=ms then raise exception 'Upload expired'; end if;
 if u->>'status'='validating' and (u->>'claimExpiresAt')::bigint>ms then raise exception 'Upload pending'; end if;
 u:=u||jsonb_build_object('status','validating','claimId',p_claim,'claimExpiresAt',ms+120000);
 update source_uploads set record=u where id=p_id; return u;
end $$;
create or replace function public.source_finish(p_mid uuid,p_id uuid,p_claim uuid,p_source jsonb,p_version jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u jsonb; ms bigint:=floor(extract(epoch from clock_timestamp())*1000);
begin
 -- Memory lock serializes adoption by independent upload IDs.
 perform 1 from memories where id=p_mid for update;
 select record into u from source_uploads where memory_id=p_mid and id=p_id for update;
 if u->>'status'='ready' then return u->'version'; end if;
 if u is null or u->>'status' is distinct from 'validating' or u->>'claimId' is distinct from p_claim::text or coalesce((u->>'claimExpiresAt')::bigint,0)<=ms then raise exception 'Upload claim inactive'; end if;
 if exists(select 1 from source_photos where memory_id=p_mid) then raise exception 'Source already exists'; end if;
 if p_source->>'id' is distinct from p_id::text or p_source->>'memoryId' is distinct from p_mid::text or p_source->>'versionId' is distinct from p_id::text or p_version->>'id' is distinct from p_id::text or p_version->>'memoryId' is distinct from p_mid::text or p_version->>'origin' is distinct from 'source' or p_version->>'imagePath' is distinct from p_source->>'displayPath' or p_source->>'originalPath' is distinct from u->>'originalPath' then raise exception 'Invalid source'; end if;
 insert into memory_versions(id,memory_id,parent_version_id,image_path,scene,instruction,created_at,origin)
 values(p_id,p_mid,null,p_version->>'imagePath',p_version->'scene',null,(p_version->>'createdAt')::timestamptz,'source');
 insert into source_photos(memory_id,version_id,record) values(p_mid,p_id,p_source);
 update source_uploads set record=u||jsonb_build_object('status','ready','source',p_source,'version',p_version) where id=p_id;
 return p_version;
end $$;
create or replace function public.source_fail(p_mid uuid,p_id uuid,p_claim uuid) returns void language sql security definer set search_path=public as $$
 update source_uploads set record=record||'{"status":"failed"}'::jsonb where memory_id=p_mid and id=p_id and record->>'claimId'=p_claim::text and record->>'status'='validating';
$$;
revoke all on function public.source_claim(uuid,uuid,uuid),public.source_finish(uuid,uuid,uuid,jsonb,jsonb),public.source_fail(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.source_claim(uuid,uuid,uuid),public.source_finish(uuid,uuid,uuid,jsonb,jsonb),public.source_fail(uuid,uuid,uuid) to service_role;
-- Original objects deliberately have no public, authenticated, or publication read policy.
-- Failed/expired unadopted objects are retained; deletion requires grace + reference checks.

create or replace function public.source_expired(p_mid uuid,p_before bigint) returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(u.record),'[]'::jsonb) from source_uploads u
 where u.memory_id=p_mid and (u.record->>'expiresAt')::bigint<p_before
 and (u.record->>'expiresAt')::bigint<floor(extract(epoch from clock_timestamp())*1000)-86400000
 and u.record->>'status'<>'ready'
 and not exists(select 1 from source_photos p where p.record->>'originalPath'=u.record->>'originalPath' or p.version_id=u.id);
$$;
revoke all on function public.source_expired(uuid,bigint) from public,anon,authenticated;
grant execute on function public.source_expired(uuid,bigint) to service_role;
