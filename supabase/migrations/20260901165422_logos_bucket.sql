-- Create logos bucket
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
-- Allow public access
create policy "Public Access" on storage.objects for select using ( bucket_id = 'logos' );
-- Allow authenticated users to upload
create policy "Auth Upload" on storage.objects for insert with check ( bucket_id = 'logos' and auth.role() = 'authenticated' );
-- Allow authenticated users to update
create policy "Auth Update" on storage.objects for update using ( bucket_id = 'logos' and auth.role() = 'authenticated' );
-- Allow authenticated users to delete
create policy "Auth Delete" on storage.objects for delete using ( bucket_id = 'logos' and auth.role() = 'authenticated' );
