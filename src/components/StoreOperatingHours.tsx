import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OperatingHours, OperatingHoursBreak, defaultOperatingHours, DailyHours } from '@/types/operatingHours';
import { Clock, Plus, Trash2, CalendarDays, Power } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StoreOperatingHoursProps {
    operatingHours?: OperatingHours;
    storeStatusOverride?: string;
    onUpdateHours: (hours: OperatingHours) => void;
    onUpdateOverride: (override: string) => void;
}

export const StoreOperatingHours: React.FC<StoreOperatingHoursProps> = ({
    operatingHours = defaultOperatingHours,
    storeStatusOverride = 'auto',
    onUpdateHours,
    onUpdateOverride
}) => {
    // Ensure we have a valid structure even if DB is empty
    const hours = operatingHours?.type ? operatingHours : defaultOperatingHours;

    const handleTypeChange = (checked: boolean) => {
        onUpdateHours({ ...hours, type: checked ? 'custom_daily' : 'same_everyday' });
    };

    const handleDefaultTimeChange = (field: 'openTime' | 'closeTime', value: string) => {
        onUpdateHours({ ...hours, default: { ...hours.default, [field]: value } });
    };

    const handleDailyTimeChange = (day: keyof typeof hours.daily, field: keyof DailyHours, value: any) => {
        onUpdateHours({
            ...hours,
            daily: {
                ...hours.daily,
                [day]: { ...hours.daily[day], [field]: value }
            }
        });
    };

    const handleAddBreak = () => {
        const newBreak: OperatingHoursBreak = {
            id: Date.now().toString(),
            name: 'New Break',
            startTime: '13:00',
            endTime: '14:00',
            days: ['all']
        };
        onUpdateHours({ ...hours, breaks: [...(hours.breaks || []), newBreak] });
    };

    const handleUpdateBreak = (id: string, field: keyof OperatingHoursBreak, value: string) => {
        const updatedBreaks = hours.breaks.map(b => b.id === id ? { ...b, [field]: value } : b);
        onUpdateHours({ ...hours, breaks: updatedBreaks });
    };

    const handleRemoveBreak = (id: string) => {
        onUpdateHours({ ...hours, breaks: hours.breaks.filter(b => b.id !== id) });
    };

    const handleAddHoliday = () => {
        const newHoliday = {
            id: Date.now().toString(),
            startDate: new Date().toISOString().split('T')[0],
            reason: ''
        };
        onUpdateHours({ ...hours, customHolidays: [...(hours.customHolidays || []), newHoliday] });
    };

    const handleUpdateHoliday = (id: string, field: 'startDate' | 'endDate' | 'reason', value: string) => {
        const updatedHolidays = (hours.customHolidays || []).map(h => h.id === id ? { ...h, [field]: value } : h);
        onUpdateHours({ ...hours, customHolidays: updatedHolidays });
    };

    const handleRemoveHoliday = (id: string) => {
        onUpdateHours({ ...hours, customHolidays: (hours.customHolidays || []).filter(h => h.id !== id) });
    };

    const daysOfWeek: (keyof typeof hours.daily)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    return (
        <Card className="mb-6">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="w-5 h-5 text-primary" />
                            Store Operating Hours
                        </CardTitle>
                        <CardDescription>
                            Configure when your store is open for taking orders
                        </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Manual Status Override</Label>
                        <Select value={storeStatusOverride} onValueChange={onUpdateOverride}>
                            <SelectTrigger className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-blue-500" />
                                        <span>Auto (Follow Schedule)</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="force_open">
                                    <div className="flex items-center gap-2">
                                        <Power className="w-4 h-4 text-green-500" />
                                        <span>Force Open</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="force_closed">
                                    <div className="flex items-center gap-2">
                                        <Power className="w-4 h-4 text-red-500" />
                                        <span>Force Closed</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="on_leave">
                                    <div className="flex items-center gap-2">
                                        <CalendarDays className="w-4 h-4 text-orange-500" />
                                        <span>On Leave / Holiday</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                
                <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <div>
                        <Label className="text-sm font-semibold">Different timings per day</Label>
                        <p className="text-xs text-muted-foreground mt-1">Enable to set custom opening/closing times for each day of the week.</p>
                    </div>
                    <Switch
                        checked={hours.type === 'custom_daily'}
                        onCheckedChange={handleTypeChange}
                    />
                </div>

                {hours.type === 'same_everyday' ? (
                    <div className="grid grid-cols-2 gap-6 p-4 border rounded-xl bg-card">
                        <div className="space-y-2">
                            <Label>Opening Time</Label>
                            <Input type="time" value={hours.default.openTime} onChange={(e) => handleDefaultTimeChange('openTime', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Closing Time</Label>
                            <Input type="time" value={hours.default.closeTime} onChange={(e) => handleDefaultTimeChange('closeTime', e.target.value)} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {daysOfWeek.map(day => (
                            <div key={day} className="flex items-center gap-4 p-3 border rounded-xl bg-card">
                                <div className="w-32 flex items-center gap-2">
                                    <Switch
                                        checked={hours.daily[day].isOpen}
                                        onCheckedChange={(c) => handleDailyTimeChange(day, 'isOpen', c)}
                                    />
                                    <span className="capitalize text-sm font-medium">{day}</span>
                                </div>
                                <div className="flex-1">
                                    {hours.daily[day].isOpen ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <Input 
                                                type="time" 
                                                value={hours.daily[day].openTime} 
                                                onChange={(e) => handleDailyTimeChange(day, 'openTime', e.target.value)}
                                            />
                                            <Input 
                                                type="time" 
                                                value={hours.daily[day].closeTime} 
                                                onChange={(e) => handleDailyTimeChange(day, 'closeTime', e.target.value)}
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-10 flex items-center px-3 bg-red-50 dark:bg-red-500/10 text-red-600 border border-red-100 dark:border-red-900/30 rounded-md text-sm font-medium">
                                            Closed (Weekly Holiday)
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold">Breaks & Custom Timings</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Add lunch time, prayer time, etc. during which ordering is paused.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleAddBreak} className="h-8 gap-1.5">
                            <Plus className="w-3.5 h-3.5" />
                            Add Break
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {(!hours.breaks || hours.breaks.length === 0) && (
                            <div className="text-center py-6 border border-dashed rounded-xl text-muted-foreground text-sm">
                                No breaks configured. Store will accept orders continuously.
                            </div>
                        )}
                        {hours.breaks?.map((b) => (
                            <div key={b.id} className="flex items-end gap-3 p-3 bg-muted/20 border border-zinc-100 dark:border-zinc-800 rounded-xl relative group">
                                <div className="flex-1 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Break Name</Label>
                                    <Input value={b.name} onChange={(e) => handleUpdateBreak(b.id, 'name', e.target.value)} placeholder="e.g. Lunch Break" className="h-8 text-sm" />
                                </div>
                                <div className="w-32 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Start</Label>
                                    <Input type="time" value={b.startTime} onChange={(e) => handleUpdateBreak(b.id, 'startTime', e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div className="w-32 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">End</Label>
                                    <Input type="time" value={b.endTime} onChange={(e) => handleUpdateBreak(b.id, 'endTime', e.target.value)} className="h-8 text-sm" />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleRemoveBreak(b.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h4 className="text-sm font-semibold">Custom Holidays</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Add specific dates when the store will be closed all day.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleAddHoliday} className="h-8 gap-1.5">
                            <Plus className="w-3.5 h-3.5" />
                            Add Holiday
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {(!hours.customHolidays || hours.customHolidays.length === 0) && (
                            <div className="text-center py-6 border border-dashed rounded-xl text-muted-foreground text-sm">
                                No custom holidays configured.
                            </div>
                        )}
                        {hours.customHolidays?.map((h) => (
                            <div key={h.id} className="flex items-end gap-3 p-3 bg-muted/20 border border-zinc-100 dark:border-zinc-800 rounded-xl relative group">
                                <div className="w-36 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                                    <Input type="date" value={h.startDate || ''} onChange={(e) => handleUpdateHoliday(h.id, 'startDate', e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div className="w-36 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">End Date (Optional)</Label>
                                    <Input type="date" value={h.endDate || ''} onChange={(e) => handleUpdateHoliday(h.id, 'endDate', e.target.value)} className="h-8 text-sm" />
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Reason / Name (Optional)</Label>
                                    <Input value={h.reason || ''} onChange={(e) => handleUpdateHoliday(h.id, 'reason', e.target.value)} placeholder="e.g. Maintenance / Festival" className="h-8 text-sm" />
                                </div>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => handleRemoveHoliday(h.id)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

            </CardContent>
        </Card>
    );
};
