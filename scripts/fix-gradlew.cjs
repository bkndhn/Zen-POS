const fs = require('fs');
const path = require('path');

console.log('=== EAS Pre-Build Fixes ===');

// Fix 1: Fix gradlew line endings (Windows CRLF -> Unix LF) for Linux build server
const gradlewPath = path.join('android', 'gradlew');
if (fs.existsSync(gradlewPath)) {
  let content = fs.readFileSync(gradlewPath, 'utf8');
  content = content.replace(/\r\n/g, '\n');
  fs.writeFileSync(gradlewPath, content);
  try { fs.chmodSync(gradlewPath, '755'); } catch(e) {}
  console.log('✓ Fixed gradlew line endings');
}

// Fix 2: Downgrade Java VERSION_21 -> VERSION_17 everywhere
// Capacitor 8 generates VERSION_21 but EAS Build only has JDK 17
// All EAS images max out at JDK 17 (no JDK 21 available)
const filesToFix = [
  path.join('android', 'app', 'capacitor.build.gradle'),
  path.join('node_modules', '@capacitor', 'android', 'capacitor', 'build.gradle'),
];

for (const filePath of filesToFix) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('VERSION_21')) {
      content = content.replace(/VERSION_21/g, 'VERSION_17');
      fs.writeFileSync(filePath, content);
      console.log(`✓ Fixed ${filePath}: VERSION_21 -> VERSION_17`);
    } else {
      console.log(`✓ ${filePath}: already correct`);
    }
  } else {
    console.log(`⚠ ${filePath}: not found (skipping)`);
  }
}

console.log('=== Pre-build fixes complete ===');
