file_path = 'src/utils/imageUtils.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find("export const compressImage")
if start != -1:
    end = content.find("export const getCDNUrl", start)
    with open('compressImage.txt', 'w', encoding='utf-8') as out:
        out.write(content[start:end])
