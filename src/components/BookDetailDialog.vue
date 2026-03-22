<template>
  <el-dialog v-model="dialogVisibleBookDetail"
    fullscreen
    class="dialog-detail"
  >
    <template #header>
      <p class="detail-book-title">
        <span class="url-link" @click="openUrl(bookDetail.url)" @contextmenu="onMangaTitleContextMenu($event, bookDetail)">{{getDisplayTitle(bookDetail)}}</span>
      </p>
    </template>
    <el-row :gutter="20" class="book-detail-card">
      <el-col :span="6">
        <el-row class="book-detail-function book-detail-cover-frame">
          <img
            class="book-detail-cover"
            :src="bookDetail.coverPath"
            @click="$emit('openContentView', bookDetail)"
            @contextmenu="$emit('openThumbnailView', bookDetail)"
          />
          <el-icon
            :size="30"
            :color="bookDetail.mark ? '#E6A23C' : '#666666'"
            class="book-detail-star" @click="switchMark(bookDetail)"
          ><BookmarkTwotone /></el-icon>
          <div class="next-manga-pane" @click="$emit('jumpMangeDetail', 1)"><el-icon text><CaretRight20Regular /></el-icon></div>
          <div class="prev-manga-pane" @click="$emit('jumpMangeDetail', -1)"><el-icon text><CaretLeft20Regular /></el-icon></div>
        </el-row>
        <el-row :gutter="20" class="book-detail-rate">
          <el-rate v-model="bookDetail.rating" size="large" allow-half @change="saveBook(bookDetail)"/>
        </el-row>
        <el-row class="book-detail-function">
          <el-descriptions :column="1">
            <el-descriptions-item :label="$t('m.pageCount')+':'" :class-name="bookDetail.pageDiff ? 'text-red' : ''">
              {{bookDetail.pageCount}} | {{bookDetail.filecount}}
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.fileSize')+':'">
              {{Math.floor(bookDetail.bundleSize / 1048576)}} | {{Math.floor(bookDetail.filesize / 1048576)}} MB
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.readCount')+':'">{{bookDetail.readCount}}</el-descriptions-item>
            <el-descriptions-item :label="$t('m.mtime')+':'">{{new Date(bookDetail.mtime).toLocaleString("zh-CN")}}</el-descriptions-item>
            <el-descriptions-item :label="$t('m.postTime')+':'">{{new Date(bookDetail.posted * 1000).toLocaleString("zh-CN")}}</el-descriptions-item>
          </el-descriptions>
        </el-row>
        <el-row class="book-detail-function">
          <el-button-group style="margin-right: 12px;">
            <el-button type="success" style="padding-right: 0;" plain @click="openLocalBook(bookDetail)">{{$t('m.re')}}</el-button>
            <el-button type="success" style="padding-left: 0;" plain @click="$emit('openContentView', bookDetail)">{{$t('m.ad')}}</el-button>
          </el-button-group>
          <el-button plain @click="triggerShowComment">{{setting.showComment ? $t('m.hideComment') : $t('m.showComment')}}</el-button>
          <el-button type="primary" plain @click="editTags">{{editingTag ? $t('m.showTag') : $t('m.editTag')}}</el-button>
        </el-row>
        <el-row class="book-detail-function">
          <el-button type="primary" plain
            @click="$emit('openSearchDialog')"
          >{{$t('m.getMetadata')}}</el-button>
          <el-button type="primary" plain @click="triggerHiddenBook(bookDetail)">{{bookDetail.hiddenBook ? $t('m.showManga') : $t('m.hideManga')}}</el-button>
        </el-row>
        <el-row class="book-detail-function">
          <el-button type="danger" plain @click="deleteLocalBook(bookDetail)">{{$t('m.deleteFile')}}</el-button>
          <el-button plain @click="rescanBook(bookDetail)">{{$t('m.rescan')}}</el-button>
          <el-button type="primary" plain @click="showFile(bookDetail.filepath)">{{$t('m.openMangaFileLocation')}}</el-button>
        </el-row>
      </el-col>
      <el-col :span="setting.showComment ? 10 : 18">
        <el-scrollbar class="book-tag-frame">
          <div v-if="editingTag">
            <div class="edit-line">
              <el-input v-model="bookDetail.title_jpn" :placeholder="$t('m.title')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-input v-model="bookDetail.title" :placeholder="$t('m.englishTitle')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-select v-model="bookDetail.status" :placeholder="$t('m.metadataStatus')" @change="saveBook(bookDetail)">
                <el-option v-for="status in statusOption" :value="status" :key="status" :label="status" />
              </el-select>
            </div>
            <div class="edit-line">
              <el-input v-model="bookDetail.url" :placeholder="$t('m.ehexAddress')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-select v-model="bookDetail.category" :placeholder="$t('m.category')" @change="saveBook(bookDetail)" clearable>
                <el-option v-for="cat in categoryOption" :value="cat" :key="cat" :label="cat" />
              </el-select>
            </div>
            <div class="edit-line" v-for="(arr, key) in tagGroup" :key="key">
              <el-select-v2
                v-model="bookDetail.tags[key]" :placeholder="key" @change="saveBookTags(bookDetail)"
                filterable clearable allow-create multiple :reserve-keyword="false" :height="340"
                :options="arr"
              >
              </el-select-v2>
            </div>
            <el-space wrap class="tag-edit-buttons">
              <el-button @click="addTagCat">{{$t('m.addCategory')}}</el-button>
              <el-button @click="$emit('getBookInfo')">{{$t('m.getTagbyUrl')}}</el-button>
              <el-button @click="resetMetadata(bookDetail)">{{$t('m.resetMetadata')}}</el-button>
              <el-button @click="copyTagClipboard(bookDetail)">{{$t('m.copyTagClipboard')}}</el-button>
              <el-button @click="pasteTagClipboard(bookDetail)">{{$t('m.pasteTagClipboard')}}</el-button>
            </el-space>
          </div>
          <div v-else>
            <el-descriptions :column="1">
              <el-descriptions-item :label="$t('m.title')+':'">{{bookDetail.title_jpn}}</el-descriptions-item>
              <el-descriptions-item :label="$t('m.englishTitle')+':'">{{bookDetail.title}}</el-descriptions-item>
              <el-descriptions-item :label="$t('m.filename')+':'">{{returnFileNameWithExt(bookDetail.filepath)}}</el-descriptions-item>
              <el-descriptions-item :label="$t('m.fileLocation')+':'">{{returnDirname(bookDetail.filepath)}}</el-descriptions-item>
              <el-descriptions-item :label="$t('m.category')+':'">
                <el-tag type="info" class="book-tag" @click="$emit('searchFromTag', `cat:${bookDetail.category}`)">{{bookDetail.category}}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item v-for="(tagArr, key) in bookDetail.tags" :label="key + ':'" :key="key">
                <el-popover
                  effect="dark"
                  trigger="hover"
                  :content="resolvedTranslation[tag] ? resolvedTranslation[tag].intro : tag"
                  :disabled="!resolvedTranslation[tag]?.intro"
                  placement="top-start"
                  :show-after="500"
                  width="300px"
                  v-for="tag in tagArr" :key="tag"
                >
                  <template #reference>
                    <el-tag
                      type="info"
                      class="book-tag"
                      :class="{'blocked-tag': key === 'artist' && setting.blockedArtists?.includes(tag)}"
                      @click="$emit('searchFromTag', tag, key)"
                      @contextmenu.prevent="onTagContextMenu($event, tag, key)"
                    >{{resolvedTranslation[tag] ? resolvedTranslation[tag].name : tag }}</el-tag>
                  </template>
                </el-popover>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-scrollbar>
      </el-col>
      <el-col :span="8" v-if="setting.showComment">
        <el-scrollbar class="book-comment-frame">
          <div v-if="commentLoading" class="comment-loading">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>搜索多版本评论中...</span>
          </div>
          <div class="book-comment" v-for="comment in comments" :key="comment.id">
            <div class="book-comment-postby">
              {{comment.author}}
              <span class="book-comment-score">{{comment.score}}</span>
              <span v-if="comment.sourceLanguage" class="comment-source" :class="'lang-' + comment.sourceLanguage">
                {{ comment.sourceLanguage === 'chinese' ? '汉化' : comment.sourceLanguage === 'english' ? '英文' : '' }}
              </span>
            </div>
            <p class="book-comment-content" @contextmenu="onMangaCommentContextMenu($event, comment)">{{comment.content}}</p>
          </div>
          <div v-if="!commentLoading && comments.length === 0" class="no-comments">
            暂无评论
          </div>
        </el-scrollbar>
      </el-col>
    </el-row>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { CaretRight20Regular, CaretLeft20Regular } from '@vicons/fluent'
import { BookmarkTwotone } from '@vicons/material'
import { Loading } from '@element-plus/icons-vue'
import { nanoid } from 'nanoid'
import he from 'he'
import * as linkify from 'linkifyjs'
import ContextMenu from '@imengyu/vue3-context-menu'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import  { insertLocalReadRecord } from '../utils.js'

const appStore = useAppStore()
const {
  setting, bookDetail, resolvedTranslation,
  bookList, displayBookList, collectionList, openCollectionBookList,
  statusOption, categoryOption,
  pathSep,
} = storeToRefs(appStore)
const {
  printMessage,
  saveBook,
  returnFileNameWithExt,
  getDisplayTitle,
  resetMetadata,
  switchMark,
  copyTagClipboard,
  pasteTagClipboard,
} = appStore

const { t } = useI18n()

const emit = defineEmits([
  'openContentView',
  'openThumbnailView',
  'saveCollection',
  'handleRemoveBookDisplay',
  'openSearchDialog',
  'getBookInfo',
  'searchFromTag',
  'jumpMangeDetail',
  'addToHistory',
])

const dialogVisibleBookDetail = ref(false)

const openBookDetail = async (book, addToHistory = true) => {
  bookDetail.value = book
  dialogVisibleBookDetail.value = true
  comments.value = []
  
  // PRIORITY PREEMPTION: Always call get-metadata-now on detail open
  // This bypasses background queues and ensures user sees latest data
  // The backend will check if cover/metadata actually needs updating
  try {
    const result = await ipcRenderer.invoke('get-metadata-now', JSON.parse(JSON.stringify(book)))
    
    if (result) {
      // Update cover if generated - update bookDetail.value directly for reactivity
      if (result.coverGenerated && result.coverPath) {
        bookDetail.value.coverPath = result.coverPath
        bookDetail.value.hash = result.hash
        bookDetail.value.pageCount = result.pageCount
      }
      
      // Update metadata if found - update bookDetail.value directly for reactivity
      if (result.metadataFound && result.metadata) {
        bookDetail.value.title = result.metadata.title
        bookDetail.value.title_jpn = result.metadata.title_jpn || bookDetail.value.title_jpn
        bookDetail.value.tags = result.metadata.tags
        bookDetail.value.status = result.metadata.status
        bookDetail.value.category = result.metadata.category
        bookDetail.value.posted = result.metadata.posted
        bookDetail.value.url = result.metadata.url
      }
    }
  } catch (e) {
    console.log('Failed to fetch metadata on demand:', e)
  }
  
  if (setting.value.showComment) {
    commentLoading.value = true
    getMultiVersionComments()
  }
  if (addToHistory) emit('addToHistory', bookDetail.value.id)
}
const openUrl = (url) => {
  ipcRenderer.invoke('open-url', url)
}
const triggerHiddenBook = async (book) => {
  book.hiddenBook = !book.hiddenBook
  await saveBook(book)
}


const returnDirname = (filepath) => {
  return filepath.split(/[/\\]/).slice(0, -1).join(pathSep.value)
}

const showFile = (filepath) => {
  ipcRenderer.invoke('show-file', filepath)
}
const openLocalBook = (book) => {
  bookDetail.value = book
  if (setting.value.imageExplorer) {
    bookDetail.value.readCount += 1
    saveBook(bookDetail.value)
    ipcRenderer.invoke('open-local-book', bookDetail.value.filepath)
  } else {
    emit('openContentView', book)
  }
  insertLocalReadRecord(book.id)
}
const rescanBook = async (book) => {
  const bookInfo = await ipcRenderer.invoke('patch-local-metadata-by-book', _.cloneDeep(book))
  _.assign(book, bookInfo)
  await saveBook(book)
  printMessage('success', t('c.rescanSuccess'))
}
const deleteBook = async (book) => {
  await ipcRenderer.invoke('delete-local-book', book.filepath)
  .finally(() => {
    dialogVisibleBookDetail.value = false
    if (book.collectionHide) {
      _.forEach(collectionList.value, (collection) => {
        collection.list = _.filter(collection.list, hash_id => hash_id !== book.id && hash_id !== book.hash)
      })
      openCollectionBookList.value = _.filter(openCollectionBookList.value, bookOfCollection => {
        return bookOfCollection.id !== book.id && bookOfCollection.id !== book.hash
      })
      emit('saveCollection')
    } else {
      const findBookInBookList = _.findIndex(bookList.value, b => b.filepath === book.filepath)
      bookList.value.splice(findBookInBookList, 1)
      displayBookList.value = _.filter(displayBookList.value, b => b.filepath !== book.filepath)
      emit('handleRemoveBookDisplay')
    }
  })
}
const deleteLocalBook = (book) => {
  if (setting.value.skipDeleteConfirm) {
    deleteBook(book)
  } else {
    ElMessageBox.confirm(
      t('c.confirmDelete'),
      '',
      {}
    )
    .then(() => deleteBook(book))
  }
}

const comments = ref([])
const commentLoading = ref(false)
const triggerShowComment = () => {
  if (setting.value.showComment) {
    setting.value.showComment = false
  } else {
    comments.value = []
    commentLoading.value = true
    // Use multi-version comment loading
    getMultiVersionComments()
    setting.value.showComment = true
  }
}

// Multi-version comment loading with language priority (Chinese > English)
const getMultiVersionComments = async () => {
  const title = bookDetail.value.title_jpn || bookDetail.value.title || ''
  const existingUrl = bookDetail.value.url
  const bookId = bookDetail.value.id
  
  console.log('getMultiVersionComments - title:', title, 'existingUrl:', existingUrl, 'bookId:', bookId)
  
  if (!title && !existingUrl) {
    comments.value = []
    commentLoading.value = false
    return
  }
  
  // Step 0: Check cache first
  try {
    console.log('Checking cache for bookId:', bookId)
    const cache = await ipcRenderer.invoke('get-comment-cache', bookId)
    console.log('Cache result:', cache)
    if (cache && cache.valid) {
      console.log('Using cached comments, fetchedAt:', new Date(cache.fetchedAt).toLocaleString())
      // Restore foundLink from foundLinkHrefs
      comments.value = (cache.comments || []).map(c => ({
        ...c,
        foundLink: (c.foundLinkHrefs || []).map(href => ({ href, value: href }))
      }))
      commentLoading.value = false
      return
    }
    if (cache && !cache.valid) {
      console.log('Cache expired (older than 1 week), fetching fresh comments')
    }
    if (!cache) {
      console.log('No cache found for bookId:', bookId)
    }
  } catch (e) {
    console.log('Cache check failed:', e)
  }
  
  try {
    // Step 1: Search for all versions of this manga on E-Hentai
    const searchUrl = `https://e-hentai.org/?f_search=${encodeURIComponent(title)}`
    console.log('Search URL:', searchUrl)
    
    const searchHtml = await ipcRenderer.invoke('get-ex-webpage', {
      url: searchUrl,
      cookie: appStore.cookie
    })
    
    console.log('Search HTML length:', searchHtml?.length)
    
    // Debug: log a sample of the HTML to see the structure
    console.log('Search HTML sample:', searchHtml.slice(0, 2000))
    
    // Step 2: Parse search results using browser's native DOMParser
    const searchDoc = new DOMParser().parseFromString(searchHtml, 'text/html')
    
    // Try multiple selectors for gallery rows (E-Hentai structure may vary)
    let galleryRows = searchDoc.querySelectorAll('.gtr0, .gtr1')
    if (galleryRows.length === 0) {
      // Try alternative selector: table rows with glname class
      galleryRows = searchDoc.querySelectorAll('tr[id^="tr_"]')
    }
    if (galleryRows.length === 0) {
      // Try another alternative: glname links directly
      const glnameLinks = searchDoc.querySelectorAll('.glname a')
      if (glnameLinks.length > 0) {
        // Create pseudo-rows from glname links
        galleryRows = glnameLinks
      }
    }
    if (galleryRows.length === 0) {
      // Try: itg table rows
      galleryRows = searchDoc.querySelectorAll('.itg tr')
    }
    
    console.log('Gallery rows found:', galleryRows.length)
    
    const galleries = []
    galleryRows.forEach(row => {
      try {
        const linkEl = row.querySelector('.glink')?.closest('a')
        if (!linkEl) return
        
        const url = linkEl.href
        const galleryTitle = row.querySelector('.glink')?.textContent || ''
        
        console.log('Found gallery:', galleryTitle, url)
        
        // Detect language from title
        let language = 'unknown'
        const lowerTitle = galleryTitle.toLowerCase()
        if (lowerTitle.includes('[chinese]') || lowerTitle.includes('中文') || lowerTitle.includes('漢化') || lowerTitle.includes('汉化')) {
          language = 'chinese'
        } else if (lowerTitle.includes('[english]') || lowerTitle.includes('英文')) {
          language = 'english'
        } else if (lowerTitle.includes('[japanese]')) {
          language = 'japanese'
        } else if (lowerTitle.includes('[korean]')) {
          language = 'korean'
        }
        
        galleries.push({ url, title: galleryTitle, language })
      } catch (e) {
        console.log('Error parsing row:', e)
      }
    })
    
    // Sort by language priority: chinese > english > others
    const languagePriority = { 'chinese': 1, 'english': 2, 'japanese': 3, 'korean': 4 }
    galleries.sort((a, b) => {
      const pa = languagePriority[a.language] || 99
      const pb = languagePriority[b.language] || 99
      return pa - pb
    })
    
    // Group galleries by language for priority-based loading
    const galleriesByLang = {}
    galleries.forEach(g => {
      const lang = g.language || 'unknown'
      if (!galleriesByLang[lang]) galleriesByLang[lang] = []
      galleriesByLang[lang].push(g)
    })
    
    // Define language priority order
    const langOrder = ['chinese', 'english', 'japanese', 'korean', 'unknown']
    
    console.log('Galleries by language:', galleriesByLang)
    
    // Step 3: Get comments with language priority
    // If a language has comments, stop and don't fetch lower priority languages
    comments.value = []
    const seenContent = new Set()
    
    for (const lang of langOrder) {
      const langGalleries = galleriesByLang[lang]
      if (!langGalleries || langGalleries.length === 0) continue
      
      // Limit to 2 galleries per language to reduce requests
      const galleriesToFetch = langGalleries.slice(0, 2)
      
      let commentsFound = 0
      
      for (const gallery of galleriesToFetch) {
        try {
          console.log(`Fetching comments from ${lang}:`, gallery.url)
          const galleryHtml = await ipcRenderer.invoke('get-ex-webpage', {
            url: gallery.url,
            cookie: appStore.cookie
          })
          
          console.log('Gallery HTML length:', galleryHtml?.length)
          
          // Parse comments using browser's native DOMParser
          const galleryDoc = new DOMParser().parseFromString(galleryHtml, 'text/html')
          const commentElements = galleryDoc.querySelectorAll('#cdiv > .c1')
          
          console.log('Comment elements found:', commentElements.length)
          
          commentElements.forEach(e => {
            try {
              const author = e.querySelector('.c2 .c3')?.textContent || 'Unknown'
              const scoreTail = e.querySelectorAll('.c2 .nosel')
              const score = scoreTail[scoreTail.length - 1]?.textContent || '0'
              let content = e.querySelector('.c6')?.innerHTML || ''
              
              console.log('Comment:', author, score, content.slice(0, 50))
              
              // Skip empty comments
              if (!content.trim()) return
              
              // Extract links before cleaning
              const foundLink = _.uniqBy(linkify.find(content.replace(/[<"]/gi, ' '), 'url'), 'href')
              
              // Clean content
              content = content.replace(/<br>/gi, '\n')
              content = content.replace(/<.+?>/gi, '')
              content = he.decode(content)
              
              // Deduplicate by content (first 100 chars)
              const contentKey = content.slice(0, 100).trim()
              if (seenContent.has(contentKey)) return
              seenContent.add(contentKey)
              
              comments.value.push({
                author,
                score,
                content,
                foundLink,
                id: nanoid(),
                sourceTitle: gallery.title,
                sourceLanguage: gallery.language
              })
              commentsFound++
            } catch (e) {
              console.log('Error parsing comment:', e)
            }
          })
        } catch (e) {
          console.log(`Failed to get comments from ${gallery.url}:`, e)
        }
      }
      
      // If we found comments in this language, stop fetching lower priority languages
      if (commentsFound > 0) {
        console.log(`Found ${commentsFound} comments in ${lang}, stopping further fetches`)
        break
      }
    }
    
    // If no comments found at all, try existing URL as fallback
    if (comments.value.length === 0 && existingUrl) {
      console.log('No comments found, trying existing URL:', existingUrl)
      try {
        const galleryHtml = await ipcRenderer.invoke('get-ex-webpage', {
          url: existingUrl,
          cookie: appStore.cookie
        })
        
        const galleryDoc = new DOMParser().parseFromString(galleryHtml, 'text/html')
        const commentElements = galleryDoc.querySelectorAll('#cdiv > .c1')
        
        commentElements.forEach(e => {
          try {
            const author = e.querySelector('.c2 .c3')?.textContent || 'Unknown'
            const scoreTail = e.querySelectorAll('.c2 .nosel')
            const score = scoreTail[scoreTail.length - 1]?.textContent || '0'
            let content = e.querySelector('.c6')?.innerHTML || ''
            
            if (!content.trim()) return
            
            const foundLink = _.uniqBy(linkify.find(content.replace(/[<"]/gi, ' '), 'url'), 'href')
            content = content.replace(/<br>/gi, '\n')
            content = content.replace(/<.+?>/gi, '')
            content = he.decode(content)
            
            comments.value.push({
              author,
              score,
              content,
              foundLink,
              id: nanoid(),
              sourceTitle: title,
              sourceLanguage: 'unknown'
            })
          } catch (e) {
            // Skip
          }
        })
      } catch (e) {
        console.log('Fallback fetch failed:', e)
      }
    }
    
    // Save to cache if we got comments
    if (comments.value.length > 0 && bookId) {
      try {
        // Determine primary source language
        const langCounts = {}
        comments.value.forEach(c => {
          const lang = c.sourceLanguage || 'unknown'
          langCounts[lang] = (langCounts[lang] || 0) + 1
        })
        const primaryLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
        
        // Serialize comments for IPC (remove non-serializable foundLink)
        const serializedComments = comments.value.map(c => ({
          author: c.author,
          score: c.score,
          content: c.content,
          id: c.id,
          sourceTitle: c.sourceTitle,
          sourceLanguage: c.sourceLanguage,
          // foundLink will be regenerated on load
          foundLinkHrefs: c.foundLink ? c.foundLink.map(l => l.href) : []
        }))
        
        await ipcRenderer.invoke('save-comment-cache', {
          bookId,
          comments: serializedComments,
          sourceLanguage: primaryLang
        })
        console.log('Saved comments to cache, count:', comments.value.length, 'language:', primaryLang)
      } catch (e) {
        console.log('Save comment cache failed:', e)
      }
    }
    
    commentLoading.value = false
  } catch (err) {
    console.log('Multi-version comment loading failed:', err)
    // Fallback to single URL loading
    if (existingUrl) {
      getComments(existingUrl)
    } else {
      comments.value = []
      commentLoading.value = false
    }
  }
}

const getComments = (url) => {
  if (url) {
    commentLoading.value = true
    ipcRenderer.invoke('get-ex-webpage', {
      url,
      cookie: appStore.cookie
    })
    .then(res => {
      comments.value = []
      const commentElements = new DOMParser().parseFromString(res, 'text/html').querySelectorAll('#cdiv>.c1')
      commentElements.forEach(e => {
        const author = e.querySelector('.c2 .c3').textContent
        const scoreTail = e.querySelectorAll('.c2 .nosel')
        const score = scoreTail[scoreTail.length - 1].textContent
        let content = e.querySelector('.c6').innerHTML
        const foundLink = _.uniqBy(linkify.find(content.replace(/[<"]/gi, ' '), 'url'), 'href')
        content = content.replace(/<br>/gi, '\n')
        content = content.replace(/<.+?>/gi, '')
        content = he.decode(content)
        comments.value.push({
          author, score, content, id: nanoid(), foundLink
        })
      })
      commentLoading.value = false
    })
    .catch(err => {
      comments.value = []
      commentLoading.value = false
      console.log(err)
    })
  } else {
    comments.value = []
    commentLoading.value = false
  }
}

const editingTag = ref(false)
const tagGroup = ref({})
const editTags = () => {
  editingTag.value = !editingTag.value
  if (editingTag.value) {
    if (!_.has(bookDetail.value, 'tags')) bookDetail.value.tags = {}
    const tempTagGroup = {}
    _.forEach(bookList.value.map(b => b.tags), (tagObject) => {
      _.forIn(tagObject, (tagArray, tagCat) => {
        if (_.isArray(tagArray)) {
          if (_.has(tempTagGroup, tagCat)) {
            tagArray.forEach(tag => tempTagGroup[tagCat].add(tag))
          } else {
            tempTagGroup[tagCat] = new Set(tagArray)
          }
        }
      })
    })
    const showTranslation = setting.value.showTranslation
    _.forIn(tempTagGroup, (tagSet, tagCat) => {
      tempTagGroup[tagCat] = [...tagSet].sort().map(tag => ({
        value: tag,
        label: `${showTranslation ? (resolvedTranslation.value[tag]?.name || tag ) + ' || ' : ''}${tag}`
      }))
    })
    tagGroup.value = tempTagGroup
  } else {
    saveBookTags(bookDetail.value)
  }
}
const saveBookTags = (book) => {
  const compactTags = {}
  _.forIn(book.tags, (tagarr, tagCat) => {
    if (!_.isEmpty(tagarr)) {
      compactTags[tagCat] = tagarr
    }
  })
  const tagSortKey = ['language', 'parody', 'character', 'group', 'artist', 'male', 'female', 'mixed', 'other', 'cosplayer']
  const sortedTags = {}
  tagSortKey.forEach(tagCat => {
    if (compactTags[tagCat]) {
      sortedTags[tagCat] = compactTags[tagCat]
    }
  })
  book.tags = Object.assign(sortedTags, compactTags)
  saveBook(book)
}
const addTagCat = () => {
  ElMessageBox.prompt(t('c.inputCategoryName'), t('m.addCategory'), {
    inputPattern: /^[\p{L}\d_]+$/u,
    inputErrorMessage: t('c.categoryNameError')
  })
  .then(({ value }) => {
    tagGroup.value[value] = []
  })
  .catch(() => {
    printMessage('info', t('c.canceled'))
  })
}


const onMangaTitleContextMenu = (e, book) => {
  e.preventDefault()
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: [
      {
        label: t('c.copyTitleToClipboard'),
        onClick: () => {
          ipcRenderer.invoke('copy-text-to-clipboard', book.title_jpn || book.title)
        }
      },
      {
        label: t('c.copyLinkToClipboard'),
        onClick: () => {
          ipcRenderer.invoke('copy-text-to-clipboard', book.url)
        }
      },
      {
        label: t('c.copyTitleAndLinkToClipboard'),
        onClick: () => {
          ipcRenderer.invoke('copy-text-to-clipboard', `${book.title_jpn || book.title}\n${book.url}\n`)
        }
      },
    ]
  })
}

const onTagContextMenu = (e, tag, key) => {
  e.preventDefault()
  const isBlocked = setting.value.blockedArtists?.includes(tag)
  
  if (key === 'artist') {
    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items: [
        {
          label: isBlocked ? t('c.unblockArtist') : t('c.blockArtist'),
          onClick: () => {
            if (isBlocked) {
              unblockArtist(tag)
            } else {
              blockArtist(tag)
            }
          }
        },
        {
          label: t('c.searchFromTag'),
          onClick: () => {
            $emit('searchFromTag', tag, key)
          }
        }
      ]
    })
  }
}

const blockArtist = (artist) => {
  if (!setting.value.blockedArtists) {
    setting.value.blockedArtists = []
  }
  if (!setting.value.blockedArtists.includes(artist)) {
    setting.value.blockedArtists.push(artist)
    ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
    printMessage('success', t('c.artistBlocked'))
  }
}

const unblockArtist = (artist) => {
  if (setting.value.blockedArtists) {
    const index = setting.value.blockedArtists.indexOf(artist)
    if (index > -1) {
      setting.value.blockedArtists.splice(index, 1)
      ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
      printMessage('success', t('c.artistUnblocked'))
    }
  }
}

const onMangaCommentContextMenu = (e, comment) => {
  e.preventDefault()
  const foundLink = comment.foundLink
  if (!_.isEmpty(foundLink)) {
    const items = foundLink.map(l => ({
      label: `${t('c.redirect')} ${l.href}`,
      onClick: () => {
        ipcRenderer.invoke('open-url', l.href)
      }
    }))
    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items
    })
  }
}

defineExpose({
  dialogVisibleBookDetail,
  editingTag,
  openBookDetail,
  openLocalBook,
  rescanBook,
  getComments,
  showFile,
  deleteLocalBook,
  triggerHiddenBook,
})

</script>

<style lang="stylus">
.el-dialog.is-fullscreen.dialog-detail
  .el-dialog__header
    .el-dialog__headerbtn
      margin: 8px 16px 0 0
      .el-icon
        width: 32px
        svg
          height: 32px
          width: 32px

.text-red
  color: red !important

.detail-book-title
  height: 44px
  overflow-y: hidden
  margin: 0 24px
.url-link
  cursor: pointer
.book-detail-card
  .book-detail-function, .book-detail-rate
    justify-content: center
    margin-bottom: 10px
  .book-detail-cover-frame
    position: relative
    width: 250px
    margin: 0 auto
    margin-bottom: 10px
    .book-detail-cover
      width: 250px
      height: 354px
      object-fit: cover
      border-radius: 4px
    .next-manga-pane, .prev-manga-pane
      position: absolute
      bottom: 80px
      cursor: pointer
      opacity: 0
      transition-delay: 0.5s
      background-color: rgba(0, 0, 0, 0.3)
      .el-icon
        font-size: 34px
        margin: 80px 0
        color: #FFFFFF
    .next-manga-pane
      right: 0
      border-radius: 4px 0 0 4px
    .prev-manga-pane
      left: 0
      border-radius: 0 4px 4px 0
    .next-manga-pane:hover, .prev-manga-pane:hover
      opacity: 1
      transition-delay: 0s
    .book-detail-star
      position: absolute
      cursor: pointer
      right: -6px
      top: -14px
  .edit-line
    margin: 4px 0
    .el-select, .el-select-v2
      width: 100%
  .el-descriptions__label
    display: inline-block
    text-align: right
    width: 80px
.book-tag-edit-popover
  .el-descriptions__cell
    padding-bottom: 0 !important
  .el-descriptions__label
    display: inline-block
    text-align: right
    width: 65px
.book-tag-frame
  height: calc(100vh - 100px)
  overflow-y: auto
  padding-right: 10px
  text-align: left
.book-tag
  margin: 4px 6px
  cursor: pointer
.blocked-tag
  background-color: #f56c6c !important
  border-color: #f56c6c !important
  color: #fff !important
.tag-edit-buttons
  margin-top: 4px
.book-comment-frame
  text-align: left
  height: calc(100vh - 100px)
  overflow-y: auto
  padding-right: 10px
  .comment-loading
    display: flex
    align-items: center
    justify-content: center
    gap: 8px
    padding: 20px
    color: var(--el-text-color-secondary)
    .el-icon
      font-size: 18px
  .no-comments
    text-align: center
    padding: 40px 20px
    color: var(--el-text-color-secondary)
  .book-comment
    .book-comment-postby
      font-size: 12px
      background-color: var(--el-fill-color-dark)
      padding-left: 4px
      color: var(--el-text-color-regular)
      display: flex
      align-items: center
      flex-wrap: wrap
      gap: 4px
    .book-comment-score
      margin-left: auto
      margin-right: 4px
    .comment-source
      font-size: 10px
      padding: 1px 4px
      border-radius: 3px
      margin-left: 4px
      &.lang-chinese
        background-color: #e74c3c
        color: #fff
      &.lang-english
        background-color: #3498db
        color: #fff
    .book-comment-content
      font-size: 14px
      white-space: pre-wrap
      padding-left: 4px
      color: var(--el-text-color-regular)
</style>