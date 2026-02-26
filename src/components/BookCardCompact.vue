<template>
  <div 
    class="book-card-compact"
    @click="$emit('openBookDetail')"
    @contextmenu="$emit('onBookContextMenu', $event, book)"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <div class="compact-main">
      <img class="compact-cover" :src="getCoverUrl(book.coverPath)" @error="generateCoverOnDemand(book)" />
      <div class="compact-info">
        <p class="compact-title" :title="getDisplayTitle(book)">{{getDisplayTitle(book)}}</p>
        <div class="compact-meta">
          <el-tag size="small" :type="isChineseTranslatedManga(book) ? 'danger' : 'info'">{{ book.pageCount }}P</el-tag>
          <el-tag size="small" :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'">{{book.status}}</el-tag>
          <el-rate v-model="bookRating" size="small" allow-half @change="saveBook(Object.assign({}, book, {rating: bookRating}))" @click.stop />
          <span class="compact-artist" v-if="artistList">{{ artistList }}</span>
        </div>
      </div>
      <div class="compact-actions">
        <el-button type="success" size="small" plain @click.stop="$emit('openLocalBook')">{{$t('m.re')}}</el-button>
        <el-button type="primary" size="small" plain @click.stop="$emit('viewManga')">{{$t('m.ad')}}</el-button>
        <el-icon
          :size="20"
          :color="book.mark ? '#E6A23C' : '#666666'"
          class="compact-mark" @click.stop="switchMark(book)"
        ><BookmarkTwotone /></el-icon>
      </div>
    </div>
    
    <Teleport to="body">
      <div 
        v-if="showPreview && previewImages.length > 0"
        class="compact-preview"
        :style="previewStyle"
      >
        <img 
          v-for="(img, index) in previewImages" 
          :key="index"
          :src="img"
          class="preview-image"
        />
        <div class="preview-loading" v-if="loadingPreview">
          <el-icon class="is-loading"><Loading /></el-icon>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watchEffect, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone, Loading } from '@vicons/material'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'

const appStore = useAppStore()
const { setting } = storeToRefs(appStore)
const { getDisplayTitle, isChineseTranslatedManga, saveBook, switchMark } = appStore

const { t } = useI18n()

const getCoverUrl = (coverPath) => {
  if (!coverPath) return ''
  if (coverPath.startsWith('file://')) return coverPath
  return 'file://' + coverPath.replace(/\\/g, '/')
}

const ipcRenderer = window.ipcRenderer

const generateCoverOnDemand = async (book) => {
  if (!book.coverPath || book.coverPath === '') {
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
        await ipcRenderer.invoke('save-book', bookData)
      }
    } catch (e) {
      console.log('Failed to generate cover:', e)
    }
  }
}

const emit = defineEmits([
  'openBookDetail',
  'handleClickCover',
  'onBookContextMenu',
  'openLocalBook',
  'viewManga',
])

const props = defineProps({
  book: Object
})

const bookRating = ref(props.book.rating)

watchEffect(() => {
  bookRating.value = props.book.rating
})

const artistList = computed(() => {
  const tags = props.book.tags || {}
  const artists = tags.artist || []
  const groups = tags.group || []
  const all = [...artists, ...groups]
  return all.slice(0, 2).join(', ') || null
})

const showPreview = ref(false)
const previewImages = ref([])
const loadingPreview = ref(false)
const previewStyle = ref({})
let previewTimeout = null
let loadedBooks = new Set()

const handleMouseEnter = (e) => {
  previewTimeout = setTimeout(() => {
    showPreview.value = true
    updatePreviewPosition(e)
    loadPreviewImages()
  }, 500)
}

const handleMouseLeave = () => {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
    previewTimeout = null
  }
  showPreview.value = false
}

const updatePreviewPosition = (e) => {
  const x = e.clientX + 20
  const y = e.clientY
  previewStyle.value = {
    left: `${Math.min(x, window.innerWidth - 350)}px`,
    top: `${Math.min(y, window.innerHeight - 450)}px`,
  }
}

const loadPreviewImages = async () => {
  if (loadedBooks.has(props.book.id)) {
    return
  }
  
  loadingPreview.value = true
  
  try {
    const { filepath, type } = props.book
    const result = await ipcRenderer.invoke('get-preview-images', { filepath, type, count: 3 })
    if (result && result.images) {
      previewImages.value = result.images.map(img => 
        img && !img.startsWith('file://') ? 'file://' + img.replace(/\\/g, '/') : img
      )
      loadedBooks.add(props.book.id)
    }
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
</script>

<style lang="stylus">
.book-card-compact
  display: block
  width: 100%
  padding: 8px 12px
  border-bottom: 1px solid var(--el-border-color-lighter)
  cursor: pointer
  transition: background-color 0.2s
  
  &:hover
    background-color: var(--el-fill-color-light)
  
  .compact-main
    display: flex
    align-items: center
    gap: 12px
  
  .compact-cover
    width: 45px
    height: 64px
    object-fit: cover
    border-radius: 3px
    flex-shrink: 0
  
  .compact-info
    flex: 1
    min-width: 0
    
    .compact-title
      font-size: 14px
      font-weight: 500
      margin: 0 0 6px 0
      white-space: nowrap
      overflow: hidden
      text-overflow: ellipsis
    
    .compact-meta
      display: flex
      align-items: center
      gap: 6px
      flex-wrap: wrap
      
      .el-tag
        padding: 0 4px
        height: 18px
        line-height: 16px
      
      .el-rate
        height: 16px
      
      .compact-artist
        font-size: 12px
        color: var(--el-text-color-secondary)
        margin-left: 4px
  
  .compact-actions
    display: flex
    align-items: center
    gap: 4px
    flex-shrink: 0
    
    .el-button
      padding: 4px 8px
    
    .compact-mark
      cursor: pointer
      margin-left: 4px

.compact-preview
  position: fixed
  z-index: 9999
  background: var(--el-bg-color)
  border: 1px solid var(--el-border-color)
  border-radius: 8px
  padding: 8px
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)
  display: flex
  gap: 4px
  
  .preview-image
    width: 120px
    height: 170px
    object-fit: cover
    border-radius: 4px
  
  .preview-loading
    display: flex
    align-items: center
    justify-content: center
    width: 120px
    height: 170px
    background: var(--el-fill-color-light)
    border-radius: 4px
</style>
