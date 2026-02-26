<template>
  <el-popover
    :visible="showPreview"
    :width="380"
    placement="right"
    :show-arrow="false"
    :offset="8"
    popper-class="compact-preview-popover"
  >
    <template #reference>
      <div 
        class="book-card-compact"
        @click="$emit('openBookDetail')"
        @contextmenu="$emit('onBookContextMenu', $event, book)"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
      >
        <div class="compact-main">
          <!-- 状态指示器替代缩略图 -->
          <div class="compact-status-indicator" :class="statusClass">
            <span class="status-icon">{{ book.pageCount || '?' }}P</span>
          </div>
          
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
      <div class="preview-cover" v-else-if="book.coverPath">
        <div class="cover-image" :style="{ backgroundImage: `url('${getCoverUrl(book.coverPath)}')` }"></div>
      </div>
      <div class="preview-placeholder" v-else>
        <el-icon :size="32"><ImageOutlined /></el-icon>
        <span>No preview available</span>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, watchEffect, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone, ImageOutlined, SyncOutlined } from '@vicons/material'
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

const statusClass = computed(() => {
  if (props.book.status === 'tagged') return 'status-tagged'
  if (props.book.status === 'non-tag') return 'status-non-tag'
  return 'status-failed'
})

// 预览功能 - 仅在悬浮 300ms 后加载
const showPreview = ref(false)
const previewImages = ref([])
const loadingPreview = ref(false)
let previewTimeout = null
let loadedBooks = new Set()

const handleMouseEnter = () => {
  previewTimeout = setTimeout(() => {
    showPreview.value = true
    loadPreviewImages()
  }, 300) // 300ms 延迟
}

const handleMouseLeave = () => {
  if (previewTimeout) {
    clearTimeout(previewTimeout)
    previewTimeout = null
  }
  showPreview.value = false
}

const loadPreviewImages = async () => {
  // 优先使用封面
  if (props.book.coverPath) {
    previewImages.value = []
    return
  }
  
  if (loadedBooks.has(props.book.id)) {
    return
  }
  
  loadingPreview.value = true
  
  try {
    // 先生成封面
    const bookData = JSON.parse(JSON.stringify(props.book))
    const coverInfo = await ipcRenderer.invoke('generate-cover-priority', bookData)
    if (coverInfo && coverInfo.coverPath) {
      props.book.coverPath = coverInfo.coverPath
      props.book.hash = coverInfo.hash
      props.book.pageCount = coverInfo.pageCount
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
  
  // 状态指示器替代缩略图
  .compact-status-indicator
    width: 45px
    height: 64px
    border-radius: 3px
    flex-shrink: 0
    display: flex
    align-items: center
    justify-content: center
    font-size: 11px
    font-weight: 600
    
    &.status-tagged
      background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%)
      color: white
    
    &.status-non-tag
      background: linear-gradient(135deg, #909399 0%, #b4b4b4 100%)
      color: white
    
    &.status-failed
      background: linear-gradient(135deg, #e6a23c 0%, #f0c78a 100%)
      color: white
    
    .status-icon
      text-align: center
      line-height: 1.2
  
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

// 预览 Popover 样式
.compact-preview-popover
  padding: 8px !important
  
  .preview-content
    display: flex
    flex-direction: column
    align-items: center
    
    .preview-loading
      display: flex
      flex-direction: column
      align-items: center
      gap: 8px
      padding: 20px
      color: var(--el-text-color-secondary)
    
    .preview-images
      display: flex
      gap: 4px
      
      .preview-image
        width: 120px
        height: 170px
        background-size: cover
        background-position: center
        background-repeat: no-repeat
        border-radius: 4px
    
    .preview-cover
      .cover-image
        width: 200px
        height: 283px
        background-size: cover
        background-position: center
        background-repeat: no-repeat
        border-radius: 4px
    
    .preview-placeholder
      display: flex
      flex-direction: column
      align-items: center
      gap: 8px
      padding: 20px
      color: var(--el-text-color-secondary)
</style>