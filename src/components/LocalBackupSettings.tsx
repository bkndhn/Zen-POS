import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, HardDrive, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportLocalDatabase, importLocalDatabase } from '@/utils/backupUtils';

export function LocalBackupSettings() {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportLocalDatabase();
            toast({
                title: "Backup Successful",
                description: "Your local data has been downloaded."
            });
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Backup Failed",
                description: e.message
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            await importLocalDatabase(file);
            toast({
                title: "Restore Successful",
                description: "Local database has been restored from the backup file. Please refresh the page."
            });
            setTimeout(() => window.location.reload(), 2000);
        } catch (e: any) {
            toast({
                variant: "destructive",
                title: "Restore Failed",
                description: e.message
            });
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    return (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader className="p-4 sm:p-6 pb-2">
                <CardTitle className="flex items-center space-x-2 text-base sm:text-lg text-blue-800 dark:text-blue-300">
                    <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Local Backup & Restore</span>
                </CardTitle>
                <CardDescription className="text-blue-600/80 dark:text-blue-400/80">
                    If you are operating in Local-Only mode, it is highly recommended to frequently download a backup of your data to prevent loss if browser data is cleared.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2">
                <div className="flex flex-col sm:flex-row gap-4">
                    <Button 
                        onClick={handleExport} 
                        disabled={isExporting}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {isExporting ? 'Downloading...' : 'Download Backup'}
                    </Button>

                    <div className="relative flex-1">
                        <input
                            type="file"
                            accept="application/json,.json"
                            onChange={handleFileChange}
                            ref={fileInputRef}
                            className="hidden"
                            id="backup-upload"
                        />
                        <Button 
                            variant="outline" 
                            disabled={isImporting}
                            className="w-full border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {isImporting ? 'Restoring...' : 'Restore from Backup'}
                        </Button>
                    </div>
                </div>
                <div className="mt-4 flex items-start space-x-2 text-xs text-blue-700/80 dark:text-blue-400/80">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p>Restoring a backup will overwrite matching records (by ID) in your local database. Records with new IDs will be added. It is safe to restore the same backup multiple times.</p>
                </div>
            </CardContent>
        </Card>
    );
}
