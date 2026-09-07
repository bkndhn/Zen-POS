/**
 * Post-sync script: Ensures the local BluetoothPrinterPlugin is registered
 * in the iOS capacitor.config.json packageClassList after `npx cap sync`.
 * 
 * Run: node scripts/ios-post-sync.cjs
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'ios', 'App', 'App', 'capacitor.config.json');

if (!fs.existsSync(configPath)) {
    console.log('[ios-post-sync] No iOS config found, skipping.');
    process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const classList = config.packageClassList || [];

if (!classList.includes('BluetoothPrinterPlugin')) {
    classList.push('BluetoothPrinterPlugin');
    config.packageClassList = classList;
    fs.writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
    console.log('[ios-post-sync] ✅ Added BluetoothPrinterPlugin to packageClassList');
} else {
    console.log('[ios-post-sync] BluetoothPrinterPlugin already registered');
}
