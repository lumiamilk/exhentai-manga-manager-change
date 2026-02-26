const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')
const { nanoid } = require('nanoid')
const { spawn } = require('child_process')
const _ = require('lodash')
const { getRootPath } = require('../modules/utils.js')

const _7z = path.join(getRootPath(), 'resources/extraResources/7z.exe')

const getArchivelist = async (libraryPath) => {
  const list = globSync('**/*.@(rar|7z|cb7|cbr)', {
    cwd: libraryPath,
    nocase: true,
    nodir: true,
    follow: true,
    absolute: true
  })
  return list
}

const solveBookTypeArchive = async (filepath, TEMP_PATH, COVER_PATH) => {
  // Use the provided TEMP_PATH as the base directory (it's already a unique taskTempDir from geneCover)
  // Create a unique subdirectory for extraction
  const tempFolder = path.join(TEMP_PATH, 'extract_' + nanoid(8))
  await fs.promises.mkdir(tempFolder, { recursive: true })
  
  const output = await spawnPromise(_7z, ['l', filepath, '-slt', '-sccUTF-8', '-p123456'])
  let pathlist = _.filter(output.split(/\r\n/), s => _.startsWith(s, 'Path') && !_.includes(s, '__MACOSX'))
  pathlist = pathlist.map(p => {
    const match = /(?<== ).*$/.exec(p)
    return match ? match[0].trim() : ''
  })
  let imageList = _.filter(pathlist, p => ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(path.extname(p).toLowerCase()))
  imageList = imageList.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))

  let targetFile
  let targetFilePath
  let coverFile
  let tempCoverPath
  let coverPath
  
  if (imageList.length > 8) {
    targetFile = imageList[7].trim()
    coverFile = imageList[0].trim()
    // Use 'e' command: Extract ignoring paths - files go directly to tempFolder root
    await spawnPromise(_7z, ['e', '-o' + tempFolder, '-p123456', '-y', '--', filepath, targetFile])
    await spawnPromise(_7z, ['e', '-o' + tempFolder, '-p123456', '-y', '--', filepath, coverFile])
  } else if (imageList.length > 0) {
    targetFile = imageList[0].trim()
    coverFile = imageList[0].trim()
    // Use 'e' command: Extract ignoring paths
    await spawnPromise(_7z, ['e', '-o' + tempFolder, '-p123456', '-y', '--', filepath, targetFile])
  } else {
    throw new Error('compression package is not include image')
  }
  
  // With 'e' command, files are extracted directly to tempFolder root (no subdirectory)
  // The filename in tempFolder is just the basename of the extracted file
  const targetBasename = path.basename(targetFile)
  const coverBasename = path.basename(coverFile)
  
  // Verify files exist
  const extractedTargetPath = path.join(tempFolder, targetBasename)
  const extractedCoverPath = path.join(tempFolder, coverBasename)
  
  // Check if files exist, if not try to find them in tempFolder
  const filesInTemp = await fs.promises.readdir(tempFolder).catch(() => [])
  const actualTargetFile = filesInTemp.find(f => path.extname(f).toLowerCase() === path.extname(targetFile).toLowerCase()) || targetBasename
  const actualCoverFile = filesInTemp.find(f => path.extname(f).toLowerCase() === path.extname(coverFile).toLowerCase()) || coverBasename
  
  // IMPORTANT: Write all temp files to tempFolder, NOT to TEMP_PATH
  targetFilePath = path.join(tempFolder, 'target' + nanoid(8) + path.extname(actualTargetFile))
  await fs.promises.copyFile(path.join(tempFolder, actualTargetFile), targetFilePath)

  tempCoverPath = path.join(tempFolder, 'cover' + nanoid(8) + path.extname(actualCoverFile))
  await fs.promises.copyFile(path.join(tempFolder, actualCoverFile), tempCoverPath)

  coverPath = path.join(COVER_PATH, nanoid() + '.webp')

  const fileStat = await fs.promises.stat(filepath)
  return {targetFilePath, tempCoverPath, coverPath, pageCount: imageList.length, bundleSize: fileStat?.size, mtime: fileStat?.mtime}
}

const getImageListFromArchive = async (filepath, VIEWER_PATH) => {
  const tempFolder = path.join(VIEWER_PATH, nanoid(8))
  // Use 'e' command for extraction without directory structure
  await spawnPromise(_7z, ['e', filepath, '-o' + tempFolder, '-p123456', '-y'], 2 * 60 * 1000)
  let list = globSync('**/*.@(jpg|jpeg|png|webp|avif|gif)', {
    cwd: tempFolder,
    nocase: true
  })
  list = _.filter(list, s => !_.includes(s, '__MACOSX'))
  list = list.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))
  return list.map(f => ({
    relativePath: f,
    absolutePath: path.join(tempFolder, f)
  }))
}

const deleteImageFromArchive = async (filename, filepath) => {
  await spawnPromise(_7z, ['d', '-p123456', '--', filepath, filename])
  return true
}

const spawnPromise = (commmand, argument, timeoutMs = 30 * 1000) => {
  return new Promise((resolve, reject) => {
    const spawned = spawn(commmand, argument)
    const output = []
    const timeout = setTimeout(() => {
      spawned.kill()
      reject('7z return timeout')
    }, timeoutMs) // 默认30s超时

    spawned.on('error', data => {
      clearTimeout(timeout)
      reject(data)
    })
    spawned.on('exit', code => {
      clearTimeout(timeout)
      if (code === 0) {
        setTimeout(() => resolve(String(output)), 50)
      } else {
        reject('close code is ' + code)
      }
    })
    spawned.stdout.on('data', data => {
      output.push(data)
    })
  })
}

module.exports = {
  getArchivelist,
  solveBookTypeArchive,
  getImageListFromArchive,
  deleteImageFromArchive
}