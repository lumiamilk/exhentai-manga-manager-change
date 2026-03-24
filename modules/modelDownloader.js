/**
 * 模型自动下载模块
 * 用于首次使用翻译功能时自动下载所需模型
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 模型配置
const MODELS = {
  // OCR 模型
  'manga-ocr-full.ckpt': {
    url: 'https://github.com/zyddnys/manga-image-translator/releases/download/v0.3.1/manga-ocr-full.ckpt',
    size: '约 400MB',
    description: '日文文字识别模型'
  },
  'craft_mixed.onnx': {
    url: 'https://github.com/zyddnys/manga-image-translator/releases/download/v0.3.1/craft_mixed.onnx',
    size: '约 80MB',
    description: '文本检测模型'
  },
  'lama_mpe.ckpt': {
    url: 'https://github.com/zyddnys/manga-image-translator/releases/download/v0.3.1/lama_mpe.ckpt',
    size: '约 150MB',
    description: '图像修复模型（可选）'
  }
}

// 检查模型是否存在
function checkModelsExist(modelsPath) {
  const results = {}
  
  for (const [name, config] of Object.entries(MODELS)) {
    const filePath = path.join(modelsPath, name)
    const exists = fs.existsSync(filePath)
    results[name] = {
      exists,
      path: filePath,
      config
    }
  }
  
  return results
}

// 检查 llama.cpp 是否存在
function checkLlamaCppExists(basePath) {
  const possiblePaths = [
    path.join(basePath, 'llama.cpp', 'llama-server.exe'),
    path.join(basePath, 'other_code', 'llama-b8223-bin-win-cuda-12.4-x64', 'llama-server.exe'),
    path.join(basePath, '..', 'llama.cpp', 'llama-server.exe')
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return { exists: true, path: p }
    }
  }
  return { exists: false, path: null }
}

// 使用 curl 下载文件（Windows 自带）
function downloadModel(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      // 确保目录存在
      const dir = path.dirname(destPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      // 使用 curl 下载
      const command = `curl -L -o "${destPath}" "${url}"`
      execSync(command, { 
        stdio: 'inherit',
        timeout: 30 * 60 * 1000 // 30 分钟超时
      })
      
      resolve(destPath)
    } catch (err) {
      reject(err)
    }
  })
}

// 下载所有必需模型
async function downloadRequiredModels(modelsPath, sendMessage) {
  const results = checkModelsExist(modelsPath)
  const requiredModels = ['manga-ocr-full.ckpt', 'craft_mixed.onnx']
  const downloaded = []
  const failed = []

  // 确保目录存在
  if (!fs.existsSync(modelsPath)) {
    fs.mkdirSync(modelsPath, { recursive: true })
  }

  for (const modelName of requiredModels) {
    const modelInfo = results[modelName]
    
    if (modelInfo.exists) {
      sendMessage(`模型 ${modelName} 已存在，跳过下载`)
      continue
    }

    sendMessage(`正在下载 ${modelName} (${modelInfo.config.size})...`)
    
    try {
      const destPath = path.join(modelsPath, modelName)
      await downloadModel(modelInfo.config.url, destPath, (percent, downloaded, total) => {
        const MB = 1024 * 1024
        sendMessage(`下载进度: ${percent}% (${(downloaded/MB).toFixed(1)}/${(total/MB).toFixed(1)} MB)`)
      })
      downloaded.push(modelName)
      sendMessage(`模型 ${modelName} 下载完成`)
    } catch (err) {
      failed.push({ name: modelName, error: err.message })
      sendMessage(`模型 ${modelName} 下载失败: ${err.message}`)
    }
  }

  return { downloaded, failed }
}

// 获取模型下载状态
function getModelStatus(basePath) {
  const modelsPath = path.join(basePath, 'models')
  const ocrPath = path.join(basePath, 'manga-image-translator', 'models')
  
  const status = {
    ocrModels: checkModelsExist(ocrPath),
    llmModels: fs.existsSync(path.join(modelsPath, 'llm')),
    llamaCpp: checkLlamaCppExists(basePath),
    pythonEnv: fs.existsSync(path.join(basePath, 'python-env', 'Scripts', 'python.exe')) ||
               fs.existsSync(path.join(basePath, 'other_code', 'manga-image-translator', '.venv', 'Scripts', 'python.exe'))
  }
  
  // 计算整体就绪状态
  const requiredOcr = ['manga-ocr-full.ckpt', 'craft_mixed.onnx']
  status.ocrReady = requiredOcr.every(name => status.ocrModels[name]?.exists)
  status.translationReady = status.ocrReady && status.pythonEnv
  
  return status
}

// 生成下载指南
function generateDownloadGuide() {
  let guide = '翻译功能需要以下组件：\n\n'
  
  guide += '【OCR 模型】（自动下载）\n'
  guide += '  - manga-ocr-full.ckpt: 日文文字识别\n'
  guide += '  - craft_mixed.onnx: 文本检测\n\n'
  
  guide += '【LLM 模型】（手动下载）\n'
  guide += '  推荐使用 GalTransl-v4-4B (日译中专用)\n'
  guide += '  下载地址: https://huggingface.co/2bb6bf1d14/GalTransl-v4-4B-gguf\n'
  guide += '  下载后将 .gguf 文件放入 models/ 目录\n\n'
  
  guide += '【llama.cpp】\n'
  guide += '  下载地址: https://github.com/ggerganov/llama.cpp/releases\n'
  guide += '  需要 llama-server.exe 和相关 DLL 文件\n'
  
  return guide
}

module.exports = {
  MODELS,
  checkModelsExist,
  checkLlamaCppExists,
  downloadModel,
  downloadRequiredModels,
  getModelStatus,
  generateDownloadGuide
}