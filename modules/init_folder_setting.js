const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { getRootPath } = require('./utils.js')


let STORE_PATH = app.getPath('userData')
if (!fs.existsSync(STORE_PATH)) {
  fs.mkdirSync(STORE_PATH)
}
const rootPath = getRootPath()
let isPortable = false
try {
  const dataPath = path.join(rootPath, 'data')
  fs.accessSync(dataPath)
  STORE_PATH = dataPath
  isPortable = true
} catch {
  try {
    fs.accessSync(path.join(rootPath, 'portable'))
    STORE_PATH = rootPath
    isPortable = true
  } catch {
    STORE_PATH = app.getPath('userData')
  }
}

const TEMP_PATH = path.join(STORE_PATH, 'tmp')
const COVER_PATH = path.join(STORE_PATH, 'cover')
const VIEWER_PATH = path.join(STORE_PATH, 'viewer')

const preparePath = () => {
  fs.mkdirSync(TEMP_PATH, { recursive: true })
  fs.mkdirSync(COVER_PATH, { recursive: true })
  fs.mkdirSync(VIEWER_PATH, { recursive: true })
}

const prepareSetting = () => {
  // 获取项目根目录
  const rootPath = getRootPath()
  
  // 默认翻译服务路径
  const defaultMangaTranslatorPath = path.join(rootPath, 'other_code', 'manga-image-translator')
  
  const defaultSetting = {
    proxy: undefined,
    library: app.getPath('downloads'),
    libraries: [],
    metadataPath: undefined,
    hitomiDataPath: 'D:\\soft\\to_run\\Technical Preview Hitomi-Downloader\\core\\hitomi_data',
    imageExplorer: '"C:\\Windows\\explorer.exe"',
    pageSize: 42,
    loadOnStart: true,
    igneous: '',
    ipb_pass_hash: '',
    ipb_member_id: '',
    star: '',
    showComment: true,
    requireGap: 3000,
    thumbnailColumn: 10,
    showTranslation: false,
    theme: 'light e-hentai',
    widthLimit: undefined,
    directEnter: 'detail',
    language: 'zh-CN',
    folderTreeWidth: '',
    advancedSearch: true,
    autoCheckUpdates: false,
    customOptions: '',
    defaultExpandTree: true,
    hidePageNumber: false,
    skipDeleteConfirm: false,
    displayTitle: 'japaneseTitle',
    keepReadingProgress: true,
    blockedArtists: [],
    // 翻译服务配置
    translation: {
      enabled: false,
      autoStart: false,  // 应用启动时自动启动翻译服务
      mangaTranslatorPath: defaultMangaTranslatorPath,  // manga-image-translator 目录路径
      mangaTranslatorPort: 5000,
      llamaServerPath: 'D:\\soft\\to_run\\ai\\chatai\\no_model\\llama-b8149-bin-win-cuda-12.4-x64\\llama-server.exe',
      llamaModelPath: 'D:\\soft\\to_run\\ai\\chatai\\model\\GalTransl-v4-4B-2512.gguf',
      llamaPort: 8080,
      targetLang: 'CHS',
      useCloudAPI: false,
      cloudAPIUrl: '',
      cloudAPIKey: '',
      gpuDevice: 0,  // 0 = RTX 2080 Ti, 1 = RTX 3060
    },
  }
  
  let setting
  try {
    setting = JSON.parse(fs.readFileSync(path.join(STORE_PATH, 'setting.json'), { encoding: 'utf-8' }))
    // Merge with defaults to ensure all fields exist (backward compatibility)
    setting = { ...defaultSetting, ...setting }
    // Deep merge translation object to ensure new fields get default values
    if (setting.translation) {
      setting.translation = { ...defaultSetting.translation, ...setting.translation }
    } else {
      setting.translation = { ...defaultSetting.translation }
    }
  } catch {
    setting = { ...defaultSetting }
    fs.writeFileSync(path.join(STORE_PATH, 'setting.json'), JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
  }
  
  // Backward compatibility: if libraries is empty but library exists,
  // the migration will be handled in index.js
  if (!setting.libraries) {
    setting.libraries = []
  }
  
  return setting
}

const prepareCollectionList = () => {
  let collectionList
  try {
    collectionList = JSON.parse(fs.readFileSync(path.join(STORE_PATH, 'collectionList.json'), { encoding: 'utf-8' }))
  } catch {
    collectionList = []
    fs.writeFileSync(path.join(STORE_PATH, 'collectionList.json'), JSON.stringify(collectionList, null, '  '), { encoding: 'utf-8' })
  }
  return collectionList
}

module.exports = {
  STORE_PATH,
  isPortable,
  TEMP_PATH,
  COVER_PATH,
  VIEWER_PATH,
  prepareSetting,
  prepareCollectionList,
  preparePath
}