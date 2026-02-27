# 项目记忆文件

## 版本变更记录

### v1.0.14 (2026-02-27) - AI 漫画翻译功能集成 [已发布]
- **[功能] AI 实时翻译漫画**
  - 目标：在阅读器中实现一键翻译日语漫画为中文
  - 架构：
    ```
    ┌─────────────────────────────────────────────────────────────┐
    │                 exhentai-manga-manager                      │
    │  [自动翻译: ON] ──▶ 启动两个后台服务                         │
    └─────────────────────────────────────────────────────────────┘
               │                          │
               ▼                          ▼
    ┌──────────────────────┐    ┌──────────────────────┐
    │  RTX 2080 Ti         │    │  RTX 2080 Ti         │
    │  manga-image-        │    │  llama-server.exe    │
    │  translator          │    │  GalTransl-v4-4B     │
    │  (OCR + Inpaint)     │    │  (日译中 LLM)        │
    │  端口: 5000          │    │  端口: 8080          │
    └──────────────────────┘    └──────────────────────┘
    ```

- **已完成工作**:
  1. ✅ 配置系统 - `modules/init_folder_setting.js` 添加 `translation` 配置项
  2. ✅ 翻译服务管理器 - `modules/translationService.js` 新建
  3. ✅ IPC 接口 - `index.js` 添加翻译服务相关 handlers
  4. ✅ 设置界面 - `src/components/Setting.vue` 添加翻译服务配置面板
  5. ✅ i18n - `src/locales/zh-CN.json` 添加翻译文本
  6. ✅ 日志去重 - llama-server 只从 stderr 读取日志
  7. ✅ 切换旧版本 - 新版本维护问题多，改用用户备份的旧版 manga-image-translator (Python 3.9)
  8. ✅ 安装文档 - 创建 `other_code/manga-image-translator/INSTALL.md`
  9. ✅ 直接使用虚拟环境 - 绕过 uv run，直接调用 `.venv\Scripts\python.exe`
  10. ✅ 配置 llama.cpp 翻译 - 设置 OPENAI_API_BASE 指向本地 llama-server，使用 gpt4 翻译器
  11. ✅ 修复 openai 库兼容性 - 修改 chatgpt.py 和 sakura.py 适配新版 openai 库
  12. ✅ 修复 httpx 兼容性 - 降级 httpx 到 0.27.2（openai 1.35.9 内部使用 proxies 参数）
  13. ✅ 修复健康检查端点 - 旧版本使用 `/queue-size` 而非 `/translate/image`
  14. ✅ 翻译服务启动成功 - llama-server + manga-image-translator 双服务正常运行
  15. ✅ 阅读器集成 - InternalViewer 添加自动翻译功能，检测日语漫画后自动开始翻译
  16. ✅ 翻译优先级 - 优先翻译当前阅读页面及其前后几页
  17. ✅ 翻译队列管理 - 切换漫画时清空队列
  18. ✅ 翻译重试机制 - 失败后重试最多3次
  19. ✅ 缓存结果处理 - 修复 `status: successful` 时的缓存获取逻辑
  20. ✅ 缓存损坏处理 - 缓存获取失败时自动删除损坏的缓存目录
  21. ✅ Viewer缓存清理 - 切换漫画时释放图片发送锁并清理缓存目录
  22. ✅ GPU配置优化 - llama-server 使用 GPU (-ngl 99)，manga-image-translator 使用 GPU (--use-gpu)
  23. ✅ 进程终止机制 - PID 文件记录 + process.exit 同步清理 + 启动时清理残留
  24. ✅ 设置保存 - 添加 @change="saveSetting" 确保翻译开关设置持久化
  25. ✅ 日志增强 - 添加缓存删除、翻译状态等详细日志
  26. ✅ 日语漫画检测 - tags 判断 + OCR 检测混合方案，确保正确识别日语漫画
  27. ✅ 切换漫画翻译 - 取消之前翻译任务 + 清空翻译队列 + 清理缓存
  28. ✅ 翻译服务就绪检测 - 服务启动后自动开始翻译

- **当前问题**: 无

- **最近修改 (2026-02-27)**:
  - `modules/translationService.js`:
    - 添加 PID 文件管理 (`savePids`, `loadPids`, `getPidFilePath`)
    - 添加启动时清理残留进程 (`cleanupOrphanProcesses`)
    - 添加 `process.on('exit')` 同步清理子进程
    - 添加 `process.on('SIGINT')` 处理 Ctrl+C
    - 启动进程时保存 PID
    - `stopAll()` 使用同步 `execSync` 确保在进程退出前完成
  - `index.js`:
    - 改进 `clearFolder()` 逐个删除文件，跳过 EBUSY/EPERM 错误
    - 添加详细日志（删除数量、跳过数量）
    - `load-manga-image-list` 释放锁等待 300ms 后清空缓存
    - 移除 `process.on('exit')` 中的 `translationService.stopAll()`（避免重复）
    - 添加 `detect-image-language` API 用于 OCR 检测图片语言
  - `src/components/InternalViewer.vue`:
    - 移除所有 `ipcRenderer.invoke('debug-log')` 调用（避免序列化问题）
    - 优化日语漫画检测：tags 判断失败时使用 OCR 检测中间页面
    - 添加 `pendingOCRDetect` 标志支持 OCR 检测流程
    - 精简调试日志，只保留关键日志

- **旧版本 manga-image-translator 特点**:
  - Python 3.9 环境 (uv venv --python 3.9)
  - 支持多种翻译器：youdao, baidu, deepl, gpt3.5, gpt4, nllb, sakura 等
  - 可通过 `gpt4` 翻译器 + OPENAI_API_BASE 环境变量连接本地 llama-server
  - 启动命令：`-m web --host 127.0.0.1 --port 5000 --translator gpt4 --use-gpu`
  - 安装说明见 `other_code/manga-image-translator/INSTALL.md`

- **已解决的兼容性问题**:
  1. `openai.AsyncOpenAI()` 不支持后设置 `base_url` 和 `api_key` → 在构造函数中传入
  2. `httpx 0.28.x` 移除 `proxies` 参数，openai 1.35.9 内部使用 → 降级 httpx 到 0.27.2
  3. 旧版 web API 没有 `/translate/image` 端点 → 改用 `/queue-size` 健康检查
  4. Vue Proxy 对象无法通过 IPC 序列化 → 移除 `debug-log` 调用
  5. 缓存结果获取错误 - 缓存任务不在 TASK_STATES 中 → 直接处理 `status: successful`

- **配置项** (`setting.translation`):
  ```javascript
  {
    enabled: false,
    autoStart: false,
    mangaTranslatorPath: '项目根目录/other_code/manga-image-translator',
    mangaTranslatorPort: 5000,
    targetLang: 'CHS',
    llamaServerPath: 'D:\\soft\\to_run\\ai\\chatai\\no_model\\llama-b8149-bin-win-cuda-12.4-x64\\llama-server.exe',
    llamaModelPath: 'D:\\soft\\to_run\\ai\\chatai\\model\\GalTransl-v4-4B-2512.gguf',
    llamaPort: 8080,
    gpuDevice: 0
  }
  ```

- **硬件环境**:
  - RTX 2080 Ti (22GB) - 同时运行 manga-image-translator 和 llama-server
  - RTX 3060 (12GB) - 备用
  - LLM: GalTransl-v4-4B-2512.gguf (专用日译中模型)

- **涉及文件**:
  - `modules/init_folder_setting.js` - 配置默认值
  - `modules/translationService.js` - 服务管理器 + PID 管理 + 进程清理
  - `index.js` - IPC handlers + 缓存清理 + 详细日志
  - `src/components/Setting.vue` - 设置界面
  - `src/components/InternalViewer.vue` - 阅读器 + 自动翻译
  - `src/locales/zh-CN.json` - i18n
  - `other_code/manga-image-translator/manga_translator/translators/chatgpt.py` - 修改适配新版 openai
  - `other_code/manga-image-translator/manga_translator/translators/sakura.py` - 修改适配新版 openai

### v1.0.13 (2026-02-27) - 管理界面退出按钮修复 [已解决]
- **[修复] 管理标签/管理合集界面无法退出**
  - **问题**: 进入管理标签或管理合集模式后，左侧边栏被隐藏，退出按钮也随之隐藏，无法退出
  - **根因**: 左侧边栏容器 `v-if="!editTagView && !editCollectionView"` 导致整个侧边栏在编辑模式下被隐藏
  - **解决方案**: 在 EditView.vue 的操作面板顶部添加退出按钮
  - **涉及文件**: `src/components/EditView.vue`

### v1.0.12 (2026-02-27) - 紧凑模式悬浮预览修复 [已解决]
- **[修复] 紧凑模式悬浮预览不显示**
  - **问题**: BookCardCompact.vue 的 el-popover 完全不显示
  - **根因**: 
    1. 紧凑列表的父容器 `.book-card-list` 有 `overflow-y: auto`
    2. 紧凑列表项 `width: 100%` 占满宽度
    3. 普通的 `el-popover` 定位依赖 reference 元素，在这种布局下定位失败
  - **解决方案**:
    1. 添加 `:teleported="true"` 让 popover 挂载到 body，避免被 overflow 裁剪
    2. 使用 `virtual-triggering` + `:virtual-ref` 实现鼠标位置跟随
    3. 通过 `@mousemove` 更新虚拟元素的 `getBoundingClientRect` 返回值
  - **涉及文件**: `src/components/BookCardCompact.vue`

### v1.0.11 (2026-02-27) - 作者拉黑功能与主界面左右布局 [已解决]
- **[功能] 作者拉黑功能**
  - 漫画详情页右键点击作者标签可选择"拉黑作者"
  - 被拉黑的作者标签显示红色
  - 漫画列表自动隐藏"所有作者都被拉黑"的漫画
  - 设置页面新增"高级"标签下的黑名单管理区域
  - 可在设置页面查看和移除已拉黑的作者
  - 涉及文件：`BookDetailDialog.vue`、`Setting.vue`、`pinia.js`、`init_folder_setting.js`、`zh-CN.json`

- **[UI] 主界面左右布局重构**
  - 将顶部搜索栏功能移至左侧固定宽度侧边栏
  - 左侧边栏包含：搜索框、排序/筛选、显示模式切换、操作按钮
  - 右侧为漫画卡片列表区域
  - 隐藏原有顶部搜索栏和随机标签组件
  - 设置页面也改为左右布局（左侧菜单，右侧内容）
  - 涉及文件：`App.vue`、`Setting.vue`

### v1.0.10 (2026-02-26) - 阅读器与标题显示优化 [已解决]
- **[优化] 阅读器模式切换按钮可见性**
  - **问题**: 模式切换按钮默认透明度 0.1，几乎不可见，用户找不到
  - **解决**: 将 `.viewer-mode-setting` 透明度从 0.1 改为 0.7

- **[优化] 默认阅读模式**
  - **问题**: 默认滚动模式不符合漫画阅读习惯
  - **解决**: 默认模式从 `scroll` 改为 `single`（单页/左右翻页）

- **[修复] Hitomi 元数据标题字段映射错误**
  - **问题**: 
    1. Hitomi msgpack 数据中只有 `item.n`（主标题），不存在 `item.n_jp`
    2. 代码错误地使用不存在的 `n_jp` 字段作为日文标题
    3. 导致"标题"字段始终为空，"英文标题"显示日文内容
  - **解决**: 
    1. 根据标题内容检测是否包含日文字符 `[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]`
    2. 日文标题 → 存入 `title_jpn`，英文标题 → 存入 `title`
    3. 同时更新数据库和前端显示

### v1.0.9 (2026-02-26) - 分页与元数据显示修复 [已解决]
- **[修复] 漫画详情页元数据不显示**
  - **问题根因**:
    1. Worker 初始化竞争条件：`sendToWorker` 使用 100ms 硬编码等待，Worker 可能未完成初始化
    2. 设置文件缺失字段：`hitomiDataPath` 在旧设置文件中不存在，`prepareSetting` 不会合并默认值
    3. Vue 响应式更新：元数据更新后未同步到 `bookDetail.value`
  - **解决方案**:
    1. 添加 `workerReadyPromise` 等待 Worker 完全初始化后再发送消息
    2. `prepareSetting` 使用 `{ ...defaultSetting, ...setting }` 合并默认值
    3. 直接更新 `bookDetail.value` 而非局部变量
    4. 放宽元数据获取条件支持 `undefined`/空状态

- **[修复] 分页器初始化显示所有漫画**
  - **问题根因**: `pagination.pageSize` 默认值为 200，而 `setting.pageSize` 为 12，初始化时未同步
  - **解决方案**: `loadBookList` 开始时同步 `this.pagination.pageSize = this.setting.pageSize`

- **[修复] 分页器页码高亮错误**
  - **现象**: 点击页码后内容正确切换，但页码按钮高亮始终停留在第一页
  - **问题根因**: `currentPage` setter 使用 `displayBookCount`（当前页数据量，最多12条）计算总页数，导致 `pageLimit=1`
  - **解决方案**: 使用 `lockedTotalForUI`（数据库总数）替代 `displayBookCount` 计算总页数

### v1.0.8 (2026-02-26) - 90万级HDD架构终极方案 [部分解决]
- **[尝试] 视图绝对冻结**
  - 新增 `lockedTotalCount` 和 `scanningTotal` 变量
  - 分页器绑定 `lockedTotalCount`，扫描时只更新 `scanningTotal`
  - 问题：**页码回跳仍未解决** → **v1.0.9 已修复**
- **[尝试] 磁头避让呼吸法**
  - 每扫描一本书强制睡眠 10ms
  - 用户活动时扫描器冬眠 2 秒
  - 问题：**详情页加载仍然卡顿**
- **[尝试] Worker Thread 隔离**
  - 创建 `fileLoader/worker.js` 处理元数据解析
  - 问题：**封面生成仍在主线程，解压操作阻塞 UI**
- **[尝试] 7z 解压路径修正**
  - 将 `x` 命令改为 `e` 命令（忽略压缩包内路径）
  - 问题：**ENOENT 错误仍有发生**
- **[尝试] 数据库优化**
  - 开启 WAL 模式，256MB 缓存
  - `findAll` 只加载轻量字段
  - 问题：**首次加载仍然缓慢**

### ⚠️ 核心未解决问题

#### ~~问题 1: 页码回跳~~ [v1.0.9 已解决]
- **现象**: 用户点击页码后，页面会短暂显示正确内容，然后跳回第一页或随机页
- **已尝试措施**:
  1. `lockedTotalCount` 变量隔离
  2. 扫描时不更新分页器总数
  3. `isPaginationLocked` 标志位
  4. 删除 `refresh-book-list` 的自动刷新
- **根因**: `currentPage` setter 使用 `displayBookCount`（当前页数据量）计算总页数，而非 `lockedTotalForUI`（数据库总数）
- **解决**: 修改 `currentPage` setter 使用 `lockedTotalForUI` 计算总页数

#### ~~问题 2: 详情页加载卡顿~~ [v1.0.12 已解决]
- **现象**: 点击书籍打开详情页时，UI 冻结数秒
- **根因**: 封面解压（7z）在主线程执行阻塞 UI
- **解决方案**: 通过 `get-metadata-now` IPC 实现抢占式优先级调度，用户操作时后台任务主动让出

#### ~~问题 3: ENOENT 错误~~ [v1.0.12 已解决]
- **现象**: 封面生成时找不到临时文件
- **根因**: 并发竞争或 Windows 文件锁
- **解决方案**: 
  1. 7z `e` 命令替代 `x` 命令
  2. 独立 `taskTempDir` 子目录
  3. 添加文件存在性检查和重试机制

#### ~~问题 4: 紧凑模式悬浮预览不显示~~ [v1.0.12 已解决]
- **现象**: 
  - 卡片模式 (BookCard.vue) 的 el-popover 悬浮预览正常工作
  - 紧凑列表模式 (BookCardCompact.vue) 的 el-popover 完全不显示
  - `showPreview.value = true` 已被正确设置（console.log 确认）
  - 无任何 JavaScript 错误
- **根因**: 
  - 紧凑列表的父容器 `.book-card-list` 有 `overflow-y: auto`
  - 紧凑列表项 `width: 100%` 占满宽度
  - 普通的 `el-popover` 定位依赖 reference 元素，在这种布局下定位失败
- **解决方案**:
  1. 添加 `:teleported="true"` 让 popover 挂载到 body，避免被 overflow 裁剪
  2. 使用 `virtual-triggering` + `:virtual-ref` 实现鼠标位置跟随
  3. 通过 `@mousemove` 更新虚拟元素的 `getBoundingClientRect` 返回值
  4. 最终效果：预览紧贴鼠标位置显示
- **关键代码**:
  ```vue
  <el-popover
    :visible="showPreview"
    placement="right-start"
    :teleported="true"
    :virtual-ref="virtualRef"
    virtual-triggering
  >
  ```
  ```javascript
  const virtualRef = ref({
    getBoundingClientRect: () => ({
      top: mouseY.value, right: mouseX.value,
      bottom: mouseY.value, left: mouseX.value
    })
  })
  ```
- **涉及文件**: `src/components/BookCardCompact.vue`

### 架构决策记录

1. **ESM 兼容性**: `p-limit` 是纯 ESM，改用手动队列实现
2. **SQLite WAL**: 必须开启以支持 90 万级记录
3. **分页策略**: 后端必须分页，前端最多持有 500 条数据
4. **HDD 优化**: 扫描器必须让出 IO 给用户操作

### 代码位置索引

| 功能 | 文件 | 行号 |
|------|------|------|
| 扫描循环 | index.js | ~735 |
| get-metadata-now | index.js | ~1345 |
| 分页器 | App.vue | ~165 |
| Worker | fileLoader/worker.js | 1-220 |
| 7z 解压 | fileLoader/archive.js | ~30 |
| 数据库模型 | modules/database.js | ~5 |

---

### v1.0.7 (2026-02-26) - 优先级抢占与视图隔离
- **[核心] 抢占式优先级槽位**
  - `get-metadata-now` IPC 设置 `prioritySlotActive = true` 标志
  - 封面生成循环检测 `prioritySlotActive`，用户操作时主动让出
  - 无论后台有多少扫描任务在排队，详情页请求立即执行
- **[核心] 扫描完成通知**
  - `performLibraryScan` 结束时发送 `scan-complete` 而非 `refresh-book-list`
  - 使用 `Promise.all([coverPhase, metadataPhase])` 等待所有后台阶段完成
  - 前端收到 `scan-complete` 后只更新计数，不自动刷新列表
- **[核心] HDD 抢占让出机制**
  - 封面队列循环检测 `prioritySlotActive`，睡眠 100ms 让出
  - 确保用户交互（详情页）不被后台任务阻塞
- **[UI] 扫描完成消息增强**
  - 显示完整统计：新书数、封面生成数、元数据匹配数

### v1.0.6 (2026-02-26) - Komga 三线程解耦重构
- **[核心] 前端分页"隔离锁"**
  - 彻底删除 `customChunk` 函数，前端不再做任何数组切片
  - `displayBookList` 只接受 `load-book-list-paged` 返回的分页数据
  - `refresh-book-list` 改为只刷新当前页 (`handleCurrentPageChange`)
  - 后台扫描不会向 `displayBookList` 推入全量数据
- **[核心] 详情页"瞬时补全"**
  - 增强 `get-metadata-now` IPC：同时处理封面生成和元数据获取
  - 单次调用，优先级高于后台任务
  - 返回结构包含 `coverGenerated`、`metadataFound`、`coverPath`、`metadata`
- **[核心] 三阶段并行扫描队列**
  - **Phase 1 ScanQueue (并发10)**: 快速扫描文件，仅创建数据库记录，UI立即可见书名
  - **Phase 2 CoverQueue (并发1)**: HDD优化，低并发封面生成
  - **Phase 3 MetadataQueue (并发2)**: 轻量级 Hitomi 元数据匹配
  - 每个阶段都是 `fire and forget`，互不阻塞
- **[UI] 列表模式纯净化**
  - `BookCardCompact.vue` 物理移除所有 `<img>` 标签
  - 使用 CSS 背景图片替代 DOM 图片元素
  - 悬浮预览延迟 300ms 加载，使用 `el-popover`
- **[修复] 图标导入错误**
  - `ImageOutline` → `ImageOutlined` (`@vicons/material` 正确命名)

### v1.0.5 (2026-02-26) - Yamato Incident 深度修复
- **[紧急] 修复数据解析导致的渲染崩溃 (红线 0)**
  - index.js: 在 `load-book-list-paged` 返回前解析 `tags` 字段（JSON字符串→对象）
  - pinia.js: 在 `tagList`、`tagListRaw`、`tag2cat` getter 添加 `Array.isArray()` 防御检查
- **[紧急] 数据库更新脱敏 (Yamato 标题覆盖根因修复)**
  - 严禁在 `Manga.update` 中传递整个对象，必须显式定义更新字段
  - 修复 `loadBookListFromDatabase` L316: 显式列出 9 个字段而非传递 `findMetadata`
  - 修复 `saveBookToDatabase` L334: 显式列出 17 个字段而非传递 `book`
  - 所有日志输出添加 `(id: ${book.id})` 确保可追溯
- **[紧急] 彻底的物理空间隔离 (红线 1)**
  - 废弃全局 `clearFolder(TEMP_PATH)` 调用
  - fileLoader/index.js: `geneCover()` 创建独立 `taskTempDir`
  - fileLoader/archive.js: `targetFilePath` 和 `tempCoverPath` 写入 `tempFolder` 而非 `TEMP_PATH`
  - fileLoader/zip.js: 同上
  - index.js: `processCoverInBackground()` 只清理自己的 `taskTempDir`
- **[重要] 引用安全重构**
  - `booksNeedingCover.push({ ...foundData, filepath, type })` 创建数据快照
  - `booksToProcess = [...booksNeedingCover]` 创建新数组
  - 切断内存引用，防止并发竞争导致的对象污染
- **[优化] EBUSY 重试机制**
  - `sharp.toFile()` 添加 200ms 延迟重试（最多 3 次）
  - `processCoverInBackground` 添加 EBUSY/ENOENT 重试

### v1.0.4 (2026-02-26)
- 修复loadLibraryList方法未映射到App.vue
- 为pinia.js添加ipcRenderer全局定义
- 修复BookCard.vue封面路径转换问题（添加getCoverUrl和generateCoverOnDemand）
- 添加详细调试日志以排查标题显示问题
- 记录BUG清单，形成维护手册

### v1.0.3 (2026-02-26)
- 修复ipcRenderer未定义问题
- 修复viewMode重复定义问题
- 从old_code/backup_v3完整复制index.js(包含hitomi元数据导入功能)
- 从old_code/backup_v3复制modules/database.js(包含prepareLibraryModel)
- 添加concurrently支持npm run dev同时运行vite和electron
- 在main.js添加全局ipcRenderer定义
- 添加多漫画库管理功能(pinia.js添加libraryList状态和方法)
- 添加Setting.vue库管理界面和dialog
- 添加相关i18n翻译
- 修复启动时不会自动扫描库的bug - App.vue中修改启动逻辑，无条件扫描库
- 修复loadBookList后没有设置displayBookList和调用chunkList的问题
- 扫描完成后通知前端刷新

### v1.0.0 (2026-02-26)
- 项目初始化，从exhentai-manga-manager fork

---

## BUG记录与解决方案（翻译功能相关）

### BUG-TR-001: 翻译设置未保存
**描述**: 启用自动翻译和应用启动时自动启动服务后，重启应用设置未保存
**现象**: 重启后翻译开关恢复为关闭状态
**原因**: `src/components/Setting.vue` 中翻译开关缺少 `@change="saveSetting"` 绑定
**解决**: 添加 `@change="saveSetting"` 到所有翻译相关开关
**状态**: ✅ 已修复

### BUG-TR-002: isJapaneseBook 判断逻辑错误
**描述**: 用户报告只应通过元数据 language 标签判断日语漫画，不应检查 title_jpn
**现象**: 即使 language 标签不包含 japanese，也可能被误判为日语漫画
**原因**: 原代码同时检查 language 标签和 title_jpn
**解决**: 移除 title_jpn 检查，只检查 `tags.language` 数组是否包含 'japanese'
**状态**: ✅ 已修复

### BUG-TR-003: 翻译服务启动时序问题
**描述**: 用户先打开漫画阅读器，翻译服务后启动时，翻译不会自动开始
**现象**: 翻译服务就绪后，阅读器没有收到通知，翻译未启动
**原因**: 监听器只在翻译服务状态变化时触发，服务启动后再打开漫画不会触发
**解决**: 添加 `translationServiceReady` 状态和 `showTranslationLoadingTip` 提示，服务就绪时自动开始翻译
**状态**: ✅ 已修复

### BUG-TR-004: 翻译服务就绪检测不准确
**描述**: HTTP 服务启动后立即返回就绪，但模型还未加载完成
**现象**: 翻译请求提交后失败或无响应
**原因**: 只检查 HTTP 端口是否监听，未检查模型是否加载
**解决**: 
1. 监听 stdout/stderr 输出，检测 "Waiting for translation tasks" 标志
2. 添加 10 秒等待确保模型完全就绪
3. HTTP 启动 + 模型加载完成 才认为服务就绪
**状态**: ✅ 已修复

### BUG-TR-005: 缓存结果返回错误
**描述**: manga-image-translator 返回缓存结果但 index.js 轮询 task-state 失败
**现象**: 所有图片返回 "Translation error: error"
**原因**: 
1. 缓存结果返回 `status: successful` 
2. 缓存任务不在 TASK_STATES 中
3. `/task-state` 返回 `{'state': 'error'}`
**解决**: 检查 `submitResult.status === 'successful'` 时直接获取结果，不轮询 task-state
**状态**: ✅ 已修复

### BUG-TR-006: 缓存循环问题
**描述**: 缓存结果获取失败后无限重试，陷入循环
**现象**: "使用缓存结果" → "缓存结果获取失败，尝试删除缓存重试" → "使用缓存结果" 循环
**原因**: 缓存目录存在但没有 final.jpg 文件（翻译失败时残留）
**解决**: 
1. 缓存获取失败时删除损坏的缓存目录
2. 删除后抛出错误让前端重试
**状态**: ✅ 已修复

### BUG-TR-007: 点击×关闭后显存未释放
**描述**: 点击窗口右上角×或 Ctrl+C 关闭应用后，显存仍然占用 15GB+
**现象**: 必须手动执行 `taskkill /IM python.exe /F` 才能释放显存
**原因**: 
1. `stopAll()` 是异步的，主进程被杀死时可能还未完成
2. 子进程未正确终止
**解决**: 
1. PID 文件记录子进程 PID (`%TEMP%\exhentai-manga-manager-translation-pids.json`)
2. `process.on('exit')` 使用同步 `execSync(taskkill /T /F)` 强制终止进程树
3. 启动时自动清理上次的残留进程
**状态**: ⚠️ 已实现，待用户验证

### BUG-TR-008: 显存冲突（旧版，已不存在）
**描述**: 切换漫画时清理 viewer 缓存目录失败，文件被占用 (EBUSY)
**现象**: "Error: EBUSY: resource busy or locked, unlink 'xxx.webp'"
**原因**: 
1. 之前的图片发送进程还在运行
2. 文件句柄未释放就尝试删除
**解决**: 
1. 切换漫画时先释放 `sendImageLock`
2. 等待 300ms 让操作完成
3. 逐个删除文件，跳过 EBUSY 错误
**状态**: ✅ 已修复

### BUG-TR-009: 切换漫画时 Viewer 缓存文件被占用
**描述**: 切换漫画后，旧的翻译任务仍在队列中执行
**现象**: 翻译的是旧漫画的页面，而非当前漫画
**原因**: 切换漫画时没有清空 manga-image-translator 的队列
**解决**: 
1. 添加 `/cancel-all` 端点到 web_main.py
2. 添加 `clear-translation-queue` IPC handler
3. 切换漫画时自动清空队列
**状态**: ✅ 已修复

### BUG-TR-010: 切换漫画时翻译队列未清空
**描述**: 切换到第二本漫画后，立即卡在 "Saved [xxx]" 不动
**现象**: 日志显示保存成功，但没有翻译日志，阅读器不响应
**原因**: Viewer 缓存目录清理不彻底，图片加载卡住
**状态**: ⚠️ 已添加详细日志，待用户验证

### BUG-TR-011: 切换漫画后阅读器卡住
**描述**: 切换到第二本漫画后，立即卡在 "Saved [xxx]" 不动
**现象**: 日志显示保存成功，但没有翻译日志，阅读器不响应
**原因**: Viewer 缓存目录清理不彻底，图片加载卡住
**状态**: ⚠️ 已添加详细日志，待用户验证

### BUG-TR-012: 点击×关闭后显存未释放
**描述**: 点击窗口右上角×或 Ctrl+C 关闭应用后，显存仍然占用 15GB+
**现象**: 必须手动执行 `taskkill /IM python.exe /F` 才能释放显存
**原因**: 
1. `stopAll()` 是异步的，主进程被杀死时可能还未完成
2. 子进程未正确终止
**解决**: 
1. PID 文件记录子进程 PID
2. `process.on('exit')` 使用同步 `execSync` 强制终止
3. 启动时自动清理上次的残留进程
**状态**: ⚠️ 已实现，待用户验证

### BUG-TR-013: Vue Proxy 对象无法通过 IPC 序列化
**描述**: 使用 `ipcRenderer.invoke('debug-log')` 传递调试数据时出错
**现象**: "An object could not be cloned"
**原因**: Vue 的 Proxy 对象（如 `book?.tags`）无法序列化
**解决**: 移除所有 `debug-log` 调用，或只传递基本类型
**状态**: ✅ 已修复

---

## BUG记录与解决方案

### BUG-001: ipcRenderer未定义
**描述**: InternalViewer.vue和Setting.vue中调用ipcRenderer报错
**现象**: `ReferenceError: ipcRenderer is not defined`
**原因**: preload.js中暴露的ipcRenderer在某些组件中未访问到
**解决**:
- 在main.js中添加全局定义：`window.ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve(), on: () => {}, sendSync: () => null }`
- 在components中统一使用：`const ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve(), on: () => {} }`

### BUG-002: viewMode重复定义
**描述**: Vue组件中data和computed同时定义了viewMode
**现象**: `Computed property "viewMode" is already defined in Data`
**解决**: 移除data中的重复定义，只保留computed中的定义

### BUG-003: prepareLibraryModel未定义
**描述**: index.js引入prepareLibraryModel但modules/database.js未导出
**现象**: `TypeError: prepareLibraryModel is not a function`
**解决**: 从old_code/backup_v3复制完整的modules/database.js（包含prepareLibraryModel函数）

### BUG-004: loadLibraryList方法未映射
**描述**: App.vue调用this.loadLibraryList()但未在mapActions中定义
**现象**: `Uncaught TypeError: this.loadLibraryList is not a function`
**解决**: 在App.vue的methods中添加：
```javascript
...mapActions(useAppStore, [
  'loadLibraryList',
  'addLibrary',
  'updateLibrary',
  'deleteLibrary',
])
```

### BUG-005: libraryList为undefined
**描述**: loadLibraryList()调用后libraryList为undefined
**现象**: console显示 "libraryList: undefined"
**原因**: pinia.js中的loadLibraryList未处理错误
**解决**: 在pinia.js中为loadLibraryList添加try-catch，并添加调试日志

### BUG-006: 启动后不扫描库
**描述**: 只有loadOnStart为true时才扫描，导致新用户看不到漫画
**现象**: 有库配置但不自动扫描
**解决**: 修改App.vue的启动逻辑，无条件在后台扫描（如果配置了库）
```javascript
if (this.libraryList && this.libraryList.length > 0) {
  this.loadBookList(true)
} else if (this.setting.library) {
  this.loadBookList(true)
}
```

### BUG-007: 扫描后漫画不显示
**描述**: 扫描完成但界面不更新
**现象**: 数据库有数据但GUI不显示
**原因**:
1. loadBookList没有设置displayBookList
2. 没有调用chunkList()生成分页数据
**解决**:
```javascript
this.bookList = bookList
this.displayBookList = bookList
this.chunkList()
```

### BUG-008: 封面无法显示
**描述**: 大部分漫画没有coverPath，封面图片404
**现象**: 封面图片broken，network显示404
**原因**: BookCard.vue直接使用book.coverPath未处理文件路径转换
**解决**: 添加getCoverUrl函数转换路径格式，并在onError时触发generateCoverOnDemand动态生成封面

### BUG-009: 所有漫画显示同一标题（进行中）
**描述**: GUI中所有漫画卡片显示相同的标题
**现象**: 日志显示数据正确（First chunk book标题不同），但界面所有标题相同
```
console: First chunk book: 純愛&NTR欲張りセット~弓道部部長ver.
console: Second chunk book: 初夢福袋企画まとめ
GUI: 所有卡片都显示"純愛&NTR欲張りセット~弓道部部長ver."
```
**可能原因**:
1. Vue响应式问题：bookList对象可能被共享引用
2. v-for的key问题：所有漫画id可能相同
3. getDisplayTitle函数中的setting.displayTitle可能读取错误
**调试**: 已添加console.log查看BookCard接收到的数据
**待验证**: 检查每个book.id是否唯一，检查visibleChunkDisplayBookList计算属性

### BUG-010: 封面生成失败（ENOENT）
**描述**: 大量错误 `Error: ENOENT: no such file or directory, open 'tmp/xxx.webp'`
**现象**: 
```
[Error: ENOENT: no such file or directory, open 'C:\Users\x\AppData\Roaming\exhentai-manga-manager\tmp\55yst2l6.webp']
Patch G:\hitomi\单行本\[...].cbz failed because Error: ENOENT
```
**原因**: patch-local-metadata-by-book在尝试读取tmp目录下的临时文件时文件不存在
**推测**: 并发封面生成导致临时文件被提前删除或清理
**状态**: 需要检查tmp目录管理逻辑

### BUG-011: EBUSY文件锁定（Windows）
**描述**: `Error: EBUSY: resource busy or locked, unlink 'tmp/xxx.webp'`
**现象**: Windows上删除临时文件失败，文件被占用
**原因**: 多个进程/线程同时操作同一tmp文件，或文件句柄未释放
**状态**: 需要优化tmp文件清理逻辑，添加重试机制

### BUG-012: 扫描速度慢，无进度条
**描述**: 扫描74721本书需要约2分钟，期间无视觉反馈
**现象**:
- 启动后约1分钟才开始扫描（loadLibraryList耗时）
- 扫描过程中GUI无进度条，只看到console日志
- 用户以为卡死
**原因**:
1. loadLibraryList()是异步的，且没有加载反馈
2. 扫描进度只发送到console，未更新到UI进度条
**期望**: Komga式体验 - 瞬间显示已有数据，边扫边更新进度条和新增漫画
**待实现**: 
- 实现实时进度条（监听send-progress事件并更新progress变量）
- 实现增量添加漫画（扫描到新书立即插入displayBookList并更新chunkDisplayBookList）

### BUG-013: 数据格式崩溃 (The Yamato Incident)
**描述**: WebUI 无法渲染，`TypeError: tags.forEach is not a function`
**现象**: 
- RandomTags 组件无法显示
- 控制台报错 `tags.forEach is not a function`
**原因**: 
1. Sequelize `raw: true` 返回原始数据，`tags` 字段是 JSON 字符串而非对象
2. pinia.js 的 getter 直接对 `b.tags` 调用 `_.forEach()`，未做类型检查
**解决**:
1. 主进程修复：`load-book-list-paged` 返回前遍历 data，`JSON.parse(book.tags)`
2. 前端防御：getter 中添加 `if (!b.tags || typeof b.tags !== 'object') return []`
**状态**: ✅ 已修复

### BUG-014: 分页失效 (The Pagination Crisis)
**描述**: 前端仍然一次性加载全量数据，分页不生效
**现象**:
- `customChunk` 函数仍在 `handleRemoveBookDisplay` 中被调用
- `refresh-book-list` 会触发 `loadBookList()` 加载全量数据
**原因**:
1. `customChunk` 未被删除，仍在前端做数组切片
2. 扫描完成的通知会覆盖分页数据
**解决**:
1. 彻底删除 `customChunk` 函数
2. `handleRemoveBookDisplay` 改为调用 `handleCurrentPageChange(this.currentPage)`
3. `refresh-book-list` 只刷新当前页，不加载全量数据
**状态**: ✅ 已修复

### BUG-015: 元数据滞后 (The Metadata Lag)
**描述**: 用户打开详情页时，需要等待后台扫描完成才能看到封面和标签
**现象**:
- 用户点击某本书查看详情，显示"non-tag"状态
- 封面空白，需要等后台队列轮到这本书才会生成
**原因**:
- 封面和元数据按扫描顺序排队处理，用户查看的书可能排在队尾
**解决**:
- 实现"抢占式调度"：`get-metadata-now` IPC 优先于后台队列
- 详情页打开时，立即同步生成封面和获取元数据
- 不再等待后台扫描，用户查看哪本就先处理哪本
**状态**: ✅ 已修复

---

## 核心问题诊断

### 问题1：所有漫画标题相同

**检查点**：
1. 数据库中每本书的title字段是否都相同？
2. bookList数组中的每个book对象的title属性是否不同？
3. v-for的:key是否使用book.id？（确保id唯一）
4. getDisplayTitle函数中的setting.displayTitle是否全局响应式？

**需要验证的代码**：
```javascript
// App.vue line 118
v-for="(book, index) in visibleChunkDisplayBookList"
:key="book.id"  // ← 检查book.id是否每个都不同

// pinia.js getDisplayTitle
getDisplayTitle (book) {
  switch (this.setting.displayTitle) {
    case 'japaneseTitle':
      return book.title_jpn || book.title  // ← book.title_jpn是否都为空？
  }
}
```

### 问题2：封面生成失败

**tmp目录问题**：
- 位置：`C:\Users\x\AppData\Roaming\exhentai-manga-manager\tmp`
- 错误：ENOENT（文件不存在）、EBUSY（文件被占用）
- 可能原因：
  1. getImageListByBook从cbz提取第一页后，tmp文件立即被删除
  2. 并发请求导致竞争条件
  3. Windows文件锁释放慢

**建议**：
- 检查fileLoader/index.js中的tmp文件管理
- 确保generateCoverOnDemand和getImageListByBook不冲突
- 考虑使用独立的tmp子目录或文件名加锁

---

## 系统架构说明

### 数据流程
1. **启动**:
   - 加载setting.json
   - 调用get-libraries获取漫画库列表
   - 调用load-book-list(scan=false) 立即返回数据库中的漫画
   - 在后台调用load-book-list(scan=true) 开始增量扫描

2. **扫描**:
   - 遍历所有enabled的Library
   - 扫描每个库的cbz/pdf文件
   - 与数据库对比，新增/更新/删除记录
   - 每1000本发送一次进度消息
   - 扫描完成后发送"Scan complete"消息
   - 后台生成封面（fire and forget）

3. **进度**:
   - 主进程通过sendMessageToWebContents发送文本消息到GUI消息区域
   - 通过setProgressBar发送进度数字（显示在顶部系统进度条）
   - 通过send-action刷新列表

### 关键文件

#### 主进程 (index.js)
- `load-book-list`: IPC handler，返回数据库数据，后台触发扫描
- `load-book-list-paged`: **分页加载**，返回 { data, total, page, pageSize, totalPages }
- `get-metadata-now`: **抢占式元数据获取**，优先于后台任务，同时处理封面和元数据
- `generate-cover-priority`: 优先封面生成，用于视口内书籍
- `performLibraryScan`: **三阶段解耦扫描**（ScanQueue → CoverQueue → MetadataQueue）
- `sendMessageToWebContents`: 发送消息到前端
- `setProgressBar`: 更新进度条

#### 三线程解耦架构 (v1.0.6)
```
┌─────────────────────────────────────────────────────────────┐
│                    用户操作 (UI)                            │
│  - 翻页 → load-book-list-paged (仅返回200条)               │
│  - 打开详情 → get-metadata-now (抢占式优先)                │
│  - 悬浮预览 → generate-cover-priority                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Phase 1: ScanQueue (并发10)                 │
│  - 快速扫描文件系统                                         │
│  - 仅创建数据库记录 (title, filepath, mtime)               │
│  - 扫描完成后立即通知前端刷新 (用户可见所有书名)            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│ Phase 2: CoverQueue      │   │ Phase 3: MetadataQueue   │
│ (并发1, HDD优化)          │   │ (并发2, 轻量级)          │
│ - 生成封面 (heavy I/O)   │   │ - Hitomi 元数据匹配      │
│ - 不阻塞 UI              │   │ - 不阻塞 UI              │
│ - fire and forget        │   │ - fire and forget        │
└──────────────────────────┘   └──────────────────────────┘
```

#### 前端 (src/App.vue)
- `loadBookList(scan)`: 调用IPC，更新bookList和displayBookList，调用chunkList
- `mounted()`: 初始化流程：load-setting -> loadLibraryList -> loadBookList -> 后台扫描
- `ipcRenderer.on('send-action')`: 监听刷新列表事件

#### 状态管理 (src/pinia.js)
- `libraryList`: 漫画库列表
- `loadLibraryList()`: 从数据库加载库列表
- `addLibrary/updateLibrary/deleteLibrary`: 库管理操作

#### 组件
- `BookCard.vue`: 单本漫画卡片，封面懒加载+动态生成
- `BookCardCompact.vue`: 紧凑列表模式+悬浮预览
- `Setting.vue`: 设置界面，包含库管理表格

### 数据库模型
- **Manga**: 漫画主表 (id, title, title_jpn, coverPath, hash, filepath, tags, status...)
- **Metadata**: 元数据表 (hash主键，与Manga关联)
- **Library**: 库表 (id, name, path, scanCbx, scanPdf, enabled)

---

## 运行命令
```bash
npm install @msgpack/msgpack adm-zip concurrently --save-dev
npm run dev
```

---

## 性能优化建议（待实现）

### 1. 参考Komga的极速加载
- 将bookList和displayBookList分离，避免每次过滤都重新计算
- 使用计算属性缓存visibleChunkDisplayBookList
- 实现增量更新，扫描到新书就立即添加到displayBookList，而不是等全部扫描完

### 2. 封面加载优化
- 预生成封面时批量处理，避免单个封面生成失败影响整体
- 使用封面缓存策略，已存在的封面不再重新生成
- 优化tmp文件管理，避免文件锁定冲突

### 3. 扫描速度优化
- 目前扫描是单线程，可考虑分批并行扫描（但要注意HDD的随机读写性能）
- 使用数据库索引加速查询
- 增量扫描时只对比修改时间，避免全量hash

### 4. 用户体验
- 显示扫描进度条（当前只有文本消息）
- 扫描过程中实时显示新找到的漫画（边扫边显示）
- 优先显示用户上次浏览的位置（记录currentPage和scroll位置）

---

## 已知限制

1. **Windows文件锁定**: HDD上大量小文件操作时容易出现EBUSY错误
2. **响应式更新**: Vue3的响应式系统在74500+数据量时可能出现性能问题
3. **内存占用**: 一次性加载所有漫画到内存可能占用大量RAM（约1-2GB）
4. **HDD随机读写**: 封面生成需要读取cbz内部文件，HDD随机读写性能差，建议使用SSD

---

## 测试数据
- 漫画库: G:\hitomi\单行本 (74721本)
- 数据库: 67583本（已有）
- 扫描新增: 0本（表示数据库已最新）
- 封面生成: 大量失败（tmp文件问题）

---

## 下一步计划

1. **验证**: 测试三线程解耦架构是否正常工作
2. **优化**: 封面生成队列可根据磁盘类型动态调整并发数（SSD 可提高到 3-5）
3. **体验**: 添加扫描进度条可视化（当前只有文本消息）
4. **功能**: 增加阅读位置记忆
5. **优化**: 实现虚拟滚动，进一步提升大量数据的渲染性能

---

## 调试技巧

### 查看数据是否正确
```javascript
// 在App.vue的loadBookList中添加：
console.log('bookList[0]:', bookList[0].title, bookList[0].id)
console.log('bookList[1]:', bookList[1].title, bookList[1].id)
console.log('displayBookList reactivity:', this.displayBookList.length)
```

### 检查Vue响应式
```javascript
// 检查book对象是否被正确响应式包装
console.log('book is reactive?', Vue.isReactive(bookList[0]))
```

### 强制刷新视图
```javascript
// 如果发现数据更新但视图不刷新，尝试：
this.bookList = [...bookList]  // 创建新数组触发响应
this.displayBookList = [...bookList]
```

---

## 旧代码参考

### 正确的BookCard使用方式（从old_code/backup_v3）
- BookCard.vue应使用`:book="book"` prop
- getDisplayTitle从pinia获取，传入book参数
- coverPath应该通过getCoverUrl转换

### 正确的启动流程（从old_code/backup_v3）
```javascript
// old_code/backup_v3/src/App.vue line 370-386
ipcRenderer.invoke('load-setting')
.then(async (res) => {
  this.setting = res
  await this.loadLibraryList()
  await this.loadBookList()
  if (this.libraryList && this.libraryList.length > 0) {
    this.loadBookList(true)  // 后台扫描
  } else if (this.setting.library) {
    this.loadBookList(true)
  }
})
```

---

## 联系与反馈

如遇到新的bug，请按以下格式记录到bug.txt：
```
[时间] 错误描述
[日志] 相关日志
[现象] 用户看到的效果
[预期] 期望的效果
```

并更新本MEMORY.md的BUG记录章节。
