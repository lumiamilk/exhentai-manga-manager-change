<template>
  <el-drawer v-model="drawerVisibleViewer"
    direction="ltr"
    :size="drawerHeight"
    :with-header="false"
    destroy-on-close
    @close="handleStopReadManga"
    class="viewer-drawer"
    modal-class="viewer-drawer-modal"
  >
    <div class="viewer-container">
      <div class="drawer-viewer-side"
        v-show="showViewerSide && !showThumbnail"
        @wheel.stop
        ref="sidebarRef"
      >
        <div class="sidebar-thumbnail-content">
          <div
            v-for="(image, index) in thumbnailList"
            :key="image.id"
            class="sidebar-thumbnail-item"
            :class="{'sidebar-thumbnail-active': isCurrentImage(image.id)}"
            :id="image.thumbId"
          >
            <img
              :src="`${image.thumbnailPath}?id=${image.id}`"
              class="sidebar-thumbnail"
              @click="handleClickThumbnail(image.id)"
              @contextmenu="onMangaImageContextMenu($event, image)"
            />
            <div class="sidebar-thumbnail-page">{{index + 1}} / {{thumbnailList.length}}</div>
          </div>
        </div>
      </div>
      <div class="drawer-viewer-body"
        ref="drawerViewerBody"
        @wheel.stop="handleBodyWheel"
        @scroll="handleBodyScroll"
      >
        <div class="drawer-image-content"
          v-if="!showThumbnail"
          @click="handleViewerAreaClick"
        >
          <div v-if="imageStyleType === 'scroll'">
            <div
              v-for="(image, index) in viewerImageList"
              :key="image.id"
              class="image-frame"
            >
              <div
                class="viewer-image-frame viewer-image-frame-scroll"
                :id="image.id"
                :style="returnImageStyle(image)"
                v-lazy:[image.id]="{enter: handleImageEnter, leave: handleImageLeave}"
              >
                <img
                  v-if="loadedImages[image.id]"
                  :src="getImageDisplayPath(image)"
                  class="viewer-image"
                  :style="{height: returnImageStyle(image).height}"
                  @contextmenu="onMangaImageContextMenu($event, image)"
                />
                <div v-else class="viewer-image-placeholder" :style="{height: returnImageStyle(image).height}">
                  <el-icon class="is-loading"><Loading /></el-icon>
                </div>
                <div class="viewer-image-bar" @mousedown="initResize(image.id, image.width)"></div>
                <!-- 翻译中指示器 -->
                <div v-if="translatingImages[image.id]" class="translating-indicator">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <span>翻译中...</span>
                </div>
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{index + 1}} of {{viewerImageList.length}}</div>
            </div>
          </div>
          <div v-else-if="imageStyleType === 'single'" class="image-frame-outside">
            <div class="image-frame">
              <div class="viewer-image-frame"  :style="returnImageStyle(viewerImageList[currentImageIndex])" v-if="viewerImageList.length > 0">
                <img
                  :src="getImageDisplayPath(viewerImageList[currentImageIndex])"
                  class="viewer-image"
                  :style="{height: returnImageStyle(viewerImageList[currentImageIndex])?.height}"
                  @contextmenu="onMangaImageContextMenu($event, viewerImageList[currentImageIndex])"
                />
                <!-- 翻译中指示器 -->
                <div v-if="translatingImages[viewerImageList[currentImageIndex]?.id]" class="translating-indicator">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <span>翻译中...</span>
                </div>
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{currentImageIndex + 1}} of {{viewerImageList.length}}</div>
              <img
                :src="getImageDisplayPath(viewerImageList[currentImageIndex - 1])"
                class="viewer-image-preload"
                v-if="currentImageIndex > 1"
              />
              <img
                :src="getImageDisplayPath(viewerImageList[currentImageIndex + 1])"
                class="viewer-image-preload"
                v-if="currentImageIndex < viewerImageList.length - 1"
              />
            </div>
          </div>
          <div v-else-if="imageStyleType === 'double'" class="image-frame-outside">
            <div class="image-frame">
              <div class="viewer-image-frame viewer-image-frame-double" v-if="viewerImageListDouble.length > 0">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex]?.page"
                  :key="image.id"
                  :src="getImageDisplayPath(image)"
                  class="viewer-image"
                  :style="{height: returnImageStyle(image).height}"
                  @contextmenu="onMangaImageContextMenu($event, image)"
                />
              </div>
              <div v-if="currentImageIndex > 1">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex - 1]?.page" :key="image.id"
                  :src="getImageDisplayPath(image)"
                  class="viewer-image-preload"
                />
              </div>
              <div v-if="currentImageIndex < viewerImageListDouble.length - 1">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex + 1]?.page" :key="image.id"
                  :src="getImageDisplayPath(image)"
                  class="viewer-image-preload"
                />
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{viewerImageListDouble[currentImageIndex]?.pageNumber?.join(', ')}} of {{viewerImageList.length}}</div>
            </div>
          </div>
        </div>
        <div class="drawer-thumbnail-content" v-if="showThumbnail">
          <!-- eslint-disable-next-line vue/valid-v-for -->
          <el-space wrap @wheel.stop>
            <div v-for="(image, index) in thumbnailList" :key="image.id">
              <img
                :src="`${image.thumbnailPath}?id=${image.id}`"
                class="viewer-thumbnail"
                :style="{width: thumbnailWidth}"
                @click="handleClickThumbnail(image.id)"
                @contextmenu="onMangaImageContextMenu($event, image)"
              />
              <div class="viewer-thunmnail-page">{{index + 1}} of {{thumbnailList.length}}</div>
            </div>
          </el-space>
        </div>
        <el-button class="viewer-close-button" link text :icon="Close" size="large" @click="drawerVisibleViewer = false"></el-button>
        <!-- 翻译服务加载提示 -->
        <div v-if="showTranslationLoadingTip" class="translation-loading-tip">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>正在加载漫画翻译服务，等待...</span>
        </div>
        <div class="viewer-mode-setting">
          <el-select
            v-model="showThumbnail"
            size="small"
            @change="switchThumbnail"
            class="viewer-thumbnail-select"
          >
            <el-option :value="true" :label="$t('m.thumbnail')" />
            <el-option :value="false" :label="$t('m.content')" />
          </el-select>
          <el-select
            v-model="showViewerSide"
            size="small"
            @change="handleSidebarChange"
            class="viewer-sidebar-select"
            v-show="showThumbnail === false"
          >
            <el-option :value="true" :label="$t('m.showSidebar')" />
            <el-option :value="false" :label="$t('m.hideSidebar')" />
          </el-select>
          <el-select
            v-model="imageStyleType"
            size="small"
            @focus="getCurrentImageId"
            @change="saveImageStyleType"
            class="viewer-mode"
            v-show="showThumbnail === false"
          >
            <el-option value="scroll" :label="$t('m.scrolling')" />
            <el-option value="single" :label="$t('m.singlePage')" />
            <el-option value="double" :label="$t('m.doublePage')" />
          </el-select>
          <el-select
            v-model="imageStyleFit"
            size="small"
            @change="saveImageStyleFit"
            class="viewer-image-fit"
            v-show="imageStyleType !== 'scroll' && showThumbnail === false"
          >
            <el-option value="width" :label="$t('m.fitWidth')" />
            <el-option value="height" :label="$t('m.fitHeight')" />
            <el-option value="window" :label="$t('m.fitWindow')" />
          </el-select>
          <el-select
            v-model="viewerImageWidth"
            size="small"
            class="viewer-image-width"
            v-show="imageStyleType === 'scroll' && showThumbnail === false"
          >
            <el-option :value="0.5" label="50vw" />
            <el-option :value="0.75" label="75vw" />
            <el-option :value="0.9" label="90vw" />
            <el-option :value="20" label="20%" />
            <el-option :value="50" label="50%" />
            <el-option :value="75" label="75%" />
            <el-option :value="100" label="100%" />
          </el-select>
        </div>
        <div class="next-manga-button">
          <el-button size="large" type="success" plain @click="$emit('toNextManga', -1)">{{$t('m.previousManga')}}</el-button>
          <el-button size="large" type="success" plain @click="$emit('toNextMangaRandom')">{{$t('m.nextMangaRandom')}}</el-button>
          <el-button size="large" type="success" plain @click="$emit('toNextManga', 1)">{{$t('m.nextManga')}}</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Close, Loading } from '@element-plus/icons-vue'
import { ElLoading } from 'element-plus'
import ContextMenu from '@imengyu/vue3-context-menu'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import  { insertLocalReadRecord } from '../utils.js'

const ipcRenderer = window.ipcRenderer || { on: () => {}, invoke: () => Promise.resolve() }

const appStore = useAppStore()
const { keyMap, setting, bookDetail } = storeToRefs(appStore)
const { printMessage, saveBook } = appStore
const { t } = useI18n()

const emit = defineEmits([
  'toNextManga',
  'toNextMangaRandom',
  'updateOptions',
  'updateWindowTitle',
  'rescanBook',
])

let ComicReader = null
const isComicReadDisplay = ref(false)

const showComicReader = _.throttle((imageList) => {
  if (ComicReader) {
    isComicReadDisplay.value = true
    ComicReader.open(imageList)
  }
}, 1000)

const closeComicReader = () => {
  if (ComicReader) {
    isComicReadDisplay.value = false
    ComicReader.setProps('show', false)
    ComicReader = null
    const comicReadElement = document.getElementById('ComicRead')
    if (comicReadElement) comicReadElement.remove()
    ipcRenderer.invoke('update-window-title')
  }
}

const initComicRead = async () => {
  if (!ComicReader && setting.value.viewerType === 'comicread') {
    try {
      const { initComicReader, defaultConfig } = await import('@hymbz/comic-read-script/ComicReader.umd.js')
      const configObject = defaultConfig()
      configObject.props.onExit = closeComicReader
      ComicReader = initComicReader(configObject)
    } catch (error) {
      console.error('Failed to load ComicRead:', error)
    }
  }
}

const drawerVisibleViewer = ref(false)
const showViewerSide = ref(true)
const showThumbnail = ref(false)
const viewerImageWidth = ref(0.9)
watch(viewerImageWidth, () => localStorage.setItem('viewerImageWidth', viewerImageWidth.value))
const imageStyleType = ref('single')
const imageStyleFit = ref('window')
const viewerReadingProgress = ref([])
const currentImageId = ref('')
const insertEmptyPage = ref(true)
const insertEmptyPageIndex = ref(0)
const viewerImageList = ref([])

// 翻译相关状态
const translatedImages = ref({})  // 存储翻译后的图片 { imageId: base64Data }
const translatingImages = ref({}) // 正在翻译的图片 { imageId: true }
const isPreTranslating = ref(false)  // 是否正在预翻译
const pendingAutoTranslate = ref(false)  // 等待图片加载完成后启动预翻译
const pendingOCRDetect = ref(false)  // 是否需要进行 OCR 检测
let cancelTranslation = false  // 取消翻译标志
const translationServiceReady = ref(false)  // 翻译服务是否就绪
const showTranslationLoadingTip = ref(false)  // 显示翻译服务加载提示

// 检查书籍是否需要翻译（日语漫画）- 通过 language 标签或标题判断
const isJapaneseBook = (book) => {
  if (!book || !book.tags) return false
  const tags = book.tags
  // 检查 language 标签是否包含 japanese
  if (tags.language && Array.isArray(tags.language)) {
    const hasJapanese = tags.language.some(lang => 
      lang.toLowerCase().includes('japanese')
    )
    if (hasJapanese) return true
  }
  
  // 备用判断：如果 tags 没有 language，检查 title_jpn 是否包含日文字符
  if (book.title_jpn) {
    const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/
    if (japaneseRegex.test(book.title_jpn)) {
      return true
    }
  }
  
  // 再备用：检查 title 是否包含大量日文字符（说明是日语漫画）
  if (book.title) {
    const japaneseChars = book.title.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g)
    if (japaneseChars && japaneseChars.length >= 3) {
      return true
    }
  }
  
  return false
}

// 检查翻译服务是否就绪
const checkTranslationServiceReady = async () => {
  try {
    const status = await ipcRenderer.invoke('get-translation-service-status')
    return status?.isRunning === true
  } catch {
    return false
  }
}

// 翻译单张图片（带重试机制）
const translateImage = async (image, retryCount = 0) => {
  const maxRetries = 3
  const retryDelay = 2000  // 重试间隔 2 秒
  
  if (!image || !image.filepath) return null
  if (cancelTranslation) return null  // 已取消
  if (translatedImages.value[image.id]) {
    return translatedImages.value[image.id]  // 已翻译，返回缓存
  }
  if (translatingImages.value[image.id]) {
    return null  // 正在翻译中
  }
  
  translatingImages.value[image.id] = true
  
  try {
    console.log(`[翻译] 发送翻译请求 (${retryCount > 0 ? '重试 ' + retryCount : '首次'}): ${image.filepath}`)
    const result = await ipcRenderer.invoke('translate-image', { 
      imagePath: image.filepath 
    })
    
    // 翻译完成后再次检查是否已取消
    if (cancelTranslation) {
      console.log(`[翻译] 翻译完成但已取消: ${image.filepath}`)
      return null
    }
    
    if (result.success) {
      console.log(`[翻译] 翻译成功: ${image.filepath}`)
      translatedImages.value[image.id] = result.data
      return result.data
    } else {
      console.error(`[翻译] 翻译失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, result.error)
      
      // 如果还有重试次数，等待后重试
      if (retryCount < maxRetries) {
        translatingImages.value[image.id] = false
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return translateImage(image, retryCount + 1)
      } else {
        console.error(`[翻译] 翻译失败，已达最大重试次数，跳过: ${image.filepath}`)
        return null
      }
    }
  } catch (err) {
    console.error(`[翻译] 翻译异常 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, err)
    
    // 如果还有重试次数，等待后重试
    if (retryCount < maxRetries) {
      translatingImages.value[image.id] = false
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return translateImage(image, retryCount + 1)
    } else {
      console.error(`[翻译] 翻译异常，已达最大重试次数，跳过: ${image.filepath}`)
      return null
    }
  } finally {
    translatingImages.value[image.id] = false
  }
}

// 预翻译 - 优先翻译当前阅读页面，然后翻译其他页面
const startPreTranslation = async () => {
  // 如果正在翻译，先取消之前的翻译
  if (isPreTranslating.value) {
    console.log('[翻译] 取消之前的翻译任务')
    cancelTranslation = true
    // 等待之前的翻译任务停止
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  // 检查设置是否启用翻译
  if (!setting.value.translation?.enabled) {
    return
  }
  
  // 先检查翻译服务是否就绪
  const isReady = await checkTranslationServiceReady()
  
  if (!isReady) {
    console.log('[翻译] 翻译服务未就绪，等待服务启动...')
    showTranslationLoadingTip.value = true
    translationServiceReady.value = false
    return
  }
  
  // 如果需要 OCR 检测，先检测中间几页是否有日文
  if (pendingOCRDetect.value) {
    pendingOCRDetect.value = false
    
    const totalImages = viewerImageList.value.length
    if (totalImages === 0) {
      pendingAutoTranslate.value = false
      return
    }
    
    // 检测中间几张图片
    const testIndices = []
    if (totalImages >= 3) {
      testIndices.push(Math.floor(totalImages / 2))
    }
    if (totalImages >= 5) {
      testIndices.push(Math.floor(totalImages * 0.25))
      testIndices.push(Math.floor(totalImages * 0.75))
    }
    
    let hasJapanese = false
    for (const idx of testIndices) {
      const image = viewerImageList.value[idx]
      if (image && image.filepath) {
        try {
          const result = await ipcRenderer.invoke('detect-image-language', { 
            imagePath: image.filepath 
          })
          if (result?.hasJapanese) {
            hasJapanese = true
            break
          }
        } catch (err) {
          console.log('[翻译] OCR 检测失败:', err)
        }
      }
    }
    
    if (!hasJapanese) {
      console.log('[翻译] 未检测到日文，取消自动翻译')
      pendingAutoTranslate.value = false
      return
    }
  }
  
  // 重置取消标志，开始新的翻译任务
  cancelTranslation = false
  translationServiceReady.value = true
  showTranslationLoadingTip.value = false
  isPreTranslating.value = true
  
  const totalImages = viewerImageList.value.length
  if (totalImages === 0) {
    isPreTranslating.value = false
    return
  }
  
  // 获取当前阅读页面的索引
  const currentIdx = currentImageIndex.value
  console.log(`[翻译] 开始预翻译，共 ${totalImages} 张图片，当前页: ${currentIdx + 1}`)
  
  // 构建翻译优先级队列：先翻译当前页面附近的，再翻译其他页面
  const translateOrder = []
  const added = new Set()
  
  // 辅助函数：添加到翻译队列
  const addToQueue = (idx) => {
    if (idx >= 0 && idx < totalImages && !added.has(idx)) {
      translateOrder.push(idx)
      added.add(idx)
    }
  }
  
  // 1. 最高优先级：当前页的前一页和当前页
  addToQueue(currentIdx - 1)
  addToQueue(currentIdx)
  
  // 2. 高优先级：当前页后面的几页
  for (let offset = 1; offset <= 5; offset++) {
    addToQueue(currentIdx + offset)
  }
  
  // 3. 添加剩余页面（从头到尾）
  for (let i = 0; i < totalImages; i++) {
    addToQueue(i)
  }
  
  // 按优先级顺序翻译
  for (const i of translateOrder) {
    // 检查是否被取消
    if (cancelTranslation) {
      isPreTranslating.value = false
      return
    }
    
    // 检查是否还在阅读这本漫画（如果关闭阅读器则停止）
    if (!drawerVisibleViewer.value) {
      break
    }
    
    const image = viewerImageList.value[i]
    if (image && !translatedImages.value[image.id] && !translatingImages.value[image.id]) {
      await translateImage(image)
    }
  }
  
  isPreTranslating.value = false
}

// 获取图片显示路径（原图或翻译图）
const getImageDisplayPath = (image) => {
  // 检查设置是否启用翻译且有翻译结果
  if (setting.value.translation?.enabled && translatedImages.value[image.id]) {
    // 返回翻译后的图片 (data URL)
    return `data:image/jpeg;base64,${translatedImages.value[image.id]}`
  }
  return `${image.filepath}?id=${image.id}`
}

const viewerImageListDouble = computed(() => {
  if (imageStyleType.value === 'double') {
    const result = []
    let frame = {page: [], pageNumber: []}
    let pageNumber = 0
    for (const image of viewerImageList.value) {
      pageNumber += 1
      if (image.width > image.height) {
        if (frame.page.length > 0) {
          result.push(_.clone(frame))
          frame = {page: [], pageNumber: []}
        }
        result.push({page: [image], pageNumber: [pageNumber]})
      } else {
        frame.page.push(image)
        frame.pageNumber.push(pageNumber)
        if ((insertEmptyPage.value && result.length === insertEmptyPageIndex.value) || frame.page.length >= 2) {
          result.push(_.clone(frame))
          frame = {page: [], pageNumber: []}
        }
      }
    }
    if (frame.page.length > 0) result.push(_.clone(frame))
    return result
  } else {
    return []
  }
})

const totalPage = ref(0)
const viewerImageFilepathList = computed(() => {
  const appendixLength = totalPage.value - viewerImageList.value.length
  if (appendixLength > 0 && insertEmptyPage.value) {
    return [...viewerImageList.value.map(image => image.filepath), ...Array(appendixLength).fill('') ]
  }
  return viewerImageList.value.map(image => image.filepath)
})

const receiveThumbnailList = ref([])

const thumbnailList = computed(() => {
  return _.sortBy(receiveThumbnailList.value, 'index')
})

const pendingImages = []
const pendingThumbnails = []

const flushPendingImages = () => {
  if (pendingImages.length > 0) {
    viewerImageList.value.push(...pendingImages)
    pendingImages.length = 0
  }
}

const flushPendingThumbnails = () => {
  if (pendingThumbnails.length > 0) {
    receiveThumbnailList.value.push(...pendingThumbnails)
    pendingThumbnails.length = 0
  }
}

onMounted(() => {
  viewerImageWidth.value = +localStorage.getItem('viewerImageWidth') || 0.9
  imageStyleType.value = localStorage.getItem('imageStyleType') || 'single'
  imageStyleFit.value = localStorage.getItem('imageStyleFit') || 'window'
  viewerReadingProgress.value = JSON.parse(localStorage.getItem('viewerReadingProgress')) || []

  ipcRenderer.on('manga-image', async (event, arg) => {
    pendingImages.push(arg)

    if (pendingImages.length >= 10 || viewerImageList.value.length < 10) {
      flushPendingImages()

      if (setting.value.viewerType === 'comicread') {
        totalPage.value = arg.total
        nextTick(() => {
          showComicReader(viewerImageFilepathList.value)
        })
      }
    }

    if ((viewerImageList.value.length + pendingImages.length) === arg.total) {
      flushPendingImages()

      if (setting.value.viewerType === 'comicread') {
        totalPage.value = arg.total
        nextTick(() => {
          showComicReader(viewerImageFilepathList.value)
        })
      }
      viewerLoading?.close()
      
      // 图片加载完成后，启动预翻译（如果需要）
      if (pendingAutoTranslate.value) {
        pendingAutoTranslate.value = false
        nextTick(() => startPreTranslation())
      }
    }
  })

  ipcRenderer.on('manga-thumbnail-image', (event, arg) => {
    pendingThumbnails.push(arg)

    if (pendingThumbnails.length >= 10 || viewerImageList.value.length < 10) {
      flushPendingThumbnails()
    }

    if ((receiveThumbnailList.value.length + pendingThumbnails.length) === arg.total) {
      flushPendingThumbnails()
    }
  })

  // 监听翻译服务状态变化
  ipcRenderer.on('translation-service-status', (event, status) => {
    // 当翻译服务就绪时，检查是否需要开始翻译
    if (status.type === 'success' && status.message?.includes('就绪')) {
      translationServiceReady.value = true
      
      // 如果正在阅读日语漫画且显示了等待提示
      if (showTranslationLoadingTip.value && drawerVisibleViewer.value) {
        showTranslationLoadingTip.value = false
        nextTick(() => startPreTranslation())
      }
      
      // 额外检查：如果翻译服务就绪时 pendingAutoTranslate 为 true，说明服务在打开漫画前就就绪了
      if (pendingAutoTranslate.value && drawerVisibleViewer.value) {
        nextTick(() => startPreTranslation())
      }
    }
  })

  showViewerSide.value = localStorage.getItem('showViewerSide') === 'true'

  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  // 移除翻译服务状态监听
  ipcRenderer.removeAllListeners('translation-service-status')
})
const handleWindowResize = _.debounce(() => {
  updateImageSize()
}, 200)

const drawerHeight = ref('100%')
const readyDestroyViewer = ref(false)

let viewerLoading = null
const viewManga = (book, viewerHeight = '100%') => {
  // 取消之前的翻译任务并清空队列
  cancelTranslation = true
  ipcRenderer.invoke('clear-translation-queue')
  
  readyDestroyViewer.value = false
  drawerHeight.value = viewerHeight
  viewerImageList.value = []
  receiveThumbnailList.value = []
  pendingImages.length = 0
  pendingThumbnails.length = 0
  currentImageIndex.value = 0
  insertEmptyPage.value = setting.value.defaultInsertEmptyPage
  insertEmptyPageIndex.value = 0
  bookDetail.value = book
  
  // 重置翻译状态
  translatedImages.value = {}
  translatingImages.value = {}
  isPreTranslating.value = false
  pendingAutoTranslate.value = false
  pendingOCRDetect.value = false
  showTranslationLoadingTip.value = false
  cancelTranslation = false  // 重置取消标志
  
  // 检查是否需要自动翻译（设置启用 + 日语漫画）
  const isJapanese = isJapaneseBook(book)
  
  // 如果通过 tags 判断不是日语漫画，尝试 OCR 检测
  let ocrPending = false
  if (setting.value.translation?.enabled && !isJapanese) {
    ocrPending = true
    pendingOCRDetect.value = true
  }
  
  if (setting.value.translation?.enabled && (isJapanese || ocrPending)) {
    pendingAutoTranslate.value = true
  }
  
  viewerLoading = ElLoading.service({
    lock: true,
    text: 'Loading',
    background: _.includes(setting.value.theme, 'light') ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
  })
  emit('updateWindowTitle', book)
  insertLocalReadRecord(book.id)
  ipcRenderer.invoke('load-manga-image-list', _.cloneDeep(book))
  .then(() => {
    if (!setting.value.viewerType || setting.value.viewerType === 'original') {
      drawerVisibleViewer.value = true
      if (setting.value.keepReadingProgress && showThumbnail.value === false) handleJumpToReadingProgress(book)
      viewerLoading.close()
    } else if (setting.value.viewerType === 'comicread') {
      initComicRead()
    }
    book.readCount += 1
    saveBook(book)
  })
  .catch(err => {
    console.log(err)
    viewerLoading.close()
  })

  if (localStorage.getItem('showViewerSide') === 'true') {
    showViewerSide.value = true
  }
}

const _currentImageIndex = ref(0)
const currentImageIndex = computed({
  get () {
    return _currentImageIndex.value
  },
  set (val) {
    let listLength
    if (imageStyleType.value === 'single') {
      listLength = viewerImageList.value.length
    } else {
      listLength = viewerImageListDouble.value.length
    }
    if (Number.isInteger(val)) {
      if (val < 0) {
        _currentImageIndex.value = 0
      } else if (val > listLength - 1 && listLength >= 1) {
        _currentImageIndex.value = listLength - 1
        if (setting.value.autoNextManga) emit('toNextManga', 1)
      } else {
        _currentImageIndex.value = val
      }
    }
  }
})

let storeDrawerScrollTop
const switchThumbnail = (val) => {
  setTimeout(() => document.querySelector('.viewer-close-button').focus(), 500)
  if (imageStyleType.value === 'scroll') {
    if (!val) {
      if (storeDrawerScrollTop) {
        nextTick(() => {
          document.querySelector('.drawer-viewer-body').scrollTop = storeDrawerScrollTop
          storeDrawerScrollTop = undefined
        })
      }
    } else {
      storeDrawerScrollTop = document.querySelector('.drawer-viewer-body').scrollTop
    }
  }
}

const drawerViewerBody = ref(null)

const thumbnailWidth = computed(() => {
  const innerWidth = drawerViewerBody.value ? drawerViewerBody.value.clientWidth : window.innerWidth
  return `${(innerWidth - 32) / (setting.value.thumbnailColumn || 10) - 10}px`
})

const returnImageStyle = (image) => {
  const innerWidth = drawerViewerBody.value ? drawerViewerBody.value.clientWidth : window.innerWidth
  const innerHeight = drawerViewerBody.value ? drawerViewerBody.value.clientHeight : window.innerHeight
  const returnImageStyleObject = ({width, height}) => {
    if (width) {
      return { width: width + 'px', height: (image.height * (width / image.width)) + 'px' }
    }
    if (height) {
      return { width: (image.width * (height / image.height)) + 'px', height: height + 'px' }
    }
  }
  if (image) {
    const windowRatio = innerWidth / innerHeight
    switch (imageStyleType.value) {
      case 'scroll':
        // With mode as % of window width, cap max width at 2x window width.
        // With mode as % of image width, set min width at 2%.
        if (viewerImageWidth.value <= 2) {
          return returnImageStyleObject({width: viewerImageWidth.value * innerWidth})
        } else {
          return returnImageStyleObject({width: viewerImageWidth.value / 100 * image.width / window.devicePixelRatio})
        }
      case 'double': {
        switch (imageStyleFit.value) {
          case 'height': {
            if (setting.value.hidePageNumber) {
              return returnImageStyleObject({height: innerHeight - 1})
            } else {
              // minus 36 for the height of .viewer-image-page
              return returnImageStyleObject({height: innerHeight - 36})
            }
          }
          case 'width': {
            // minus 32 for the width of scrollbar
            if (image.width > image.height) {
              return returnImageStyleObject({width: innerWidth - 32})
            } else {
              return returnImageStyleObject({width: (innerWidth - 32) / 2})
            }
          }
          case 'window': {
            if (image.width > image.height) {
              if (image.width / image.height > windowRatio) {
                return returnImageStyleObject({width: innerWidth - 32})
              } else {
                if (setting.value.hidePageNumber) {
                  return returnImageStyleObject({height: innerHeight})
                } else {
                  return returnImageStyleObject({height: innerHeight - 36})
                }
              }
            } else if (image.width * 2 / image.height > windowRatio) {
              return returnImageStyleObject({width: (innerWidth - 32) / 2 })
            } else {
              if (setting.value.hidePageNumber) {
                return returnImageStyleObject({height: innerHeight - 1})
              } else {
                return returnImageStyleObject({height: innerHeight - 36})
              }
            }
          }
        }
      }
      case 'single': {
        switch (imageStyleFit.value) {
          case 'height': {
            if (setting.value.hidePageNumber) {
              return returnImageStyleObject({height: innerHeight})
            } else {
              return returnImageStyleObject({height: innerHeight - 36})
            }
          }
          case 'width': {
            return returnImageStyleObject({width: innerWidth - 32})
          }
          case 'window': {
            if (image.width / image.height > windowRatio) {
              return returnImageStyleObject({width: innerWidth - 32})
            } else {
              if (setting.value.hidePageNumber) {
                return returnImageStyleObject({height: innerHeight})
              } else {
                return returnImageStyleObject({height: innerHeight - 36})
              }
            }
          }
        }
      }
    }
  }
}

const initResize = (id, originWidth) => {
  if (imageStyleType.value === 'scroll') {
    const element = document.getElementById(id)
    const Resize = (e) => {
      if (viewerImageWidth.value <= 2) {
        viewerImageWidth.value = _.round((e.clientX - element.offsetLeft) / innerWidth , 2)
      } else {
        viewerImageWidth.value = _.round((e.clientX - element.offsetLeft) / originWidth * 100 * window.devicePixelRatio, 0)
      }
    }
    const stopResize = (e) => {
      window.removeEventListener('mousemove', Resize, false)
      window.removeEventListener('mouseup', stopResize, false)
    }
    window.addEventListener('mousemove', Resize, false)
    window.addEventListener('mouseup', stopResize, false)
  }
}

const getCurrentImageId = () => {
  if (imageStyleType.value === 'scroll') {
    let scrollTopValue = drawerViewerBody.value ? drawerViewerBody.value.scrollTop : 0
    let currentId = null
    let lastVisibleImage = null
    let totalHeight = 0

    for (const image of viewerImageList.value) {
      const imageStyle = returnImageStyle(image)
      const imageHeight = parseFloat(imageStyle.height)
      const pageNumberHeight = setting.value.hidePageNumber ? 0 : 28
      const elementHeight = imageHeight + pageNumberHeight

      if (totalHeight <= scrollTopValue && scrollTopValue < totalHeight + elementHeight) {
        currentId = image.id
        break
      }

      lastVisibleImage = image
      totalHeight += elementHeight
    }

    currentImageId.value = currentId || (lastVisibleImage ? lastVisibleImage.id : (viewerImageList.value[0]?.id || ''))
  } else if (imageStyleType.value === 'single') {
    currentImageId.value = viewerImageList.value[currentImageIndex.value]?.id
  } else if (imageStyleType.value === 'double') {
    currentImageId.value = viewerImageListDouble.value[currentImageIndex.value]?.page[0]?.id
  }
  return currentImageId.value
}

const saveReadingProgress = () => {
  readyDestroyViewer.value = true
  try {
    let currentImageId = getCurrentImageId()
    const currentImageIndex = viewerImageList.value.findIndex(image => image.id === currentImageId)
    if (currentImageIndex > bookDetail.value.pageCount - 6) {
      currentImageId = viewerImageList.value[0].id
    }
    viewerReadingProgress.value.unshift({bookId: bookDetail.value.id, pageId: currentImageId})
    localStorage.setItem('viewerReadingProgress', JSON.stringify(viewerReadingProgress.value.slice(0, 1000)))
  } catch {}
}

const saveImageStyleType = () => {
  if (imageStyleType.value === 'double') printMessage('info', t('c.insertEmptyPageInfo'))
  localStorage.setItem('imageStyleType', imageStyleType.value)
  setTimeout(() => {
    handleClickThumbnail(currentImageId.value)
    document.querySelector('.viewer-close-button').focus()
  }, 500)
}
const saveImageStyleFit = () => {
  localStorage.setItem('imageStyleFit', imageStyleFit.value)
  setTimeout(() => document.querySelector('.viewer-close-button').focus(), 500)
}

const handleClickThumbnail = (id) => {
  showThumbnail.value = false
  let scrollTopValue = 0
  if (imageStyleType.value === 'scroll') {
    _.forEach(viewerImageList.value, (image) => {
      if (image.id === id) {
        nextTick(() => document.querySelector('.drawer-viewer-body').scrollTop = scrollTopValue)
        return false
      }
      // 28 is the height of .viewer-image-page
      if (setting.value.hidePageNumber) {
        scrollTopValue += parseFloat(returnImageStyle(image).height)
      } else {
        scrollTopValue += parseFloat(returnImageStyle(image).height) + 28
      }
    })
  } else if (imageStyleType.value === 'single') {
    currentImageIndex.value = _.findIndex(viewerImageList.value, {id: id})
  } else if (imageStyleType.value === 'double') {
    _.forEach(viewerImageListDouble.value, (imageGroup, index) => {
      if (_.find(imageGroup.page, {id: id})) {
        currentImageIndex.value = index
        return false
      }
    })
  }
}

const handleViewerAreaClick = (event) => {
  const innerWidth = drawerViewerBody.value ? drawerViewerBody.value.clientWidth : window.innerWidth
  if (showThumbnail.value === false) {
    if (imageStyleType.value === 'single' || imageStyleType.value === 'double') {
      let click
      if (setting.value.reverseLeftRight) {
        ;({ click } = keyMap.value.reverse)
      } else {
        ;({ click } = keyMap.value.normal)
      }
      if(event.clientX > innerWidth / 2) {
        currentImageIndex.value += click
        document.querySelector('.drawer-viewer-body').scrollTop = 0
        scrollCurrentThumbnailIntoView()
      } else {
        currentImageIndex.value += -click
        document.querySelector('.drawer-viewer-body').scrollTop = 0
        scrollCurrentThumbnailIntoView()
      }
    }
  }
}

const handleJumpToReadingProgress = async (book) => {
  const findProgress = viewerReadingProgress.value.find(progress => progress.bookId === book.id)
  if (findProgress) {
    const timer = ms => new Promise(res => setTimeout(res, ms))
    while (!readyDestroyViewer.value) {
      if (imageStyleType.value === 'scroll' || imageStyleType.value === 'single') {
        if (viewerImageList.value.findIndex(image => image.id === findProgress.pageId) >= 0) {
          handleClickThumbnail(findProgress.pageId)
          break
        }
      } else if (imageStyleType.value === 'double') {
        if (viewerImageListDouble.value.findIndex(imageGroup => imageGroup.page.findIndex(page => page.id === findProgress.pageId) >= 0) >= 0) {
          handleClickThumbnail(findProgress.pageId)
          break
        }
      }
      if (viewerImageList.value.length > book.pageCount - 5 || bookDetail.value.id !== book.id) break
      await timer(500)
    }
  }
}


const useNewCover = async (filepath) => {
  const coverPath = await ipcRenderer.invoke('use-new-cover', filepath)
  bookDetail.value.coverPath = coverPath
  await saveBook(bookDetail.value)
}

const handleStopReadManga = () => {
  if (setting.value.keepReadingProgress) saveReadingProgress()
  ipcRenderer.invoke('release-sendimagelock')
  ipcRenderer.invoke('update-window-title')
}

const onMangaImageContextMenu = (e, image) => {
  e.preventDefault()
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: [
      {
        label: t('c.copyImageToClipboard'),
        onClick: () => {
          ipcRenderer.invoke('copy-image-to-clipboard', image.filepath)
        }
      },
      {
        label: t('c.designateAsCover'),
        onClick: () => {
          useNewCover(image.filepath)
        }
      },
      {
        label: t('c.deleteImage'),
        onClick: async () => {
          const deleteResult = await ipcRenderer.invoke('delete-image', image.relativePath, bookDetail.value.filepath, bookDetail.value.type)
          if (deleteResult) {
            viewerImageList.value = viewerImageList.value.filter(item => item.id !== image.id)
            receiveThumbnailList.value = receiveThumbnailList.value.filter(item => item.id !== image.id)
            emit('rescanBook', bookDetail.value)
          } else {
            printMessage('error', t('c.deleteImageError'))
          }
        }
      }
    ]
  })
}

const updateImageSize = () => {
  if (imageStyleType.value === 'scroll') {
    const imageFrames = document.querySelectorAll('.viewer-image-frame-scroll')
    imageFrames.forEach((frame, index) => {
      const image = viewerImageList.value[index]
      if (image) {
        const newStyle = returnImageStyle(image)
        Object.keys(newStyle).forEach(key => {
          frame.style[key] = newStyle[key]
        })

        const imgElement = frame.querySelector('.viewer-image')
        if (imgElement && newStyle.height) {
          imgElement.style.height = newStyle.height
        }
      }
    })
  } else if (imageStyleType.value === 'single' || imageStyleType.value === 'double') {
    if (currentImageIndex.value > 1) {
      currentImageIndex.value -= 1
      nextTick(() => {
        currentImageIndex.value += 1
      })
    } else {
      currentImageIndex.value +=1
      nextTick(() => {
        currentImageIndex.value -= 1
      })
    }
  }
}

const handleSidebarChange = (val) => {
  showViewerSide.value = val
  localStorage.setItem('showViewerSide', val)
  nextTick(updateImageSize)
}

watch(showViewerSide, () => {
  nextTick(updateImageSize)
})

const handleBodyWheel = (event) => {
  if (event.ctrlKey) {
    event.preventDefault()
    if (imageStyleType.value === 'scroll') {
      const element = drawerViewerBody.value
      if (!element) return

      const rect = element.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top

      const scrollLeftBefore = element.scrollLeft
      const scrollTopBefore = element.scrollTop
      const scrollWidthBefore = element.scrollWidth
      const scrollHeightBefore = element.scrollHeight

      const scrollLeftRatio = (scrollLeftBefore + mouseX) / scrollWidthBefore
      const scrollTopRatio = (scrollTopBefore + mouseY) / scrollHeightBefore

      const zoomIntensityVW = 0.05
      const zoomIntensityPercent = 5
      if (event.deltaY < 0) { // zoom in
        if (viewerImageWidth.value <= 2) { // vw mode
          viewerImageWidth.value = _.round(Math.min(2, viewerImageWidth.value + zoomIntensityVW), 2)
        } else { // % mode
          viewerImageWidth.value = Math.min(500, viewerImageWidth.value + zoomIntensityPercent)
        }
      } else { // zoom out
        if (viewerImageWidth.value <= 2) { // vw mode
          viewerImageWidth.value = _.round(Math.max(0.1, viewerImageWidth.value - zoomIntensityVW), 2)
        } else { // % mode
          viewerImageWidth.value = Math.max(10, viewerImageWidth.value - zoomIntensityPercent)
        }
      }

      nextTick(() => {
        const scrollWidthAfter = element.scrollWidth
        const scrollHeightAfter = element.scrollHeight

        const newScrollLeft = scrollLeftRatio * scrollWidthAfter - mouseX
        const newScrollTop = scrollTopRatio * scrollHeightAfter - mouseY

        element.scrollLeft = newScrollLeft
        element.scrollTop = newScrollTop
      })
    }
    return
  }

  if (imageStyleType.value === 'single' || imageStyleType.value === 'double') {
    const element = drawerViewerBody.value
    if (!element) return

    if (event.deltaY > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 2) {
      currentImageIndex.value += 1
      element.scrollTop = 0
      scrollCurrentThumbnailIntoView()
    } else if (event.deltaY < 0 && element.scrollTop <= 0) {
      currentImageIndex.value -= 1
      scrollCurrentThumbnailIntoView()
    }
  }
}

const handleBodyScroll = _.debounce(() => {
  if (imageStyleType.value === 'scroll' && showViewerSide.value && !showThumbnail.value) {
    const currentId = getCurrentImageId()
    if (currentId) {
      scrollCurrentThumbnailIntoView(currentId)
    }
  }
}, 100)

const sidebarRef = ref(null)

const isCurrentImage = (id) => {
  if (imageStyleType.value === 'scroll') {
    return id === getCurrentImageId()
  } else if (imageStyleType.value === 'single') {
    return viewerImageList.value[currentImageIndex.value]?.id === id
  } else if (imageStyleType.value === 'double') {
    return viewerImageListDouble.value[currentImageIndex.value]?.page.some(page => page.id === id)
  }
  return false
}

watch(currentImageIndex, () => {
  scrollCurrentThumbnailIntoView()
})

const scrollCurrentThumbnailIntoView = (id = null) => {
  nextTick(() => {
    const currentId = id || getCurrentImageId()
    if (showViewerSide.value && currentId && sidebarRef.value) {
      const thumbnailElement = document.getElementById(`thumb_${currentId}`)
      if (thumbnailElement) {
        thumbnailElement.scrollIntoView({ block: 'start' })
      }
    }
  })
}

const loadedImages = ref({})

const handleImageEnter = (id) => {
  loadedImages.value[id] = true
}

const handleImageLeave = (id) => {
  loadedImages.value[id] = false
}

defineExpose({
  drawerVisibleViewer,
  showThumbnail,
  currentImageIndex,
  viewerImageList,
  viewerImageListDouble,
  imageStyleType,
  insertEmptyPage,
  insertEmptyPageIndex,
  switchThumbnail,
  saveReadingProgress,
  viewManga,
  handleStopReadManga,
  isComicReadDisplay,
  closeComicReader,
})
</script>

<style lang="stylus">
.viewer-drawer
  .el-drawer__body
    padding: 0
    overflow: hidden

.viewer-drawer-modal
  background-color: var(--el-mask-color-extra-light)

.viewer-container
  display: flex
  width: 100%
  height: 100%

.drawer-viewer-side
  width: 220px
  height: 100%
  overflow-y: auto
  border-right: 1px solid var(--el-border-color-lighter)
  padding: 10px
  box-sizing: border-box
  background-color: var(--el-fill-color-light)
  flex-shrink: 0
  z-index: 10

  .sidebar-thumbnail-content
    display: flex
    flex-direction: column
    align-items: center
    gap: 10px

  .sidebar-thumbnail-item
    display: flex
    flex-direction: column
    align-items: center
    cursor: pointer

    &.sidebar-thumbnail-active
      .sidebar-thumbnail
        border: 2px solid var(--el-color-primary)
        box-shadow: 0 0 5px var(--el-color-primary-light-5)

  .sidebar-thumbnail
    width: 100%
    max-width: 200px
    object-fit: contain
    border-radius: 4px
    border: 2px solid transparent
    transition: all 0.2s

    &:hover
      border-color: var(--el-color-primary)

  .sidebar-thumbnail-page
    margin-top: 3px
    font-size: 11px
    color: var(--el-text-color-secondary)

.drawer-viewer-body
  flex: 1
  height: 100%
  overflow: auto
  transition: width 0.3s

  .image-frame-outside
    min-height: 100%
    display: flex
    justify-content: center

.drawer-viewer-body
  width: 100%
  height: 100%
  .image-frame-outside
    height: 100vh
    display: flex
    justify-content: center
.viewer-close-button
  position: absolute
  top: 28px
  right: 25px
  .el-icon
    width: 32px
    svg
      height: 32px
      width: 32px
.viewer-close-button:hover
  color: var(--el-color-primary) !important

.translation-loading-tip
  position: absolute
  top: 80px
  right: 25px
  background: rgba(0, 0, 0, 0.8)
  color: #fff
  padding: 12px 20px
  border-radius: 8px
  display: flex
  align-items: center
  gap: 8px
  z-index: 100
  font-size: 14px

.translating-indicator
  position: absolute
  top: 10px
  right: 10px
  background: rgba(0, 0, 0, 0.7)
  color: #fff
  padding: 6px 12px
  border-radius: 4px
  display: flex
  align-items: center
  gap: 6px
  font-size: 12px

.viewer-mode-setting
  opacity: 0.7
  position: absolute
  width: 100px
  top: 8px
  left: 8px
  transition-delay: 0.2s
  z-index: 11
.viewer-mode-setting:hover
  opacity: 1
.viewer-mode, .viewer-image-fit, .viewer-thumbnail-select, .viewer-image-width, .viewer-sidebar-select
  width: 100px
  margin: 4px 8px

.image-frame
  display: flex
  flex-direction: column
  align-items: center
  .viewer-image-frame-scroll
    position: relative
  .viewer-image-frame
    margin: auto
    .viewer-image
      user-select: none
    .viewer-image-bar
      position: absolute
      height: 100%
      width: 6px
      top: 0
      right: -3px
      cursor: ew-resize
    .viewer-image-bar:hover
      background-color: var(--el-color-primary)
  .viewer-image-frame-double .viewer-image
    float: right
  .viewer-image-page
    line-height: 18px
    margin-top: 3px
    margin-bottom: 7px
  .viewer-image-preload
    display: none

.next-manga-button
  opacity: 0.05
  position: fixed
  bottom: 1em
  left: calc(50vw - 154px)
  transition-delay: 0.2s
  .el-button
    --el-button-bg-color: #f0f9eb66
.next-manga-button:hover
  opacity: 1

.drawer-thumbnail-content
  margin: 16px
  height: 100vh
  text-align: left
.viewer-thunmnail-page
  text-align: center
  font-size: 11px

.viewer-image-placeholder
  display: flex
  align-items: center
  justify-content: center
  background-color: var(--el-fill-color-light)
  .el-icon
    font-size: 32px
    color: var(--el-text-color-placeholder)
</style>