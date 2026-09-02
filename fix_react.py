import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r"profile(\?)?\.role === 'admin' \? profile(\?)?\.id : profile(\?)?\.admin_id",
        "adminProfileId",
        content
    )

    if new_content != content:
        if "useAuth()" in new_content and "adminProfileId" not in new_content.split("useAuth()")[0].split("{")[-1]:
            new_content = re.sub(
                r"const\s*{\s*profile\s*}\s*=\s*useAuth\(\);",
                "const { profile, adminProfileId } = useAuth();",
                new_content
            )

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))
