import os

content = open('src/App.tsx', 'r', encoding='utf-8').read()

if 'import { AppUpdater }' not in content:
    content = content.replace('import { Toaster } from "@/components/ui/toaster";', 'import { Toaster } from "@/components/ui/toaster";\nimport { AppUpdater } from "@/components/AppUpdater";')
    
    content = content.replace('<Toaster />', '<Toaster />\n        <AppUpdater />')
    
    open('src/App.tsx', 'w', encoding='utf-8').write(content)
