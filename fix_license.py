import os
import re

content = open('src/utils/offlineLicenseManager.ts', 'r', encoding='utf-8').read()

content = content.replace(
    'export interface LicenseStatus {\n    isValid: boolean;',
    'export interface LicenseStatus {\n    graceDays?: number;\n    isValid: boolean;'
)

target = '''        const { data: profileData, error: profileError } = await (supabase as any)
            .from('profiles')
            .select('subscription_plan, subscription_status, subscription_end_date, subscription_amount, force_logout, force_logout_reason')
            .eq('id', adminId)
            .maybeSingle();'''

replacement = '''        const { data: profileData, error: profileError } = await (supabase as any)
            .from('profiles')
            .select('subscription_plan, subscription_status, subscription_end_date, subscription_amount, force_logout, force_logout_reason')
            .eq('id', adminId)
            .maybeSingle();
            
        let graceDays = 7;
        try {
            const { data: shopData } = await (supabase as any).from('shop_settings').select('offline_grace_days').eq('user_id', adminId).maybeSingle();
            if (shopData?.offline_grace_days) graceDays = shopData.offline_grace_days;
        } catch (e) {}'''

content = content.replace(target, replacement)

content = content.replace('const status: LicenseStatus = {', 'const status: LicenseStatus = {\n            graceDays,')

open('src/utils/offlineLicenseManager.ts', 'w', encoding='utf-8').write(content)
