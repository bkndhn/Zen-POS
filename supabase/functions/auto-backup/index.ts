// Supabase Edge Function: auto-backup
// Triggered via HTTP / pg_cron to backup database to Google Drive and keep last 10 days of backups.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? "";
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let status: 'success' | 'failure' = 'failure';
  let details = '';
  let fileName = '';
  let fileSize = 0;

  try {
    // 1. Fetch Backup Settings
    const { data: settings, error: settingsError } = await supabase
      .from('backup_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) throw new Error(`Failed to load backup settings: ${settingsError.message}`);
    if (!settings || !settings.is_enabled) {
      return new Response(JSON.stringify({ message: "Backups are disabled or settings not found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Fetch Data from all tables to build a complete database dump
    const tablesToDump = [
      'profiles', 'branches', 'user_branches', 'user_permissions',
      'items', 'item_categories', 'bills', 'bill_items',
      'purchases', 'purchase_items', 'purchase_distributions', 'purchase_payments',
      'suppliers', 'expenses', 'expense_categories', 'tables', 'table_orders',
      'shop_settings', 'tax_rates', 'additional_charges', 'payments', 'display_settings'
    ];

    const databaseDump: Record<string, any[]> = {};

    for (const table of tablesToDump) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.error(`Warning: Failed to dump table ${table}: ${error.message}`);
        databaseDump[table] = [];
      } else {
        databaseDump[table] = data || [];
      }
    }

    // 3. Serialize dump
    const backupJsonString = JSON.stringify({
      version: "1.0",
      backup_timestamp: new Date().toISOString(),
      data: databaseDump
    });

    const encoder = new TextEncoder();
    const backupBytes = encoder.encode(backupJsonString);
    fileSize = backupBytes.length;
    
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
    fileName = `zenpos_backup_${timestampStr}.json`;

    // 4. Try Uploading to Google Drive if credentials exist
    let uploadedToDrive = false;
    if (settings.gdrive_folder_id && settings.gdrive_credentials) {
      try {
        const creds = typeof settings.gdrive_credentials === 'string' 
          ? JSON.parse(settings.gdrive_credentials) 
          : settings.gdrive_credentials;

        // Perform Google OAuth Service Account Auth
        const accessToken = await getGoogleAccessToken(creds);
        
        // Upload backup file
        const gdriveFileId = await uploadToGDrive(accessToken, settings.gdrive_folder_id, fileName, backupJsonString);
        uploadedToDrive = true;
        details = `Successfully uploaded backup to Google Drive. File ID: ${gdriveFileId}. `;

        // Prune backups older than retention days (default 10)
        const deletedCount = await pruneOldBackups(accessToken, settings.gdrive_folder_id, settings.retention_days || 10);
        if (deletedCount > 0) {
          details += `Pruned ${deletedCount} backup file(s) older than ${settings.retention_days} days.`;
        }
      } catch (gdriveErr: any) {
        console.error("GDrive upload failed:", gdriveErr);
        details = `Google Drive upload failed: ${gdriveErr.message || gdriveErr}. `;
      }
    } else {
      details = "Google Drive credentials or folder ID missing in settings. ";
    }

    // 5. Native Backup Fallback: Store in Supabase Storage Bucket 'database-backups'
    try {
      // Ensure bucket exists (or create it)
      const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('database-backups');
      if (bucketError || !bucketData) {
        await supabase.storage.createBucket('database-backups', { public: false });
      }

      const { error: uploadErr } = await supabase.storage
        .from('database-backups')
        .upload(fileName, backupBytes, { contentType: 'application/json', upsert: true });

      if (uploadErr) {
        details += `Supabase storage fallback failed: ${uploadErr.message}.`;
      } else {
        details += `Saved backup to local Supabase Storage bucket 'database-backups'.`;
        status = 'success'; // Treat as success if at least local backup worked
      }
    } catch (fallbackErr: any) {
      console.error("Local storage backup failed:", fallbackErr);
      details += `Local storage backup failed: ${fallbackErr.message || fallbackErr}.`;
    }

    if (uploadedToDrive) {
      status = 'success';
    }

  } catch (err: any) {
    console.error("Backup process encountered an error:", err);
    status = 'failure';
    details = err.message || "Unknown error";
  }

  // 6. Record Log in backup_logs
  try {
    await supabase.from('backup_logs').insert({
      status,
      file_name: fileName || 'failed_backup.json',
      file_size: fileSize,
      details: details || 'No details'
    });
  } catch (logErr) {
    console.error("Failed to write to backup_logs table:", logErr);
  }

  return new Response(JSON.stringify({ status, fileName, fileSize, details }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: status === 'success' ? 200 : 500,
  });
});

// Helper: Service Account access token generation using Crypto APIs
async function getGoogleAccessToken(creds: any): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj: any) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const jwtHeader = base64UrlEncode(header);
  const jwtClaim = base64UrlEncode(claim);
  const signInput = `${jwtHeader}.${jwtClaim}`;

  // Parse private key
  const pem = creds.private_key.replace(/\\n/g, "\n");
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter)).replace(/\s/g, "");
  
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const jwtSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const assertion = `${signInput}.${jwtSignature}`;

  // Request OAuth access token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Token fetch failed: ${errText}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

// Helper: Upload file to Google Drive REST API
async function uploadToGDrive(accessToken: string, folderId: string, fileName: string, content: string): Promise<string> {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/json"
  };

  const boundary = "314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--\r\n`;

  const body = 
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}` +
    `${delimiter}Content-Type: application/json\r\n\r\n${content}` +
    closeDelimiter;

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": body.length.toString()
    },
    body
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const fileData = await response.json();
  return fileData.id;
}

// Helper: Prune files older than retention limit (e.g. 10 days)
async function pruneOldBackups(accessToken: string, folderId: string, retentionDays: number): Promise<number> {
  // Query all files in the backup folder, sorted by name (which contains timestamps)
  const q = `'${folderId}' in parents and name contains 'zenpos_backup_' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=name+desc&fields=files(id,name,createdTime)`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to list files for pruning: ${await response.text()}`);
  }

  const data = await response.json();
  const files = data.files || [];

  const cutOffDate = new Date();
  cutOffDate.setDate(cutOffDate.getDate() - retentionDays);

  let deletedCount = 0;

  for (const file of files) {
    // Parse timestamp from file name: zenpos_backup_YYYY-MM-DDTHH-MM-SS.json
    const nameMatch = file.name.match(/zenpos_backup_(.+)\.json/);
    if (!nameMatch) continue;

    const fileDateStr = nameMatch[1].replace(/-/g, ":").substring(0, 10) + " " + nameMatch[1].substring(11, 19).replace(/-/g, ":");
    const fileDate = new Date(fileDateStr);

    if (isNaN(fileDate.getTime())) continue;

    // If file date is older than cutoff date, delete it
    if (fileDate < cutOffDate) {
      const deleteUrl = `https://www.googleapis.com/drive/v3/files/${file.id}`;
      const delResponse = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (delResponse.ok) {
        deletedCount++;
      } else {
        console.error(`Failed to delete old backup file ${file.name} (ID: ${file.id}): ${await delResponse.text()}`);
      }
    }
  }

  return deletedCount;
}
