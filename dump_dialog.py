file_path = 'src/pages/PublicMenu.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if "const ItemCustomizerDialog =" in line:
        start_idx = i
        break

if start_idx != -1:
    with open('dialog_out.txt', 'w', encoding='utf-8') as out:
        out.write("".join(lines[start_idx:start_idx+150]))
