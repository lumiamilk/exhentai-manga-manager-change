<template>
  <div class="book-card-wrapper">
    <el-popover
      :visible="showPreview"
      :width="520"
      placement="right"
      :show-arrow="false"
      :offset="8"
      popper-class="card-preview-popover"
    >
      <template #reference>
        <div class="book-card"
          @mouseenter="handleMouseEnter"
          @mouseleave="handleMouseLeave"
        >
          <p class="book-title"
            @click="$emit('openBookDetail')"
            @contextmenu="onMangaTitleContextMenu($event, book)"
            :title="getDisplayTitle(book)"
          >{{getDisplayTitle(book)}}</p>
          <img
            class="book-cover"
            :src="getCoverUrl(book.coverPath)"
            @error="generateCoverOnDemand(book)"
            @click="$emit('handleClickCover')"
            @contextmenu="$emit('onBookContextMenu', $event, book)"
          />
          <el-tag class="book-card-language" size="small"
            :type="isChineseTranslatedManga(book) ? 'danger' : 'info'"
            @click="$emit('handleSearchString', `:count=${book.readCount}`)"
          >{{book.readCount}}</el-tag>
          <el-tag class="book-card-pagecount" size="small" type="danger" v-if="book.pageDiff" @click="$emit('handleSearchString', 'pageDiff')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
          <el-tag class="book-card-pagecount" size="small" type="info" v-else>{{ book.pageCount }}P</el-tag>
          <el-icon
            :size="30"
            :color="book.mark ? '#E6A23C' : '#666666'"
            class="book-card-mark" @click="switchMark(book)"
          ><BookmarkTwotone /></el-icon>
          <div class="collect-tag">
            <el-tag
              v-for="tag in filterCollectTag(book.tags)" :key="tag.id"
              @click="$emit('searchFromTag', tag.tag, tag.cat)"
              class="book-collect-tag"
              :color="tag.color"
              size="small"
              effect="dark"
            >{{tag.letter}}:{{resolvedTranslation[tag.tag]?.name || tag.tag}}</el-tag>
          </div>
          <div>
            <el-button-group class="outer-read-button-group">
              <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('openLocalBook')">{{$t('m.re')}}</el-button>
              <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('viewManga')">{{$t('m.ad')}}</el-button>
            </el-button-group>
            <el-tag
              class="book-status-tag"
              effect="plain"
              :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'"
              @click="$emit('searchFromTag', book.status)"
            >{{book.status}}</el-tag>
            <el-rate v-model="bookRating" size="small" allow-half @change="saveBook(Object.assign({}, book, {rating: bookRating}))"/>
          </div>
        </div>
      </template>
      
      <!-- 悬浮预览内容 -->
      <div class="preview-content" v-if="showPreview">
        <div class="preview-loading" v-if="loadingPreview">
          <el-icon class="is-loading" :size="24"><SyncOutlined /></el-icon>
          <span>Loading preview...</span>
        </div>
        <div class="preview-images" v-else-if="previewImages.length > 0">
          <div 
            v-for="(img, index) in previewImages" 
            :key="index"
            class="preview-image"
            :style="{ backgroundImage: `url('${img}')` }"
          ></div>
        </div>
        <div class="preview-placeholder" v-else>
          <el-icon :size="32"><ImageOutlined /></el-icon>
          <span>No preview available</span>
        </div>
      </div>
    </el-popover>
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone, ImageOutlined, SyncOutlined } from '@vicons/material'
import ContextMenu from '@imengyu/vue3-context-menu'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const appStore = useAppStore()
const { setting, resolvedTranslation } = storeToRefs(appStore)
const { getDisplayTitle, isChineseTranslatedManga, saveBook, switchMark } = appStore
const ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve() }

const { t } = useI18n()

const emit = defineEmits([
  'openBookDetail',
  'handleClickCover',
  'onBookContextMenu',
  'handleSearchString',
  'searchFromTag',
  'openLocalBook',
  'viewManga',
])

const props = defineProps({
  book: Object
})

// 预览功能
const showPreview = ref(false)
const previewImages = ref([])
const loadingPreview = ref(false)
let previewTimeout = null
let loadedBooks = new Set()

const handleMouseEnter = () => {
  previewTimeout = setTimeout(() => {
    showPreview.value = true
    loadPreviewImages()
  }, 500) // 500ms 延迟
}

const handleMouseLeave = () => {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
    previewTimeout = null
  }
  showPreview.value = false
}

const loadPreviewImages = async () => {
  if (loadedBooks.has(props.book.id)) {
    return
  }
  
  loadingPreview.value = true
  
  try {
    const result = await ipcRenderer.invoke('get-preview-images', {
      filepath: props.book.filepath,
      type: props.book.type,
      count: 3
    })
    if (result && result.images && result.images.length > 0) {
      previewImages.value = result.images.map(p => 'file://' + p.replace(/\\/g, '/'))
    }
    loadedBooks.add(props.book.id)
  } catch (e) {
    console.log('Failed to load preview:', e)
  }
  
  loadingPreview.value = false
}

onUnmounted(() => {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
  }
})

// VIEWPORT-FIRST: Generate cover on mount if missing
onMounted(() => {
  if (!props.book.coverPath || props.book.coverPath === '') {
    generateCoverOnDemand(props.book)
  }
})

const getCoverUrl = (coverPath) => {
  if (!coverPath) return ''
  if (coverPath.startsWith('file://')) return coverPath
  return 'file://' + coverPath.replace(/\\/g, '/')
}

const generateCoverOnDemand = async (book) => {
  // Use priority cover generation for viewport-first experience
  if (!book.coverPath || book.coverPath === '') {
    try {
      // Create a snapshot to avoid reference issues
      const bookSnapshot = JSON.parse(JSON.stringify(book))
      
      // Try priority cover generation first (Komga-style)
      const coverInfo = await ipcRenderer.invoke('generate-cover-priority', bookSnapshot)
      
      if (coverInfo && coverInfo.coverPath) {
        book.coverPath = coverInfo.coverPath
        book.hash = coverInfo.hash
        book.pageCount = coverInfo.pageCount
        book.bundleSize = coverInfo.bundleSize
        book.mtime = coverInfo.mtime
        book.coverHash = coverInfo.coverHash
      }
    } catch (e) {
      // Fallback to regular patch if priority fails
      try {
        const bookData = JSON.parse(JSON.stringify(book))
        const coverInfo = await ipcRenderer.invoke('patch-local-metadata-by-book', bookData)
        if (coverInfo && coverInfo.coverPath) {
          book.coverPath = coverInfo.coverPath
          book.hash = coverInfo.hash
          book.pageCount = coverInfo.pageCount
          book.bundleSize = coverInfo.bundleSize
          book.mtime = coverInfo.mtime
          book.coverHash = coverInfo.coverHash
        }
      } catch (fallbackError) {
        // Silent fail - cover generation is not critical
      }
    }
  }
}

const bookRating = ref(props.book.rating)

watchEffect(() => {
  bookRating.value = props.book.rating
})

const filterCollectTag = (tagObject) => {
  if (setting.value.showCollectTag) {
    const collectTag = setting.value.collectTag || []
    return collectTag.filter(tag => tagObject[tag.cat] && tagObject[tag.cat].includes(tag.tag))
  } else {
    return []
  }
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

</script>

<style lang="stylus">
.book-card-wrapper
  display: inline-block
.book-card
  display: inline-block
  width: 220px
  min-height: 365px
  padding-bottom: 4px
  border: solid 1px var(--el-border-color)
  border-radius: 4px
  margin: 6px 6px
  position: relative
  .collect-tag
    overflow-x: hidden
    margin: 0 0 0 10px
    text-align: left
    .book-collect-tag
      cursor: pointer
      margin-right: 4px
      margin-bottom: 4px
      border-width: 0

// 预览样式
.preview-content
  display: flex
  flex-direction: column
  gap: 8px

.preview-loading, .preview-placeholder
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 8px
  padding: 20px
  color: var(--el-text-color-secondary)

.preview-images
  display: flex
  gap: 8px

.preview-image
  width: 160px
  height: 226px
  background-size: cover
  background-position: center
  background-repeat: no-repeat
  border-radius: 4px
  border: 1px solid var(--el-border-color-light)

.book-title
  height: 36px
  overflow-y: hidden
  margin: 8px 6px
  font-size: 14px
  cursor: pointer
  line-height: 18px
  padding: 0 4px
.book-card-mark, .book-card-language, .book-card-pagecount
  position: absolute
  cursor: pointer
.book-card-language
  left: 10px
  top: 52px
  border-radius: 3px 0 3px 0
.book-card-pagecount
  left: 10px
  top: 315px
  border-radius: 0 3px 0 3px
.book-card-mark
  right: 4px
  top: 40px
.book-cover
  border-radius: 4px
  width: 200px
  height: 283px
  object-fit: cover
.outer-read-button-group
  margin: 0 6px
.outer-read-button:first-child
  padding: 0 0 0 6px
.outer-read-button + .outer-read-button
  padding: 0 6px 0 0
.book-status-tag
  padding: 0 2px
  margin-right: 6px
  cursor: pointer
  width: 56px
.el-rate
  display: inline-block
  height: 18px
</style>