create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  manifest jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
revoke all on public.projects from anon;
grant select, insert, update, delete on public.projects to authenticated;
create policy "Owners read projects" on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners create projects" on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Owners update projects" on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete projects" on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);
insert into storage.buckets (id, name, public, file_size_limit) values ('project-audio', 'project-audio', false, 52428800);
create policy "Owners read audio" on storage.objects for select to authenticated using (bucket_id = 'project-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners upload audio" on storage.objects for insert to authenticated with check (bucket_id = 'project-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete audio" on storage.objects for delete to authenticated using (bucket_id = 'project-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
