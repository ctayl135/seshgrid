alter table public.feed_posts add column kind text not null default 'song' check(kind in ('song','beat'));
alter table public.feed_posts add column bpm integer check(bpm between 30 and 300);
alter table public.feed_posts add column license_notes text not null default 'Contact the producer for usage permission.' check(char_length(license_notes)<=300);
alter table public.feed_posts add column allow_session_use boolean not null default false;
alter table public.feed_posts add column duration numeric check(duration>0 and duration<=240);
alter table public.projects add column revision integer not null default 0;
create table public.collaborators(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 invited_by uuid not null references auth.users(id) on delete cascade, member_id uuid not null references public.artist_profiles(id) on delete cascade,
 project_name text not null,role text not null check(role in ('viewer','editor')),status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
 created_at timestamptz not null default now(),unique(project_id,member_id),check(invited_by<>member_id)
);
alter table public.collaborators enable row level security;
grant select on public.collaborators to authenticated;
create policy "Participants read invitations" on public.collaborators for select to authenticated using((select auth.uid()) in (invited_by,member_id));
create function public.project_access(p_id uuid,p_write boolean default false) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from projects p where p.id=p_id and (p.owner_id=auth.uid() or exists(select 1 from collaborators c where c.project_id=p.id and c.member_id=auth.uid() and c.status='accepted' and (not p_write or c.role='editor'))));
$$;
revoke all on function public.project_access(uuid,boolean) from public,anon;grant execute on function public.project_access(uuid,boolean) to authenticated;
drop policy "Owners read projects" on public.projects;
create policy "Owners read projects" on public.projects for select to authenticated using(public.project_access(id,false));
drop policy "Owners update projects" on public.projects;
create policy "Owners update projects" on public.projects for update to authenticated using(public.project_access(id,true)) with check(public.project_access(id,true));
create function public.keep_project_owner() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if new.owner_id<>old.owner_id then raise exception 'Project ownership cannot change';end if;return new;end$$;
create trigger fixed_project_owner before update on public.projects for each row execute function public.keep_project_owner();
drop policy "Owners read audio" on storage.objects;
create policy "Owners read audio" on storage.objects for select to authenticated using(bucket_id='project-audio' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.projects p where p.id::text=(storage.foldername(name))[2] and p.owner_id::text=(storage.foldername(name))[1] and public.project_access(p.id,false))));
drop policy "Owners upload audio" on storage.objects;
create policy "Owners upload audio" on storage.objects for insert to authenticated with check(bucket_id='project-audio' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.projects p where p.id::text=(storage.foldername(name))[2] and p.owner_id::text=(storage.foldername(name))[1] and public.project_access(p.id,true))));
create table public.direct_messages(id uuid primary key default gen_random_uuid(),sender_id uuid not null references public.artist_profiles(id) on delete cascade,recipient_id uuid not null references public.artist_profiles(id) on delete cascade,body text not null check(char_length(trim(body)) between 1 and 2000),created_at timestamptz not null default now(),read_at timestamptz,check(sender_id<>recipient_id));
alter table public.direct_messages enable row level security;
grant select,insert on public.direct_messages to authenticated;
create policy "Participants read messages" on public.direct_messages for select to authenticated using((select auth.uid()) in(sender_id,recipient_id));
create policy "Artists send own messages" on public.direct_messages for insert to authenticated with check((select auth.uid())=sender_id and read_at is null);
create index messages_inbox on public.direct_messages(recipient_id,created_at desc);
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,title text not null,link text not null,invite_id uuid references public.collaborators(id) on delete cascade,created_at timestamptz not null default now(),read_at timestamptz);
alter table public.notifications enable row level security;grant select on public.notifications to authenticated;
create policy "Owners read notifications" on public.notifications for select to authenticated using((select auth.uid())=user_id);
create index notifications_inbox on public.notifications(user_id,created_at desc);
create function public.message_notice() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if (select count(*) from direct_messages where sender_id=auth.uid() and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before sending more messages';end if;
 new.created_at=now();new.read_at=null;
 insert into notifications(user_id,title,link) values(new.recipient_id,'Message from '||(select display_name from artist_profiles where id=new.sender_id),'/messages?artist='||new.sender_id::text);return new;end$$;
create trigger notify_message before insert on public.direct_messages for each row execute function public.message_notice();
create function public.invite_collaborator(p_project uuid,p_member uuid,p_role text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare owner uuid;title text;inv uuid;begin
 select owner_id,name into owner,title from projects where id=p_project;
 if owner is null or owner<>auth.uid() or p_member=owner or p_role not in('viewer','editor') then raise exception 'Only the owner can invite collaborators';end if;
 insert into collaborators(project_id,invited_by,member_id,project_name,role) values(p_project,owner,p_member,title,p_role) on conflict(project_id,member_id) do update set role=excluded.role,status='pending',project_name=excluded.project_name returning id into inv;
 insert into notifications(user_id,title,link,invite_id) values(p_member,'Invitation to '||title,'/notifications',inv);return inv;end$$;
create function public.respond_invitation(p_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare inv collaborators;begin
 update collaborators set status=case when p_accept then 'accepted' else 'declined' end where id=p_id and member_id=auth.uid() and status='pending' returning * into inv;
 if inv.id is null then raise exception 'Invitation is no longer pending';end if;
 insert into notifications(user_id,title,link) values(inv.invited_by,(case when p_accept then 'Accepted: ' else 'Declined: ' end)||inv.project_name,'/studio?project='||inv.project_id::text||'&source=cloud');end$$;
create function public.revoke_collaborator(p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare inv collaborators;begin
 update collaborators set status='revoked' where id=p_id and invited_by=auth.uid() returning * into inv;if inv.id is null then raise exception 'Only the owner can revoke access';end if;
 insert into notifications(user_id,title,link) values(inv.member_id,'Access revoked: '||inv.project_name,'/notifications');end$$;
create function public.read_inbox(p_sender uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
 if p_sender is null then update notifications set read_at=now() where user_id=auth.uid() and read_at is null;else update direct_messages set read_at=now() where recipient_id=auth.uid() and sender_id=p_sender and read_at is null;end if;end$$;
create function public.save_session(p_id uuid,p_owner uuid,p_name text,p_manifest jsonb,p_updated timestamptz,p_revision integer default null) returns integer language plpgsql security definer set search_path=public,pg_temp as $$declare current projects;next_rev integer;begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 select * into current from projects where id=p_id for update;
 if current.id is null then
 if p_owner<>auth.uid() then raise exception 'Not allowed to create this session';end if;
 insert into projects(id,owner_id,name,manifest,updated_at,revision) values(p_id,p_owner,p_name,p_manifest,p_updated,1);return 1;end if;
 if not public.project_access(p_id,true) or current.owner_id<>p_owner then raise exception 'Editing access is required';end if;
 if (p_revision is not null and p_revision<>current.revision) or (p_revision is null and (current.owner_id<>auth.uid() or exists(select 1 from collaborators where project_id=p_id and status='accepted'))) then raise exception 'Session changed. Open the latest cloud version or duplicate your work before saving';end if;
 next_rev=current.revision+1;
 update projects set name=p_name,manifest=p_manifest,updated_at=p_updated,revision=next_rev where id=p_id;return next_rev;end$$;
revoke all on function public.invite_collaborator(uuid,uuid,text),public.respond_invitation(uuid,boolean),public.revoke_collaborator(uuid),public.read_inbox(uuid),public.save_session(uuid,uuid,text,jsonb,timestamptz,integer) from public,anon;
grant execute on function public.invite_collaborator(uuid,uuid,text),public.respond_invitation(uuid,boolean),public.revoke_collaborator(uuid),public.read_inbox(uuid),public.save_session(uuid,uuid,text,jsonb,timestamptz,integer) to authenticated;
