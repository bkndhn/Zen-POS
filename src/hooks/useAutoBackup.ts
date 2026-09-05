import { useEffect, useRef } from 'react';
import { requireOnline } from '@/utils/onlineGuard';
import { supabase } from '@/integrations/supabase/client';
import { buildBackup } from '@/utils/backupUtils';

export function useAutoBackup() {
  const isRunning = useRef(false);

  useEffect(() => {
    // Check every minute
    const interval = setInterval(() => {
      checkAndRunBackup();
    }, 60000);

    // Initial check just in case the app was opened exactly on the minute
    checkAndRunBackup();

    return () => clearInterval(interval);
  }, []);

  const checkAndRunBackup = async () => {
    if (isRunning.current) return;
    if (!navigator.onLine) return;

    try {
      const now = new Date();
      const hour = now.getHours().toString().padStart(2, '0');
      const minute = now.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hour}:${minute}`;

      // Configured schedule: 8 AM, 2 PM, 11 PM
      const SCHEDULES = ['08:00', '14:00', '23:00'];

      // Find the most recent schedule time that has already passed today
      const passedSchedules = SCHEDULES.filter(s => s <= timeStr);
      if (passedSchedules.length === 0) return; // Before the first schedule of the day

      const latestSlot = passedSchedules[passedSchedules.length - 1]; // e.g. '14:00'
      const currentSlot = `${now.toDateString()}_${latestSlot}`;
      const lastBackupSlot = localStorage.getItem('last_auto_backup_slot');

      if (lastBackupSlot === currentSlot) return; // Already backed up for this slot

      isRunning.current = true;

      // Check if backup is enabled in settings
      const { data: settings } = await supabase.from('backup_settings').select('is_enabled, retention_days').single();
      if (!settings?.is_enabled) {
        isRunning.current = false;
        return;
      }

      console.log(`[AutoBackup] Triggering scheduled cloud backup for ${timeStr}...`);
      
      // Perform the backup
      const backupData = await buildBackup();
      const backupJson = JSON.stringify(backupData, null, 2);
      const filename = `backup_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${hour}-${minute}.json`;

      const { error: uploadError } = await supabase.storage
        .from('pos_backups')
        .upload(filename, backupJson, {
          contentType: 'application/json',
          upsert: true
        });

      if (uploadError) {
        console.error('[AutoBackup] Upload failed:', uploadError);
        isRunning.current = false;
        return;
      }

      console.log('[AutoBackup] Successfully uploaded:', filename);
      localStorage.setItem('last_auto_backup_slot', currentSlot);

      // Handle retention (cleanup old backups)
      const retentionDays = settings.retention_days || 10;
      cleanupOldBackups(retentionDays);
      
    } catch (e) {
      console.error('[AutoBackup] Error during auto-backup process:', e);
    } finally {
      isRunning.current = false;
    }
  };

  const cleanupOldBackups = async (daysToKeep: number) => {
    try {
      const { data: files, error: listError } = await supabase.storage.from('pos_backups').list();
      if (listError || !files) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const filesToDelete = files
        .filter(f => {
          if (f.name === '.emptyFolderPlaceholder') return false;
          const created = new Date(f.created_at);
          return created < cutoffDate;
        })
        .map(f => f.name);

      if (filesToDelete.length > 0) {
        requireOnline('Cloud backup cleanup');
        await supabase.storage.from('pos_backups').remove(filesToDelete);
        console.log(`[AutoBackup] Cleaned up ${filesToDelete.length} old backups past ${daysToKeep} days.`);
      }
    } catch (e) {
      console.error('[AutoBackup] Failed to clean up old backups:', e);
    }
  };
}
