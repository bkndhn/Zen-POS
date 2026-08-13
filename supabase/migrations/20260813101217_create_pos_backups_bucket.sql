-- Create the pos_backups bucket
insert into storage.buckets (id, name, public)
values ('pos_backups', 'pos_backups', false)
on conflict (id) do nothing;

-- Policy: Allow super_admins to manage pos_backups
create policy "Super admins can manage pos_backups"
on storage.objects for all
to authenticated
using (
  bucket_id = 'pos_backups'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  )
)
with check (
  bucket_id = 'pos_backups'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin'
  )
);
