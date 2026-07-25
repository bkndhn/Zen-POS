import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Download, Upload, HardDrive, AlertTriangle, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportLocalDatabase, importLocalDatabase } from '@/utils/backupUtils';

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
        // Auto-detect: try without passphrase first; if encrypted, prompt.
        await runImport(file);
    };

    return (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader className="p-4 sm:p-6 pb-2">
                <CardTitle className="flex items-center space-x-2 text-base sm:text-lg text-blue-800 dark:text-blue-300">
                    <HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Local Backup & Restore</span>
                </CardTitle>
                <CardDescription className="text-blue-600/80 dark:text-blue-400/80">
                    Download a full snapshot of your on-device data (bills, pending bills, items, categories, and preferences).
                    Enable end-to-end encryption before sharing the file via Drive, WhatsApp, or email.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
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
                        use AES-256-GCM with PBKDF2/SHA-256 (210,000 iterations). If you lose the passphrase,
                        the file <strong>cannot</strong> be recovered — this is by design.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
