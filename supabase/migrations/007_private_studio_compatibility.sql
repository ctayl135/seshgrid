-- Keep older private owner-only studios working; shared changes must use save_session.
grant update on public.projects to authenticated;
alter policy "Owners update projects" on public.projects using(owner_id=(select auth.uid()) and not exists(select 1 from public.collaborators c where c.project_id=projects.id and c.status='accepted')) with check(owner_id=(select auth.uid()) and not exists(select 1 from public.collaborators c where c.project_id=projects.id and c.status='accepted'));
