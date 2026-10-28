# 墨隐 · Novel Studio

> 本地优先的 AI 小说创作工作台。Windows 桌面应用，Tauri 2 + React。
> 接任何 OpenAI 兼容接口，把设定、前情摘要与最近正文拼成上下文，让长篇写到三十章人物也不走形。

![主界面](docs/screenshot-main.png)

## 为什么不是又一个"AI 聊天套壳"

长篇写作真正的难点不是调通接口，而是三件事：

1. **上下文一致性** —— 三十章之后，AI 还记不记得沈砚的旧伤在右肩？
2. **可控采纳** —— 生成结果要能逐段对比、按需替换，而不是复制粘贴。
3. **不打断心流** —— 所有操作都在键盘上，选一段就能改，写完自动存。

墨隐围绕这三点设计：设定卡 + 摘要链 + 章纲 + 正文节选分层注入；改写走"分段对比 / 逐字对比"双视图；编辑器里选中文字就浮出操作条。

## 界面

| 大纲视图 | 三版同写 |
| --- | --- |
| ![大纲](docs/screenshot-outline.png) | ![多候选](docs/screenshot-multi.png) |

| 设定库 | 模型配置 |
| --- | --- |
| ![设定库](docs/screenshot-bible.png) | ![设置](docs/screenshot-settings.png) |

| 选中即改 | 改写对比 |
| --- | --- |
| ![选区操作](docs/screenshot-selection.png) | ![diff](docs/screenshot-diff.png) |

| 提示词模板 | 选择章节导出 |
| --- | --- |
| ![模板](docs/screenshot-writing.png) | ![导出](docs/screenshot-export.png) |

| 伏笔台账 | 全文搜索 |
| --- | --- |
| ![线索](docs/screenshot-threads.png) | ![搜索](docs/screenshot-search.png) |

| 写作统计 | |
| --- | --- |
| ![统计](docs/screenshot-stats.png) | |

| 文风预设与语感样本 | 人味评分 |
| --- | --- |
| ![文风](docs/screenshot-voice.png) | ![人味](docs/screenshot-human.png) |

| 角色语气 | |
| --- | --- |
| ![角色语气](docs/screenshot-voice-editor.png) | |

| 新手引导 | |
| --- | --- |
| ![引导](docs/screenshot-onboarding.png) | ![引导结束](docs/screenshot-onboarding-end.png) |

## 功能

**首次启动引导**
- 五步新手引导：欢迎 → 选文风 → 接模型 → 写作闭环 → 开始
- 引导内可直接选文风预设、跳转设置配模型，返回后继续原步骤
- 完成后不再自动弹出；设置 › 关于 可重新观看
- 方向键切换、Esc 跳过，尊重系统「减少动态效果」

**文风（让 AI 写得更像人）**
- 四种预设：**轻小说 / 网文 / 严肃文学 / 自定义**，每个预设都带可执行的写作细则（对话优先、短句、单句成段、去套语、章末钩子）
- 轻小说细则含**视点、对话独立成段、独白用（）、段落三行上限、语感示例与反例**；题材选「日本校园轻小说」再追加校园场景提示
- **语感样本**：粘贴一段你希望「读起来像这样」的文字（200-500 字），只学语气与节奏，不抄内容
- **角色语气库**：给人物记口癖、说话长短、常用词、禁用词；生成时按「本章出场」注入，对白能分清谁在说话
- **轻小说对白改写**：选中文字点「轻小说」，专治书面腔、没有停顿、两个人说话一个味
- 生成结果带 **人味评分**：检测套语密度、对话占比、句长变化、段落长度，并给出具体问题（例如「套语 11 处：仿佛×2、似乎×1」）
- 「去 AI 味」一键改写：删套语、把抽象情绪改成动作与对话

**写作**
- 三栏工作台：目录 / 正文 / AI 创作台，专注模式一键收起两栏
- 宋体排版、1.5 倍行距、字数与阅读时长、目标字数进度
- 自动保存（900ms 防抖）、手动 `Ctrl+S`、章节树拖拽排序、双击改名
- **历史版本**：AI 采纳前自动快照，带内容预览，可随时恢复；恢复前也会再存一份
- **回收站**：删除的章节先进回收站，可恢复或彻底删除
- 章节信息面板：卷名、状态（草稿 / 修订 / 定稿）、本章章纲、摘要
- **AI 命名**：按正文、摘要与章纲生成 3 个章节标题候选，点选后可改再保存；卷名同样支持 AI 起名
- 深色「墨夜」/ 浅色「宣纸」双主题，无边框窗口 + 自绘标题栏

**大纲与线索**
- 独立的「大纲」视图：按卷分组，逐章写章纲，失焦自动保存
- 每章可一键 **AI 章纲**：结合梗概、前情摘要与已写正文，给出 3-6 个节拍
- 章纲作为【本章章纲】注入；**伏笔台账**里的待回收线索作为【待回收伏笔】注入
- 线索记录埋设章 / 回收章，可标记已回收、重新打开

**AI 创作**
- 续写本章：流式输出，**从光标处插入**（光标在文末就接最后一句）
- 选中改写：去 AI 味 / 扩写 / 精简 / 改成对白 / 自由指令
- 改写结果支持**分段对比**与**逐字对比**，一键替换原文
- **三版同写**：并发生成 3 个候选；全部写完后自动评估，标出推荐版本、分数和「编辑视角」理由（评估失败时用本地文风分兜底），再挑一版采用
- **按段采纳**：把生成结果拆成段落勾选，只插入想要的部分
- 推理模型（如 deepseek-reasoner）会实时显示「思考过程」，不会假装卡死
- 上下文仪表：注入的 tokens、设定条数、摘要章数、本章章纲、旧文召回、伏笔、模型窗口

**设定库（记忆）**
- 人物 / 地点 / 势力 / 物品 / 设定五类卡片，支持别名与身份
- 人物卡可记「口癖 / 说话长度 / 常用词 / 禁用词」，出场时作为【角色语气】注入
- **AI 识别设定**：粘贴一段人物小传 / 大纲 / 片段，或直接用本章正文，AI 抽出人物、地点、势力、物品与世界观；先出预览卡，可改名字、类型、描述与语气，重名条目可选「合并 / 跳过 / 新建」，写入后可一键撤销
- 只抽取文本里真实写到的内容，不脑补；长文超过 2 万字自动截断
- 按「本章出场」相关度排序注入设定卡；前情按摘要链注入（最多 8 章）
- 章节写到 300 字且没有摘要时**自动生成**；正文继续增长会自动更新摘要
- **旧文召回**：本地关键词检索前文段落（无网络、无额外费用），把细节送进提示词
- 上下文硬上限：超出模型窗口时依次丢召回、减设定、缩摘要、缩正文，最后截断过长的固定块（梗概 / 章纲 / 语感样本），保证不超窗
- 上下文预算随模型窗口自适应（8k 本地模型不撑爆，128k 也不浪费）

**搜索与统计**
- 全文搜索：跨章节查找，点击跳转到对应位置；支持替换当前章
- 写作统计：最近 14 天字数柱状图、今日新增、近 7 天、连续写作天数

**模型与数据**
- 任意 OpenAI 格式服务：DeepSeek、OpenAI、OpenRouter、SiliconFlow、Ollama、LM Studio
- 多套配置一键切换，支持拉取 `/v1/models`、连通性测试、温度、最大输出、上下文窗口
- **提示词模板可编辑**：`{{title}} {{genre}} {{pov}} {{style}}` 四个变量，随时恢复默认
- 导入 txt / docx（按「第 N 章 / # 标题」自动切章，GBK 与 UTF-8 都能读）
- 导出 DOCX / Markdown / TXT，可按卷或勾选章节导出
- API Key 使用 **Windows DPAPI** 加密后再写入 SQLite，明文不落盘；全本地单机

## 快速开始

```bash
# 依赖：Node 20+、Rust（MSVC 工具链）、WebView2（Win11 自带）
npm install

# 开发（自动拉起 vite + tauri）
npm run app:dev

# 打包安装器（NSIS，输出在 src-tauri/target/release/bundle/nsis/）
npm run app:build

# 便携版单文件（不生成安装器）
npm run build
cd src-tauri && cargo build --release
# 产物：src-tauri/target/release/novel-studio.exe
```

> 若构建时报 `LNK1104` 或临时目录无权限，把 `TMP` / `TEMP` 指向项目内目录再编译即可。
> `npm run app:build` 首次执行会联网下载 NSIS 打包器。

已构建好的成品在 [GitHub Releases](https://github.com/sbx20100804/moyin-studio/releases)：安装版 `Moyin-Setup`、免安装版 `Moyin-Portable`。

开发时如果没有 API Key，可以先起一个本地假模型联调流式与改写链路：

```bash
node tools/mock-openai.cjs      # http://127.0.0.1:8899
```

然后在设置里把 Base URL 填 `http://127.0.0.1:8899`、模型填 `mock-writer`。

首次启动会建一个示例作品《长夜将明》，可直接体验；「设置 › 模型」里填 Base URL 与 API Key 即可开始。

### 常见服务配置

| 服务 | Base URL | 模型示例 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` / `deepseek-reasoner` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | 任意 |
| Ollama | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
| LM Studio | `http://127.0.0.1:1234/v1` | 本地已加载模型 |

Base URL 末尾写不写 `/v1` 都可以，程序会自动补全。

## 技术结构

```
src/                     React 18 + TypeScript + Tailwind 4 + Motion
  components/            TitleBar / Sidebar / Editor / Outline / Threads / AIPanel / Bible ...
  lib/store.ts           Zustand 状态机（项目、章节、草稿、生成、多候选、线索、统计）
  lib/ai.ts              提示词模板、上下文预算与硬裁剪、设定相关度、RAG 注入
  lib/api.ts             Tauri invoke 封装
src-tauri/
  src/db.rs              rusqlite + WAL、版本化迁移、检索 / 搜索 / 统计 / 线索
  src/ai.rs              SSE 流式、推理内容、摘要 / 章纲 / 设定抽取
  src/import.rs          txt / md / docx 解析与自动切章（含 GBK 解码）
  src/parent.rs          原生文件对话框挂到主窗口（raw-window-handle）
  src/secret.rs          DPAPI CryptProtectData / CryptUnprotectData（原生 FFI）
  src/export.rs          TXT / Markdown / 手写 OOXML 的 DOCX（zip）
  src/lib.rs             命令注册、无边框窗口创建、便携模式
```

生成链路：前端先做本地检索与伏笔收集 → 拼消息（含硬上限裁剪）→ `generate` 命令 → Rust 流式读 SSE → `ai://delta` / `ai://reasoning` 事件 → Zustand 累加 → 面板逐字渲染。取消通过 `AtomicBool` 逐块检查，90 秒无数据自动中止。多候选是三次并发请求，按 requestId 分流。

## 数据位置

- 默认：`%APPDATA%\com.moyin.novelstudio\moyin.db`
- 便携模式：设置环境变量 `MOYIN_DATA_DIR` 指向任意目录，数据库与 WebView 缓存都会落在那里
- 数据库带 `user_version` 迁移（当前 v4），升级不会丢稿

## 路线图

- [ ] 向量检索（替换现在的关键词召回），跨几十章的语义召回
- [ ] 矛盾检查（年龄、季节、伤势、称谓前后不一致）
- [ ] EPUB / PDF 导出与排版模板
- [ ] 批量生成队列（按章纲连写 N 章）
- [ ] 自动更新与代码签名
