-- Add new columns to shop_settings for Quick Bill, Custom Bottom Text, Notifications, and Auto-Reports
ALTER TABLE shop_settings
ADD COLUMN IF NOT EXISTS quick_bill_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bill_bottom_text TEXT DEFAULT 'Thank you!',
ADD COLUMN IF NOT EXISTS low_stock_notification_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_report_time TEXT,
ADD COLUMN IF NOT EXISTS auto_report_enabled BOOLEAN DEFAULT false;
