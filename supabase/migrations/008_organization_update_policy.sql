create policy organizations_update on public.organizations
for update
using (id = public.current_profile_org())
with check (id = public.current_profile_org());
