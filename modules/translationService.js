/**
 * 翻译服务管理器
 * 负责启动和管理 manga-image-translator 和 llama.cpp 服务
 */

const { spawn, execSync } = require('child_process')
const http = require('http')
const path = require('path')
const fs = require('fs')

// PID 文件路径，用于记录子进程 PID
const getPidFilePath = () => path.join(require('os').tmpdir(), 'exhentai-manga-manager-translation-pids.json')

// 保存 PID 到文件
const savePids = (pids) => {
  try {
    fs.writeFileSync(getPidFilePath(), JSON.stringify(pids))
  } catch (err) {
    console.log('[翻译服务] 保存 PID 文件失败:', err.message)
  }
}

// 读取 PID 文件
const loadPids = () => {
  try {
    const data = fs.readFileSync(getPidFilePath(), 'utf8')
    return JSON.parse(data)
  } catch {
    return { mangaTranslator: null, llamaServer: null }
  }
}

// 清理残留进程（同步，用于启动时和退出时）
const cleanupOrphanProcesses = () => {
  const pids = loadPids()
  console.log('[翻译服务] 检查残留进程:', pids)
  
  if (pids.mangaTranslator) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pids.mangaTranslator} /T /F`, { stdio: 'ignore' })
        console.log(`[翻译服务] 已清理残留的 manga-translator 进程 (PID: ${pids.mangaTranslator})`)
      }
    } catch (err) {
      // 进程可能已经不存在
    }
  }
  
  if (pids.llamaServer) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pids.llamaServer} /T /F`, { stdio: 'ignore' })
        console.log(`[翻译服务] 已清理残留的 llama-server 进程 (PID: ${pids.llamaServer})`)
      }
    } catch (err) {
      // 进程可能已经不存在
    }
  }
  
  // 清空 PID 文件
  savePids({ mangaTranslator: null, llamaServer: null })
}

// 在模块加载时清理残留进程
cleanupOrphanProcesses()

// 注册退出时的清理函数（使用同步代码）
process.on('exit', () => {
  console.log('[翻译服务] 进程退出，清理子进程...')
  const pids = loadPids()
  
  if (pids.mangaTranslator) {
    try {
      execSync(`taskkill /pid ${pids.mangaTranslator} /T /F`, { stdio: 'ignore' })
      console.log(`[翻译服务] 已终止 manga-translator (PID: ${pids.mangaTranslator})`)
    } catch (err) {}
  }
  
  if (pids.llamaServer) {
    try {
      execSync(`taskkill /pid ${pids.llamaServer} /T /F`, { stdio: 'ignore' })
      console.log(`[翻译服务] 已终止 llama-server (PID: ${pids.llamaServer})`)
    } catch (err) {}
  }
})

// 处理 SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  cleanupOrphanProcesses()
  process.exit(0)
})

class TranslationService {
  constructor() {
    this.mangaTranslatorProcess = null
    this.llamaServerProcess = null
    this.mangaTranslatorPort = 5000
    this.llamaPort = 8080
    this.isRunning = false
    this.statusCallback = null
    this.modelLoaded = false  // 模型是否加载完成
  }

  /**
   * 设置状态回调
   */
  setStatusCallback(callback) {
    this.statusCallback = callback
  }

  /**
   * 通知状态变化
   */
  notifyStatus(status) {
    if (this.statusCallback) {
      this.statusCallback(status)
    }
  }

  /**
   * 检查服务是否可用
   */
  checkService(url) {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(2000, () => {
        req.destroy()
        resolve(false)
      })
    })
  }

  /**
   * 测试翻译服务是否真正可用
   * 通过队列大小判断 - 如果队列为空且 HTTP 服务正常，说明服务已就绪
   */
  async testTranslationReady() {
    const fetch = require('node-fetch')
    
    try {
      // 检查队列状态
      const response = await fetch(`http://127.0.0.1:${this.mangaTranslatorPort}/queue-size`, {
        timeout: 5000
      })
      
      if (!response.ok) {
        console.log('[翻译服务] 队列状态检查失败:', response.status)
        return false
      }
      
      const result = await response.json()
      console.log('[翻译服务] 队列状态:', result)
      
      // 队列存在且能正常响应，说明服务就绪
      return true
    } catch (err) {
      console.log('[翻译服务] 队列状态检查异常:', err.message)
      return false
    }
  }

  /**
   * 启动 manga-image-translator 服务
   */
  async startMangaTranslator(config) {
    let { mangaTranslatorPath, mangaTranslatorPort, gpuDevice } = config
    
    // 如果路径不存在，尝试默认路径
    if (!mangaTranslatorPath || !fs.existsSync(mangaTranslatorPath)) {
      const rootPath = path.dirname(path.dirname(__dirname))
      mangaTranslatorPath = path.join(rootPath, 'other_code', 'manga-image-translator')
      console.log('[翻译服务] 使用默认路径:', mangaTranslatorPath)
    }
    
    if (!fs.existsSync(mangaTranslatorPath)) {
      this.notifyStatus({ type: 'error', message: 'manga-image-translator 路径不存在: ' + mangaTranslatorPath })
      return false
    }

    // 检查是否已运行
    const isRunning = await this.checkService(`http://127.0.0.1:${mangaTranslatorPort}/queue-size`)
    if (isRunning) {
      // 如果服务已在运行，假设模型已加载（从之前的会话）
      this.modelLoaded = true
      this.notifyStatus({ type: 'success', message: '翻译服务已就绪' })
      return true
    }

    this.mangaTranslatorPort = mangaTranslatorPort || 5000

    return new Promise((resolve) => {
      try {
        // 设置环境变量指定 GPU
        const env = { ...process.env }
        if (gpuDevice !== undefined) {
          env.CUDA_VISIBLE_DEVICES = String(gpuDevice)
        }

        // 使用虚拟环境中的 Python 直接运行
        const venvPython = path.join(mangaTranslatorPath, '.venv', 'Scripts', 'python.exe')
        
        console.log('[翻译服务] mangaTranslatorPath:', mangaTranslatorPath)
        console.log('[翻译服务] venvPython:', venvPython)
        console.log('[翻译服务] venvPython exists:', fs.existsSync(venvPython))
        
        // 检查虚拟环境是否存在
        if (!fs.existsSync(venvPython)) {
          this.notifyStatus({ type: 'error', message: `虚拟环境不存在: ${venvPython}` })
          resolve(false)
          return
        }

        // 设置 OpenAI API 指向本地 llama-server
        env.OPENAI_API_BASE = `http://127.0.0.1:${this.llamaPort}/v1`
        env.OPENAI_API_KEY = 'sk-dummy'

        this.mangaTranslatorProcess = spawn(venvPython, [
          '-m', 'manga_translator', 
          '-m', 'web',  // 旧版本使用 -m web 启动服务器
          '--host', '127.0.0.1',
          '--port', String(this.mangaTranslatorPort),
          '--translator', 'gpt4',  // 使用 gpt4 翻译器，通过 OPENAI_API_BASE 连接 llama-server
          '--use-gpu'  // 使用 GPU 加速图像处理
        ], {
          cwd: mangaTranslatorPath,
          env: env,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        
        // 保存 PID 以便在进程退出时清理
        console.log(`[翻译服务] manga-translator 已启动，PID: ${this.mangaTranslatorProcess.pid}`)
        savePids({ 
          mangaTranslator: this.mangaTranslatorProcess.pid, 
          llamaServer: loadPids().llamaServer 
        })

        // 处理进程输出的辅助函数
        const handleProcessOutput = (data) => {
          const msg = data.toString().trim()
          if (msg) {
            console.log('[MangaTranslator]', msg)
            this.notifyStatus({ type: 'log', source: 'manga-translator', message: msg })
            
            // 检测模型加载完成的标志
            if (msg.includes('Waiting for translation tasks') || 
                msg.includes('U2Net loaded') ||
                msg.includes('Running in web_client mode')) {
              console.log('[翻译服务] 检测到模型加载完成标志')
              this.modelLoaded = true
            }
          }
        }

        // 同时监听 stdout 和 stderr
        this.mangaTranslatorProcess.stdout.on('data', handleProcessOutput)
        this.mangaTranslatorProcess.stderr.on('data', handleProcessOutput)

        this.mangaTranslatorProcess.on('error', (err) => {
          console.error('Failed to start manga-image-translator:', err)
          this.notifyStatus({ type: 'error', message: '启动 manga-image-translator 失败: ' + err.message })
          resolve(false)
        })

        this.mangaTranslatorProcess.on('exit', (code) => {
          console.log('manga-image-translator exited with code:', code)
          this.mangaTranslatorProcess = null
          this.modelLoaded = false
        })

        // 等待服务启动 (最多 180 秒)
        this.modelLoaded = false
        let attempts = 0
        const checkInterval = setInterval(async () => {
          attempts++
          // 检查 HTTP 服务是否启动
          const httpReady = await this.checkService(`http://127.0.0.1:${this.mangaTranslatorPort}/queue-size`)
          
          if (attempts % 10 === 0) {
            console.log(`[翻译服务] 检查状态: httpReady=${httpReady}, modelLoaded=${this.modelLoaded}, attempts=${attempts}`)
          }
          
          // 服务就绪条件：HTTP 启动 + 模型加载完成
          if (httpReady && this.modelLoaded) {
            clearInterval(checkInterval)
            
            // 等待额外 10 秒确保模型完全加载
            this.notifyStatus({ type: 'info', message: '等待翻译模型初始化完成...' })
            console.log('[翻译服务] 模型已加载，等待 10 秒确保完全就绪...')
            await new Promise(resolve => setTimeout(resolve, 10000))
            
            this.notifyStatus({ type: 'success', message: '翻译服务已就绪' })
            this.isRunning = true
            resolve(true)
          } else if (attempts >= 180) {
            clearInterval(checkInterval)
            this.notifyStatus({ type: 'error', message: 'manga-image-translator 启动超时' })
            resolve(false)
          }
        }, 1000)

      } catch (err) {
        console.error('Failed to start manga-image-translator:', err)
        this.notifyStatus({ type: 'error', message: '启动 manga-image-translator 失败' })
        resolve(false)
      }
    })
  }

  /**
   * 启动 llama.cpp 服务
   */
  async startLlamaServer(config) {
    const { llamaServerPath, llamaModelPath, llamaPort, gpuDevice } = config
    
    if (!llamaServerPath || !fs.existsSync(llamaServerPath)) {
      this.notifyStatus({ type: 'error', message: 'llama-server.exe 路径未配置或不存在' })
      return false
    }

    if (!llamaModelPath || !fs.existsSync(llamaModelPath)) {
      this.notifyStatus({ type: 'error', message: 'LLM 模型路径未配置或不存在' })
      return false
    }

    // 检查是否已运行
    const isRunning = await this.checkService(`http://127.0.0.1:${llamaPort}/health`)
    if (isRunning) {
      this.notifyStatus({ type: 'info', message: 'llama-server 服务已在运行' })
      return true
    }

    this.llamaPort = llamaPort || 8080

    return new Promise((resolve) => {
      try {
        const args = [
          '-m', llamaModelPath,
          '--port', String(this.llamaPort),
          '--host', '127.0.0.1',
          '-ngl', '99',  // 将所有层加载到 GPU
          '-c', '4096',  // 上下文长度
        ]

        // 不设置 CUDA_VISIBLE_DEVICES，让系统自动分配
        const env = { ...process.env }

        this.llamaServerProcess = spawn(llamaServerPath, args, {
          env: env,
          stdio: ['ignore', 'pipe', 'pipe']
        })
        
        // 保存 PID 以便在进程退出时清理
        console.log(`[翻译服务] llama-server 已启动，PID: ${this.llamaServerProcess.pid}`)
        savePids({ 
          mangaTranslator: loadPids().mangaTranslator, 
          llamaServer: this.llamaServerProcess.pid 
        })

        // llama-server 将大部分日志输出到 stderr，stdout 可能重复
        // 只监听 stderr 避免重复日志
        this.llamaServerProcess.stderr.on('data', (data) => {
          const msg = data.toString().trim()
          if (msg) {
            console.log('[LlamaServer]', msg)
            this.notifyStatus({ type: 'log', source: 'llama-server', message: msg })
          }
        })

        this.llamaServerProcess.on('error', (err) => {
          console.error('Failed to start llama-server:', err)
          this.notifyStatus({ type: 'error', message: '启动 llama-server 失败: ' + err.message })
          resolve(false)
        })

        this.llamaServerProcess.on('exit', (code) => {
          console.log('llama-server exited with code:', code)
          this.llamaServerProcess = null
        })

        // 等待服务启动 (最多 120 秒，大模型加载较慢)
        let attempts = 0
        const checkInterval = setInterval(async () => {
          attempts++
          const ready = await this.checkService(`http://127.0.0.1:${this.llamaPort}/health`)
          if (ready) {
            clearInterval(checkInterval)
            this.notifyStatus({ type: 'success', message: 'llama-server 服务已启动' })
            resolve(true)
          } else if (attempts >= 120) {
            clearInterval(checkInterval)
            this.notifyStatus({ type: 'error', message: 'llama-server 启动超时' })
            resolve(false)
          }
        }, 1000)

      } catch (err) {
        console.error('Failed to start llama-server:', err)
        this.notifyStatus({ type: 'error', message: '启动 llama-server 失败' })
        resolve(false)
      }
    })
  }

  /**
   * 启动所有翻译服务
   */
  async startAll(config) {
    this.notifyStatus({ type: 'info', message: '正在启动翻译服务...' })

    // 先启动 llama-server (翻译后端)
    const llamaOk = await this.startLlamaServer(config)
    if (!llamaOk) {
      this.notifyStatus({ type: 'warning', message: 'llama-server 启动失败，将尝试使用其他翻译方式' })
    }

    // 再启动 manga-image-translator (OCR + Inpaint)
    const mangaOk = await this.startMangaTranslator(config)
    if (!mangaOk) {
      this.notifyStatus({ type: 'error', message: 'manga-image-translator 启动失败' })
      return false
    }

    this.isRunning = true
    this.notifyStatus({ type: 'success', message: '翻译服务已就绪' })
    return true
  }

  /**
   * 停止所有服务
   */
  stopAll() {
    console.log('[翻译服务] stopAll() 被调用，正在停止所有服务...')
    
    // 在 Windows 上使用 taskkill 强制终止进程树（同步操作）
    const killProcessTree = (pid, name) => {
      if (pid) {
        try {
          console.log(`[翻译服务] 尝试终止 ${name} 进程 (PID: ${pid})`)
          if (process.platform === 'win32') {
            // 使用 taskkill 强制终止进程树
            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
            console.log(`[翻译服务] 已强制终止 ${name} 进程 (PID: ${pid})`)
          } else {
            process.kill(pid, 'SIGTERM')
            console.log(`[翻译服务] 已发送 SIGTERM 到 ${name} 进程`)
          }
        } catch (err) {
          // 进程可能已经不存在
          console.log(`[翻译服务] 终止 ${name} 进程时出错:`, err.message)
        }
      } else {
        console.log(`[翻译服务] ${name} 进程不存在或已终止`)
      }
    }
    
    const mangaPid = this.mangaTranslatorProcess?.pid
    const llamaPid = this.llamaServerProcess?.pid
    
    console.log('[翻译服务] mangaTranslatorProcess PID:', mangaPid || 'null')
    console.log('[翻译服务] llamaServerProcess PID:', llamaPid || 'null')
    
    if (mangaPid) {
      killProcessTree(mangaPid, 'manga-translator')
      this.mangaTranslatorProcess = null
    }
    if (llamaPid) {
      killProcessTree(llamaPid, 'llama-server')
      this.llamaServerProcess = null
    }
    
    // 清空 PID 文件
    savePids({ mangaTranslator: null, llamaServer: null })
    this.isRunning = false
    this.modelLoaded = false
    this.notifyStatus({ type: 'info', message: '翻译服务已停止' })
  }

  /**
   * 获取服务状态
   */
  async getStatus() {
    const mangaRunning = await this.checkService(`http://127.0.0.1:${this.mangaTranslatorPort}/queue-size`)
    const llamaRunning = await this.checkService(`http://127.0.0.1:${this.llamaPort}/health`)
    return {
      mangaTranslator: mangaRunning,
      llamaServer: llamaRunning,
      isRunning: mangaRunning && llamaRunning && this.modelLoaded
    }
  }
}

module.exports = TranslationService
