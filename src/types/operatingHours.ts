export interface DailyHours {
  isOpen: boolean;
  openTime: string; // 'HH:mm' format
  closeTime: string; // 'HH:mm' format
}

export interface OperatingHoursBreak {
  id: string;
  name: string;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  days: string[]; // e.g. ['monday', 'tuesday'] or ['all']
}

export interface OperatingHours {
  type: 'same_everyday' | 'custom_daily';
  default: DailyHours;
  daily: {
    monday: DailyHours;
    tuesday: DailyHours;
    wednesday: DailyHours;
    thursday: DailyHours;
    friday: DailyHours;
    saturday: DailyHours;
    sunday: DailyHours;
  };
  breaks: OperatingHoursBreak[];
}

export const defaultOperatingHours: OperatingHours = {
  type: 'same_everyday',
  default: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
  daily: {
    monday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    tuesday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    wednesday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    thursday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    friday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    saturday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
    sunday: { isOpen: true, openTime: '09:00', closeTime: '22:00' },
  },
  breaks: []
};
