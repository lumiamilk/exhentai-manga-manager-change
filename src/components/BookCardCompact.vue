<template>
  <div class="book-card-compact-wrapper">
    <!-- 虚拟触发的 popover，跟随鼠标位置 -->
    <el-popover
      :visible="showPreview"
      :width="520"
      placement="right-start"
      :show-arrow="false"
      popper-class="card-preview-popover"
      :teleported="true"
      :virtual-ref="virtualRef"
      virtual-triggering
    >
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
    
    <!-- 主内容区域 -->
    <div 
      class="book-card-compact"
      ref="cardRef"
      @click="$emit('openBookDetail')"
      @contextmenu="$emit('onBookContextMenu', $event, book)"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @mousemove="handleMouseMove"
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
  </div>
</template>

<script setup>
import { ref, watchEffect, computed, onMounted, onUnmounted } from 'vue'
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

const ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve() }

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

// 预览功能 - 虚拟触发
const cardRef = ref(null)
const showPreview = ref(false)
const previewImages = ref([])
const loadingPreview = ref(false)
let previewTimeout = null
let loadedBooks = new Set()

// 虚拟触发元素 - 模拟一个跟随鼠标的虚拟元素
const virtualRef = ref({
  getBoundingClientRect: () => ({
    width: 0,
    height: 0,
    top: mouseY.value,
    right: mouseX.value,
    bottom: mouseY.value,
    left: mouseX.value,
    x: mouseX.value,
    y: mouseY.value
  })
})

const mouseX = ref(0)
const mouseY = ref(0)

const handleMouseMove = (e) => {
  mouseX.value = e.clientX
  mouseY.value = e.clientY
}

const handleMouseEnter = () => {
  previewTimeout = setTimeout(() => {
    showPreview.value = true
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
</script>

<style lang="stylus">
.book-card-compact-wrapper
  width: 100%
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
  width: 150px
  height: 212px
  background-size: cover
  background-position: center
  background-repeat: no-repeat
  border-radius: 4px
  border: 1px solid var(--el-border-color-light)

.preview-cover
  .cover-image
    width: 200px
    height: 283px
    background-size: cover
    background-position: center
    background-repeat: no-repeat
    border-radius: 4px
</style>
