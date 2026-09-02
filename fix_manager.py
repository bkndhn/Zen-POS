import os

content = open('src/utils/offlineLicenseManager.ts', 'r', encoding='utf-8').read()

target = '''        const { data: profileData, error: profileError } = await (supabase as any)
            .from('profiles')
            .select('subscription_plan, subscription_status, subscription_end_date, subscription_amount, force_logout, force_logout_reason')
            .eq('id', adminId)
            .maybeSingle();
            
        let graceDays = 7;
        try {
            const { data: shopData } = await (supabase as any).from('shop_settings').select('offline_grace_days').eq('user_id', adminId).maybeSingle();
            if (shopData?.offline_grace_days) graceDays = shopData.offline_grace_days;
        } catch (e) {}'''

replacement = '''        const { data: profileData, error: profileError } = await (supabase as any)
            .from('profiles')
            .select('subscription_plan, subscription_status, subscription_end_date, subscription_amount, force_logout, force_logout_reason, client_permissions')
            .eq('id', adminId)
            .maybeSingle();
            
        let graceDays = 7;
        if (profileData?.client_permissions?.offline_grace_days !== undefined) {
            graceDays = profileData.client_permissions.offline_grace_days;
        }'''

content = content.replace(target, replacement)
open('src/utils/offlineLicenseManager.ts', 'w', encoding='utf-8').write(content)
