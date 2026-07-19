# ZenPOS - New Supabase Setup Guide

## Quick Setup (5 Minutes)

### Step 1: Create New Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose organization, name your project (e.g., "hotel-pos")
4. Select region closest to you (e.g., "ap-south-1" for India)
5. Set a strong database password (SAVE THIS!)
6. Wait 2-3 minutes for project to initialize

### Step 2: Run the Database Schema
1. In Supabase Dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy the ENTIRE contents of `supabase_complete_database.sql`
4. Paste into the SQL Editor
5. Click "Run" (Ctrl+Enter)
6. Wait for "Success" message

### Step 3: Enable Authentication
1. Go to **Authentication** > **Providers**
2. Enable **Email** provider
3. (Optional) Disable email confirmation for faster testing:
   - Go to **Authentication** > **Settings**
   - Turn OFF "Enable email confirmations"

### Step 4: Enable Realtime (for KDS/Service Area sync)
1. Go to **Database** > **Replication**
2. Under "Source" find the `bills` table
3. Toggle it to **ON** 
4. (This enables real-time updates for Kitchen Display)

### Step 5: (Optional) Set Up Storage for Images
1. Go to **Storage**
2. Click "New Bucket"
3. Name: `images`
4. Set to **Public** bucket
5. Click "Create Bucket"

### Step 6: Get Your Credentials
1. Go to **Settings** > **API**
2. Copy these values:
   - **Project URL** (e.g., `https://xxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Step 7: Update Your App
Create or update `.env` file in your project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 8: Test It!
1. Run your app: `npm run dev`
2. Sign up with a new account
3. The first user automatically becomes **Admin**!

---

## What's Included in the Schema

| Component | Count | Details |
|-----------|-------|---------|
| **Enums** | 5 | app_role, payment_method, payment_mode, service_status, user_status |
| **Tables** | 14 | profiles, items, bills, bill_items, expenses, settings, etc. |
| **RLS Policies** | 36+ | Full row-level security |
| **Functions** | 2 | update_updated_at_column, has_page_permission |
| **Triggers** | 4 | Auto-update timestamps |
| **Indexes** | 4 | Optimized for KDS queries |
| **Default Data** | ✅ | Payment types, expense categories, item categories |

---

## Troubleshooting

### "Permission denied" error
- Make sure you're logged in before accessing data
- Check that RLS policies are correctly applied

### "Table does not exist" error
- Run the complete SQL script again
- Check SQL Editor for any error messages

### Real-time sync not working
- Verify `bills` table is added to Replication
- Check browser console for WebSocket errors

### First user not becoming admin
- This should happen automatically
- If not, manually update the profile in Supabase Table Editor:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE user_id = 'YOUR_USER_ID';
  ```

---

## File Location
**SQL Schema**: `supabase_complete_database.sql`

This file contains everything needed to recreate your backend. Keep it versioned in Git!
