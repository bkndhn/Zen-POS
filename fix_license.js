const fs = require('fs');
let content = fs.readFileSync('src/utils/offlineLicenseManager.ts', 'utf-8');

// Update syncSubscriptionLicense
const targetStr = .eq('id', adminId)
            .maybeSingle();;

const replacementStr = .eq('id', adminId)
            .maybeSingle();
            
        let graceDays = 7;
        try {
            const { data: shopData } = await (supabase as any).from('shop_settings').select('offline_grace_days').eq('user_id', adminId).maybeSingle();
            if (shopData?.offline_grace_days) graceDays = shopData.offline_grace_days;
        } catch (e) { console.warn(e); };

content = content.replace(targetStr, replacementStr);

const statusTarget = const status: LicenseStatus = {;
const statusReplacement = const status: LicenseStatus = {
            graceDays,;

content = content.replace(statusTarget, statusReplacement);

fs.writeFileSync('src/utils/offlineLicenseManager.ts', content);
