import os

content = open('src/integrations/supabase/types.ts', 'r', encoding='utf-8').read()

content = content.replace(
    'number_of_users: number | null\n',
    'number_of_users: number | null\n            offline_grace_days: number | null\n'
)

content = content.replace(
    'number_of_users?: number | null\n',
    'number_of_users?: number | null\n            offline_grace_days?: number | null\n'
)

open('src/integrations/supabase/types.ts', 'w', encoding='utf-8').write(content)
