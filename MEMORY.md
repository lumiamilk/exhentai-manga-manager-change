# 项目记忆文件

## 版本变更记录

### v1.0.1 (2026-02-26)
- 新增Hitomi元数据自动导入功能
- 新增紧凑列表显示模式 + 鼠标悬浮预览

### 功能变更详情

#### 1. Hitomi元数据自动导入
- **配置位置**: 设置 -> Hitomi数据目录
- **元数据路径**: D:\soft\to_run\Technical Preview Hitomi-Downloader\core\hitomi_data
- **实现方式**:
  - 启动时自动加载hitomi的msgpack元数据到内存缓存
  - 从漫画文件名提取Hitomi ID (格式: (123456))
  - 自动匹配并导入: 标题、作者、社团、标签、页数、类型、发布日期
- **依赖**: msgpackr npm包

#### 2. 紧凑列表显示模式
- **配置位置**: 设置 -> 显示模式
- **功能**:
  - 切换卡片/紧凑列表两种显示模式
  - 紧凑列表: 只显示文字信息(标题、页数、评分、作者)
  - 鼠标悬浮500ms后显示预览: 封面+前3页图片
- **组件**: BookCardCompact.vue

#### 3. 极速加载(已有优化)
- 使用SQLite缓存，启动时直接读取数据库
- 手动扫描才重新扫描目录

## 项目结构
```
exhentai-manga-manager/
├── index.js          # 主进程，处理漫画扫描、数据库
├── preload.js        # 预加载脚本
├── src/
│   ├── App.vue       # 主界面，显示模式切换
│   ├── pinia.js     # 状态管理
│   └── components/  
│       ├── BookCard.vue      # 卡片模式
│       ├── BookCardCompact.vue # 紧凑列表+预览
│       └── Setting.vue       # 设置(新增显示模式)
├── modules/
│   ├── database.js  # SQLite模型
│   └── init_folder_setting.js # 默认设置
└── fileLoader/      # 漫画文件加载
```

## 关键文件修改
- `index.js`: 添加hitomi元数据加载(matchHitomiMetadata, loadHitomiMetadata), 添加get-preview-images IPC
- `modules/init_folder_setting.js`: 添加displayMode默认设置
- `src/components/Setting.vue`: 添加显示模式选择、Hitomi路径输入
- `src/components/BookCardCompact.vue`: 新建紧凑列表组件
- `src/App.vue`: 根据displayMode切换组件

## 运行命令
```bash
npm install msgpackr  # 安装依赖
npm run dev           # 开发模式
npm run build         # 构建
```
