file_path = 'src/pages/PublicMenu.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# We're looking for: <p className="text-sm font-semibold mt-1" style={{ color: primaryColor || '#ea580c' }}>?{item.price.toFixed(2)} Base</p>
old_str = "Base</p>"
new_str = "/{item.base_value && item.base_value > 1 ? item.base_value : ''}{item.unit !== 'pcs' && item.unit !== 'pc' ? getShortUnit(item.unit) : 'pc'}</p>"

if old_str in content:
    content = content.replace(old_str, new_str)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced 'Base' with correct unit")
else:
    print("Could not find 'Base'")
