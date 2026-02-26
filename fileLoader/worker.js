/**
 * Metadata Worker Thread
 * Handles cover generation and metadata resolution in a separate thread
 * to prevent blocking the main process during background scanning.
 * 
 * This worker runs independently and communicates via message passing.
 */

const { parentPort } = require('worker_threads')
const path = require('path')
const fs = require('fs')
const { createHash } = require('crypto')
const sharp = require('sharp')
const { nanoid } = require('nanoid')
const { decode } = require('@msgpack/msgpack')
const { spawn } = require('child_process')

// Temp paths passed from main thread
let TEMP_PATH = ''
let COVER_PATH = ''
let hitomiDataPath = ''
let _7zPath = ''

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Extract Hitomi ID from filename
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

// Parse Hitomi metadata from msgpack files
const getHitomiMetadata = async (comicId) => {
  if (!hitomiDataPath || !fs.existsSync(hitomiDataPath)) {
    return null
  }

  try {
    const files = await fs.promises.readdir(hitomiDataPath)
    const packFiles = files.filter(f => f.endsWith('_pack.json'))

    for (const filename of packFiles) {
      const packPath = path.join(hitomiDataPath, filename)
      try {
        const buffer = await fs.promises.readFile(packPath)
        const data = decode(buffer)

        for (const item of data) {
          if (String(item.id) === comicId) {
            const tags = {}
            if (item.l) {
              const langMap = { 'japanese': 'japanese', 'chinese': 'chinese', 'korean': 'korean', 'english': 'english' }
              const lang = langMap[item.l.toLowerCase()] || item.l.toLowerCase()
              tags.language = [lang, 'translated']
            }

            if (item.a && Array.isArray(item.a)) tags.artist = item.a.filter(a => a)
            if (item.g && Array.isArray(item.g)) tags.group = item.g.filter(g => g)
            if (item.p && Array.isArray(item.p)) tags.parody = item.p.filter(s => s)
            if (item.c && Array.isArray(item.c)) tags.character = item.c.filter(c => c)

            const femaleTags = []
            const maleTags = []
            const otherTags = []

            for (const tag of (item.t || [])) {
              if (!tag) continue
              if (tag.startsWith('female:')) femaleTags.push(tag.substring(7))
              else if (tag.startsWith('male:')) maleTags.push(tag.substring(6))
              else if (tag.startsWith('tag:')) otherTags.push(tag.substring(4))
              else otherTags.push(tag)
            }

            if (femaleTags.length) tags.female = femaleTags
            if (maleTags.length) tags.male = maleTags
            if (otherTags.length) tags.other = otherTags

            // Hitomi data: item.n is the main title (could be Japanese or English)
            // item.n_jp field does not exist in actual Hitomi msgpack data
            // We determine title type by checking if it contains Japanese characters
            const mainTitle = item.n || ''
            const isJapaneseTitle = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(mainTitle)
            
            return {
              title: isJapaneseTitle ? '' : mainTitle,
              title_jpn: isJapaneseTitle ? mainTitle : '',
              tags,
              category: item.type || 'Doujinshi',
              posted: item.d ? Math.floor(new Date(item.d * 1000).getTime() / 1000) : null,
              url: `https://hitomi.la/galleries/${comicId}.html`
            }
          }
        }
      } catch (e) {
        // Continue to next file
      }
    }
  } catch (e) {
    // Directory read error
  }

  return null
}

// ============================================================================
// COVER GENERATION (simplified - uses archive/zip handlers from main thread)
// ============================================================================

const generateCoverInWorker = async (filepath, type) => {
  // Create unique temp directory
  const taskTempDir = path.join(TEMP_PATH, nanoid())
  await fs.promises.mkdir(taskTempDir, { recursive: true })

  try {
    // We need to call back to main thread for archive extraction
    // For now, signal that we need main thread help
    return { needMainThread: true, taskTempDir }
  } catch (e) {
    await fs.promises.rm(taskTempDir, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

// Process cover with sharp
const processCoverWithSharp = async (tempCoverPath, coverPath, taskTempDir) => {
  // Check file exists
  if (!fs.existsSync(tempCoverPath)) {
    throw new Error(`Temp cover file not found: ${tempCoverPath}`)
  }

  const coverHash = createHash('sha1').update(fs.readFileSync(tempCoverPath)).digest('hex')
  const copyTempCoverPath = path.join(taskTempDir, nanoid(8) + path.extname(tempCoverPath))
  await fs.promises.copyFile(tempCoverPath, copyTempCoverPath)

  // Sharp processing with retry
  const maxRetries = 3
  let retryCount = 0
  while (retryCount < maxRetries) {
    try {
      await sharp(copyTempCoverPath, { failOnError: false })
        .resize(500, 707, { fit: 'contain', background: '#303133' })
        .toFile(coverPath)
      break
    } catch (e) {
      retryCount++
      if (e.code === 'EBUSY' && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount))
      } else {
        throw e
      }
    }
  }

  return { coverHash, coverPath }
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

parentPort.on('message', async (message) => {
  const { type, data, taskId } = message

  try {
    let result = null

    switch (type) {
      case 'init':
        // Initialize paths from main thread
        TEMP_PATH = data.TEMP_PATH
        COVER_PATH = data.COVER_PATH
        hitomiDataPath = data.hitomiDataPath
        _7zPath = data._7zPath
        result = { initialized: true }
        break

      case 'get-metadata':
        // Get Hitomi metadata (lightweight operation)
        const comicId = extractIdFromName(path.basename(data.filepath))
        if (comicId) {
          const metadata = await getHitomiMetadata(comicId)
          if (metadata) {
            result = {
              metadataFound: true,
              metadata
            }
          } else {
            result = { metadataFound: false }
          }
        } else {
          result = { metadataFound: false }
        }
        break

      case 'process-cover':
        // Process cover with sharp after extraction done in main thread
        const { tempCoverPath, coverPath, taskTempDir } = data
        const sharpResult = await processCoverWithSharp(tempCoverPath, coverPath, taskTempDir)
        result = {
          coverGenerated: true,
          coverHash: sharpResult.coverHash,
          coverPath: sharpResult.coverPath
        }
        break

      default:
        result = null
    }

    parentPort.postMessage({ taskId, result, error: null })
  } catch (e) {
    parentPort.postMessage({ taskId, result: null, error: e.message })
  }
})

// Signal ready
parentPort.postMessage({ ready: true })
