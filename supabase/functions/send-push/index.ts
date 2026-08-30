import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// Import googleapis or create a simple JWT signer for FCM HTTP v1 API
// For simplicity, we use the raw REST approach if firebase-admin is not available,
// but Supabase supports importing npm modules!
import { initializeApp, cert } from 'npm:firebase-admin/app';
import { getMessaging } from 'npm:firebase-admin/messaging';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lazy initialization of Firebase Admin
let firebaseApp: any = null;
const initFirebase = async () => {
  if (firebaseApp) return firebaseApp;
  
  // Try env var first
  let serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  
  // If not in env, fetch from Supabase vault
  if (!serviceAccountJson) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? "";
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const vaultClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await vaultClient.rpc('vault_read_secret', { secret_name: 'firebase_service_account' });
    
    // Fallback: try direct query to vault.decrypted_secrets
    if (error || !data) {
      const { data: vaultData, error: vaultError } = await vaultClient
        .from('decrypted_secrets' as any)
        .select('decrypted_secret')
        .eq('name', 'firebase_service_account')
        .single();
      
      if (vaultError || !vaultData) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT not found in env or vault. Error: " + (vaultError?.message || 'not found'));
      }
      serviceAccountJson = (vaultData as any).decrypted_secret;
    } else {
      serviceAccountJson = typeof data === 'string' ? data : JSON.stringify(data);
    }
  }
  
  if (!serviceAccountJson) throw new Error("Firebase service account credentials not available");
  
  const serviceAccount = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  firebaseApp = initializeApp({
    credential: cert(serviceAccount)
  });
  return firebaseApp;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Auth Guard: Require Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? "";
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    const { record, type, table } = payload;
    
    // Generic ZenPOS Alert handling
    // Support both direct payload and database webhook record
    let title = payload.title || record?.title || "ZenPOS Alert";
    let body = payload.body || record?.body || "You have a new notification.";
    let userId = payload.user_id || record?.user_id;

    if (!userId) {
       return new Response(JSON.stringify({ error: "Missing user_id to target push notification" }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 400,
       });
    }

    // Handle custom data field
    const rawData = payload.data || record?.data;
    const fcmData: { [key: string]: string } = {};
    if (rawData && typeof rawData === 'object') {
      for (const key of Object.keys(rawData)) {
        fcmData[key] = String(rawData[key]); // FCM requires data values to be strings
      }
    }

    // Fetch FCM tokens for the user
    const { data: devices, error: deviceError } = await supabase
      .from('user_devices')
      .select('device_token')
      .eq('user_id', userId);

    if (deviceError || !devices || devices.length === 0) {
       return new Response(JSON.stringify({ message: "No registered devices found for user." }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 200,
       });
    }

    await initFirebase();
    const messaging = getMessaging();

    const tokens = devices.map(d => d.device_token);
    
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    // Batch chunking: FCM allows max 500 tokens per sendEachForMulticast call
    const chunkSize = 500;
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      
      const message = {
        notification: { title, body },
        data: Object.keys(fcmData).length > 0 ? fcmData : undefined,
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'zenpos_default',
            defaultSound: true,
            defaultVibrateTimings: true,
            icon: '@mipmap/ic_launcher'
          }
        },
        apns: {
          headers: {
            'apns-priority': '10'
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'content-available': 1,
              'mutable-content': 1
            }
          }
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification: {
            title,
            body,
            icon: '/lovable-uploads/8779c404-f498-4818-afef-87931b3e4cf0.png',
            badge: '/lovable-uploads/8779c404-f498-4818-afef-87931b3e4cf0.png',
            requireInteraction: true,
          },
          fcmOptions: {
            link: fcmData.url || '/',
          },
        },
        tokens: chunk,
      };

      const response = await messaging.sendEachForMulticast(message);
      
      successCount += response.successCount;
      failureCount += response.failureCount;

      // Token cleanup
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            if (
              resp.error.code === 'messaging/registration-token-not-registered' || 
              resp.error.code === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(chunk[idx]);
            }
          }
        });
      }
    }

    // Remove invalid tokens from the database using service role client
    if (invalidTokens.length > 0) {
      const { error: deleteError } = await supabase
        .from('user_devices')
        .delete()
        .in('device_token', invalidTokens);
        
      if (deleteError) {
        console.error("Failed to delete invalid tokens:", deleteError);
      }
    }

    console.log(`Push notifications sent successfully. Success: ${successCount}, Failures: ${failureCount}, Invalid tokens removed: ${invalidTokens.length}`);

    return new Response(JSON.stringify({ 
      success: true, 
      successCount, 
      failureCount,
      cleanedTokens: invalidTokens.length 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    console.error("Push notification failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
