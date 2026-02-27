# manga-image-translator 安装说明

## 环境要求
- Python 3.9
- uv 包管理器
- NVIDIA GPU + CUDA

## 安装步骤

```powershell
# 进入项目目录
cd D:\temp\manga_reader\exhentai-manga-manager\other_code\manga-image-translator

# 创建 Python 3.9 虚拟环境
uv venv --python 3.9

# 先安装 PyTorch CUDA 版本 (重要!)
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 再安装其他依赖
uv pip install -r requirements.txt

# 测试运行
.venv\Scripts\python.exe -m manga_translator --help
```

## 启动翻译服务

```powershell
# 启动服务器模式
.venv\Scripts\python.exe -m manga_translator -m web --host 127.0.0.1 --port 5000 --use-gpu
```

## 可用的翻译器

- `youdao` - 有道翻译
- `baidu` - 百度翻译
- `deepl` - DeepL
- `gpt3.5` - GPT-3.5 Turbo (需要 OpenAI API)
- `gpt4` - GPT-4 (需要 OpenAI API)
- `nllb` - NLLB 离线翻译
- `sakura` - Sakura 离线翻译
- `none` - 不翻译
- `original` - 保留原文

## 配置 llama.cpp 翻译

使用 `gpt4` 翻译器，并设置环境变量指向本地 llama-server：

```powershell
$env:OPENAI_API_BASE = "http://127.0.0.1:8080/v1"
$env:OPENAI_API_KEY = "sk-dummy"

.venv\Scripts\python.exe -m manga_translator -m web --host 127.0.0.1 --port 5000 --use-gpu
```

## GPU 加速

```powershell
# 使用 GPU
.venv\Scripts\python.exe -m manga_translator -m web --host 127.0.0.1 --port 5000 --use-gpu

# 限制 GPU 显存
.venv\Scripts\python.exe -m manga_translator -m web --host 127.0.0.1 --port 5000 --use-gpu-limited
```

## 常见问题

### CUDA not found
需要先安装带 CUDA 支持的 PyTorch：
```powershell
uv pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```
