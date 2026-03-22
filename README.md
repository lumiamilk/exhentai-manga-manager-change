<div align="center">

<img src="https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/public/icon.png" alt="icon.png" width="128"/>

# exhentai-manga-manager

> **本项目是 [SchneeHertz/exhentai-manga-manager](https://github.com/SchneeHertz/exhentai-manga-manager) v1.6.13 的硬分叉**，添加了 AI 漫画翻译等功能。

**标签化管理, 阅读从ExHentai下载的短篇漫画**

<p>
  <a href="https://discord.gg/pS9jR8C8f6">
    <img src="https://img.shields.io/badge/Discord-purple?style=flat-square" alt="Discord" />
  </a>
</p>

<p>
  <a href="#">
    <img src="https://img.shields.io/badge/require-Windows_10-blue?style=flat-square" alt="Windows_10" />
  </a>
  <a href="https://github.com/SchneeHertz/exhentai-manga-manager/stargazers">
    <img src="https://img.shields.io/github/stars/SchneeHertz/exhentai-manga-manager?style=flat-square&color=cornflowerblue" alt="Github Stars" />
  </a>
  <a href="https://github.com/SchneeHertz/exhentai-manga-manager/releases/latest">
    <img src="https://img.shields.io/github/v/release/SchneeHertz/exhentai-manga-manager?label=latest&style=flat-square&color=cornflowerblue" alt="Github Stable Release" />
  </a>
</p>

中文介绍 | [English Readme](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/README_EN.md) | [日本語の説明](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/README_JA.md)


**[使用说明](https://github.com/SchneeHertz/exhentai-manga-manager/wiki/中文说明)** | **[FAQ](https://github.com/SchneeHertz/exhentai-manga-manager/wiki/FAQ)**

</div>

![cover.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/cover.jpg)
![detail.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/detail.jpg)
![edit_tag.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/edit_tag.jpg)
![viewer.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer.jpg)
![viewer2.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/viewer2.jpg)
![thumbnails.jpg](https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/screenshots/thumbnails.jpg)


**欢迎加入[Discord讨论组](https://discord.gg/pS9jR8C8f6)**

## 功能
- 从一个文件夹建立漫画库
- 从漫画文件中提取封面，然后批量从ExHentai获取漫画的标签
- 编辑标签
- 基于标签，漫画名，文件路径，时间的搜索
- 关联外部图片浏览器
- 内置图片浏览器
- **多版本评论合并**：自动搜索同名漫画的汉化版/英文版评论，按语言优先级加载
- **评论缓存**：一周内从本地数据库加载评论，减少网络请求

## 更多功能
- 库元数据的导出和导入
- 可选免安装版
- 收藏漫画
- 按上传时间，添加时间，评分排序
- 显示ExHentai上的评论
- 漫画内容缩略图，进度定位与选择
- 支持已解压漫画文件夹，zip，rar，7z压缩包
- 多章节漫画的合集管理
- 隐藏指定漫画
- 标签翻译为中文
- 可选的多个配色主题
- 标签分析
- 支持自定义封面
- 展示库文件夹结构，按文件夹查看漫画
- 支持导入exhentai整体元数据数据库备份
- 内置图片浏览器支持单页，双页，卷轴式浏览
- 标签频率分析
- 局域网浏览
- 配套脚本
  - [从ExHentai画廊页面复制元数据](https://sleazyfork.org/zh-CN/scripts/472321)
  - [EH高亮本地本子](https://greasyfork.org/zh-CN/scripts/510077)

## 贡献
- 请参考[贡献指南](https://github.com/SchneeHertz/exhentai-manga-manager/blob/master/CONTRIBUTING.md)

---

## AI 漫画翻译功能

从 v1.0.14 开始支持 AI 实时翻译日语漫画为中文。

### 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                 exhentai-manga-manager                      │
│  [自动翻译: ON] ──▶ 启动两个后台服务                         │
└─────────────────────────────────────────────────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐    ┌──────────────────────┐
│  manga-image-        │    │  llama-server.exe    │
│  translator          │    │  GalTransl-v4-4B     │
│  (OCR + Inpaint)     │    │  (日译中 LLM)        │
│  端口: 5000          │    │  端口: 8080          │
└──────────────────────┘    └──────────────────────┘
```

### 环境要求
- NVIDIA GPU (RTX 2080 Ti 22GB 或更高)
- llama-server (本地 LLM 服务)
- manga-image-translator (漫画 OCR + 翻译)

### 安装步骤

> **关于 manga-image-translator**: 本项目使用的是基于 [zyddnys/manga-image-translator](https://github.com/zyddnys/manga-image-translator) (commit: 3506d3b5, 2024.07.28 版本) 的修改版，原版后来经过大幅重构 (新版本引入了大量 bug)，当前版本保留了稳定的核心翻译功能，并修复了兼容性问题。

#### 1. 克隆项目
```bash
git clone https://github.com/lumiamilk/exhentai-manga-manager-change.git
cd exhentai-manga-manager-change
npm install
```

#### 2. 安装 manga-image-translator 依赖

```powershell
cd other_code\manga-image-translator

# 创建 Python 3.9 虚拟环境
uv venv --python 3.9

# 先安装 PyTorch CUDA 版本 (重要!)
.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 安装其他依赖
.venv\Scripts\python.exe -m pip install -r requirements.txt

# 重要: 降级 httpx 到 0.27.2 (新版有兼容性问题)
.venv\Scripts\python.exe -m pip install httpx==0.27.2
```

#### 3. 下载模型文件

需要下载以下模型到 `other_code/manga-image-translator/models/` 目录：

| 模型 | 文件名 | 用途 |
|------|--------|------|
| OCR | `manga-ocr-full.ckpt` | 日文文字识别 |
| Detection | `craft_mixed.onnx` | 文本检测 |
| Inpainting | `lama_mpe.ckpt` | 图像修复 (可选) |

详见 [manga-image-translator 安装说明](other_code/manga-image-translator/INSTALL.md)

#### 4. 下载 LLM 模型 (用于翻译)

推荐使用 [GalTransl-v4-4B](https://huggingface.co/2bb6bf1d14/GalTransl-v4-4B-gguf) 或其他日译中模型。

将模型文件放入 `models/` 目录，例如：
- `models/GalTransl-v4-4B-2601.gguf`

### 启动应用

```powershell
cd exhentai-manga-manager
npm run start
```

### 配置翻译服务

1. 在应用设置中找到"翻译设置"区域
2. 配置以下路径：
   - **manga-translator 路径**: `other_code/manga-image-translator`
   - **llama-server 路径**: 你的 llama-server.exe 路径
   - **LLM 模型路径**: `models/GalTransl-v4-4B-2601.gguf`
3. 启用"自动翻译"开关
4. （可选）启用"应用启动时自动启动服务"

### 翻译功能特性

- **自动检测日语漫画**: 通过元数据 `language: japanese` 标签自动识别
- **智能翻译队列**: 优先翻译当前阅读页面及其前后几页
- **翻译缓存**: 已翻译的页面自动缓存，下次阅读无需重新翻译
- **GPU 加速**: llama-server 和 manga-image-translator 均使用 GPU 加速
- **进程管理**: 应用退出时自动清理后台进程，释放显存

### 常见问题

**Q: 翻译服务启动后显存占用多少？**
A: 约 15GB（manga-image-translator ~8GB + llama-server ~7GB）

**Q: 翻译一页需要多长时间？**
A: 约 5-15 秒，取决于图片复杂度和 GPU 性能

**Q: 支持哪些翻译目标语言？**
A: 目前支持简体中文 (CHS)、繁体中文 (CHT)、英文 (ENG) 等

---

## Python 辅助脚本

项目包含两个 Python 辅助脚本，使用 uv 管理依赖：

```powershell
# 转换漫画为 CBZ 格式
uv run python convert_to_cbz.py <漫画目录> --output <输出目录>

# 按语言筛选漫画 (保留中文、日文，删除其他语言)
uv run python filter_comics_by_language.py <漫画目录> --dry-run  # 预览
uv run python filter_comics_by_language.py <漫画目录> --execute  # 执行删除
```

---

## Thanks
本项目受到了诸多开源项目的帮助

- [EhTagTranslation/Database](https://github.com/EhTagTranslation/Database)
- [zyddnys/manga-image-translator](https://github.com/zyddnys/manga-image-translator) (基于 2024.07.28 版本)
- [SchneeHertz/exhentai-manga-manager](https://github.com/SchneeHertz/exhentai-manga-manager) (v1.6.13 硬分叉)
