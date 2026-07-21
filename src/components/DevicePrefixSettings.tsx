import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Laptop2, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useBranch } from '@/contexts/BranchContext';

export function DevicePrefixSettings() {
    const { operatingBranchId: branchId } = useBranch();
    const [prefix, setPrefix] = useState('');

    useEffect(() => {
        const key = branchId ? `hotel_pos_device_prefix_${branchId}` : 'hotel_pos_device_prefix';
        const saved = localStorage.getItem(key) || localStorage.getItem('hotel_pos_device_prefix') || '';
        setPrefix(saved);
    }, [branchId]);

    const handleSave = () => {
        const key = branchId ? `hotel_pos_device_prefix_${branchId}` : 'hotel_pos_device_prefix';
        const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        
        if (cleanPrefix) {
            localStorage.setItem(key, cleanPrefix);
            setPrefix(cleanPrefix);
            toast({
                title: "Prefix Saved",
                description: `This device will now generate bills starting with ${cleanPrefix}-`
            });
        } else {
            localStorage.removeItem(key);
            setPrefix('');
            toast({
                title: "Prefix Cleared",
                description: "This device will use standard bill numbers."
            });
        }
    };

    return (
        <Card>
            <CardHeader className="p-4 sm:p-6 pb-2">
                <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                    <Laptop2 className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                    <span>Device Billing Prefix</span>
                </CardTitle>
                <CardDescription>
                    Assign a unique prefix to this specific device (e.g. T1, POS) to prevent bill number collisions when syncing offline bills.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2">
                <div className="flex items-end gap-3 max-w-sm">
                    <div className="space-y-2 flex-1">
                        <Label htmlFor="devicePrefix">Prefix (Letters/Numbers only)</Label>
                        <Input 
                            id="devicePrefix"
                            placeholder="e.g. T1"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                            maxLength={5}
                            className="font-mono"
                        />
                    </div>
                    <Button onClick={handleSave}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
