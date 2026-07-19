import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { OperatingHours } from '@/types/operatingHours';
import { Clock, Calendar, Coffee, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface StoreTimingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    operatingHours: OperatingHours;
    shopName?: string;
}

const formatTime = (time24: string) => {
    try {
        const [hours, minutes] = time24.split(':');
        const d = new Date();
        d.setHours(parseInt(hours, 10));
        d.setMinutes(parseInt(minutes, 10));
        return format(d, 'h:mm a');
    } catch {
        return time24;
    }
};

export const StoreTimingsModal: React.FC<StoreTimingsModalProps> = ({ open, onOpenChange, operatingHours, shopName }) => {
    
    const renderWeeklyHours = () => {
        if (operatingHours.type === 'same_everyday') {
            return (
                <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Everyday</span>
                    {operatingHours.default.isOpen ? (
                        <span className="text-gray-600 dark:text-gray-400">
                            {formatTime(operatingHours.default.openTime)} - {formatTime(operatingHours.default.closeTime)}
                        </span>
                    ) : (
                        <span className="text-red-500 font-medium">Closed</span>
                    )}
                </div>
            );
        }

        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
        return (
            <div className="space-y-1">
                {days.map(day => {
                    const hrs = operatingHours.daily[day];
                    return (
                        <div key={day} className="flex justify-between items-center py-1.5 border-b last:border-0">
                            <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{day}</span>
                            {hrs.isOpen ? (
                                <span className="text-gray-600 dark:text-gray-400 text-sm">
                                    {formatTime(hrs.openTime)} - {formatTime(hrs.closeTime)}
                                </span>
                            ) : (
                                <span className="text-red-500 font-medium text-sm">Closed</span>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] w-[95vw] rounded-2xl p-0 overflow-hidden bg-white dark:bg-zinc-950">
                <div className="bg-gradient-to-br from-orange-500 to-red-600 p-6 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-white">
                            <Clock className="w-6 h-6" />
                            Store Timings
                        </DialogTitle>
                        <DialogDescription className="text-white/80">
                            {shopName ? `Working hours for ${shopName}` : 'Our weekly schedule and holidays'}
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                    {/* Weekly Hours */}
                    <div>
                        <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                            <Calendar className="w-5 h-5 text-orange-500" />
                            Weekly Schedule
                        </h4>
                        <div className="bg-gray-50 dark:bg-zinc-900 rounded-xl p-4 border border-gray-100 dark:border-zinc-800 shadow-sm">
                            {renderWeeklyHours()}
                        </div>
                    </div>

                    {/* Breaks */}
                    {operatingHours.breaks && operatingHours.breaks.length > 0 && (
                        <div>
                            <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                                <Coffee className="w-5 h-5 text-amber-500" />
                                Break Timings
                            </h4>
                            <div className="space-y-2">
                                {operatingHours.breaks.map(b => (
                                    <div key={b.id} className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 flex justify-between items-center border border-amber-100 dark:border-amber-900">
                                        <span className="font-medium text-amber-900 dark:text-amber-100">{b.name}</span>
                                        <span className="text-amber-700 dark:text-amber-400 text-sm">
                                            {formatTime(b.startTime)} - {formatTime(b.endTime)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Custom Holidays */}
                    {operatingHours.customHolidays && operatingHours.customHolidays.length > 0 && (
                        <div>
                            <h4 className="flex items-center gap-2 text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                                Upcoming Holidays
                            </h4>
                            <div className="space-y-2">
                                {operatingHours.customHolidays
                                    .filter(h => !h.endDate || new Date(h.endDate) >= new Date(new Date().setHours(0,0,0,0))) // Only show current/future holidays
                                    .map(h => {
                                        const isMultiDay = h.endDate && h.endDate !== h.startDate;
                                        return (
                                            <div key={h.id} className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-100 dark:border-red-900">
                                                <div className="font-medium text-red-900 dark:text-red-100">{h.reason || 'Store Holiday'}</div>
                                                <div className="text-red-700 dark:text-red-400 text-sm mt-1">
                                                    {format(parseISO(h.startDate), 'MMM do, yyyy')}
                                                    {isMultiDay && ` - ${format(parseISO(h.endDate!), 'MMM do, yyyy')}`}
                                                </div>
                                            </div>
                                        );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
