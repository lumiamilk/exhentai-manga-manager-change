import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'

const ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve(), on: () => {} }

export const useAppStore = defineStore('appStore', {
  state: () => ({
    cat2letter: {
      language: 'l',
      parody: 'p',
      character: 'c',
      group: 'g',
      artist: 'a',
      female: 'f',
      male: 'm',
      mixed: 'x',
      other: 'o',
      cosplayer: 'cos'
    },
    keyMap: {
      normal: {
        next: 'ArrowRight',
        prev: 'ArrowLeft',
        click: 1
      },
      reverse: {
        next: 'ArrowLeft',
        prev: 'ArrowRight',
        click: -1
      }
    },
    statusOption: [
      'non-tag',
      'tagged',
      'tag-failed'
    ],
    categoryOption: [
      'Doujinshi',
      'Manga',
      'Artist CG',
      'Game CG',
      'Non-H',
      'Image Set',
      'Western',
      'Cosplay',
      'Asian Porn',
      'Misc',
    ],
    searchTypeList: [
      { label: "exhentai(sha1)", value: "exhentai" },
      { label: "e-hentai(sha1)", value: "e-hentai" },
      { label: "exhentai(keyword)", value: "exsearch" },
      { label: "e-hentai(keyword)", value: "e-search" },
      { label: "hentag(keyword)", value: "hentag" },
      { label: "exhentai(.ehviewer file from EhViewer)", value: ".ehviewer" },
    ],
    setting: {},
    bookDetail: {},
    resolvedTranslation: {},
    // PAGINATION: bookList now holds only current page data (max ~200 items)
    bookList: [],
    displayBookList: [],
    chunkDisplayBookList: [],
    // PAGINATION: total count from database
    totalBookCount: 0,
    // PAGINATION: current page state
    pagination: {
      page: 1,
      pageSize: 200,
      sortField: 'date',
      sortOrder: 'DESC',
      filters: {}
    },
    collectionList: [],
    openCollectionBookList: [],
    serviceAvailable: true,
    sortValue: undefined,
    editCollectionView: false,
    editTagView: false,
    localeFile: null,
    folderTreeData: [],
    viewMode: 'card',
    libraryList: [],
  }),
  getters: {
    cookie: (state) => {
      return `igneous=${state.setting.igneous};ipb_pass_hash=${state.setting.ipb_pass_hash};ipb_member_id=${state.setting.ipb_member_id};star=${state.setting.star}`
    },
    pathSep: () => {
      return ipcRenderer.sendSync('get-path-sep')
    },
    displayBookCount (state) {
      if (state.sortValue === 'hidden') {
        return _.sumBy(state.displayBookList, book => book.hiddenBook ? 1 : 0)
      }
      return _.sumBy(state.displayBookList, book => this.isVisibleBook(book) ? 1 : 0)
    },
    tagList (state) {
      const uniqedTagMap = new Map()
      state.bookList.filter(b => {
        return !b.hiddenBook && !b.folderHide
      }).forEach(b => {
        // Defensive check: ensure tags is a valid object
        if (!b.tags || typeof b.tags !== 'object' || Array.isArray(b.tags)) return
        _.forEach(b.tags, (tags, cat) => {
          if (!Array.isArray(tags)) return
          const tagSet = uniqedTagMap.get(cat) || uniqedTagMap.set(cat, new Set()).get(cat)
          tags.forEach(tag => tagSet.add(tag))
        })
      })
      const uniqedTagArray = _.flatMap(_.entries(uniqedTagMap), ([cat, tagSet]) => {
        return _.map([...tagSet], tag => `${cat}##${tag}`)
      }).sort()
      return uniqedTagArray.map(combinedTag => {
        const tagArray = _.split(combinedTag, '##')
        const letter = state.cat2letter[tagArray[0]] ? state.cat2letter[tagArray[0]] : tagArray[0]
        let labelHeader = tagArray[0]
        let labelTail = tagArray[1]
        if (state.setting.showTranslation) {
          labelHeader = tagArray[0] === 'group' ? '团队' : state.resolvedTranslation[tagArray[0]]?.name || tagArray[0]
          labelTail = state.resolvedTranslation[tagArray[1]]?.name || tagArray[1]
        }
        return {
          label: `${labelHeader}:${labelTail}`,
          value: `${letter}:"${tagArray[1]}"$`
        }
      })
    },
    tagListRaw (state) {
      const tagArray = _(state.bookList.map(b => {
        // Defensive check: ensure tags is a valid object
        if (!b.tags || typeof b.tags !== 'object' || Array.isArray(b.tags)) return []
        return _.map(b.tags, (tags, cat) => {
          if (!Array.isArray(tags)) return []
          return _.map(tags, tag => `${cat}##${tag}`)
        })
      }))
      .flattenDeep().value()
      const uniqedTagArray = [...new Set(tagArray)].sort()
      return uniqedTagArray.map(combinedTag => {
        const tagArray = _.split(combinedTag, '##')
        const letter = state.cat2letter[tagArray[0]] ? state.cat2letter[tagArray[0]] : tagArray[0]
        return {
          id: `${tagArray[0]}:${tagArray[1]}`,
          letter,
          cat: tagArray[0],
          tag: tagArray[1],
        }
      })
    },
    tagListForSelect (state) {
      if (state.setting.showTranslation) {
        return state.tagListRaw.map(({letter, cat, tag}) => {
          const labelHeader = cat === 'group' ? '团队' : state.resolvedTranslation[cat]?.name || cat
          const labelTail = state.resolvedTranslation[tag]?.name || tag
          return {
            label: `${labelHeader}:${labelTail} || ${letter}:"${tag}"$`,
            value: `${letter}:"${tag}"$`
          }
        })
      } else {
        return state.tagListRaw.map(({letter, cat, tag}) => {
          return {
            label: `${cat}:${tag} || ${letter}:"${tag}"$`,
            value: `${letter}:"${tag}"$`
          }
        })
      }
    },
    tag2cat (state) {
      const temp = {}
      const tagArray = _(state.bookList.map(b => {
        // Defensive check: ensure tags is a valid object
        if (!b.tags || typeof b.tags !== 'object' || Array.isArray(b.tags)) return []
        return _.map(b.tags, (tags, cat) => {
          if (!Array.isArray(tags)) return []
          return _.map(tags, tag => `${cat}##${tag}`)
        })
      }))
      .flattenDeep().value()
      const uniqedTagArray = [...new Set(tagArray)]
      uniqedTagArray.forEach(combinedTag => {
        const tagArray = _.split(combinedTag, '##')
        temp[tagArray[1]] = tagArray[0]
      })
      return temp
    },
    customOptions (state) {
      return _.compact(_.get(state.setting, 'customOptions', '').split('\n'))
        .map(str => ({label: str.trim(), value: str.trim().replace(/\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/g, '|||')}))
    },
    visibleChunkDisplayBookList (state) {
      const blockedArtists = state.setting.blockedArtists || []
      return state.chunkDisplayBookList.filter(book => {
        if (book.collectionHide || book.folderHide) return false
        if (state.sortValue !== 'hidden' && book.hiddenBook) return false
        
        // Filter by blocked artists: hide book only if ALL artists are blocked
        if (blockedArtists.length > 0 && book.tags?.artist?.length > 0) {
          const allArtistsBlocked = book.tags.artist.every(artist => blockedArtists.includes(artist))
          if (allArtistsBlocked) return false
        }
        
        return true
      })
    },
    visibleChunkDisplayBookListForCollectView (state) {
      return state.chunkDisplayBookList.filter(book => !book.isCollection && !book.folderHide && !book.hiddenBook)
    },
    visibleChunkDisplayBookListForEditTagView (state) {
      return state.chunkDisplayBookList.filter(book => !book.isCollection && !book.folderHide)
    },
  },
  actions: {
    isBook (book) {
      // isCollection mean book is collection
      return !book.isCollection
    },
    isVisibleBook (book) {
      // folderHide mean book hide by not selecting at folder tree
      // collectionHide mean book hide because book in collection
      // hiddenBook mean book hide by user operation
      return !book.folderHide && !book.collectionHide && !book.hiddenBook
    },
    printMessage(type, msg) {
      ElMessage.closeAll()
      ElMessage[type]({
        message: msg,
        offset: 50
      })
    },
    returnFileNameWithExt (filepath) {
      return filepath.split(/[/\\]/).pop()
    },
    returnFileName (book) {
      const fileNameWithExtension = this.returnFileNameWithExt(book.filepath)
      if (book.type === 'folder') return fileNameWithExtension
      return fileNameWithExtension.split('.').slice(0, -1).join('.')
    },
    returnTrimFileName (book) {
      const fileNameWithExtension = this.returnFileNameWithExt(book.filepath)
      let fileNameWithoutExtension = fileNameWithExtension
      try {
        if (book.type !== 'folder') {
          fileNameWithoutExtension = fileNameWithExtension.split('.').slice(0, -1).join('.')
        }
        if (this.setting.trimTitleRegExp) {
          fileNameWithoutExtension = fileNameWithoutExtension.replace(new RegExp(this.setting.trimTitleRegExp, 'g'), '')
        }
        if (this.setting.searchKeySuffix) {
          fileNameWithoutExtension = fileNameWithoutExtension + ' ' + this.setting.searchKeySuffix
        }
      } catch (e) {
        console.log(e)
      }
      return fileNameWithoutExtension
    },
    getDisplayTitle (book) {
      if (book.isCollection) return book.title
      switch (this.setting.displayTitle) {
        case 'englishTitle':
          return book.title
        case 'japaneseTitle':
          return book.title_jpn || book.title
        case 'filename':
          return this.returnFileName(book)
        default:
          return book.title_jpn || book.title || this.returnFileName(book)
      }
    },
    async resetMetadata (book) {
      book.title = this.returnFileName(book)
      book.title_jpn = null
      book.posted = null
      book.filecount = null
      book.rating = null
      book.filesize = null
      book.category = null
      book.tags = {}
      book.status = 'non-tag'
      book.url = null
      await this.saveBook(book)
    },
    saveBook (book) {
      return ipcRenderer.invoke('save-book', _.cloneDeep(book))
    },
    async switchMark (book) {
      book.mark = !book.mark
      await this.saveBook(book)
    },
    isChineseTranslatedManga (book) {
      return _.includes(book?.tags?.language, 'chinese') ? true : false
    },
    copyTagClipboard (book) {
      ipcRenderer.invoke('copy-text-to-clipboard', JSON.stringify(_.pick(book, ['tags', 'status', 'category'])))
    },
    async pasteTagClipboard (book) {
      const text = await ipcRenderer.invoke('read-text-from-clipboard')
      _.assign(book, JSON.parse(text))
      await this.saveBook(book)
    },
    filterFolderMethod (node, keyword) {
      if (!keyword) return true
      const label = node.text || node.label || ''
      return label.toLowerCase().includes(keyword.toLowerCase())
    },
    async loadLibraryList () {
      try {
        const libraries = await ipcRenderer.invoke('get-libraries')
        console.log('loadLibraryList result:', libraries)
        this.libraryList = libraries || []
        return this.libraryList
      } catch (e) {
        console.error('loadLibraryList error:', e)
        this.libraryList = []
        return []
      }
    },
    async addLibrary (library) {
      const result = await ipcRenderer.invoke('add-library', _.cloneDeep(library))
      if (result.success && result.library) {
        this.libraryList = [...this.libraryList, result.library]
      }
      return result
    },
    async updateLibrary (library) {
      const result = await ipcRenderer.invoke('update-library', _.cloneDeep(library))
      if (result.success) {
        this.libraryList = this.libraryList.map(l => 
          l.id === library.id ? { ...l, ...library } : l
        )
      }
      return result
    },
    async deleteLibrary (libraryId) {
      const result = await ipcRenderer.invoke('delete-library', libraryId)
      if (result.success) {
        this.libraryList = this.libraryList.filter(l => l.id !== libraryId)
      }
      return result
    },
    // PAGINATION: Load paged book list from backend
    async loadBookListPaged (page = 1) {
      try {
        this.pagination.page = page
        // IMPORTANT: Clone pagination values to avoid DataCloneError with Vue 3 Proxy objects
        const paginationParams = JSON.parse(JSON.stringify({
          page: this.pagination.page,
          pageSize: this.pagination.pageSize,
          sortField: this.pagination.sortField,
          sortOrder: this.pagination.sortOrder,
          filters: this.pagination.filters
        }))
        const result = await ipcRenderer.invoke('load-book-list-paged', paginationParams)
        
        if (result && result.data) {
          // Prepare book list (add pageDiff flag)
          result.data.forEach(book => {
            if (Number.isInteger(book.filecount) && Number.isInteger(book.pageCount) && Math.abs(book.filecount - book.pageCount) > 5) {
              book.pageDiff = true
            }
          })
          
          this.bookList = result.data
          this.displayBookList = result.data
          this.totalBookCount = result.total
          
          console.log(`Loaded page ${result.page}/${result.totalPages}, total: ${result.total}`)
        }
        return result
      } catch (e) {
        console.error('loadBookListPaged error:', e)
        return { data: [], total: 0, page: 1, pageSize: this.pagination.pageSize, totalPages: 0 }
      }
    },
    // PAGINATION: Update pagination settings
    setPagination (options) {
      if (options.page !== undefined) this.pagination.page = options.page
      if (options.pageSize !== undefined) this.pagination.pageSize = options.pageSize
      if (options.sortField !== undefined) this.pagination.sortField = options.sortField
      if (options.sortOrder !== undefined) this.pagination.sortOrder = options.sortOrder
      if (options.filters !== undefined) this.pagination.filters = options.filters
    },
    // PAGINATION: Get total book count
    async getBookCount (filters = {}) {
      try {
        return await ipcRenderer.invoke('get-book-count', filters)
      } catch (e) {
        console.error('getBookCount error:', e)
        return 0
      }
    },
  }
})