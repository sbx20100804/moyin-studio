import json
for p in [r"D:\NovelStudio\package.json", r"D:\NovelStudio\package-lock.json", r"D:\NovelStudio\tsconfig.json", r"D:\NovelStudio\src-tauri\tauri.conf.json"]:
    try:
        json.load(open(p, encoding="utf-8"))
        print("OK", p)
    except Exception as e:
        print("FAIL", p, e)
