const { app, BrowserWindow, ipcMain, session, dialog, shell, screen, Menu, clipboard, nativeImage, Tray } = require('electron')
const path = require('path')
const fs = require('fs')
const { brotliDecompress } = require('zlib')
const { promisify, format } = require('util')
const _ = require('lodash')
const { nanoid } = require('nanoid')
const sharp = require('sharp')
const { exec } = require('child_process')
const { createHash } = require('crypto')
const sqlite3 = require('sqlite3').verbose()
const fetch = require('node-fetch')
const { HttpsProxyAgent } = require('https-proxy-agent')
const windowStateKeeper = require('electron-window-state')
const express = require('express')
const { globSync } = require('glob')
const { decode } = require('@msgpack/msgpack')
const { Op } = require('sequelize')
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')

const { prepareMangaModel, prepareMetadataModel, prepareLibraryModel } = require('./modules/database')
const { prepareTemplate } = require('./modules/prepare_menu.js')
const { getBookFilelist, geneCover, getImageListByBook, deleteImageFromBook } = require('./fileLoader/index.js')
const { STORE_PATH, isPortable, TEMP_PATH, COVER_PATH, VIEWER_PATH, prepareSetting, prepareCollectionList, preparePath } = require('./modules/init_folder_setting.js')
const { findSameFile } = require('./fileLoader/folder.js')

// ============================================================================
// WORKER THREAD MANAGEMENT
// ============================================================================
let metadataWorker = null
let workerTaskId = 0
const workerPromises = new Map()
let workerReadyResolve = null
let workerReadyPromise = null

const initMetadataWorker = () => {
  if (metadataWorker) return metadataWorker

  // Create a promise that resolves when worker is fully initialized
  workerReadyPromise = new Promise((resolve) => {
    workerReadyResolve = resolve
  })

  metadataWorker = new Worker(path.join(__dirname, 'fileLoader/worker.js'))

  metadataWorker.on('message', (message) => {
    if (message.ready) {
      // Initialize worker with paths
      const { getRootPath } = require('./modules/utils.js')
      const _7zPath = path.join(getRootPath(), 'resources/extraResources/7z.exe')
      metadataWorker.postMessage({
        type: 'init',
        data: {
          TEMP_PATH,
          COVER_PATH,
          hitomiDataPath: setting.hitomiDataPath,
          _7zPath
        },
        taskId: 'init'
      })
      // Worker is now ready after init message sent
      if (workerReadyResolve) {
        workerReadyResolve()
        workerReadyResolve = null
      }
      return
    }

    if (message.taskId && workerPromises.has(message.taskId)) {
      const { resolve, reject } = workerPromises.get(message.taskId)
      workerPromises.delete(message.taskId)
      if (message.error) {
        reject(new Error(message.error))
      } else {
        resolve(message.result)
      }
    }
  })

  metadataWorker.on('error', (error) => {
    console.error('Worker error:', error)
  })

  metadataWorker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Worker stopped with exit code ${code}`)
    }
    metadataWorker = null
    workerReadyPromise = null
    workerReadyResolve = null
  })

  return metadataWorker
}

const sendToWorker = async (type, data) => {
  const worker = initMetadataWorker()
  
  // Wait for worker to be fully initialized before sending message
  if (workerReadyPromise) {
    await workerReadyPromise
  }

  return new Promise((resolve, reject) => {
    const taskId = `task_${++workerTaskId}`

    workerPromises.set(taskId, { resolve, reject })
    worker.postMessage({ type, data, taskId })
  })
}

// ============================================================================
// CONCURRENCY CONTROL - HDD Optimized with User Priority
// ============================================================================
// PrioritySlot: Reserved for user-triggered operations (detail dialog, viewport)
let prioritySlotActive = false

// USER PRIORITY: When user is active, scanner must yield completely
let isUserActive = false
let userActiveTimer = null

// HDD HEAD AVOIDANCE: Track active priority requests
let activePriorityRequests = 0

const setUserActive = () => {
  isUserActive = true
  if (userActiveTimer) clearTimeout(userActiveTimer)
  // User activity window: 3 seconds after last interaction (per FINAL_RECONSTRUCTION_PLAN)
  userActiveTimer = setTimeout(() => {
    isUserActive = false
  }, 3000)
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Worker thread pool for metadata resolution
const metadataWorkers = new Map()
let workerIdCounter = 0

// Simple queue for cover generation (sequential for HDD)
let coverQueueRunning = false
const coverQueue = []

const runCoverQueue = async () => {
  if (coverQueueRunning) return
  coverQueueRunning = true
  
  while (coverQueue.length > 0) {
    // Check if priority slot is active (user interaction)
    while (prioritySlotActive) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    const task = coverQueue.shift()
    if (task) {
      try {
        const result = await task.fn()
        task.resolve(result)
      } catch (e) {
        task.reject(e)
      }
      // HDD delay between tasks
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  
  coverQueueRunning = false
}

// Helper: Execute with delay to prevent HDD thrashing
const withHddDelay = async (fn, delayMs = 10) => {
  const result = await fn()
  await new Promise(resolve => setTimeout(resolve, delayMs))
  return result
}

// Simple queue wrapper for cover generation
const coverQueueLimit = (fn) => {
  return new Promise((resolve, reject) => {
    coverQueue.push({ fn, resolve, reject })
    runCoverQueue()
  })
}

// ============================================================================

preparePath()
let setting = prepareSetting()
let collectionList = prepareCollectionList()

// ============================================================================
// DATABASE MODELS - Global scope for all IPC handlers
// ============================================================================
let Manga = prepareMangaModel(path.join(STORE_PATH, './database.sqlite'))
let Library = prepareLibraryModel(path.join(STORE_PATH, './database.sqlite'))
let metadataSqliteFile
if (setting.metadataPath) {
  metadataSqliteFile = path.join(setting.metadataPath, './metadata.sqlite')
} else {
  metadataSqliteFile = path.join(STORE_PATH, './metadata.sqlite')
}
let Metadata = prepareMetadataModel(metadataSqliteFile)
const getColumns = async (sequelize, tableName) => {
  const query = `PRAGMA table_info(${tableName})`
  const [results] = await sequelize.query(query)
  return results.map(column => column.name)
}
;(async () => {
  const columns = await getColumns(Manga.sequelize, 'Mangas')
  if (['hiddenBook', 'readCount', 'fileSize', 'libraryId'].some(c => !columns.includes(c))) {
    await Manga.sync({ alter: true })
  } else {
    await Manga.sync()
  }
  await Metadata.sync()
  await Library.sync()
  
  // Migration: if libraries table is empty but setting.library exists, create default library
  const libraryCount = await Library.count()
  if (libraryCount === 0 && setting.library) {
    const knownPaths = [
      'G:\\hitomi\\单行本',
      'H:\\hitomi\\单行本',
      'I:\\hitomi_comics\\hitomi\\单行本',
      'J:\\hitomi\\单行本'
    ]
    const isKnownPath = knownPaths.some(p => setting.library.startsWith(p))
    
    if (isKnownPath) {
      for (const libPath of knownPaths) {
        try {
          if (fs.existsSync(libPath)) {
            await Library.create({
              name: path.basename(path.dirname(libPath)) + ' Library',
              path: libPath,
              scanCbx: true,
              scanPdf: false,
              scanDirectoryExclusions: [],
              enabled: true
            })
            console.log('Added library:', libPath)
          }
        } catch (e) {
          console.log('Failed to add library:', libPath, e.message)
        }
      }
    } else {
      await Library.create({
        name: 'Default Library',
        path: setting.library,
        scanCbx: true,
        scanPdf: false,
        scanDirectoryExclusions: [],
        enabled: true
      })
      console.log('Migrated default library from setting.library')
    }
  }
})()

const logFile = fs.createWriteStream(path.join(STORE_PATH, 'log.txt'), { flags: 'w' })
const logStdout = process.stdout
const logStderr = process.stderr

console.log = (...message) => {
  logFile.write(format(...message) + '\n')
  logStdout.write(format(...message) + '\n')
}

console.error = (...message) => {
  logFile.write(format(...message) + '\n')
  logStderr.write(format(...message) + '\n')
}

process
  .on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason)
  })
  .on('uncaughtException', err => {
    console.log(err, 'Uncaught Exception thrown')
    process.exit(1)
  })

const sendMessageToWebContents = (message) => {
  console.log(message)
  try {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('send-message', message)
    }
  } catch (e) {
    console.log('Failed to send message to webContents:', e.message)
  }
}

let mainWindow
let tray
let screenWidth
let sendImageLock = false

const createTray = () => {
  if (tray) return
  const iconPath = path.join(__dirname, 'public/icon.png')
  tray = new Tray(iconPath)
  tray.setToolTip('exhentai-manga-manager')
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.minimize()
      } else if (mainWindow.isMinimized()) {
        mainWindow.restore()
        mainWindow.setSkipTaskbar(false)
        mainWindow.focus()
      } else {
        mainWindow.show()
        mainWindow.setSkipTaskbar(false)
        mainWindow.focus()
      }
    }
  })
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'show window',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore()
          } else {
            mainWindow.show()
          }
          mainWindow.setSkipTaskbar(false)
          mainWindow.focus()
        }
      }
    },
    {
      label: 'exit',
      click: () => {
        mainWindow.close()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

const createWindow = () => {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1560,
    defaultHeight: 1000
  })
  const win = new BrowserWindow({
    'x': mainWindowState.x,
    'y': mainWindowState.y,
    'width': mainWindowState.width,
    'height': mainWindowState.height,
    webPreferences: {
      webSecurity: app.isPackaged ? true : false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  })
  if (app.isPackaged) {
    win.loadFile('dist/index.html')
  } else {
    win.loadURL('http://localhost:5374')
  }
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)
  const menu = Menu.buildFromTemplate(prepareTemplate(win))
  Menu.setApplicationMenu(menu)
  win.webContents.on('did-finish-load', () => {
    const name = require('./package.json').name
    const version = require('./package.json').version
    win.setTitle(name + ' ' + version)
  })
  win.once('ready-to-show', () => {
    if (setting.minimizeOnStart) {
      if (setting.minimizeToTray) {
        createTray()
        win.hide()
        win.setSkipTaskbar(true)
      } else {
        win.minimize()
      }
    } else {
      win.show()
    }
  })
  win.on('minimize', (event) => {
    if (setting.minimizeToTray) {
      event.preventDefault()
      createTray()
      win.hide()
      win.setSkipTaskbar(true)
    }
  })
  win.on('restore', () => {
    win.show()
    win.setSkipTaskbar(false)
  })
  win.on('show', () => {
    win.setSkipTaskbar(false)
    mainWindowState.manage(win)
  })
  return win
}

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=65536')
// app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const primaryDisplay = screen.getPrimaryDisplay()
  screenWidth = Math.floor(primaryDisplay.workAreaSize.width * primaryDisplay.scaleFactor)
  mainWindow = createWindow()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow()
  }
})

app.on('ready', async () => {
  if (setting.proxy) {
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: setting.proxy
    })
  }
  // session.defaultSession.loadExtension(path.join(__dirname, './devtools'))
})

app.on('window-all-closed', () => {
  // 停止翻译服务，释放显存
  translationService.stopAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 确保应用退出时停止服务
app.on('before-quit', () => {
  translationService.stopAll()
})

// base function
const loadBookListFromBrFile = async () => {
  try {
    const buffer = await fs.promises.readFile(path.join(STORE_PATH, 'bookList.json.br'))
    const decodeBuffer = await promisify(brotliDecompress)(buffer)
    return JSON.parse(decodeBuffer.toString())
  } catch {
    try {
      return JSON.parse(await fs.promises.readFile(path.join(STORE_PATH, 'bookList.json'), { encoding: 'utf-8' }))
    } catch {
      return []
    }
  }
}

const loadLegecyBookListFromFile = async () => {
  const bookList = await loadBookListFromBrFile()
  try {
    shell.trashItem(path.join(STORE_PATH, 'bookList.json.br'))
    shell.trashItem(path.join(STORE_PATH, 'bookList.json'))
  } catch {
    console.log('Remove Legecy BookList Failed')
  }
  return bookList
}

const loadBookListFromDatabase = async () => {
  let bookList = await Manga.findAll()
  bookList = bookList.map(b => b.toJSON())
  if (_.isEmpty(bookList)) {
    bookList = await loadLegecyBookListFromFile()
    await saveBookListToDatabase(bookList)
  }
  let metadataList = await Metadata.findAll()
  metadataList = metadataList.map(m => m.toJSON())
  const bookListLength = bookList.length
  for (let i = 0; i < bookListLength; i++) {
    const book = bookList[i]
    const findMetadata = metadataList.find(m => m.hash === book.hash)
    if (findMetadata) {
      if (book.status === 'non-tag' && findMetadata.status !== 'non-tag') {
        // Explicitly define update fields to prevent full-object update accidents
        await Manga.update({
          title: findMetadata.title,
          title_jpn: findMetadata.title_jpn,
          tags: findMetadata.tags,
          status: findMetadata.status,
          category: findMetadata.category,
          posted: findMetadata.posted,
          filecount: findMetadata.filecount,
          rating: findMetadata.rating,
          url: findMetadata.url
        }, { where: { id: book.id } })
      }
      Object.assign(book, findMetadata)
    } else {
      setProgressBar((i + 1) / bookListLength)
      await Metadata.upsert(book)
    }
  }
  setProgressBar(-1)
  return bookList
}

const saveBookListToDatabase = async (data) => {
  console.log('Empty Exist BookList and Saved New BookList')
  await Manga.destroy({ truncate: true })
  await Manga.bulkCreate(data)
}

const saveBookToDatabase = async (book) => {
  // Explicitly define update fields to prevent full-object update accidents
  await Manga.update({
    title: book.title,
    title_jpn: book.title_jpn,
    tags: book.tags,
    status: book.status,
    category: book.category,
    posted: book.posted,
    filecount: book.filecount,
    rating: book.rating,
    url: book.url,
    coverPath: book.coverPath,
    hash: book.hash,
    pageCount: book.pageCount,
    bundleSize: book.bundleSize,
    mtime: book.mtime,
    coverHash: book.coverHash,
    mark: book.mark,
    hiddenBook: book.hiddenBook
  }, { where: { id: book.id } })
  await Metadata.upsert(book)
  console.log(`Saved ${book.title} (id: ${book.id})`)
}

const setProgressBar = (progress) => {
  try {
    if (mainWindow) {
      mainWindow.setProgressBar(progress)
      mainWindow.webContents.send('send-action', {
        action: 'send-progress',
        progress
      })
    }
  } catch (e) {
    console.log('Failed to set progress bar:', e.message)
  }
}

const clearFolder = async (Folder) => {
  console.log(`[清理] 开始清空目录: ${Folder}`)
  try {
    // 先尝试删除目录内容，逐个删除文件以处理被占用的文件
    const entries = await fs.promises.readdir(Folder, { withFileTypes: true }).catch(() => [])
    let deletedCount = 0
    let skippedCount = 0
    for (const entry of entries) {
      const fullPath = path.join(Folder, entry.name)
      try {
        if (entry.isDirectory()) {
          await clearFolder(fullPath)
          await fs.promises.rmdir(fullPath).catch(() => {})
          deletedCount++
        } else {
          await fs.promises.unlink(fullPath)
          deletedCount++
        }
      } catch (err) {
        // 忽略 EBUSY 和 EPERM 错误（文件被占用或权限问题）
        if (err.code !== 'EBUSY' && err.code !== 'EPERM') {
          console.log(`[清理] 删除文件失败: ${fullPath}`, err.message)
        } else {
          skippedCount++
        }
      }
    }
    console.log(`[清理] 清空目录完成: ${Folder}, 已删除 ${deletedCount} 个, 跳过 ${skippedCount} 个`)
  } catch (err) {
    console.log(`[清理] 清空目录出错: ${Folder}`, err.message)
  }
}


// Background cover generation worker - uses CoverQueue (concurrency: 1)
const processCoverInBackground = async (book, libraryId) => {
  // Wrap in queue limit for HDD protection
  return coverQueueLimit(async () => {
    const maxRetries = 3
    let retryCount = 0
    let taskTempDir = null
    
    while (retryCount < maxRetries) {
      try {
        const { filepath, type } = book
        const result = await withHddDelay(() => geneCover(filepath, type), 10)
        taskTempDir = result.taskTempDir
        
        if (result.targetFilePath && result.coverPath) {
          const hash = createHash('sha1').update(fs.readFileSync(result.targetFilePath)).digest('hex')
          await Manga.update({
            coverPath: result.coverPath,
            hash,
            pageCount: result.pageCount,
            bundleSize: result.bundleSize,
            mtime: result.mtime.toJSON(),
            coverHash: result.coverHash,
            status: 'non-tag'
          }, { where: { id: book.id } })
        }
        
        // Clean up ONLY this task's temp directory
        if (taskTempDir) {
          await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
        }
        return // Success
      } catch (e) {
        retryCount++
        if (taskTempDir) {
          await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
        }
        if (retryCount < maxRetries && (e.code === 'EBUSY' || e.code === 'ENOENT')) {
          await new Promise(resolve => setTimeout(resolve, 200 * retryCount))
          taskTempDir = null
        } else {
          console.log(`Failed to generate cover for ${book.filepath} after ${retryCount} attempts: ${e}`)
          return
        }
      }
    }
  })
}

// library and metadata
ipcMain.handle('load-book-list', async (event, scan) => {
  // Always return current database data FIRST, then scan in background
  const currentBookList = await loadBookListFromDatabase()
  
  if (scan) {
    // Start scanning in background (fire and forget)
    ;(async () => {
      try {
        await performLibraryScan()
      } catch (e) {
        console.error('Background scan failed:', e)
      }
    })()
  }
  
  return currentBookList
})

// Paged book list loading - returns only one page of data
ipcMain.handle('load-book-list-paged', async (event, { page = 1, pageSize = 200, sortField = 'date', sortOrder = 'DESC', filters = {} }) => {
  // USER PRIORITY: Mark user as active
  setUserActive()
  
  try {
    // FORCE DEFAULT: Prevent undefined from causing full table return
    const limit = parseInt(pageSize) || 20  // Force default 20
    const effectivePageSize = Math.min(limit, 500)  // HARD LIMIT: max 500
    const offset = (Math.max(1, parseInt(page) || 1) - 1) * effectivePageSize
    
    // Build where clause from filters
    const whereClause = { exist: true }
    
    // Apply filters
    if (filters.searchString) {
      const searchConditions = []
      const searchStr = filters.searchString.toLowerCase()
      // Basic search: search in title, title_jpn, filepath
      searchConditions.push(
        { title: { [Op.like]: `%${searchStr}%` } },
        { title_jpn: { [Op.like]: `%${searchStr}%` } },
        { filepath: { [Op.like]: `%${searchStr}%` } }
      )
      whereClause[Op.or] = searchConditions
    }
    
    if (filters.status) {
      whereClause.status = filters.status
    }
    
    if (filters.category) {
      whereClause.category = filters.category
    }
    
    if (filters.libraryId) {
      whereClause.libraryId = filters.libraryId
    }
    
    if (filters.hiddenBook !== undefined) {
      whereClause.hiddenBook = filters.hiddenBook
    }
    
    if (filters.mark !== undefined) {
      whereClause.mark = filters.mark
    }
    
    // Map sort fields
    const validSortFields = {
      'date': 'date',
      'mtime': 'mtime',
      'posted': 'posted',
      'rating': 'rating',
      'readCount': 'readCount',
      'title': 'title',
      'pageCount': 'pageCount'
    }
    
    const orderField = validSortFields[sortField] || 'date'
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    
    // Get total count
    const total = await Manga.count({ where: whereClause })
    
    // Get paged data with hard limit
    const books = await Manga.findAll({
      where: whereClause,
      order: [[orderField, orderDirection]],
      limit: effectivePageSize,
      offset: offset,
      raw: true
    })
    
    // Parse tags field from JSON string to object for each book
    const parsedBooks = books.map(book => {
      if (typeof book.tags === 'string') {
        try {
          book.tags = JSON.parse(book.tags)
        } catch (e) {
          book.tags = {}
        }
      }
      if (!book.tags || typeof book.tags !== 'object') {
        book.tags = {}
      }
      return book
    })
    
    return {
      data: parsedBooks,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  } catch (e) {
    console.error('load-book-list-paged error:', e)
    return {
      data: [],
      total: 0,
      page: page,
      pageSize: pageSize,
      totalPages: 0
    }
  }
})

// Get total book count for display
ipcMain.handle('get-book-count', async (event, filters = {}) => {
  try {
    const whereClause = { exist: true }
    
    if (filters.status) {
      whereClause.status = filters.status
    }
    
    return await Manga.count({ where: whereClause })
  } catch (e) {
    console.error('get-book-count error:', e)
    return 0
  }
})

// Separate function for library scanning
// THREE-THREAD DECOUPLING: Scan -> Cover -> Metadata
const performLibraryScan = async () => {
  sendMessageToWebContents('Start loading library')

  // PHASE 1: FAST SCAN - Only load lightweight fields for comparison
  // DO NOT load tags, title_jpn etc - these are heavy and not needed for scanning
  const bookList = await Manga.findAll({ 
    raw: true,
    attributes: ['id', 'filepath', 'mtime', 'fileSize', 'title', 'coverPath', 'status', 'libraryId', 'exist']
  })
  console.log('Database books count:', bookList.length)
  const bookMap = new Map(bookList.map(b => [b.filepath, b]))
  bookList.forEach(b => b.exist = false)
  
  let libraries = await Library.findAll({ where: { enabled: 1 }, raw: true })
  console.log('Enabled libraries count:', libraries.length, libraries)
  if (libraries.length === 0 && setting.library) {
    libraries = [{
      id: null,
      name: 'Default Library',
      path: setting.library,
      scanCbx: true,
      scanPdf: false,
      scanDirectoryExclusions: [],
      enabled: true
    }]
  }

  let newBookCount = 0
  let changedBookCount = 0
  let skippedBookCount = 0
  let totalRemovedCount = 0
    
  // QUEUES: Separate lists for different processing
  const booksNeedingCover = []
  const booksNeedingMetadata = []

  // SCAN PHASE: Fast, high concurrency (no heavy I/O)
  for (const library of libraries) {
    const libraryId = library.id
    const libraryPath = library.path
    
    sendMessageToWebContents(`Scanning library: ${library.name} (${libraryPath})`)
    
    let list = await getBookFilelist(libraryPath)
    if (!_.isEmpty(setting.excludeFile)) {
      let excludeRe
      try {
        excludeRe = new RegExp(setting.excludeFile)
        list = _.filter(list, file => !excludeRe.test(file.filepath))
      } catch {
        console.log('Illegal regular expressions')
      }
    }
    
    // Apply library-specific exclusions
    const exclusions = Array.isArray(library.scanDirectoryExclusions) 
      ? library.scanDirectoryExclusions 
      : []
    if (exclusions.length > 0) {
      list = list.filter(file => {
        return !exclusions.some(exclusion => 
          file.filepath.includes(exclusion)
        )
      })
    }
    
    const listLength = list.length
    sendMessageToWebContents(`Load ${listLength} book from library: ${library.name}`)

    const hasExistingBooks = bookList.length > 0
    let lastLogTime = Date.now()
    
    // BATCH WRITE: Collect new books and write in batches for HDD optimization
    const batchNewBooks = []
    const BATCH_SIZE = 100
    
    // FAST SCAN LOOP: Only stat and create DB records, no cover extraction
    for (let i = 0; i < listLength; i++) {
      // HDD HEAD AVOIDANCE: While user is active, scanner MUST hibernate completely
      // This ensures HDD is 100% free for user operations (detail dialog, pagination)
      while (isUserActive || activePriorityRequests > 0) {
        await sleep(1000) // Deep winter sleep - 1 second per check
      }
      
      // PHYSICAL YIELD: 10ms forced macro-task gap for IPC to enter
      // Without this, frontend pagination requests cannot reach main process!
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // FORCED BREATHING: 20ms per book for HDD head stability
      await new Promise(resolve => setTimeout(resolve, 20))
      
      // EVENT LOOP YIELD: Allow IPC handlers to process every 10 books
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve))
      }
      
      const { filepath, type } = list[i]
      const foundData = bookMap.get(filepath)
      
      if (foundData === undefined) {
        // New file - collect for batch insert
        newBookCount++
        const id = nanoid()
        let fileStat
        try {
          fileStat = await fs.promises.stat(filepath)
        } catch (e) {
          continue // Skip inaccessible files
        }
        
        const newBook = {
          title: path.basename(filepath),
          coverPath: '',
          hash: '',
          filepath,
          type,
          id,
          pageCount: 0,
          bundleSize: 0,
          mtime: fileStat.mtime.toJSON(),
          fileSize: fileStat.size,
          coverHash: '',
          status: 'non-tag',
          exist: true,
          date: Date.now(),
          libraryId: libraryId
        }
        
        batchNewBooks.push(newBook)
        bookList.push(newBook)
        bookMap.set(filepath, newBook)
        
        // Add to queues for later processing
        booksNeedingCover.push({ ...newBook, filepath, type })
        booksNeedingMetadata.push({ ...newBook, filepath, type })
        
        // BATCH WRITE: Write to database in batches of 100
        if (batchNewBooks.length >= BATCH_SIZE) {
          await Manga.bulkCreate(batchNewBooks)
          batchNewBooks.length = 0
          
          // THROTTLED UPDATE: Notify frontend every 1000 new books
          if (newBookCount % 1000 === 0) {
            mainWindow.webContents.send('send-action', { 
              action: 'refresh-book-list',
              total: bookList.length
            })
          }
        }
      } else {
        // Existing file - mark as exist
        foundData.exist = true
        
        // Check if file changed (throttled for performance)
        const now = Date.now()
        if (now - lastLogTime > 5000 || !hasExistingBooks) {
          lastLogTime = now
          try {
            const fileStat = await fs.promises.stat(filepath)
            const currentMtime = fileStat.mtime.toJSON()
            const currentFileSize = fileStat.size
            const isChanged = foundData.mtime !== currentMtime || foundData.fileSize !== currentFileSize
            
            if (isChanged) {
              changedBookCount++
              const updatedBook = {
                pageCount: 0,
                bundleSize: 0,
                mtime: currentMtime,
                fileSize: currentFileSize,
                coverHash: '',
                hash: '',
                coverPath: '',
                libraryId: libraryId
              }
              await Manga.update(updatedBook, { where: { id: foundData.id } })
              Object.assign(foundData, updatedBook)
              booksNeedingCover.push({ ...foundData, filepath, type })
            }
          } catch (e) {
            // File might have been deleted
          }
        }
        
        if (isPortable) {
          const newCoverPath = path.join(COVER_PATH, path.basename(foundData.coverPath))
          if (foundData.coverPath !== newCoverPath) {
            foundData.coverPath = newCoverPath
            await Manga.update({ coverPath: newCoverPath }, { where: { id: foundData.id } })
          }
        }
        
        // Add to metadata queue if non-tag
        if (foundData.status === 'non-tag') {
          booksNeedingMetadata.push({ ...foundData, filepath, type })
        }
      }
      
      // Progress reporting - ONLY at 1% thresholds
      try {
        if (i === 0) setProgressBar(0.05)
        const currentPercent = Math.round((i + 1) / listLength * 100)
        const prevPercent = Math.round(i / listLength * 100)
        // Only send message when crossing a 1% threshold
        if (currentPercent > prevPercent || i === listLength - 1) {
          sendMessageToWebContents(`Scanning: ${i + 1}/${listLength} (${currentPercent}%)`)
          setProgressBar(i / listLength)
        }
      } catch (e) {
        // Silent fail for progress updates
      }
    }
    
    // FLUSH REMAINING BATCH: Write any remaining books in the batch
    if (batchNewBooks.length > 0) {
      await Manga.bulkCreate(batchNewBooks)
      batchNewBooks.length = 0
    }
  }

  // CLEANUP: Remove deleted files
  const existData = bookList.filter(b => b.exist === true)
  try {
    const coverList = await fs.promises.readdir(COVER_PATH)
    const existCoverList = existData.map(b => b.coverPath)
    const removeCoverList = _.difference(coverList.map(p => path.join(COVER_PATH, p)), existCoverList)
    for (const coverPath of removeCoverList) {
      await fs.promises.rm(coverPath)
    }
  } catch (err) {
    console.log(err)
  }
  const removeData = bookList.filter(b => b.exist === false)
  const removedCount = removeData.length
  totalRemovedCount += removedCount
  for (const book of removeData) {
    await Manga.destroy({ where: { id: book.id } })
  }
  
  setProgressBar(-1)
  sendMessageToWebContents(`Scan complete: ${newBookCount} new, ${changedBookCount} changed, ${skippedBookCount} unchanged, ${totalRemovedCount} removed`)
  
  // Notify frontend IMMEDIATELY - UI can now display all book titles
  mainWindow.webContents.send('send-action', { action: 'refresh-book-list' })
  
  // PHASE 2: COVER QUEUE - Low concurrency (HDD friendly)
  // Process covers in background with queue limit
  const coverPhase = (async () => {
    const booksToProcess = [...booksNeedingCover]
    if (booksToProcess.length > 0) {
      sendMessageToWebContents(`Generating covers for ${booksToProcess.length} books in background...`)
      
      // COVER CONCURRENCY: 1 for HDD, can increase for SSD
      let processed = 0
      const total = booksToProcess.length
      
      // Process covers one at a time (HDD optimization)
      for (const book of booksToProcess) {
        // Check if priority slot is active (user interaction)
        while (prioritySlotActive) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        
        await processCoverInBackground(book, book.libraryId)
        processed++
        if (processed % 50 === 0 || processed === total) {
          sendMessageToWebContents(`Generated covers: ${processed}/${total}`)
          setProgressBar(processed / total)
        }
      }
      setProgressBar(-1)
      sendMessageToWebContents(`Cover generation complete: ${processed} books`)
      return processed
    }
    return 0
  })()
  
  // PHASE 3: METADATA QUEUE - Runs in parallel with cover queue
  const metadataPhase = (async () => {
    let matchedCount = 0
    if (setting.hitomiDataPath && fs.existsSync(setting.hitomiDataPath)) {
      sendMessageToWebContents(`Starting Hitomi metadata import for ${booksNeedingMetadata.length} books...`)
      
      try {
        const { decode } = require('@msgpack/msgpack')
        
        // Load all Hitomi data once
        const idToMetadata = new Map()
        const files = await fs.promises.readdir(setting.hitomiDataPath)
        const packFiles = files.filter(f => f.endsWith('_pack.json'))
        
        for (const filename of packFiles) {
          const packPath = path.join(setting.hitomiDataPath, filename)
          try {
            const buffer = await fs.promises.readFile(packPath)
            const data = decode(buffer)
            
            for (const item of data) {
              const comicId = String(item.id)
              if (!comicId) continue
              
              idToMetadata.set(comicId, {
                title: item.n || '',
                language: item.l || '',
                type: item.type || 'Doujinshi',
                filecount: item.pg || 0,
                posted: item.d ? Math.floor(new Date(item.d * 1000).getTime() / 1000) : null,
                artists: item.a && Array.isArray(item.a) ? item.a : [],
                groups: item.g && Array.isArray(item.g) ? item.g : [],
                series: item.p && Array.isArray(item.p) ? item.p : [],
                tags: item.t && Array.isArray(item.t) ? item.t : [],
                characters: item.c && Array.isArray(item.c) ? item.c : [],
              })
            }
          } catch (e) {
            console.log(`Failed to read ${filename}:`, e.message)
          }
        }
        
        sendMessageToWebContents(`Loaded ${idToMetadata.size} Hitomi metadata entries`)
        
        // METADATA CONCURRENCY: 2 (lightweight operation)
        let matchedCount = 0
        const naPatterns = new Set(['n/a', 'n／a', 'original'])
        
        const extractIdFromName = (name) => {
          const matches = name.match(/\((\d+)\)\s*(?:\[|$)/)
          if (matches) return matches[matches.length - 1]
          const allMatches = name.match(/\((\d+)/g)
          if (allMatches) {
            const lastMatch = allMatches[allMatches.length - 1]
            return lastMatch.match(/\d+/)?.[0]
          }
          return null
        }
        
        // Process metadata queue (lower priority than covers)
        for (const book of booksNeedingMetadata) {
          if (book.status !== 'non-tag') continue
          
          const basename = path.basename(book.filepath)
          const comicId = extractIdFromName(basename)
          
          if (!comicId) continue
          
          const hitomiMeta = idToMetadata.get(comicId)
          if (!hitomiMeta) continue
          
          const tags = {}
          if (hitomiMeta.language) {
            const langMap = { 'japanese': 'japanese', 'chinese': 'chinese', 'korean': 'korean', 'english': 'english' }
            const lang = langMap[hitomiMeta.language.toLowerCase()] || hitomiMeta.language.toLowerCase()
            tags.language = [lang, 'translated']
          }
          
          if (hitomiMeta.artists.length) tags.artist = hitomiMeta.artists.filter(a => a && !naPatterns.has(a.toLowerCase()))
          if (hitomiMeta.groups.length) tags.group = hitomiMeta.groups.filter(g => g && !naPatterns.has(g.toLowerCase()))
          if (hitomiMeta.series.length) tags.parody = hitomiMeta.series.filter(s => s && !naPatterns.has(s.toLowerCase()))
          if (hitomiMeta.characters.length) tags.character = hitomiMeta.characters.filter(c => c && !naPatterns.has(c.toLowerCase()))
          
          const femaleTags = []
          const maleTags = []
          const otherTags = []
          
          for (const tag of hitomiMeta.tags || []) {
            if (!tag || naPatterns.has(tag.toLowerCase())) continue
            if (tag.startsWith('female:')) femaleTags.push(tag.substring(7))
            else if (tag.startsWith('male:')) maleTags.push(tag.substring(6))
            else if (tag.startsWith('tag:')) otherTags.push(tag.substring(4))
            else otherTags.push(tag)
          }
          
          if (femaleTags.length) tags.female = femaleTags
          if (maleTags.length) tags.male = maleTags
          if (otherTags.length) tags.other = otherTags
          
          await Manga.update({
            title: hitomiMeta.title || book.title,
            tags: tags,
            filecount: hitomiMeta.filecount,
            posted: hitomiMeta.posted,
            category: hitomiMeta.type,
            status: 'tagged',
            url: `https://hitomi.la/galleries/${comicId}.html`
          }, { where: { id: book.id } })
          
          matchedCount++
        }
        
        sendMessageToWebContents(`Hitomi metadata import complete: ${matchedCount} matched`)
      } catch (e) {
        console.log('Hitomi metadata import failed:', e)
        sendMessageToWebContents(`Hitomi metadata import failed: ${e.message}`)
      }
    }
    return matchedCount
  })()
  
  // Wait for both phases to complete, then send scan-complete
  Promise.all([coverPhase, metadataPhase]).then(([coversGenerated, metadataMatched]) => {
    mainWindow.webContents.send('send-action', { 
      action: 'scan-complete',
      newCount: newBookCount,
      changedCount: changedBookCount,
      removedCount: totalRemovedCount,
      coversGenerated,
      metadataMatched
    })
  }).catch(err => {
    console.error('Background processing error:', err)
  })
}

ipcMain.handle('force-gene-book-list', async (event, arg) => {
  await Manga.destroy({ truncate: true })
  await clearFolder(TEMP_PATH)
  await clearFolder(COVER_PATH)
  sendMessageToWebContents('Start loading library')
  
  // Get all enabled libraries
  let libraries = await Library.findAll({ where: { enabled: true }, raw: true })
  
  // Backward compatibility: if no libraries in database, use setting.library
  if (libraries.length === 0 && setting.library) {
    libraries = [{
      id: null,
      name: 'Default Library',
      path: setting.library,
      scanCbx: true,
      scanPdf: false,
      scanDirectoryExclusions: [],
      enabled: true
    }]
  }
  
  for (const library of libraries) {
    const libraryId = library.id
    const libraryPath = library.path
    
    sendMessageToWebContents(`Scanning library: ${library.name} (${libraryPath})`)
    
    let list = await getBookFilelist(libraryPath)
    if (!_.isEmpty(setting.excludeFile)) {
      let excludeRe
      try {
        excludeRe = new RegExp(setting.excludeFile)
        list = _.filter(list, file => !excludeRe.test(file.filepath))
      } catch {
        console.log('Illegal regular expressions')
      }
    }
    
    // Apply library-specific exclusions
    if (library.scanDirectoryExclusions && library.scanDirectoryExclusions.length > 0) {
      list = list.filter(file => {
        return !library.scanDirectoryExclusions.some(exclusion => 
          file.filepath.includes(exclusion)
        )
      })
    }
    
    const listLength = list.length
    sendMessageToWebContents(`Load ${listLength} book from library: ${library.name}`)
    for (let i = 0; i < listLength; i++) {
      try {
        const { filepath, type } = list[i]
        const id = nanoid()
        const { targetFilePath, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type)
        if (targetFilePath && coverPath) {
          const hash = createHash('sha1').update(fs.readFileSync(targetFilePath)).digest('hex')
          await Manga.create({
            title: path.basename(filepath),
            coverPath,
            hash,
            filepath,
            type,
            id,
            pageCount,
            bundleSize,
            mtime: mtime.toJSON(),
            coverHash,
            status: 'non-tag',
            date: Date.now(),
            libraryId: libraryId
          })
        }
        if ((i + 1) % 50 === 0) await clearFolder(TEMP_PATH)
        setProgressBar(i / listLength)
      } catch (e) {
        sendMessageToWebContents(`Load ${list[i].filepath} failed because ${e}, ${i + 1} of ${listLength}`)
      }
    }
    await clearFolder(TEMP_PATH)
  }

  setProgressBar(-1)
  return await loadBookListFromDatabase()
})

ipcMain.handle('patch-local-metadata', async (event, arg) => {
  const bookList = await loadBookListFromDatabase()
  const bookListLength = bookList.length
  await clearFolder(TEMP_PATH)
  await clearFolder(COVER_PATH)

  for (let i = 0; i < bookListLength; i++) {
    try {
      const book = bookList[i]
      let { filepath, type } = book
      if (!type) type = 'archive'
      const { targetFilePath, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type)
      if (targetFilePath && coverPath) {
        const hash = createHash('sha1').update(fs.readFileSync(targetFilePath)).digest('hex')
        _.assign(book, { type, coverPath, hash, pageCount, bundleSize, mtime: mtime.toJSON(), coverHash })
        await saveBookToDatabase(book)
      }
      if ((i + 1) % 50 === 0) await clearFolder(TEMP_PATH)
      setProgressBar(i / bookListLength)
    } catch (e) {
      sendMessageToWebContents(`Patch ${bookList[i].filepath} failed because ${e}`)
    }
  }

  await clearFolder(TEMP_PATH)
  setProgressBar(-1)
  return bookList
})

ipcMain.handle('patch-local-metadata-by-book', async (event, book) => {
  let { filepath, type } = book
  if (!type) type = 'archive'
  let taskTempDir = null
  try {
    const result = await geneCover(filepath, type)
    taskTempDir = result.taskTempDir
    if (result.targetFilePath && result.coverPath) {
      const hash = createHash('sha1').update(fs.readFileSync(result.targetFilePath)).digest('hex')
      if (taskTempDir) await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
      return Promise.resolve({ coverPath: result.coverPath, hash, pageCount: result.pageCount, bundleSize: result.bundleSize, mtime: result.mtime.toJSON(), coverHash: result.coverHash })
    }
    return Promise.reject(new Error('Failed to generate cover'))
  } catch (e) {
    sendMessageToWebContents(`Patch ${book.filepath} failed because ${e}`)
    if (taskTempDir) await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
    return Promise.reject(e)
  }
})

// Priority cover generation for visible books
ipcMain.handle('generate-cover-priority', async (event, book) => {
  let { filepath, type, id } = book
  if (!type) type = 'archive'
  let taskTempDir = null
  try {
    const result = await geneCover(filepath, type)
    taskTempDir = result.taskTempDir
    if (result.targetFilePath && result.coverPath) {
      const hash = createHash('sha1').update(fs.readFileSync(result.targetFilePath)).digest('hex')
      await Manga.update({
        coverPath: result.coverPath,
        hash,
        pageCount: result.pageCount,
        bundleSize: result.bundleSize,
        mtime: result.mtime.toJSON(),
        coverHash: result.coverHash,
        status: 'non-tag'
      }, { where: { id } })
      if (taskTempDir) await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
      return Promise.resolve({ coverPath: result.coverPath, hash, pageCount: result.pageCount, bundleSize: result.bundleSize, mtime: result.mtime.toJSON(), coverHash: result.coverHash })
    }
    return Promise.reject(new Error('Failed to generate priority cover'))
  } catch (e) {
    console.log(`Priority cover generation failed for ${filepath}: ${e}`)
    if (taskTempDir) await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
    return Promise.reject(e)
  }
})

// Check if cover file exists
ipcMain.handle('check-file-exists', async (event, filepath) => {
  try {
    await fs.promises.access(filepath)
    return true
  } catch {
    return false
  }
})

// Function to read the .ehviewer file
function getEhviewerDataManually(dir) {
  try {
    const filePath = path.join(dir, '.ehviewer')
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const lines = fileContent.split('\n')
      if (lines.length >= 4) {
        const gid = lines[2].trim()
        const token = lines[3].trim()
        return { gid, token }
      }
    }
    return null
  } catch (error) {
    console.error('Failed to read .ehviewer file:', error)
    return null
  }
}

// VIEWPORT-FIRST: Get metadata AND cover immediately for detail dialog
// WORKER THREAD: Uses separate thread for metadata resolution to prevent blocking
ipcMain.handle('get-metadata-now', async (event, book) => {
  // USER PRIORITY: Mark user as active
  setUserActive()
  prioritySlotActive = true
  activePriorityRequests++ // HDD head avoidance
  
  try {
    const { filepath, type, id } = book
    const result = {
      coverGenerated: false,
      metadataFound: false,
      coverPath: null,
      metadata: null
    }
    
    // PRIORITY 1: Generate cover if missing (still in main thread - heavy I/O)
    if (!book.coverPath || book.coverPath === '') {
      try {
        let bookType = type || 'archive'
        const coverResult = await geneCover(filepath, bookType)
        
        if (coverResult.targetFilePath && coverResult.coverPath) {
          const hash = createHash('sha1').update(fs.readFileSync(coverResult.targetFilePath)).digest('hex')
          
          await Manga.update({
            coverPath: coverResult.coverPath,
            hash,
            pageCount: coverResult.pageCount,
            bundleSize: coverResult.bundleSize,
            mtime: coverResult.mtime.toJSON(),
            coverHash: coverResult.coverHash,
            status: book.status || 'non-tag'
          }, { where: { id } })
          
          result.coverGenerated = true
          result.coverPath = coverResult.coverPath
          result.pageCount = coverResult.pageCount
          result.hash = hash
          
          if (coverResult.taskTempDir) {
            await fs.promises.rm(coverResult.taskTempDir, { recursive: true, force: true }).catch(() => {})
          }
        }
      } catch (e) {
        // Silent fail - cover generation is not critical
      }
    } else {
      result.coverPath = book.coverPath
    }
    
    // PRIORITY 2: Get metadata using Worker Thread
    // Try to get metadata if book is not yet tagged (non-tag, undefined, null, or empty)
    const needsMetadata = !book.status || book.status === 'non-tag' || book.status === ''
    const hasHitomiData = setting.hitomiDataPath && fs.existsSync(setting.hitomiDataPath)
    
    if (needsMetadata && hasHitomiData) {
      try {
        const workerResult = await sendToWorker('get-metadata', { filepath })
        
        if (workerResult && workerResult.metadataFound && workerResult.metadata) {
          const metadata = {
            ...workerResult.metadata,
            status: 'tagged'
          }
          
          await Manga.update({
            title: metadata.title,
            title_jpn: metadata.title_jpn,
            tags: metadata.tags,
            status: metadata.status,
            category: metadata.category,
            posted: metadata.posted,
            url: metadata.url
          }, { where: { id } })
          
          result.metadataFound = true
          result.metadata = metadata
          console.log(`[get-metadata-now] Found metadata for: ${filepath}`)
        }
      } catch (e) {
        console.log('[get-metadata-now] Worker error:', e.message)
      }
    } else if (!hasHitomiData) {
      console.log('[get-metadata-now] No hitomiDataPath configured or path does not exist')
    }
    
    return result
  } catch (e) {
    return { coverGenerated: false, metadataFound: false, coverPath: null, metadata: null }
  } finally {
    prioritySlotActive = false
    activePriorityRequests-- // Release HDD head
  }
})

ipcMain.handle('get-ehviewer-data', async (event, dir) => {
  return getEhviewerDataManually(dir)
})

ipcMain.handle('get-ex-webpage', async (event, { url, cookie }) => {
  if (setting.proxy) {
    return await fetch(url, {
      headers: {
        Cookie: cookie
      },
      agent: new HttpsProxyAgent(setting.proxy)
    })
    .then(async res => {
      const result = await res.text()
      if (!result) throw new Error('Empty response, maybe the cookie is expired')
      return result
    })
    .catch(e => {
      sendMessageToWebContents(`Get ex page failed because ${e}`)
    })
  } else {
    return await fetch(url, {
      headers: {
        Cookie: cookie
      }
    })
    .then(async res => {
      const result = await res.text()
      if (!result) throw new Error('Empty response, maybe the cookie is expired')
      return result
    })
    .catch(e => {
      sendMessageToWebContents(`Get ex page failed because ${e}`)
    })
  }
})

ipcMain.handle('post-data-ex', async (event, { url, data }) => {
  if (setting.proxy) {
    return await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      },
      agent: new HttpsProxyAgent(setting.proxy)
    })
    .then(res => res.text())
    .catch(e => {
      sendMessageToWebContents(`Get ex data failed because ${e}`)
    })
  } else {
    return await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(res => res.text())
    .catch(e => {
      sendMessageToWebContents(`Get ex data failed because ${e}`)
    })
  }
})

ipcMain.handle('save-book', async (event, book) => {
  return await saveBookToDatabase(book)
})

// home
ipcMain.handle('get-folder-tree', async (event, filePathList) => {
  // Get all library paths for path calculation
  const libraries = await Library.findAll({ raw: true })
  const libraryPaths = libraries.length > 0 
    ? libraries.map(l => l.path) 
    : (setting.library ? [setting.library] : [])
  
  const resolveTree = (preRoot, tree, initFolder) => {
    _.forIn(tree, (node, label) => {
      const trueLabel = label.slice(1)
      if (_.isEmpty(node)) {
        preRoot.push({
          label: trueLabel,
          value: trueLabel,
          folderPath: [...initFolder, trueLabel].slice(1).join(path.sep),
        })
      } else {
        preRoot.push({
          label: trueLabel,
          value: trueLabel,
          folderPath: [...initFolder, trueLabel].slice(1).join(path.sep),
          children: resolveTree([], node, [...initFolder, trueLabel]),
        })
      }
    })
    return preRoot
  }
  
  const folderList = [...new Set(filePathList.map(filepath => path.dirname(filepath)))]
  const allFolderTrees = []
  
  for (const libraryPath of libraryPaths) {
    const librarySplitPathsLength = libraryPath.split(path.sep).length - 1
    const bookPathSplitList = folderList
      .filter(fp => fp.startsWith(libraryPath))
      .sort()
      .map(fp => fp.split(path.sep).slice(librarySplitPathsLength))
    
    const folderTreeObject = {}
    for (const folders of bookPathSplitList) {
      _.set(folderTreeObject, folders.map(f => '_' + f), {})
    }
    
    const tree = resolveTree([], folderTreeObject, [])
    if (tree.length > 0) {
      allFolderTrees.push(...tree)
    }
  }
  
  return allFolderTrees
})

ipcMain.handle('load-collection-list', async (event, arg) => {
  return collectionList
})

ipcMain.handle('save-collection-list', async (event, list) => {
  collectionList = list
  const targetPath = path.join(STORE_PATH, 'collectionList.json')
  const tempPath = path.join(STORE_PATH, 'collectionList.json.tmp')
  await fs.promises.writeFile(tempPath, JSON.stringify(list, null, '  '), { encoding: 'utf-8' })
  return await fs.promises.rename(tempPath, targetPath)
})

// detail
ipcMain.handle('open-url', async (event, url) => {
  shell.openExternal(url)
})

ipcMain.handle('show-file', async (event, filepath) => {
  shell.showItemInFolder(filepath)
})

ipcMain.handle('use-new-cover', async (event, filepath) => {
  const copyTempCoverPath = path.join(TEMP_PATH, nanoid(8) + path.extname(filepath))
  const coverPath = path.join(COVER_PATH, nanoid() + path.extname(filepath))
  try {
    await fs.promises.copyFile(filepath, copyTempCoverPath)
    await sharp(copyTempCoverPath, { failOnError: false })
    .resize(500, 707, {
      fit: 'contain',
      background: '#303133'
    })
    .toFile(coverPath)
    return coverPath
  } catch (e) {
    sendMessageToWebContents(`Generate cover from ${filepath} failed because ${e}`)
  }
})

ipcMain.handle('open-local-book', async (event, filepath) => {
  exec(`${setting.imageExplorer} "${filepath}"`)
})

ipcMain.handle('delete-local-book', async (event, filepath) => {
  // Check if filepath is within any library path
  const libraries = await Library.findAll({ raw: true })
  const libraryPaths = libraries.length > 0 
    ? libraries.map(l => l.path) 
    : (setting.library ? [setting.library] : [])
  
  const isInLibrary = libraryPaths.some(libPath => filepath.startsWith(libPath))
  
  if (isInLibrary) {
    try {
      const stats = await fs.promises.stat(filepath)
      if (stats.isDirectory()) {
        const imageFiles = globSync('*.@(jpg|jpeg|png|webp|avif|gif)', {
          cwd: filepath,
          nocase: true,
          absolute: true
        })

        for (const imageFile of imageFiles) {
          try {
            await shell.trashItem(imageFile)
          } catch {
            await fs.promises.rm(imageFile, { force: true })
          }
        }

        const remainingFiles = await fs.promises.readdir(filepath)
        if (remainingFiles.length === 0) {
          await shell.trashItem(filepath)
        }
      } else {
        await shell.trashItem(filepath)
      }
    } catch (e) {
      sendMessageToWebContents(`Delete ${filepath} failed because ${e}`)
    }
    await Manga.destroy({ where: { filepath: filepath } })
  }
})

ipcMain.handle('move-local-book', async (event, oldPath, folderArr) => {
  try {
    const pathSep = require('path').sep
    
    // Find which library this book belongs to
    const libraries = await Library.findAll({ raw: true })
    const libraryPaths = libraries.length > 0 
      ? libraries.map(l => l.path) 
      : (setting.library ? [setting.library] : [])
    
    let targetLibraryPath = null
    for (const libPath of libraryPaths) {
      if (oldPath.startsWith(libPath)) {
        targetLibraryPath = libPath
        break
      }
    }
    
    if (!targetLibraryPath && setting.library) {
      targetLibraryPath = setting.library
    }
    
    const folderPath = Array.isArray(folderArr) && folderArr.length > 0 ? folderArr.join(pathSep) : ''
    const newFilePath = path.join(path.dirname(targetLibraryPath || setting.library), folderPath, path.basename(oldPath))
    if (oldPath !== newFilePath) {
      await fs.promises.rename(oldPath, newFilePath)
      sendMessageToWebContents(`Move ${oldPath} to ${newFilePath} successfully`)
      return newFilePath
    } else {
      sendMessageToWebContents(`Move ${oldPath} failed because the new path is the same as the old path`)
      return false
    }
  } catch (e) {
    sendMessageToWebContents(`Move ${oldPath} failed because ${e}`)
    return false
  }
})

// viewer
ipcMain.handle('load-manga-image-list', async (event, book) => {
  // 先释放之前的图片发送锁，停止之前的发送进程
  console.log(`[viewer] 切换漫画，释放图片发送锁，准备清空缓存: ${book.title || book.id}`)
  sendImageLock = false
  // 等待一小段时间让之前的操作完成
  await new Promise(resolve => setTimeout(resolve, 300))
  
  console.log(`[viewer] 清空缓存目录: ${VIEWER_PATH}`)
  await clearFolder(VIEWER_PATH)
  console.log(`[viewer] 缓存目录已清空`)

  const { filepath, type, id: bookId } = book
  const list = await getImageListByBook(filepath, type)
  console.log(`[viewer] 获取到 ${list.length} 张图片`)

  sendImageLock = true
  ;(async () => {
    // 384 is the default 4K screen width divided by the default number of thumbnail columns
    const thumbnailWidth = _.isFinite(screenWidth / setting.thumbnailColumn) ? Math.floor(screenWidth / setting.thumbnailColumn) : 384
    const widthLimit = _.isNumber(setting.widthLimit) ? Math.ceil(setting.widthLimit) : screenWidth
    for (let index = 1; index <= list.length; index++) {
      if (sendImageLock) {
        let imageFilepath = list[index - 1].absolutePath
        const extname = path.extname(imageFilepath)
        if (imageFilepath.search(/[%#]/) >= 0 || type === 'folder') {
          const newFilepath = path.join(VIEWER_PATH, `rename_${nanoid(8)}${extname}`)
          await fs.promises.copyFile(imageFilepath, newFilepath)
          imageFilepath = newFilepath
        }
        let { width, height } = await sharp(imageFilepath, { failOnError: false }).metadata()
        if (widthLimit !== 0 && width > widthLimit) {
          height = Math.floor(height * (widthLimit / width))
          width = widthLimit
          const resizedFilepath = path.join(VIEWER_PATH, `resized_${nanoid(8)}.jpg`)
          switch (extname) {
            case '.gif':
              break
            default:
              await sharp(imageFilepath, { failOnError: false })
                .resize({ width })
                .toFile(resizedFilepath)
              imageFilepath = resizedFilepath
              break
          }
        }
        mainWindow.webContents.send('manga-image', {
          id: `${bookId}_${index}`,
          index,
          relativePath: list[index - 1].relativePath,
          filepath: imageFilepath,
          width, height,
          total: list.length
        })
        if (setting.viewerType !== 'comicread') {
          ;(async () => {
            let thumbnailPath = path.join(VIEWER_PATH, `thumb_${nanoid(8)}.jpg`)
            switch (extname) {
              case '.gif':
                thumbnailPath = imageFilepath
                break
              default:
                await sharp(imageFilepath, { failOnError: false })
                  .resize({ width: thumbnailWidth })
                  .toFile(thumbnailPath)
                break
            }
            mainWindow.webContents.send('manga-thumbnail-image', {
              id: `${bookId}_${index}`,
              thumbId: `thumb_${bookId}_${index}`,
              index,
              relativePath: list[index - 1].relativePath,
              filepath: imageFilepath,
              thumbnailPath,
              total: list.length
            })
          })()
        }
      }
    }
  })()

  return list
})

ipcMain.handle('release-sendimagelock', () => {
  sendImageLock = false
})

ipcMain.handle('delete-image', async (event, filename, filepath, type) => {
  return await deleteImageFromBook(filename, filepath, type)
})

// Get preview images for compact view
ipcMain.handle('get-preview-images', async (event, { filepath, type, count }) => {
  try {
    const list = await getImageListByBook(filepath, type)
    if (!list || list.length === 0) {
      return { images: [] }
    }
    
    const images = []
    const maxCount = Math.min(count || 3, list.length)
    
    // Get first N images (skipping cover which is usually the first)
    for (let i = 1; i <= maxCount && i < list.length; i++) {
      const img = list[i]
      let imageFilepath = img.absolutePath
      
      // Handle special characters
      if (imageFilepath.search(/[%#]/) >= 0 || type === 'folder') {
        const extname = path.extname(imageFilepath)
        const newFilepath = path.join(TEMP_PATH, `preview_${nanoid(8)}${extname}`)
        await fs.promises.copyFile(imageFilepath, newFilepath)
        imageFilepath = newFilepath
      }
      
      // Resize to thumbnail
      const thumbnailPath = path.join(TEMP_PATH, `preview_thumb_${nanoid(8)}.jpg`)
      await sharp(imageFilepath, { failOnError: false })
        .resize(200, 283, { fit: 'inside' })
        .toFile(thumbnailPath)
      
      images.push(thumbnailPath)
    }
    
    return { images }
  } catch (e) {
    console.log('Failed to get preview images:', e)
    return { images: [] }
  }
})

// setting
ipcMain.handle('select-folder', async (event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory']
  })
  if (!result.canceled) {
    return result.filePaths[0]
  } else {
    return undefined
  }
})

ipcMain.handle('select-file', async (event, title, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openFile'],
    filters
  })
  if (!result.canceled) {
    return result.filePaths[0]
  } else {
    return undefined
  }
})

// Library management
ipcMain.handle('get-libraries', async (event, arg) => {
  const libraries = await Library.findAll({ raw: true })
  // SQLite 返回 0/1，转换为布尔值
  return libraries.map(lib => ({
    ...lib,
    enabled: !!lib.enabled,
    scanCbx: !!lib.scanCbx,
    scanPdf: !!lib.scanPdf,
    scanDirectoryExclusions: lib.scanDirectoryExclusions || []
  }))
})

ipcMain.handle('add-library', async (event, library) => {
  // Check if path already exists
  const existingLibrary = await Library.findOne({ where: { path: library.path } })
  if (existingLibrary) {
    sendMessageToWebContents(`Library with path ${library.path} already exists`)
    return { success: false, message: 'Library path already exists' }
  }
  
  // Check if path is nested within existing library or vice versa
  const allLibraries = await Library.findAll({ raw: true })
  for (const lib of allLibraries) {
    if (library.path.startsWith(lib.path + path.sep) || lib.path.startsWith(library.path + path.sep)) {
      sendMessageToWebContents(`Library path is nested with existing library: ${lib.name}`)
      return { success: false, message: 'Library path is nested with existing library' }
    }
  }
  
  // Create library record
  const newLibrary = await Library.create({
    name: library.name,
    path: library.path,
    scanCbx: library.scanCbx !== undefined ? library.scanCbx : true,
    scanPdf: library.scanPdf !== undefined ? library.scanPdf : false,
    scanDirectoryExclusions: library.scanDirectoryExclusions || [],
    enabled: library.enabled !== undefined ? library.enabled : true
  })
  sendMessageToWebContents(`Library "${library.name}" added successfully`)
  return { success: true, library: newLibrary.toJSON() }
})

ipcMain.handle('update-library', async (event, library) => {
  const existingLibrary = await Library.findByPk(library.id)
  if (!existingLibrary) {
    sendMessageToWebContents(`Library with id ${library.id} not found`)
    return { success: false, message: 'Library not found' }
  }
  
  // If path is being changed, check for nesting
  if (library.path && library.path !== existingLibrary.path) {
    const allLibraries = await Library.findAll({ 
      where: { id: { [require('sequelize').Op.ne]: library.id } },
      raw: true 
    })
    for (const lib of allLibraries) {
      if (library.path.startsWith(lib.path + path.sep) || lib.path.startsWith(library.path + path.sep)) {
        sendMessageToWebContents(`Library path is nested with existing library: ${lib.name}`)
        return { success: false, message: 'Library path is nested with existing library' }
      }
    }
  }
  
  await Library.update({
    name: library.name !== undefined ? library.name : existingLibrary.name,
    path: library.path !== undefined ? library.path : existingLibrary.path,
    scanCbx: library.scanCbx !== undefined ? library.scanCbx : existingLibrary.scanCbx,
    scanPdf: library.scanPdf !== undefined ? library.scanPdf : existingLibrary.scanPdf,
    scanDirectoryExclusions: library.scanDirectoryExclusions !== undefined ? library.scanDirectoryExclusions : existingLibrary.scanDirectoryExclusions,
    enabled: library.enabled !== undefined ? library.enabled : existingLibrary.enabled,
    updatedAt: new Date()
  }, { where: { id: library.id } })
  
  sendMessageToWebContents(`Library "${library.name || existingLibrary.name}" updated successfully`)
  return { success: true }
})

ipcMain.handle('delete-library', async (event, libraryId) => {
  const library = await Library.findByPk(libraryId)
  if (!library) {
    sendMessageToWebContents(`Library with id ${libraryId} not found`)
    return { success: false, message: 'Library not found' }
  }
  
  // Soft delete: only delete library configuration, keep manga data
  await Library.destroy({ where: { id: libraryId } })
  sendMessageToWebContents(`Library "${library.name}" deleted (manga data preserved)`)
  return { success: true }
})

ipcMain.handle('load-setting', async (event, arg) => {
  return setting
})

ipcMain.handle('save-setting', async (event, receiveSetting) => {
  if (receiveSetting.proxy) {
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: receiveSetting.proxy
    })
  }
  if (receiveSetting.metadataPath !== setting.metadataPath) {
    Metadata = prepareMetadataModel(path.join(receiveSetting.metadataPath, './metadata.sqlite'))
    await Metadata.sync()
  }
  if (receiveSetting.enabledLANBrowsing !== setting.enabledLANBrowsing) {
    if (receiveSetting.enabledLANBrowsing) {
      enableLANBrowsing()
    } else {
      if (LANBrowsingInstance?.listening) {
        LANBrowsingInstance.close(() => {
          sendMessageToWebContents('LAN browsing closed')
        })
      }
    }
  }
  if (receiveSetting.startOnLogin !== setting.startOnLogin) {
    app.setLoginItemSettings({
      openAtLogin: receiveSetting.startOnLogin
    })
  }
  setting = receiveSetting
  if (tray && !setting.minimizeToTray) {
    tray.destroy()
    tray = null
  }
  const targetPath = path.join(STORE_PATH, 'setting.json')
  const tempPath = path.join(STORE_PATH, 'setting.json.tmp')
  await fs.promises.writeFile(tempPath, JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
  return await fs.promises.rename(tempPath, targetPath)
})

ipcMain.handle('export-database', async (event, folder) => {
  if (folder !== STORE_PATH && folder !== setting.metadataPath) {
    await fs.promises.copyFile(path.join(STORE_PATH, 'collectionList.json'), path.join(folder, 'collectionList.json'))
    await fs.promises.copyFile(metadataSqliteFile, path.join(folder, 'metadata.sqlite'))
    return true
  } else {
    sendMessageToWebContents('Export failed because the target folder is the same as the source folder')
    return false
  }
})

ipcMain.handle('import-database', async (event, arg) => {
  const { collectionListPath, metadataSqlitePath } = arg
  if (collectionListPath && metadataSqlitePath) {
    await Metadata.sequelize.close()
    await fs.promises.copyFile(collectionListPath, path.join(STORE_PATH, 'collectionList.json'))
    await fs.promises.copyFile(metadataSqlitePath, metadataSqliteFile)
    app.relaunch()
    app.exit(0)
  } else {
    sendMessageToWebContents('Import failed because the source folder is empty')
  }
})

ipcMain.handle('import-sqlite', async (event, bookList) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
  })
  if (!result.canceled) {
    const db = new sqlite3.Database(result.filePaths[0], sqlite3.OPEN_READONLY)
    const dbGet = (sql, params) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
    })
    try {
      const re = /'/g
      const bookListLength = bookList.length
      for (let i = 0; i < bookListLength; i++) {
        const book = bookList[i]
        if (book.status !== 'tagged') {
          let metadata
          // 当book type为folder时，尝试获取.ehviewer数据
          if (book.type === 'folder') {
            const dirname = book.filepath
            const ehviewerData = getEhviewerDataManually(dirname)
            const { gid, token } = ehviewerData || {}
            if (gid && token) {
              metadata = await dbGet('SELECT * FROM gallery WHERE gid = ? AND token = ?', [gid, token])
            }
          }
          if (metadata === undefined) {
            // remove file extension
            const filename = path.parse(book.title).name
            metadata = await dbGet(`SELECT * FROM gallery WHERE torrents LIKE ?
                                                            OR title LIKE ?
                                                            OR title_jpn LIKE ?
                                                            OR thumb LIKE ?`,
              [`%${filename}%`, `%${filename}%`, `%${filename}%`, `%${book.coverHash}%`]
            )
          }

          if (metadata) {
            metadata.tags = {
              language: metadata.language ? JSON.parse(metadata.language.replace(re, '\"')) : undefined,
              parody: metadata.parody ? JSON.parse(metadata.parody.replace(re, '\"')) : undefined,
              character: metadata.character ? JSON.parse(metadata.character.replace(re, '\"')) : undefined,
              group: metadata.group ? JSON.parse(metadata.group.replace(re, '\"')) : undefined,
              artist: metadata.artist ? JSON.parse(metadata.artist.replace(re, '\"')) : undefined,
              male: metadata.male ? JSON.parse(metadata.male.replace(re, '\"')) : undefined,
              female: metadata.female ? JSON.parse(metadata.female.replace(re, '\"')) : undefined,
              mixed: metadata.mixed ? JSON.parse(metadata.mixed.replace(re, '\"')) : undefined,
              other: metadata.other ? JSON.parse(metadata.other.replace(re, '\"')) : undefined,
              cosplayer: metadata.cosplayer ? JSON.parse(metadata.cosplayer.replace(re, '\"')) : undefined,
              rest: metadata.rest ? JSON.parse(metadata.rest.replace(re, '\"')) : undefined,
            }
            metadata.filecount = +metadata.filecount
            metadata.rating = +metadata.rating
            metadata.posted = +metadata.posted
            metadata.exFilesize = +metadata.exFilesize
            metadata.url = `https://exhentai.org/g/${metadata.gid}/${metadata.token}/`
            _.assign(book, _.pick(metadata, ['tags', 'title', 'title_jpn', 'filecount', 'rating', 'posted', 'exFilesize', 'category', 'url']), { status: 'tagged' })
            await saveBookToDatabase(book)
          }
          setProgressBar(i / bookListLength)
        }
      }
      db.close()
      setProgressBar(-1)
    } catch (e) {
      console.log(e)
      db.close()
    }
    return {
      success: true,
      bookList
    }
  } else {
    return {
      success: false
    }
  }
})

// Import metadata from hitomi msgpack data
ipcMain.handle('import-from-hitomi', async (event, bookList) => {
  let hitomiDataDir = null
  
  // If bookList is an object with hitomiDataPath, use that
  if (bookList && bookList.hitomiDataPath) {
    hitomiDataDir = bookList.hitomiDataPath
    bookList = bookList.bookList || []
  } else if (typeof bookList === 'string') {
    // Backward compatibility: first argument could be hitomiDataPath
    hitomiDataDir = bookList
    bookList = []
  }
  
  // If no path provided, ask user to select
  if (!hitomiDataDir) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择 hitomi_data 目录'
    })
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, message: '未选择目录' }
    }
    hitomiDataDir = result.filePaths[0]
  }
  
  sendMessageToWebContents(`正在从 ${hitomiDataDir} 加载 hitomi 元数据...`)
  
  // Load all hitomi metadata
  const idToMetadata = new Map()
  
  try {
    const files = await fs.promises.readdir(hitomiDataDir)
    const packFiles = files.filter(f => f.endsWith('_pack.json'))
    
    for (const filename of packFiles) {
      const filepath = path.join(hitomiDataDir, filename)
      try {
        const buffer = await fs.promises.readFile(filepath)
        const data = decode(buffer)
        
        for (const item of data) {
          const comicId = String(item.id)
          if (!comicId) continue
          
          const metadata = {
            id: comicId,
            title: item.n || '',
            language: item.l || '',
            type: item.type || '',
            filecount: item.pg || 0,
            posted: null,
            artists: [],
            groups: [],
            series: [],
            tags: [],
            characters: [],
          }
          
          // Date
          if (item.d) {
            try {
              const date = new Date(item.d * 1000)
              metadata.posted = Math.floor(date.getTime() / 1000)
            } catch {}
          }
          
          // Artists
          if (item.a) {
            metadata.artists = Array.isArray(item.a) ? item.a : [item.a]
          }
          
          // Groups
          if (item.g) {
            metadata.groups = Array.isArray(item.g) ? item.g : [item.g]
          }
          
          // Series
          if (item.p) {
            metadata.series = Array.isArray(item.p) ? item.p : [item.p]
          }
          
          // Tags
          if (item.t) {
            metadata.tags = Array.isArray(item.t) ? item.t : [item.t]
          }
          
          // Characters
          if (item.c) {
            metadata.characters = Array.isArray(item.c) ? item.c : [item.c]
          }
          
          idToMetadata.set(comicId, metadata)
        }
      } catch (e) {
        sendMessageToWebContents(`读取 ${filename} 失败: ${e.message}`)
      }
    }
    
    sendMessageToWebContents(`已加载 ${idToMetadata.size} 条 hitomi 元数据`)
    
    // Match books with hitomi metadata
    let matchedCount = 0
    const bookListLength = bookList.length
    const naPatterns = new Set(['n/a', 'n／a', 'original'])
    
    // Extract ID from folder/filename pattern: [Artist] Title (123456)[Language]
    const extractIdFromName = (name) => {
      const matches = name.match(/\((\d+)\)\s*(?:\[|$)/)
      if (matches) return matches[matches.length - 1]
      const allMatches = name.match(/\((\d+)\)/g)
      if (allMatches) {
        const lastMatch = allMatches[allMatches.length - 1]
        return lastMatch.match(/\d+/)?.[0]
      }
      return null
    }
    
    for (let i = 0; i < bookListLength; i++) {
      const book = bookList[i]
      if (book.status === 'tagged') {
        continue
      }
      
      // Try to extract ID from filepath
      const basename = path.basename(book.filepath)
      let comicId = extractIdFromName(basename)
      
      // Try info.txt if no ID found
      if (!comicId && book.type === 'folder') {
        const infoPath = path.join(book.filepath, 'info.txt')
        try {
          if (fs.existsSync(infoPath)) {
            const content = await fs.promises.readFile(infoPath, 'utf-8')
            const idMatch = content.match(/(?:图库\s*)?ID:\s*(\d+)/)
            if (idMatch) comicId = idMatch[1]
          }
        } catch {}
      }
      
      // Try .ehviewer file
      if (!comicId && book.type === 'folder') {
        const ehviewerData = getEhviewerDataManually(book.filepath)
        if (ehviewerData?.gid) comicId = ehviewerData.gid
      }
      
      // Try ComicInfo.xml from CBZ/ZIP file
      if (!comicId && (book.type === 'zip' || book.type === 'archive')) {
        try {
          const AdmZip = require('adm-zip')
          const zip = new AdmZip(book.filepath)
          const comicInfoEntry = zip.getEntry('ComicInfo.xml')
          if (comicInfoEntry) {
            const xmlContent = comicInfoEntry.getData().toString('utf-8')
            // Extract Hitomi.la Gallery ID from Notes field
            const notesMatch = xmlContent.match(/<Notes>(?:<!\[CDATA\[)?Hitomi\.la Gallery ID:\s*(\d+)/i)
            if (notesMatch) comicId = notesMatch[1]
            // Fallback: try to extract from Web field
            if (!comicId) {
              const webMatch = xmlContent.match(/<Web>.*?hitomi\.la\/galleries\/(\d+)/i)
              if (webMatch) comicId = webMatch[1]
            }
          }
        } catch (e) {
          // Ignore errors when reading ComicInfo.xml
        }
      }
      
      if (!comicId) continue
      
      const hitomiMeta = idToMetadata.get(comicId)
      if (!hitomiMeta) continue
      
      // Build tags object
      const tags = {}
      
      // Add language tag
      if (hitomiMeta.language) {
        const langMap = { 'japanese': 'japanese', 'chinese': 'chinese', 'korean': 'korean', 'english': 'english' }
        const lang = langMap[hitomiMeta.language.toLowerCase()] || hitomiMeta.language.toLowerCase()
        tags.language = [lang, 'translated']
      } else {
        tags.language = ['japanese']
      }
      
      // Add artists
      if (hitomiMeta.artists?.length) {
        tags.artist = hitomiMeta.artists.filter(a => a && !naPatterns.has(a.toLowerCase()))
      }
      
      // Add groups
      if (hitomiMeta.groups?.length) {
        tags.group = hitomiMeta.groups.filter(g => g && !naPatterns.has(g.toLowerCase()))
      }
      
      // Add series (parody)
      if (hitomiMeta.series?.length) {
        tags.parody = hitomiMeta.series.filter(s => s && !naPatterns.has(s.toLowerCase()))
      }
      
      // Add characters
      if (hitomiMeta.characters?.length) {
        tags.character = hitomiMeta.characters.filter(c => c && !naPatterns.has(c.toLowerCase()))
      }
      
      // Add tags (female/male/other)
      const femaleTags = []
      const maleTags = []
      const otherTags = []
      
      for (const tag of hitomiMeta.tags || []) {
        if (!tag || naPatterns.has(tag.toLowerCase())) continue
        if (tag.startsWith('female:')) {
          femaleTags.push(tag.substring(7))
        } else if (tag.startsWith('male:')) {
          maleTags.push(tag.substring(6))
        } else if (tag.startsWith('tag:')) {
          otherTags.push(tag.substring(4))
        } else {
          otherTags.push(tag)
        }
      }
      
      if (femaleTags.length) tags.female = femaleTags
      if (maleTags.length) tags.male = maleTags
      if (otherTags.length) tags.other = otherTags
      
      // Update book
      book.title = hitomiMeta.title || book.title
      book.tags = tags
      book.filecount = hitomiMeta.filecount
      book.posted = hitomiMeta.posted
      book.category = hitomiMeta.type || 'Doujinshi'
      book.status = 'tagged'
      book.url = `https://hitomi.la/galleries/${comicId}.html`
      
      await saveBookToDatabase(book)
      matchedCount++
      
      if ((i + 1) % 100 === 0) {
        setProgressBar(i / bookListLength)
      }
    }
    
    setProgressBar(-1)
    sendMessageToWebContents(`导入完成: 匹配 ${matchedCount} 本漫画`)
    
    return {
      success: true,
      matchedCount,
      bookList
    }
  } catch (e) {
    sendMessageToWebContents(`导入失败: ${e.message}`)
    return { success: false, message: e.message }
  }
})


// tools

ipcMain.handle('set-progress-bar', async (event, progress) => {
  setProgressBar(progress)
})

ipcMain.handle('get-locale', async (event, arg) => {
  return app.getLocale()
})

ipcMain.handle('copy-image-to-clipboard', async (event, filepath) => {
  clipboard.writeImage(nativeImage.createFromPath(filepath))
})

ipcMain.handle('copy-text-to-clipboard', async (event, text) => {
  clipboard.writeText(text)
})

ipcMain.handle('read-text-from-clipboard', async () => {
  return clipboard.readText()
})

ipcMain.handle('update-window-title', async (event, title) => {
  const name = require('./package.json').name
  const version = require('./package.json').version
  if (title) {
    mainWindow.setTitle(name + ' ' + version + ' | ' + title)
  } else {
    mainWindow.setTitle(name + ' ' + version)
  }
})

ipcMain.handle('switch-fullscreen', async (event, arg) => {
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

ipcMain.on('get-path-sep', async (event, arg) => {
  event.returnValue = path.sep
})


// 初始化Express
const LANBrowsing = express()
const port = 23786
const sortkey_map = {
  "date_added": {
    key: "date",
    type: "number"
  },
  "date_modified": {
    key: "mtime",
    type: "date"
  },
  "date_posted": {
    key: "posted",
    type: "number"
  },
  "size": {
    key: "bundleSize",
    type: "number"
  },
  "rating": {
    key: "rating",
    type: "number"
  },
  "read_count": {
    key: "readCount",
    type: "number"
  },
  "random": {}
}

// 设置静态文件夹
const staticFilePath = path.resolve(STORE_PATH, 'public')
fs.mkdirSync(staticFilePath, { recursive: true })
LANBrowsing.use('/static', express.static(staticFilePath))

let mangas = []
let tagTranslation = undefined

// sort
function compareItems(a, b, sortKey, ascending = false) {
  const sortConfig = sortkey_map[sortKey]
  if (!sortConfig) {
    throw new Error(`Invalid sort key: ${sortKey}`)
  }

  const { key, type } = sortConfig

  let valA = a[key]
  let valB = b[key]

  if (type === "number") {
    valA = Number(valA) || 0
    valB = Number(valB) || 0
  } else if (type === "date") {
    valA = new Date(valA).getTime() || 0
    valB = new Date(valB).getTime() || 0
  } else {
    valA = String(valA || "")
    valB = String(valB || "")
  }

  if (valA < valB) return ascending ? -1 : 1
  if (valA > valB) return ascending ? 1 : -1
  return 0
}

// 格式化标签
const formatTags = (tags) => {
  return Object.entries(tags)
    .map(([key, values]) => values.map(value => setting.showTranslation ? `${key}:${tagTranslation?.[value]?.name ?? value}` : `${key}:${value}`).join(', '))
    .join(', ')
}

ipcMain.handle('update-tag-translation', async (event, _tagTranslation) => {
  tagTranslation = _tagTranslation
})

LANBrowsing.get('/api/search', async (req, res) => {
  try {
    const filter = req.query.filter || ''
    const start = parseInt(req.query.start, 10) || 0
    const length = parseInt(req.query.length, 10) || 200
    // 默认使用阅读次数排序, 来匹配 mihon 热门不带 sortby
    let sortKey = req.query.sortby || 'read_count'
    let showAll = false
    if (sortKey.includes("_all")) {
      sortKey = sortKey.replace("_all", "")
      showAll = true
    }

    // 读取并搜索数据库
    mangas = await loadBookListFromDatabase()
    let filterMangas
    if (filter) {
      filterMangas = mangas.filter(manga => {
        return JSON.stringify(_.pick(manga, ['title', 'title_jpn', 'status', 'category', 'filepath', 'url'])).toLowerCase().includes(filter.toLowerCase())
        || formatTags(manga.tags).toLowerCase().includes(filter.toLowerCase())
      })
    } else {
      filterMangas = mangas
    }

    if (sortKey !== 'random') {
      filterMangas = filterMangas.sort((a, b) => compareItems(a, b, sortKey))
    } else {
      filterMangas = _.shuffle(filterMangas)
    }
    filterMangas = showAll ? filterMangas : filterMangas.slice(start, start + length)

    // 格式化响应数据
    const responseData = filterMangas.map(manga => ({
      arcid: manga.hash,
      extension: path.extname(manga.filepath),
      filename: path.basename(manga.filepath),
      isnew: 'true',
      lastreadtime: 0,
      pagecount: manga.pageCount,
      progress: 0,
      size: manga.exFilesize,
      summary: null,
      tags: manga.tags ? formatTags(manga.tags) : '',
      title: `${manga.title_jpn && manga.title ? `${manga.title_jpn} || ${manga.title}` : manga.title}`,
      category: manga.category,
      url: manga.url
    }))
    const hash = createHash('md5').update(JSON.stringify(responseData)).digest('hex')
    res.json({
      data: responseData,
      hash,
      draw: 0,
      recordsFiltered: responseData.length,
      recordsTotal: filterMangas.length
    })
  } catch (error) {
    res.status(500).send(error.message)
  }
})

LANBrowsing.get('/api/search/random', async (req, res) => {
  try {
    // 从数据库中随机获取指定数量的 Manga 记录
    const count = parseInt(req.query.count, 10) || 1
    const randomMangas = _.sampleSize(await loadBookListFromDatabase(), count)

    const responseData = randomMangas.map(manga => ({
      arcid: manga.hash,
      extension: path.extname(manga.filepath),
      filename: path.basename(manga.filepath),
      isnew: 'true',
      lastreadtime: 0,
      pagecount: manga.pageCount,
      progress: 0,
      size: manga.filesize,
      summary: null,
      tags: manga.tags ? formatTags(manga.tags) : '',
      title: `${manga.title_jpn && manga.title ? `${manga.title_jpn} || ${manga.title}` : manga.title}`,
      category: manga.category,
    }))

    res.json({
      data: responseData
    })
  } catch (error) {
    console.error('Failed to fetch random Manga:', error)
    res.status(500).send('Internal Server Error')
  }
})

LANBrowsing.get('/api/archives/:hash/metadata', async (req, res) => {
  try {
    const mangaHash = req.params.hash

    // 从数据库找到对应的漫画
    if (_.isEmpty(mangas)) mangas = await loadBookListFromDatabase()
    const manga = await mangas.find(manga => manga.hash === mangaHash)

    if (!manga) {
      return res.status(404).send('Manga not found')
    }

    // 构造响应数据
    const responseMetadata = {
      arcid: manga.hash,
      extension: path.extname(manga.filepath),
      filename: path.basename(manga.filepath),
      isnew: 'true',
      lastreadtime: 0,
      pagecount: manga.pageCount,
      progress: 0,
      size: manga.filesize,
      summary: null,
      tags: manga.tags ? formatTags(manga.tags) : '',
      title: `${manga.title_jpn && manga.title ? `${manga.title_jpn} || ${manga.title}` : manga.title}`,
      category: manga.category,
    }

    res.json(responseMetadata)
  } catch (error) {
    res.status(500).send(error.message)
  }
})

// 处理封面图片请求
LANBrowsing.get('/api/archives/:hash/thumbnail', async (req, res) => {
  const hash = req.params.hash
  const manga = await Manga.findOne({where: {hash: hash}})
  if (!manga || !manga.coverPath) {
    return res.status(404).send('Cover not found')
  }
  const coverFilePath = path.join(staticFilePath, path.basename(manga.coverPath))
  await fs.promises.copyFile(manga.coverPath, coverFilePath)
  if (fs.existsSync(coverFilePath)) {
    res.sendFile(coverFilePath)
  } else {
    res.status(404).send('Cover file not found')
  }
})

let existBook = {
  hash: null,
  imageList: []
}

// 处理章节列表请求
LANBrowsing.get('/api/archives/:hash/files', async (req, res) => {
  try {
    const mangaHash = req.params.hash

    // 从数据库找到对应的漫画
    const manga = await Manga.findOne({where: {hash: mangaHash}})

    if (!manga) {
      return res.status(404).send('Manga not found')
    }

    await clearFolder(VIEWER_PATH)
    await clearFolder(staticFilePath)
    const imageList = await getImageListByBook(manga.filepath, manga.type)

    existBook = {
      hash: manga.hash,
      imageList: imageList.map(p => p.absolutePath)
    }
    // 构造响应数据
    const responseFiles = {
      job: Date.now(), // 示例中的 job 可以是一个随机数或时间戳
      pages: imageList.map((file, index) => `/api/archives/${manga.hash}/page?path=${index + 1}`)
    }

    res.json(responseFiles)
  } catch (error) {
    res.status(500).send(error.message)
  }
})

// 处理章节图片请求
LANBrowsing.get('/api/archives/:hash/page', async (req, res) => {
  const hash = req.params.hash
  const page = parseInt(req.query.path, 10)
  if (isNaN(page) || page < 1) {
    return res.status(400).send('Invalid page number')
  }

  const manga = await Manga.findOne({where: {hash: hash}})
  if (!manga || !manga.filepath) {
    return res.status(404).send('File not found')
  }

  // 获取章节图片列表
  try {
    let imageList
    if (manga.hash === existBook.hash) {
      imageList = existBook.imageList
    } else {
      await clearFolder(VIEWER_PATH)
      await clearFolder(staticFilePath)
      imageList = await getImageListByBook(manga.filepath, manga.type)
      imageList = imageList.map(p => p.absolutePath)
      existBook.hash = manga.hash
      existBook.imageList = imageList
    }
    const imageFilePath = imageList[page - 1]
    if (!imageFilePath) {
      return res.status(404).send('Image not found')
    }

    // 重命名并复制图片文件到静态文件夹
    const imageFileName = `${manga.hash}_${page}${path.extname(imageFilePath)}`
    const imageFile = path.join(staticFilePath, imageFileName)
    await fs.promises.copyFile(imageFilePath, imageFile)

    // 发送图片文件
    if (fs.existsSync(imageFile)) {
      res.sendFile(imageFile)
    } else {
      res.status(404).send('Image file not found')
    }
  } catch (err) {
    console.error(err)
    res.status(500).send('Error processing file')
  }
})

// 处理webview请求
LANBrowsing.get('/reader', async (req, res) => {
  const id = req.query.id
  const manga = await Manga.findOne({where: {hash: id}})

  // 重定向至manga.url
  if (manga && manga.url) {
    res.redirect(manga.url.replace('exhentai', 'e-hentai'))
  } else {
    res.status(404).send('Manga not found')
  }
})

LANBrowsing.get('/', (req, res) => {
  switch (setting.language) {
    case 'en-US':
      res.redirect('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/LAN-Browsing')
      break
    case 'zh-CN':
    case 'zh-TW':
    default:
      res.redirect('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/%E5%B1%80%E5%9F%9F%E7%BD%91%E6%B5%8F%E8%A7%88')
      break
  }
})

let LANBrowsingInstance
// 启动Express服务器
const enableLANBrowsing = () => {
  if (LANBrowsingInstance?.listening) {
    LANBrowsingInstance.close(() => {
      LANBrowsingInstance = LANBrowsing.listen(port, '0.0.0.0', () => {
        sendMessageToWebContents(`LAN browsing restart and listening at http://0.0.0.0:${port}`)
      })
    })
  } else {
    LANBrowsingInstance = LANBrowsing.listen(port, '0.0.0.0', () => {
      sendMessageToWebContents(`LAN browsing listening at http://0.0.0.0:${port}`)
    })
  }
}

ipcMain.handle('enable-LAN-browsing', async (event, arg) => {
  enableLANBrowsing()
})

// ============================================================================
// TRANSLATION SERVICE
// ============================================================================
const TranslationService = require('./modules/translationService.js')
const translationService = new TranslationService()

// 设置翻译服务状态回调
translationService.setStatusCallback((status) => {
  sendMessageToWebContents(`[翻译服务] ${status.message}`)
  mainWindow?.webContents.send('translation-service-status', status)
})

// 启动翻译服务
ipcMain.handle('start-translation-service', async (event) => {
  const translationConfig = setting.translation || {}
  return await translationService.startAll(translationConfig)
})

// 停止翻译服务
ipcMain.handle('stop-translation-service', async (event) => {
  translationService.stopAll()
  return true
})

// 获取翻译服务状态
ipcMain.handle('get-translation-service-status', async (event) => {
  const status = await translationService.getStatus()
  return status
})

// 清空翻译队列
ipcMain.handle('clear-translation-queue', async (event) => {
  const translationConfig = setting.translation || {}
  const port = translationConfig.mangaTranslatorPort || 5000
  
  try {
    const response = await fetch(`http://127.0.0.1:${port}/cancel-all`, {
      method: 'POST'
    })
    return response.ok
  } catch (err) {
    return false
  }
})

// 翻译单张图片 (使用旧版 manga-image-translator API)
ipcMain.handle('translate-image', async (event, { imagePath, config }) => {
  const translationConfig = setting.translation || {}
  const port = translationConfig.mangaTranslatorPort || 5000
  const targetLang = translationConfig.targetLang || 'CHS'
  
  try {
    const FormData = require('form-data')
    const formData = new FormData()
    
    // 读取图片文件
    const imageBuffer = await fs.promises.readFile(imagePath)
    formData.append('file', imageBuffer, { filename: 'image.png', contentType: 'image/png' })
    formData.append('tgt_lang', targetLang)
    formData.append('translator', 'gpt4')  // 使用 gpt4 连接本地 llama-server
    formData.append('detector', 'default')
    
    // 提交翻译任务
    const submitResponse = await fetch(`http://127.0.0.1:${port}/run`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    })
    
    if (!submitResponse.ok) {
      throw new Error(`Submit translation failed: ${submitResponse.statusText}`)
    }
    
    const submitResult = await submitResponse.json()
    const taskId = submitResult.task_id
    
    if (!taskId) {
      throw new Error('No task_id returned')
    }
    
    // 如果返回 successful 状态，说明使用了缓存结果，直接获取翻译后的图片
    if (submitResult.status === 'successful') {
      const resultResponse = await fetch(`http://127.0.0.1:${port}/result/${taskId}`)
      if (resultResponse.ok) {
        const translatedImageBuffer = Buffer.from(await resultResponse.arrayBuffer())
        return { success: true, data: translatedImageBuffer.toString('base64'), taskId, cached: true }
      } else {
        // 缓存结果获取失败，删除损坏的缓存目录
        const mangaTranslatorResultPath = path.join(
          __dirname,
          'other_code',
          'manga-image-translator',
          'result',
          taskId
        )
        try {
          await fs.promises.rm(mangaTranslatorResultPath, { recursive: true, force: true })
        } catch (err) {
          // ignore
        }
        throw new Error('Cached result fetch failed, cache deleted')
      }
    }
    
    // 轮询等待翻译完成
    let attempts = 0
    const maxAttempts = 120  // 最多等待 120 秒
    while (attempts < maxAttempts) {
      const stateResponse = await fetch(`http://127.0.0.1:${port}/task-state?taskid=${taskId}`)
      const stateResult = await stateResponse.json()
      
      if (stateResult.finished) {
        // 翻译完成，获取结果
        const resultResponse = await fetch(`http://127.0.0.1:${port}/result/${taskId}`)
        if (resultResponse.ok) {
          const translatedImageBuffer = Buffer.from(await resultResponse.arrayBuffer())
          return { success: true, data: translatedImageBuffer.toString('base64'), taskId }
        } else {
          throw new Error('Failed to fetch translated image')
        }
      }
      
      if (stateResult.state && stateResult.state.startsWith('error')) {
        throw new Error(`Translation error: ${stateResult.state}`)
      }
      
      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
    
    throw new Error('Translation timeout')
  } catch (err) {
    console.error('Translation error:', err)
    return { success: false, error: err.message }
  }
})

// 检测图片中的文字语言（OCR 检测）
ipcMain.handle('detect-image-language', async (event, { imagePath }) => {
  const translationConfig = setting.translation || {}
  const port = translationConfig.mangaTranslatorPort || 5000
  
  try {
    const FormData = require('form-data')
    const formData = new FormData()
    
    // 读取图片文件
    const imageBuffer = await fs.promises.readFile(imagePath)
    formData.append('file', imageBuffer, { filename: 'image.png', contentType: 'image/png' })
    formData.append('tgt_lang', 'CHS')
    formData.append('translator', 'none')  // 不翻译，只做 OCR
    formData.append('detector', 'default')
    
    // 提交任务
    const submitResponse = await fetch(`http://127.0.0.1:${port}/run`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    })
    
    if (!submitResponse.ok) {
      throw new Error(`Submit failed: ${submitResponse.statusText}`)
    }
    
    const submitResult = await submitResponse.json()
    const taskId = submitResult.task_id
    
    if (!taskId) {
      throw new Error('No task_id returned')
    }
    
    // 如果已经有缓存结果，直接获取
    if (submitResult.status === 'successful') {
      return await getOCRResult(port, taskId)
    }
    
    // 轮询等待完成
    let attempts = 0
    const maxAttempts = 60  // 最多等待 60 秒
    while (attempts < maxAttempts) {
      const stateResponse = await fetch(`http://127.0.0.1:${port}/task-state?taskid=${taskId}`)
      const stateResult = await stateResponse.json()
      
      if (stateResult.finished) {
        return await getOCRResult(port, taskId)
      }
      
      if (stateResult.state && stateResult.state.startsWith('error')) {
        throw new Error(`OCR error: ${stateResult.state}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
    
    throw new Error('OCR timeout')
  } catch (err) {
    console.error('OCR detection error:', err)
    return { success: false, error: err.message, hasJapanese: false }
  }
})

// 获取 OCR 结果并检测是否包含日文
async function getOCRResult(port, taskId) {
  try {
    // 获取翻译后的图片（包含文字）
    const resultResponse = await fetch(`http://127.0.0.1:${port}/result/${taskId}`)
    if (!resultResponse.ok) {
      throw new Error('Failed to fetch result')
    }
    
    // 获取 OCR 识别的文本（通过 detection 结果）
    const detectResponse = await fetch(`http://127.0.0.1:${port}/detect/${taskId}`)
    let detectedText = ''
    if (detectResponse.ok) {
      const detectResult = await detectResponse.json()
      // 提取所有识别的文本
      if (detectResult && detectResult.result) {
        detectedText = JSON.stringify(detectResult.result)
      }
    }
    
    // 检测是否包含日文字符
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF]/
    const hasJapanese = japaneseRegex.test(detectedText)
    
    return { success: true, hasJapanese, detectedText }
  } catch (err) {
    return { success: false, error: err.message, hasJapanese: false }
  }
}

// 使用 LLM 翻译文本
ipcMain.handle('translate-text', async (event, { text, context }) => {
  const translationConfig = setting.translation || {}
  const port = translationConfig.llamaPort || 8080
  
  const systemPrompt = `你是一个专业的日文到简体中文的翻译助手。你正在翻译日本漫画中的对话和文字。
请保持翻译的准确性和流畅性，注意：
1. 保持原文的语气和情感
2. 对于漫画特有的表达方式，如拟声词、感叹词等，使用中文对应的表达
3. 如果有上下文，请结合上下文进行翻译
4. 只输出翻译结果，不要输出任何解释或说明`

  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-model',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请将以下日文翻译成简体中文：\n\n${text}` }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })
    
    if (!response.ok) {
      throw new Error(`LLM translation failed: ${response.statusText}`)
    }
    
    const result = await response.json()
    const translatedText = result.choices?.[0]?.message?.content || text
    return { success: true, text: translatedText }
  } catch (err) {
    console.error('LLM translation error:', err)
    return { success: false, error: err.message, text: text }
  }
})

// 前端调试日志
ipcMain.handle('debug-log', (event, { message, data }) => {
  console.log(`[前端] ${message}`, data || '')
  return true
})