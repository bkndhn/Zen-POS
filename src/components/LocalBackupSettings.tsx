import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, HardDrive, AlertTriangle, Lock, Eye, EyeOff, ShieldCheck, Database, Server, Smartphone, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportLocalDatabase, importLocalDatabase } from '@/utils/backupUtils';
import { getStorageEstimate, StorageStatus, initStoragePersistence, universalStorage } from '@/utils/nativeStorage';
import { offlineManager } from '@/utils/offlineManager';

export function LocalBackupSettings() {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [encrypt, setEncrypt] = useState(true);
    const [passphrase, setPassphrase] = useState('');
    const [importPassphrase, setImportPassphrase] = useState('');
    const [showPass, setShowPass] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingFileRef = useRef<File | null>(null);
    const [needPass, setNeedPass] = useState(false);

    // Storage mode and metrics
    const [isLocalMode, setIsLocalMode] = useState<boolean>(() => {
        return localStorage.getItem('privacy_storage_mode') === 'local';
    });
    const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
    const [dbMetrics, setDbMetrics] = useState<{
        itemsCount: number;
        categoriesCount: number;
        billsCount: number;
        pendingBillsCount: number;
        expensesCount: number;
        tablesCount: number;
        customersCount: number;
    } | null>(null);

    useEffect(() => {
        loadMetrics();
    }, []);

    const loadMetrics = async () => {
        const est = await getStorageEstimate();
        setStorageStatus(est);

        try {
            const summary = await offlineManager.getLocalDatabaseSummary();
            setDbMetrics(summary);
        } catch (e) {
            console.warn('Failed to load local DB metrics:', e);
        }
    };

    const handleStorageModeChange = async (checked: boolean) => {
        const mode = checked ? 'local' : 'cloud';
        setIsLocalMode(checked);
        await universalStorage.setItem('privacy_storage_mode', mode);
        toast({
            title: checked ? '100% Local Storage Active' : 'Cloud Sync Mode Active',
            description: checked
                ? 'All new bills, inventory edits, and customer data will remain strictly on-device in local IndexedDB.'
                : 'Data will auto-sync with Supabase cloud when online.',
        });
    };

    const handleEnablePersistence = async () => {
        const granted = await initStoragePersistence();
        await loadMetrics();
        if (granted) {
            toast({
                title: '🛡️ Storage Protection Active',
                description: 'Operating system persistent storage is granted for your offline POS database.',
            });
        } else {
            toast({
                title: 'ℹ️ Storage Check Complete',
                description: 'Local IndexedDB storage is active & operational. To request maximum OS eviction protection, install Zen POS as a PWA app or bookmark this site in your browser.',
            });
        }
    };

    const handleExport = async () => {
        if (encrypt && passphrase.length < 6) {
            toast({ variant: 'destructive', title: 'Passphrase too short', description: 'Use at least 6 characters, or turn encryption off.' });
            return;
        }
        setIsExporting(true);
        try {
            await exportLocalDatabase(encrypt ? passphrase : undefined);
            toast({
                title: encrypt ? 'Encrypted Backup Ready' : 'Backup Ready',
                description: encrypt
                    ? 'AES-256 encrypted .zpbenc file downloaded. Store the passphrase safely — it cannot be recovered.'
                    : 'Plain-text .json backup downloaded.',
            });
            await loadMetrics();
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Backup Failed', description: e.message });
        } finally {
            setIsExporting(false);
        }
    };

    const runImport = async (file: File, pass?: string) => {
        setIsImporting(true);
        try {
            const { restored } = await importLocalDatabase(file, pass);
            toast({
                title: 'Restore Successful',
                description: `Restored ${restored} records. Reloading…`,
            });
            setNeedPass(false);
            setImportPassphrase('');
            pendingFileRef.current = null;
            setTimeout(() => window.location.reload(), 1500);
        } catch (e: any) {
            if (String(e.message).toLowerCase().includes('encrypted') || String(e.message).toLowerCase().includes('passphrase')) {
                setNeedPass(true);
                toast({ variant: 'destructive', title: 'Passphrase Required', description: e.message });
            } else {
                toast({ variant: 'destructive', title: 'Restore Failed', description: e.message });
            }
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        pendingFileRef.current = file;
        await runImport(file);
    };

    return (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader className="p-4 sm:p-6 pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <CardTitle className="flex items-center space-x-2 text-base sm:text-lg text-blue-800 dark:text-blue-300">
                        <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                        <span>Local Storage & Backup Engine</span>
                    </CardTitle>
                    {storageStatus?.isPersistent ? (
                        <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Storage Eviction Shield Active
                        </Badge>
                    ) : (
                        <Button size="sm" variant="outline" onClick={handleEnablePersistence} className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100">
                            Enable Storage Eviction Shield
                        </Button>
                    )}
                </div>
                <CardDescription className="text-blue-600/80 dark:text-blue-400/80">
                    World-class local-first engine. Keeps your POS operational 100% offline with on-device IndexedDB storage.
                    Works seamlessly on Web PWA and Android (Capacitor webview sync).
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 space-y-4">

                {/* Storage Mode Selector */}
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white/80 dark:bg-blue-950/40 p-3.5">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                                {isLocalMode ? <Smartphone className="w-4 h-4 text-purple-600" /> : <Server className="w-4 h-4 text-blue-600" />}
                                <span>{isLocalMode ? '100% Local Storage Mode' : 'Cloud Sync & Hybrid Mode'}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {isLocalMode
                                    ? 'All billing, stock changes, and customer records remain strictly on this device.'
                                    : 'Local-first with automatic background sync to Supabase cloud when online.'}
                            </p>
                        </div>
                        <Switch id="storage-mode-toggle" checked={isLocalMode} onCheckedChange={handleStorageModeChange} />
                    </div>
                </div>

                {/* Local Database Metrics Breakdown */}
                {dbMetrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="rounded-lg border bg-white/60 dark:bg-blue-950/20 p-2.5 text-center">
                            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <Database className="w-3 h-3 text-blue-500" /> Local Bills
                            </div>
                            <div className="text-base font-semibold mt-0.5">{dbMetrics.billsCount + dbMetrics.pendingBillsCount}</div>
                        </div>
                        <div className="rounded-lg border bg-white/60 dark:bg-blue-950/20 p-2.5 text-center">
                            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <Database className="w-3 h-3 text-emerald-500" /> Items / Cats
                            </div>
                            <div className="text-base font-semibold mt-0.5">{dbMetrics.itemsCount} / {dbMetrics.categoriesCount}</div>
                        </div>
                        <div className="rounded-lg border bg-white/60 dark:bg-blue-950/20 p-2.5 text-center">
                            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <Database className="w-3 h-3 text-amber-500" /> Expenses / Tables
                            </div>
                            <div className="text-base font-semibold mt-0.5">{dbMetrics.expensesCount} / {dbMetrics.tablesCount}</div>
                        </div>
                        <div className="rounded-lg border bg-white/60 dark:bg-blue-950/20 p-2.5 text-center">
                            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                                <HardDrive className="w-3 h-3 text-purple-500" /> Storage Used
                            </div>
                            <div className="text-base font-semibold mt-0.5">{storageStatus?.usageMB || '0'} MB</div>
                        </div>
                    </div>
                )}

                {/* Encryption Settings */}
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-white/60 dark:bg-blue-950/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="encrypt-toggle" className="flex items-center gap-2 text-sm font-medium">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            Encrypt backup (AES-256-GCM)
                        </Label>
                        <Switch id="encrypt-toggle" checked={encrypt} onCheckedChange={setEncrypt} />
                    </div>
                    {encrypt && (
                        <div className="relative">
                            <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                            <Input
                                type={showPass ? 'text' : 'password'}
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                placeholder="Enter passphrase (min 6 chars) — memorise it"
                                className="pl-8 pr-9 h-9"
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPass(v => !v)}
                                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                            >
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        {isExporting ? 'Preparing…' : encrypt ? 'Download Encrypted Backup' : 'Download Backup'}
                    </Button>

                    <div className="relative flex-1">
                        <input
                            type="file"
                            accept="application/json,application/octet-stream,.json,.zpbenc"
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
                            {isImporting ? 'Restoring…' : 'Restore from Backup'}
                        </Button>
                    </div>
                </div>

                {needPass && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                            <Lock className="w-4 h-4" /> Encrypted file — enter passphrase to restore
                        </div>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                value={importPassphrase}
                                onChange={(e) => setImportPassphrase(e.target.value)}
                                placeholder="Passphrase"
                                className="h-9"
                            />
                            <Button
                                size="sm"
                                onClick={() => pendingFileRef.current && runImport(pendingFileRef.current, importPassphrase)}
                                disabled={!importPassphrase || isImporting}
                            >
                                Unlock & Restore
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex items-start space-x-2 text-xs text-blue-700/80 dark:text-blue-400/80">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p>
                        Restoring merges records by ID — safe to run multiple times. Encrypted backups (.zpbenc)
                        use AES-256-GCM with PBKDF2/SHA-256 (210,000 iterations). Restoring works across both PWA and
                        Android Capacitor webviews without needing native APK rebuilds.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

