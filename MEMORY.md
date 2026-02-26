# 项目记忆文件

## 版本变更记录

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

#### 问题 2: 详情页加载卡顿
- **现象**: 点击书籍打开详情页时，UI 冻结数秒
- **已尝试措施**:
  1. Worker Thread 处理元数据
  2. `setImmediate` 让出事件循环
  3. `activePriorityRequests` 计数器
  4. 扫描器冬眠机制
- **可能根因**: 封面解压（7z）仍在主线程执行
- **建议**: 将 `geneCover` 完整移入 Worker Thread，或使用 `workerpool`

#### 问题 3: ENOENT 错误
- **现象**: 封面生成时找不到临时文件
- **已尝试措施**:
  1. 7z `e` 命令替代 `x` 命令
  2. `fs.existsSync` 检查
  3. 独立 `taskTempDir` 子目录
- **可能根因**: 并发竞争或 Windows 文件锁
- **建议**: 添加文件存在性检查和重试机制

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
