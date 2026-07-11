import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(request, response) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials in serverless environment");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Perform a simple query to keep the database active
    const { data, error } = await supabase.from('shop_settings').select('shop_name').limit(1);
    
    if (error) throw error;
    
    response.status(200).json({
      status: 'ok',
      db_status: 'connected',
      timestamp: new Date().toISOString(),
      message: 'Keep-alive ping successful'
    });
  } catch (error) {
    console.error("Health check / keep-alive failed:", error);
    response.status(500).json({
      status: 'error',
      message: error.message || 'Unknown health check error'
    });
  }
}
