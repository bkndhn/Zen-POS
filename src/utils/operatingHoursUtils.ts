import { OperatingHours } from '@/types/operatingHours';

export type StoreStatus = 'open' | 'closed' | 'break';

export interface StoreStatusInfo {
    status: StoreStatus;
    message: string;
}

export function getStoreStatus(
    operatingHours: OperatingHours | null | undefined,
    storeStatusOverride: string | null | undefined
): StoreStatusInfo {
    // 1. Check manual overrides first
    if (storeStatusOverride) {
        if (storeStatusOverride === 'force_open') {
            return { status: 'open', message: 'Open' };
        }
        if (storeStatusOverride === 'force_closed') {
            return { status: 'closed', message: 'Currently Closed' };
        }
        if (storeStatusOverride === 'on_leave') {
            return { status: 'closed', message: 'On Leave / Holiday' };
        }
    }

    // 2. If no operating hours configured, assume open
    if (!operatingHours || !operatingHours.type) {
        return { status: 'open', message: 'Open' };
    }

    const now = new Date();
    // Get current day name (lowercase)
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()] as keyof typeof operatingHours.daily;
    
    // Format current time as HH:mm
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    
    // Check if today is a custom holiday
    if (operatingHours.customHolidays && operatingHours.customHolidays.length > 0) {
        // format date as YYYY-MM-DD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        
        const holiday = operatingHours.customHolidays.find(h => {
            if (!h.endDate) return h.startDate === todayStr;
            return todayStr >= h.startDate && todayStr <= h.endDate;
        });
        if (holiday) {
            return { status: 'closed', message: holiday.reason ? `Closed: ${holiday.reason}` : 'Closed for Holiday' };
        }
    }

    // 3. Determine today's schedule
    let todaysSchedule;
    if (operatingHours.type === 'custom_daily') {
        todaysSchedule = operatingHours.daily[currentDay];
    } else {
        todaysSchedule = operatingHours.default;
    }

    if (!todaysSchedule || !todaysSchedule.isOpen) {
        return { status: 'closed', message: 'Closed Today' };
    }

    const { openTime, closeTime } = todaysSchedule;
    
    // Convert times to minutes for easier comparison
    const timeToMins = (t: string) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const currentMins = timeToMins(currentTimeStr);
    const openMins = timeToMins(openTime);
    let closeMins = timeToMins(closeTime);
    
    // Handle case where close time is past midnight (e.g., open 09:00, close 02:00)
    if (closeMins < openMins) {
        closeMins += 24 * 60;
    }
    
    let effectiveCurrentMins = currentMins;
    if (effectiveCurrentMins < openMins && closeMins > 24 * 60) {
        // If it's early morning (e.g. 01:00) and we close past midnight, shift current time for comparison
        effectiveCurrentMins += 24 * 60;
    }

    // 4. Check if currently within opening hours
    if (effectiveCurrentMins < openMins) {
        return { status: 'closed', message: `Opens at ${formatTime(openTime)}` };
    }
    
    if (effectiveCurrentMins > closeMins) {
        return { status: 'closed', message: 'Closed for the day' };
    }

    // 5. Check if currently on a break
    if (operatingHours.breaks && operatingHours.breaks.length > 0) {
        for (const b of operatingHours.breaks) {
            // Check if break applies to today
            if (b.days && !b.days.includes('all') && !b.days.includes(currentDay)) {
                continue;
            }
            
            const breakStartMins = timeToMins(b.startTime);
            const breakEndMins = timeToMins(b.endTime);
            
            if (currentMins >= breakStartMins && currentMins < breakEndMins) {
                return { 
                    status: 'break', 
                    message: `On Break: ${b.name} (Back at ${formatTime(b.endTime)})` 
                };
            }
        }
    }

    // 6. Otherwise open
    return { status: 'open', message: `Open until ${formatTime(closeTime)}` };
}

function formatTime(time24: string): string {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${hours}:${m} ${ampm}`;
}
