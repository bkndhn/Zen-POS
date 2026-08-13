create table if not exists public.user_devices (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    device_token text not null,
    platform text not null default 'android',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id, device_token)
);

-- RLS
alter table public.user_devices enable row level security;

create policy "Users can view own devices"
on public.user_devices for select
using (auth.uid() = user_id);

create policy "Users can manage own devices"
on public.user_devices for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Trigger for updated_at
create trigger handle_updated_at before update on public.user_devices
  for each row execute procedure moddatetime (updated_at);
