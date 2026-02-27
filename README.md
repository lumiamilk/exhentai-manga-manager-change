<div align="center">

<img src="https://raw.githubusercontent.com/SchneeHertz/exhentai-manga-manager/master/public/icon.png" alt="icon.png" width="128"/>

# exhentai-manga-manager

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

## AI 漫画翻译功能

从 v1.0.14 开始支持 AI 实时翻译日语漫画为中文。

### 环境要求
- NVIDIA GPU (RTX 2080 Ti 或更高，22GB 显存)
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

- **OCR**: `manga-ocr-full.ckpt`
- **Detection**: `craft_mixed.onnx`
- **Inpainting**: `lama_mpe.ckpt` (可选)

详见 [manga-image-translator 安装说明](other_code/manga-image-translator/INSTALL.md)

#### 4. 下载 LLM 模型 (用于翻译)

推荐使用 [GalTransl-v4-4B](https://huggingface.co/2bb6bf1d14/GalTransl-v4-4B-gguf) 或其他日译中模型。

### 配置

1. 启动 llama-server (翻译后端)：
```powershell
llama-server.exe -m GalTransl-v4-4B-2512.gguf -ngl 99 -c 4096 --port 8080
```

2. 在应用设置中启用自动翻译，配置：
   - manga-translator 路径: `other_code/manga-image-translator`
   - llama-server 路径: 你的 llama-server.exe 路径
   - 目标语言: CHS (简体中文)

## Thanks
本项目受到了诸多开源项目的帮助

- [EhTagTranslation/Database](https://github.com/EhTagTranslation/Database)


## 赞助
[!["爱发电"](https://static.afdiancdn.com/static/img/logo/logo.png)](https://afdian.com/a/SeldonHorizon)
[如果这个软件帮到了你，可以请我喝杯奶茶](https://afdian.com/a/SeldonHorizon)