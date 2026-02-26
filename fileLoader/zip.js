const fs = require('fs')
const path = require('path')
const { globSync } = require('glob')
const AdmZip = require('adm-zip')
const { nanoid } = require('nanoid')
const _ = require('lodash')

const getZipFilelist = async (libraryPath) => {
  const list = globSync('**/*.@(zip|cbz)', {
    cwd: libraryPath,
    nocase: true,
    nodir: true,
    follow: true,
    absolute: true
  })
  return list
}

const solveBookTypeZip = async (filepath, TEMP_PATH, COVER_PATH) => {
  // Use the provided TEMP_PATH as the base directory (it's already a unique taskTempDir from geneCover)
  // Create a unique subdirectory for extraction
  const tempFolder = path.join(TEMP_PATH, 'extract_' + nanoid(8))
  await fs.promises.mkdir(tempFolder, { recursive: true })
  
  const zip = new AdmZip(filepath)
  const zipFileList = zip.getEntries()
  const findZFile = (entryName) => {
    return _.find(zipFileList, zFile => zFile.entryName == entryName)
  }
  const fileList = zipFileList.map(zFile => zFile.entryName)
  let imageList = _.filter(fileList, filepath => _.includes(['.jpg', ',jpeg', '.png', '.webp', '.avif', '.gif'], path.extname(filepath).toLowerCase()))
  imageList = imageList.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))

  let targetFile
  let targetFilePath
  let coverFile
  let tempCoverPath
  let coverPath
  
  if (imageList.length > 8) {
    targetFile = imageList[7].trim()
    coverFile = imageList[0].trim()
    // extractEntryTo(zipEntry, targetPath, maintainEntryPath = false, overwrite = true)
    // maintainEntryPath = false flattens the directory structure
    zip.extractEntryTo(findZFile(targetFile), tempFolder, false, true)
    zip.extractEntryTo(findZFile(coverFile), tempFolder, false, true)
  } else if (imageList.length > 0) {
    targetFile = imageList[0].trim()
    coverFile = imageList[0].trim()
    // Flatten directory structure
    zip.extractEntryTo(findZFile(targetFile), tempFolder, false, true)
  } else {
    throw new Error('compression package is not include image')
  }

  // With maintainEntryPath = false, files go directly to tempFolder root
  // The filename is just the basename
  const targetBasename = path.basename(targetFile)
  const coverBasename = path.basename(coverFile)
  
  // Verify files exist
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

const getImageListFromZip = async (filepath, VIEWER_PATH) => {
  const zip = new AdmZip(filepath)
  const tempFolder = path.join(VIEWER_PATH, nanoid(8))
  zip.extractAllTo(tempFolder, true)
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

module.exports = {
  getZipFilelist,
  solveBookTypeZip,
  getImageListFromZip
}