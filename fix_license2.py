import os

content = open('src/utils/offlineLicenseManager.ts', 'r', encoding='utf-8').read()

# 1. Update cacheVerifiedLicense argument
target1 = '''export function cacheVerifiedLicense(adminId: string, subscriptionData: {
    status?: string;
    planName?: string;
    endDate?: string;
    forceLogout?: boolean;
    forceLogoutReason?: string;
    subscriptionAmount?: number;
}): void {'''

replacement1 = '''export function cacheVerifiedLicense(adminId: string, subscriptionData: {
    status?: string;
    planName?: string;
    endDate?: string;
    forceLogout?: boolean;
    forceLogoutReason?: string;
    subscriptionAmount?: number;
    graceDays?: number;
}): void {'''

content = content.replace(target1, replacement1)

# 2. Update hardcoded graceDays in payload
target2 = '''        lastVerifiedAt: now,
        graceDays: DEFAULT_GRACE_DAYS,'''
replacement2 = '''        lastVerifiedAt: now,
        graceDays: subscriptionData.graceDays || DEFAULT_GRACE_DAYS,'''

content = content.replace(target2, replacement2)

# 3. Update cacheVerifiedLicense call inside syncSubscriptionLicense
target3 = '''        cacheVerifiedLicense(adminId, {
            status,
            planName,
            endDate,
            forceLogout,
            forceLogoutReason,
            subscriptionAmount,
        });'''
replacement3 = '''        cacheVerifiedLicense(adminId, {
            status,
            planName,
            endDate,
            forceLogout,
            forceLogoutReason,
            subscriptionAmount,
            graceDays,
        });'''

content = content.replace(target3, replacement3)

open('src/utils/offlineLicenseManager.ts', 'w', encoding='utf-8').write(content)
