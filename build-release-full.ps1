# build-release-full.ps1
# 完整版打包脚本：Electron + Python环境 + 模型 + llama.cpp

param(
    [string]$OutputDir = "out-full",
    [switch]$SkipModels = $false,
    [switch]$SkipPython = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  exhentai-manga-manager Full Release" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 清理旧的输出目录
if (Test-Path $OutputDir) {
    Write-Host "Cleaning old output directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $OutputDir
}

# Step 1: 构建 Vite
Write-Host "`n[1/4] Building Vite frontend..." -ForegroundColor Green
npm run build
if ($LASTEXITCODE -ne 0) {
    throw "Vite build failed"
}

# Step 2: 打包 Electron 基础
Write-Host "`n[2/4] Packaging Electron app..." -ForegroundColor Green
npx electron-builder --win nsis --x64 --config.directories.output=$OutputDir

# Step 3: 复制 Python 环境（如果不跳过）
if (-not $SkipPython) {
    Write-Host "`n[3/4] Copying Python environment..." -ForegroundColor Green
    $PythonSrc = "other_code\manga-image-translator\.venv"
    $PythonDst = "$OutputDir\python-env"
    
    if (Test-Path $PythonSrc) {
        # 创建目标目录
        New-Item -ItemType Directory -Force -Path $PythonDst | Out-Null
        
        # 复制 Python 环境（排除不必要的文件）
        $ExcludePatterns = @("__pycache__", "*.pyc", "*.pyo", "*.pdb", "pip", "setuptools", "wheel")
        
        # 使用 robocopy 复制
        $ExcludeArgs = $ExcludePatterns | ForEach-Object { "/XD", $_ }
        robocopy $PythonSrc $PythonDst /E /NFL /NDL /NJH /NJS /nc /ns /np $ExcludeArgs
        Write-Host "Python environment copied to $PythonDst" -ForegroundColor Gray
    } else {
        Write-Host "Warning: Python environment not found at $PythonSrc" -ForegroundColor Yellow
        Write-Host "Run 'uv venv --python 3.9' and install dependencies first" -ForegroundColor Yellow
    }
    
    # 复制 manga-image-translator 源码
    $MITSrc = "other_code\manga-image-translator"
    $MITDst = "$OutputDir\manga-image-translator"
    if (Test-Path $MITSrc) {
        New-Item -ItemType Directory -Force -Path $MITDst | Out-Null
        robocopy $MITSrc $MITDst /E /XD ".venv" "models" "result" "__pycache__" /NFL /NDL /NJH /NJS
        Write-Host "manga-image-translator copied to $MITDst" -ForegroundColor Gray
    }
} else {
    Write-Host "`n[3/4] Skipping Python environment (--SkipPython)" -ForegroundColor Yellow
}

# Step 4: 复制模型文件（如果不跳过）
if (-not $SkipModels) {
    Write-Host "`n[4/4] Copying model files..." -ForegroundColor Green
    
    # OCR 模型
    $ModelsSrc = "other_code\manga-image-translator\models"
    $ModelsDst = "$OutputDir\models\ocr"
    if (Test-Path $ModelsSrc) {
        New-Item -ItemType Directory -Force -Path $ModelsDst | Out-Null
        robocopy $ModelsSrc $ModelsDst /E /NFL /NDL /NJH /NJS
        Write-Host "OCR models copied to $ModelsDst" -ForegroundColor Gray
    }
    
    # LLM 模型
    $LLMSrc = "models"
    $LLMDst = "$OutputDir\models\llm"
    if (Test-Path $LLMSrc) {
        Get-ChildItem $LLMSrc -Filter "*.gguf" | ForEach-Object {
            New-Item -ItemType Directory -Force -Path $LLMDst | Out-Null
            Copy-Item $_.FullName $LLMDst
            Write-Host "LLM model copied: $($_.Name)" -ForegroundColor Gray
        }
    }
    
    # llama.cpp
    $LlamaSrc = "other_code\llama-b8223-bin-win-cuda-12.4-x64"
    $LlamaDst = "$OutputDir\llama.cpp"
    if (Test-Path $LlamaSrc) {
        New-Item -ItemType Directory -Force -Path $LlamaDst | Out-Null
        # 只复制必要的文件
        Copy-Item "$LlamaSrc\llama-server.exe" $LlamaDst -ErrorAction SilentlyContinue
        Copy-Item "$LlamaSrc\ggml.dll" $LlamaDst -ErrorAction SilentlyContinue
        Copy-Item "$LlamaSrc\ggml-cuda.dll" $LlamaDst -ErrorAction SilentlyContinue
        Copy-Item "$LlamaSrc\ggml-base.dll" $LlamaDst -ErrorAction SilentlyContinue
        Copy-Item "$LlamaSrc\ggml-cpu-*.dll" $LlamaDst -ErrorAction SilentlyContinue
        Copy-Item "$LlamaSrc\libomp140.x86_64.dll" $LlamaDst -ErrorAction SilentlyContinue
        Write-Host "llama.cpp copied to $LlamaDst" -ForegroundColor Gray
    }
} else {
    Write-Host "`n[4/4] Skipping model files (--SkipModels)" -ForegroundColor Yellow
}

# 统计输出大小
Write-Host "`n========================================" -ForegroundColor Cyan
$TotalSize = (Get-ChildItem -Recurse $OutputDir | Measure-Object -Property Length -Sum).Sum
$SizeGB = [math]::Round($TotalSize / 1GB, 2)
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Output: $OutputDir" -ForegroundColor White
Write-Host "Total size: $SizeGB GB" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan

# 提示用户
if ($SkipModels) {
    Write-Host "`nNote: Models not included. Users will need to download them on first use." -ForegroundColor Yellow
}
