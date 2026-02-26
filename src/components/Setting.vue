<template>
  <el-dialog v-model="dialogVisibleSetting"
    width="65em"
    :modal="false"
    append-to-body
    top="60px"
    class="setting-dialog"
  >
    <template #header><p class="setting-title">{{$t('m.setting')}}</p></template>
    <div class="setting-layout">
      <div class="setting-sidebar">
        <el-menu
          :default-active="activeSettingPanel"
          @select="(key) => activeSettingPanel = key"
          class="setting-menu"
        >
          <el-menu-item index="general">
            <span>{{$t('m.general')}}</span>
          </el-menu-item>
          <el-menu-item index="internalViewer">
            <span>{{$t('m.internalViewer')}}</span>
          </el-menu-item>
          <el-menu-item index="collectTag">
            <span>{{$t('m.collectTag')}}</span>
          </el-menu-item>
          <el-menu-item index="advanced">
            <span>{{$t('m.advanced')}}</span>
          </el-menu-item>
          <el-menu-item index="accelerator">
            <span>{{$t('m.accelerator')}}</span>
          </el-menu-item>
          <el-menu-item index="about">
            <span>{{$t('m.about')}}</span>
          </el-menu-item>
        </el-menu>
      </div>
      <div class="setting-content">
        <div v-show="activeSettingPanel === 'general'" class="setting-panel">
          <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line library-management">
              <div class="library-header">
                <span class="setting-label">{{$t('m.libraryManagement')}}</span>
                <el-button type="primary" plain size="small" @click="openAddLibraryDialog">{{$t('m.addLibrary')}}</el-button>
              </div>
              <el-table :data="libraryList" size="small" style="width: 100%" v-if="libraryList.length > 0">
                <el-table-column prop="name" :label="$t('m.libraryName')" min-width="100" />
                <el-table-column prop="path" :label="$t('m.libraryPath')" min-width="200" show-overflow-tooltip />
                <el-table-column :label="$t('m.scanOptions')" min-width="100">
                  <template #default="{ row }">
                    <el-tag v-if="row.scanCbx" size="small" type="info" style="margin-right: 4px;">CBZ</el-tag>
                    <el-tag v-if="row.scanPdf" size="small" type="info">PDF</el-tag>
                  </template>
                </el-table-column>
                <el-table-column :label="$t('m.enabled')" width="80">
                  <template #default="{ row }">
                    <el-switch 
                      v-model="row.enabled" 
                      @change="handleLibraryEnabledChange(row)"
                      active-color="#13ce66"
                      inactive-color="#ff4949"
                    />
                  </template>
                </el-table-column>
                <el-table-column :label="$t('m.action')" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="openEditLibraryDialog(row)">{{$t('m.edit')}}</el-button>
                    <el-button link type="danger" @click="handleDeleteLibrary(row)">{{$t('m.delete')}}</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="no-library-tip">
                {{$t('m.noLibraryTip')}}
              </div>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.metadataPath" :placeholder="$t('m.metadataPathDefault')">
                <template #prepend><span class="setting-label">{{$t('m.metadataPath')}}</span></template>
                <template #append><el-button @click="selectMetadataPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.hitomiDataPath">
                <template #prepend><span class="setting-label">{{$t('m.hitomiDataPath')}}</span></template>
                <template #append><el-button @click="selectHitomiDataPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.imageExplorer" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.imageViewer')}}</span></template>
                <template #append><el-button @click="selectImageExplorerPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.theme')}}</span></template>
                <el-select placeholder=" " v-model="setting.theme" @change="handleThemeChange">
                  <el-option label="Default Dark" value="dark"></el-option>
                  <el-option label="Default Light" value="light"></el-option>
                  <el-option label="ExHentai" value="dark exhentai"></el-option>
                  <el-option label="E-Hentai" value="light e-hentai"></el-option>
                  <el-option label="nHentai" value="dark nhentai"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.igneous" @change="saveSetting">
                <template #prepend><span class="setting-label">igneous</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_pass_hash" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_pass_hash</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_member_id" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_member_id</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.star" @change="saveSetting">
                <template #prepend><span class="setting-label">star</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.proxy" @change="saveSetting" :placeholder="$t('m.like') + ' http://127.0.0.1:7890'">
                <template #prepend><span class="setting-label">{{$t('m.proxy')}}</span></template>
                <template #append><el-button @click="testProxy">{{$t('m.test')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
        </el-row>
        </div>
        <div v-show="activeSettingPanel === 'internalViewer'" class="setting-panel">
          <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend>
                  <span class="setting-label">{{$t('m.viewerType')}}</span>
                </template>
                <el-select placeholder=" " v-model="setting.viewerType" @change="saveSetting">
                  <el-option :label="$t('m.originalViewer')" value="original"></el-option>
                  <el-option label="ComicRead" value="comicread"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.thumbnailColumn" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.thumbnailColumn')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.widthLimit" :placeholder="$t('m.widthLimitInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.widthLimit')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.hidePageNumber"
              :active-text="$t('m.hidePageNumber')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.keepReadingProgress"
              :active-text="$t('m.keepReadingProgress')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.reverseLeftRight"
              :active-text="$t('m.reverseLeftRight')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.autoNextManga"
              :active-text="$t('m.autoNextManga')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.defaultInsertEmptyPage"
              :active-text="$t('m.defaultInsertEmptyPage')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        </div>
        <div v-show="activeSettingPanel === 'collectTag'" class="setting-panel">
          <el-row :gutter="8">
          <el-col :span="24" class="setting-line collect-tag">
            <draggable
              v-model="setting.collectTag"
              item-key="id"
              animation="200"
              @change="saveSetting"
            >
              <template #item="{element}">
                <el-tag :color="element.color" effect="dark" closable @close="removeTag(element.id)">
                  {{element.letter}}:{{resolvedTranslation[element.tag]?.name || element.tag}}
                </el-tag>
              </template>
            </draggable>
          </el-col>
          <el-col :span="24" class="setting-line collect-tag">
            <el-form :inline="true" :model="formTagAdd" :show-message="false">
              <el-form-item :label="$t('m.tag')">
                <el-select-v2
                  v-model="formTagAdd.tag"
                  filterable clearable :height="340"
                  style="width: 500px"
                  :options="tagListForCollect"
                ></el-select-v2>
              </el-form-item>
              <el-form-item :label="$t('m.tagColor')">
                <el-color-picker v-model="formTagAdd.color" show-alpha :predefine="moderateSoftColors"/>
              </el-form-item>
              <el-form-item>
                <el-button plain @click="addTagToCollect">{{$t('m.addTag')}}</el-button>
              </el-form-item>
            </el-form>
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.showCollectTag"
              :active-text="$t('m.showCollectTag')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        </div>
        <div v-show="activeSettingPanel === 'advanced'" class="setting-panel">
          <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.language')}}</span></template>
                <el-select placeholder=" " v-model="setting.language" @change="handleLanguageChange(setting.language)">
                  <el-option :label="$t('m.systemDefault')" value="default"></el-option>
                  <el-option label="zh-CN" value="zh-CN"></el-option>
                  <el-option label="zh-TW" value="zh-TW"></el-option>
                  <el-option label="en-US" value="en-US"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.directEnter')}}</span></template>
                <el-select placeholder=" " v-model="setting.directEnter" @change="saveSetting">
                  <el-option :label="$t('m.detailPage')" value="detail"></el-option>
                  <el-option :label="$t('m.internalViewer')" value="internalViewer"></el-option>
                  <el-option :label="$t('m.externalViewer')" value="externalViewer"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.displayTitle')}}</span></template>
                <el-select :placeholder="$t('m.displayTitleInfo')" v-model="setting.displayTitle" @change="saveSetting">
                  <el-option :label="$t('m.englishTitle')" value="englishTitle"></el-option>
                  <el-option :label="$t('m.japaneseTitle')" value="japaneseTitle"></el-option>
                  <el-option :label="$t('m.filename')" value="filename"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.displayMode')}}</span></template>
                <el-select v-model="setting.displayMode" @change="saveSetting">
                  <el-option :label="$t('m.cardMode')" value="card"></el-option>
                  <el-option :label="$t('m.compactMode')" value="compact"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.defaultScraper')}}</span></template>
                <el-select v-model="setting.defaultScraper" @change="saveSetting">
                  <el-option v-for="searchType in searchTypeList" :key="searchType.value" :label="searchType.label" :value="searchType.value" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.requireGap" :placeholder="$t('m.requireGapInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.requestGap')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px">
              <template #prepend>{{$t('m.customOptions')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customOptions" :placeholder="$t('m.customOptionsPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.trimTitleRegExp" :placeholder="$t('m.trimTitleRegExpInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.trimTitleRegExp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.searchKeySuffix" :placeholder="$t('m.searchKeySuffixInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.searchKeySuffix')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.excludeFile" :placeholder="$t('m.excludeFileInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.excludeFile')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.folderTreeWidth" :placeholder="$t('m.folderTreeWidthInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.folderTreeWidth')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px" appendWidth="0">
              <template #prepend>{{$t('m.customCss')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customCss" :placeholder="$t('m.customCssPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
              <template #append>
                <el-button text :icon="MdRefresh" @click="reloadWindow"></el-button>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="4">
            <div class="setting-line">
              <el-popconfirm
                placement="top-start"
                :title="$t('m.rebuildWarning')"
                @confirm="forceGeneBookList"
              >
                <template #reference>
                  <el-button class="function-button" plain>{{$t('m.rebuildLibrary')}}</el-button>
                </template>
              </el-popconfirm>
            </div>
          </el-col>
          <el-col :span="5">
            <div class="setting-line">
              <el-popconfirm
                placement="top-start"
                :title="$t('m.patchWarning')"
                @confirm="patchLocalMetadata"
              >
                <template #reference>
                  <el-button class="function-button" type="primary" plain>{{$t('m.patchLocalMetadata')}}</el-button>
                </template>
              </el-popconfirm>
            </div>
          </el-col>
          <el-col :span="5">
            <div class="setting-line">
              <el-button class="function-button" type="primary" plain @click="exportDatabase">{{$t('m.exportMetadata')}}</el-button>
            </div>
          </el-col>
          <el-col :span="5">
            <div class="setting-line">
              <el-button class="function-button" type="primary" plain @click="importDatabase">{{$t('m.importMetadata')}}</el-button>
            </div>
          </el-col>
          <el-col :span="5">
            <div class="setting-line">
              <el-button class="function-button" type="primary" plain @click="importMetadataFromSqlite">{{$t('m.importMetadataFromSqlite')}}</el-button>
            </div>
          </el-col>
          <el-col :span="5">
            <div class="setting-line">
              <el-button class="function-button" type="success" plain @click="importMetadataFromHitomi">{{$t('m.importMetadataFromHitomi')}}</el-button>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.loadOnStart"
              :active-text="$t('m.onStartScan')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.startOnLogin"
              :active-text="$t('m.startOnLogin')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.autoCheckUpdates"
              :active-text="$t('m.autoCheckUpdates')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.enabledLANBrowsing"
              :active-text="$t('m.enabledLANBrowsing')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.batchTagfailedBook"
              :active-text="$t('m.batchTagfailedBook')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.onlyGetMetadataOfSelectedFolder"
              :active-text="$t('m.onlyGetMetadataOfSelectedFolder')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.showComment"
              :active-text="$t('m.showComment')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.showTranslation"
              :active-text="$t('m.tagTranslate')"
              @change="handleTranslationSettingChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.skipDeleteConfirm"
              :active-text="$t('m.skipDeleteConfirm')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.disableRandomTag"
              :active-text="$t('m.disableRandomTag')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeOnStart"
              :active-text="$t('m.minimizeOnStart')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeToTray"
              :active-text="$t('m.minimizeToTray')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <el-row :gutter="8" style="margin-top: 16px;">
          <el-col :span="24">
            <div class="setting-line blocked-artists-section">
              <div class="blocked-artists-header">
                <span class="setting-label">{{$t('m.blockedArtists')}}</span>
              </div>
              <p class="blocked-artists-info">{{$t('m.blockedArtistsInfo')}}</p>
              <div v-if="setting.blockedArtists && setting.blockedArtists.length > 0" class="blocked-artists-list">
                <el-tag
                  v-for="artist in setting.blockedArtists"
                  :key="artist"
                  closable
                  type="danger"
                  class="blocked-artist-tag"
                  @close="unblockArtist(artist)"
                >
                  {{ artist }}
                </el-tag>
              </div>
              <div v-else class="no-blocked-artists">
                {{$t('m.noBlockedArtists')}}
              </div>
            </div>
          </el-col>
        </el-row>
        </div>
        <div v-show="activeSettingPanel === 'accelerator'" class="setting-panel">
          <el-descriptions
          :column="2" size="small" style="margin-top: 16px;"
          v-for="group in acceleratorInfo" :key="group.group"
          :title="$t(`ac.${group.group}`)"
        >
          <el-descriptions-item v-for="(value, key) in group.accelerators" :key="value" width="22em">
            <template #label><span style="display: inline-block; min-width: 10em;">{{ $t(`ac.${group.group}_${key}`) }}</span></template>
            <el-tag>{{ value }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>
        </div>
        <div v-show="activeSettingPanel === 'about'" class="setting-panel">
          <el-descriptions :column="1">
          <el-descriptions-item :label="$t('m.appName')+':'">exhentai-manga-manager</el-descriptions-item>
          <el-descriptions-item :label="$t('m.version')+':'">
            <a href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager/releases')">{{version}}</a>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('m.appPage')+':'">
            <a href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager')">github</a>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('m.help')+':'">
            <a v-if="['zh-CN', 'zh-TW'].includes($i18n.locale)" href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/中文说明')">github wiki</a>
            <a v-else href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/English-Instruction')">github wiki</a>
          </el-descriptions-item>
          <el-descriptions-item :label="$t('m.donation')+':'">
            <a v-if="['zh-CN', 'zh-TW'].includes($i18n.locale)" href="#" @click="openLink('https://afdian.com/a/SeldonHorizon')">爱发电</a>
            <a v-else href="#" @click="openLink('https://www.buymeacoffee.com/schneehertz')">buy me a coffee</a>
          </el-descriptions-item>
        </el-descriptions>
        <img src="/icon.png" class="about-logo">
        <el-row>
          <el-col :span="4" :offset="10">
            <div class="setting-line">
              <el-button class="function-button" type="primary" plain @click="autoCheckUpdates(true)">{{$t('m.checkUpdates')}}</el-button>
            </div>
          </el-col>
        </el-row>
        </div>
      </div>
    </div>
  </el-dialog>

  <el-dialog v-model="dialogVisibleLibrary" :title="libraryDialogTitle" width="500px">
    <el-form :model="libraryForm" label-width="100px">
      <el-form-item :label="$t('m.libraryName')">
        <el-input v-model="libraryForm.name" />
      </el-form-item>
      <el-form-item :label="$t('m.libraryPath')">
        <el-input v-model="libraryForm.path">
          <template #append>
            <el-button @click="selectLibraryFolder">{{$t('m.select')}}</el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item :label="$t('m.scanOptions')">
        <el-checkbox v-model="libraryForm.scanCbx">CBZ</el-checkbox>
        <el-checkbox v-model="libraryForm.scanPdf">PDF</el-checkbox>
      </el-form-item>
      <el-form-item :label="$t('m.enabled')">
        <el-switch v-model="libraryForm.enabled" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisibleLibrary = false">{{$t('m.cancel')}}</el-button>
      <el-button type="primary" @click="saveLibrary">{{$t('m.save')}}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, h, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { MdRefresh } from '@vicons/ionicons4'

import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import zhTw  from 'element-plus/dist/locale/zh-tw.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import { version } from '../../package.json'
import { gh_token } from '../../secret_key.json'
import { acceleratorInfo } from '../utils.js'
import NameFormItem from './NameFormItem.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const ipcRenderer = window.ipcRenderer || { invoke: () => Promise.resolve(), on: () => {} }
const appStore = useAppStore()
const { searchTypeList, setting, bookList, resolvedTranslation, localeFile, tagListRaw, libraryList } = storeToRefs(appStore)
const { printMessage } = appStore

const { t, locale } = useI18n()

const emit = defineEmits([
  'loadBookList',
  'loadCollectionList',
])

const dialogVisibleLibrary = ref(false)
const libraryDialogTitle = ref('')
const libraryForm = ref({
  name: '',
  path: '',
  scanCbx: true,
  scanPdf: false,
  enabled: true
})

const openAddLibraryDialog = () => {
  libraryDialogTitle.value = t('m.addLibrary')
  libraryForm.value = {
    name: '',
    path: '',
    scanCbx: true,
    scanPdf: false,
    enabled: true
  }
  dialogVisibleLibrary.value = true
}

const openEditLibraryDialog = (library) => {
  libraryDialogTitle.value = t('m.editLibrary')
  libraryForm.value = { ...library }
  dialogVisibleLibrary.value = true
}

const selectLibraryFolder = async () => {
  const res = await ipcRenderer.invoke('select-folder', t('m.libraryPath'))
  if (res) {
    libraryForm.value.path = res
  }
}

const saveLibrary = async () => {
  if (!libraryForm.value.name || !libraryForm.value.path) {
    printMessage('warning', t('m.libraryNamePathRequired'))
    return
  }
  let result
  if (libraryForm.value.id) {
    result = await appStore.updateLibrary(libraryForm.value)
  } else {
    result = await appStore.addLibrary(libraryForm.value)
  }
  if (result.success) {
    printMessage('success', libraryForm.value.id ? t('m.libraryUpdated') : t('m.libraryAdded'))
    dialogVisibleLibrary.value = false
  } else {
    printMessage('error', result.message || t('m.libraryOperationFailed'))
  }
}

const handleLibraryEnabledChange = async (library) => {
  const newEnabled = library.enabled
  const result = await appStore.updateLibrary(library)
  if (result.success) {
    printMessage('success', newEnabled ? t('m.libraryEnabled') : t('m.libraryDisabled'))
  } else {
    printMessage('error', result.message || t('m.libraryOperationFailed'))
  }
}

const handleDeleteLibrary = async (library) => {
  try {
    await ElMessageBox.confirm(
      t('m.confirmDeleteLibrary', { name: library.name }),
      t('m.warning'),
      { confirmButtonText: t('m.confirm'), cancelButtonText: t('m.cancel'), type: 'warning' }
    )
    const result = await appStore.deleteLibrary(library.id)
    if (result.success) {
      printMessage('success', t('m.libraryDeleted'))
    } else {
      printMessage('error', result.message || t('m.libraryOperationFailed'))
    }
  } catch (e) {
    printMessage('info', t('m.canceled'))
  }
}

onMounted(() => {
  appStore.loadLibraryList()
  ipcRenderer.invoke('load-setting')
    .then(async (res) => {
      setting.value = res

      // set default value
      if (res.autoCheckUpdates === undefined) setting.value.autoCheckUpdates = true
      if (res.trimTitleRegExp === undefined) setting.value.trimTitleRegExp = '^\\d+[-]?\\s*|\\s*(\\[[^\\]]*\\]|\\([^\\)]*\\)|【[^】]*】|（[^）]*）)\\s*'
      if (res.defaultScraper === undefined) setting.value.defaultScraper = 'exhentai'
      if (res.defaultInsertEmptyPage === undefined) setting.value.defaultInsertEmptyPage = true
      if (res.viewerType === undefined) setting.value.viewerType = 'original'
      saveSetting()

      // default action
      if (res.theme) changeTheme(res.theme)
      await handleLanguageSet(res.language)
      if (res.showTranslation) loadTranslationFromEhTagTranslation()
      if (res.autoCheckUpdates) autoCheckUpdates(false)
      if (res.enabledLANBrowsing) ipcRenderer.invoke('enable-LAN-browsing')
      if (res.customCss) electronFunction['insert-css'](res.customCss)
    })
})

const selectLibraryPath = () => {
  ipcRenderer.invoke('select-folder', t('m.library'))
  .then(res => {
    if (res) {
      setting.value.library = res
      saveSetting()
    }
  })
}

const selectMetadataPath = () => {
  ipcRenderer.invoke('select-folder', t('m.metadataPath'))
  .then(res => {
    setting.value.metadataPath = res
    saveSetting()
  })
}

const selectHitomiDataPath = () => {
  ipcRenderer.invoke('select-folder', t('m.hitomiDataPath'))
  .then(res => {
    setting.value.hitomiDataPath = res
    saveSetting()
  })
}

const selectImageExplorerPath = () => {
  ipcRenderer.invoke('select-file', t('m.imageViewer'))
  .then(res => {
    if (res) {
      setting.value.imageExplorer = `"${res}"`
      saveSetting()
    }
  })
}

const loadTranslationFromEhTagTranslation = async () => {
  const resultObject = {}
  const translationCache = JSON.parse(localStorage.getItem('translationCache') || "{}")
  resolvedTranslation.value = translationCache
  ipcRenderer.invoke('update-tag-translation', translationCache)
  await fetch('https://github.com/EhTagTranslation/Database/releases/latest/download/db.text.json')
  .then(res => res.json())
  .then(res => {
    const sourceTranslationDatabase = res.data
    _.forIn(sourceTranslationDatabase, cat => {
      _.forIn(cat.data, (value, key) => {
        resultObject[key] = _.pick(value, ['name', 'intro'])
      })
    })
    resolvedTranslation.value = resultObject
    ipcRenderer.invoke('update-tag-translation', resultObject)
    localStorage.setItem('translationCache', JSON.stringify(resultObject))
  })
  .catch((error) => {
    console.log(error)
    printMessage('warning', t('c.useTranslationCache'))
  })
}

const handleTranslationSettingChange = (val) => {
  if (val) {
    loadTranslationFromEhTagTranslation()
  } else {
    resolvedTranslation.value =  {}
  }
  saveSetting()
}

const testProxy = async () => {
  await fetch('https://e-hentai.org')
  .then((res) => {
    if (res.status === 200) {
      printMessage('success', t('c.proxyWorking'))
    } else {
      printMessage('error', `Error ${res.status}: ` + t('c.proxyNotWorking'))
    }
  })
  .catch((error) => {
    printMessage('error', t('c.proxyNotWorking'))
  })
}

const autoCheckUpdates = async (forceShowDialog) => {
  await fetch('https://api.github.com/repos/SchneeHertz/exhentai-manga-manager/releases/latest', {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + gh_token,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  .then(res => res.json())
  .then(res => {
    const { tag_name, html_url, body } = res
    const skipVersion = localStorage.getItem('skipVersion')
    if (tag_name && tag_name !== 'v' + version && tag_name !== skipVersion) {
      ElMessageBox.confirm(
        h('pre', { innerHTML: body, style: 'font-family: Avenir, Helvetica, Arial, sans-serif; text-wrap: balance;' }),
        t('c.newVersion') + tag_name,
        {
          distinguishCancelAndClose: true,
          confirmButtonText: t('c.downloadUpdate'),
          cancelButtonText: t('c.skipVersion')
        }
      )
      .then(() => {
        ipcRenderer.invoke('open-url', html_url)
      })
      .catch((action) => {
        if (action === 'cancel') {
          localStorage.setItem('skipVersion', tag_name)
        }
      })
    } else if (forceShowDialog) {
      ElMessageBox.confirm(
        t('c.notNewVersion'),
        {
          type: 'info',
          showCancelButton: false
        }
      )
    }
  })
}

const handleThemeChange = (val) => {
  changeTheme(val)
  saveSetting()
}

const changeTheme = (classValue) => {
  document.documentElement.setAttribute('class', classValue)
}

const handleLanguageChange = async (languageCode) => {
  await handleLanguageSet(languageCode)
  saveSetting()
}

const handleLanguageSet = async (languageCode) => {
  if (!languageCode || (languageCode === 'default')) {
    languageCode = await ipcRenderer.invoke('get-locale')
  }
  switch (languageCode) {
    case 'zh-CN':
      localeFile.value = zhCn
      locale.value = 'zh-CN'
      break
    case 'zh-TW':
      localeFile.value = zhTw
      locale.value = 'zh-TW'
      break
    case 'en-US':
    default:
      localeFile.value = en
      locale.value = 'en-US'
      break
  }
}

const saveSetting = () => {
  ipcRenderer.invoke('save-setting', _.cloneDeep(setting.value))
}

const unblockArtist = (artist) => {
  if (setting.value.blockedArtists) {
    const index = setting.value.blockedArtists.indexOf(artist)
    if (index > -1) {
      setting.value.blockedArtists.splice(index, 1)
      saveSetting()
    }
  }
}

const openLink = (link) => {
  ipcRenderer.invoke('open-url', link)
}

const forceGeneBookList = async () => {
  dialogVisibleSetting.value = false
  localStorage.setItem('viewerReadingProgress', JSON.stringify([]))
  bookList.value = await ipcRenderer.invoke('force-gene-book-list')
  emit('loadCollectionList')
  printMessage('success', t('c.rebuildMessage'))
}
const patchLocalMetadata = async () => {
  await ipcRenderer.invoke('patch-local-metadata')
  emit('loadBookList')
}


const exportDatabase = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('c.exportFolder'))
  const result = await ipcRenderer.invoke('export-database', folder)
  if (result) printMessage('success', t('c.exportMessage'))
}

const importDatabase = async () => {
  const collectionListPath = await ipcRenderer.invoke('select-file', t('c.selectCollectionList'), [{name: 'JSON', extensions: ['json']}])
  const metadataSqlitePath = await ipcRenderer.invoke('select-file', t('c.selectMetadataSqlite'), [{name: 'SQLite', extensions: ['sqlite']}])
  await ipcRenderer.invoke('import-database', {collectionListPath, metadataSqlitePath})
}

const importMetadataFromSqlite = async () => {
  const {success, bList} = await ipcRenderer.invoke('import-sqlite', _.cloneDeep(bookList.value))
  if (success) {
    bookList.value = bList
    printMessage('success', t('c.importMessage'))
  } else {
    printMessage('info', t('c.canceled'))
  }
}

const importMetadataFromHitomi = async () => {
  const {success, matchedCount, bookList: updatedBookList, message} = await ipcRenderer.invoke('import-from-hitomi', _.cloneDeep(bookList.value))
  if (success) {
    bookList.value = updatedBookList
    printMessage('success', `从 Hitomi 导入完成，匹配 ${matchedCount} 本漫画`)
  } else {
    printMessage('info', message || t('c.canceled'))
  }
}

const formTagAdd = ref({
  tag: null,
  color: '#42A5F5'
})

const tagListForCollect = computed(() => {
  if (setting.value.showTranslation) {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      const labelHeader = cat === 'group' ? '团队' : resolvedTranslation.value[cat]?.name || cat
      const labelTail = resolvedTranslation.value[tag]?.name || tag
      return {
        label: `${labelHeader}:${labelTail} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  } else {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      return {
        label: `${cat}:${tag} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  }
})

const moderateSoftColors = [
  '#FF6F61', // 略微柔和但鲜艳的珊瑚红
  '#F48FB1', // 鲜明的粉红色
  '#42A5F5', // 鲜艳的蓝色
  '#66BB6A', // 鲜艳的绿色
  '#FFCA28', // 亮黄色
  '#AB47BC', // 鲜亮的紫色
  '#26A69A', // 热带青色
  '#FFA726', // 鲜亮的橙色
  '#8D6E63', // 保存自然的棕色
  '#78909C'  // 鲜明的灰蓝色
]

const addTagToCollect = () => {
  const tag = tagListRaw.value.find(tag => tag.id === formTagAdd.value.tag)
  if (!setting.value.collectTag) setting.value.collectTag = []
  setting.value.collectTag.push({
    id: tag.id,
    letter: tag.letter,
    cat: tag.cat,
    tag: tag.tag,
    color: formTagAdd.value.color
  })
  setting.value.collectTag = _.uniqBy(setting.value.collectTag, 'id')
  formTagAdd.value.tag = null
  saveSetting()
}

const removeTag = (id) => {
  setting.value.collectTag = setting.value.collectTag.filter(tag => tag.id !== id)
  saveSetting()
}

const reloadWindow = () => {
  window.location.reload()
}

const dialogVisibleSetting = ref(false)
const activeSettingPanel = ref('general')

defineExpose({
  dialogVisibleSetting,
  activeSettingPanel,
  saveSetting
})

</script>

<style lang="stylus">
.setting-title
  margin:0
  text-align: center
.setting-line
  margin: 6px 0
  .el-input-group__prepend
    width: 110px
.setting-line.regexp
  .el-input__inner
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace
.setting-line.collect-tag
  .el-form-item
    margin-bottom: 0
  .el-tag
    margin-right: 8px
    margin-bottom: 8px
    border-width: 0
.blocked-artists-section
  margin-top: 12px
.blocked-artists-header
  margin-bottom: 8px
.blocked-artists-info
  color: var(--el-text-color-secondary)
  font-size: 12px
  margin: 0 0 12px 0
.blocked-artists-list
  display: flex
  flex-wrap: wrap
  gap: 8px
.blocked-artist-tag
  margin: 0
.no-blocked-artists
  color: var(--el-text-color-placeholder)
  font-size: 13px
.setting-switch
  text-align: left
  margin-top: 6px
.label-input>.el-input__wrapper
  display: none
.label-input
  .el-input-group__append
    width: calc(100% - 140px)
    padding: 0
    background-color: transparent
    border-left: solid 1px var(--el-border-color)
    .el-select
      width: 100%
.about-logo
  width: 160px
  position: absolute
  right: 40px
  top: 10px

.setting-layout
  display: flex
  min-height: 60vh
  max-height: 75vh
.setting-sidebar
  width: 140px
  flex-shrink: 0
  border-right: 1px solid var(--el-border-color)
  margin-right: 16px
.setting-menu
  border-right: none
  background: transparent
.setting-menu .el-menu-item
  height: 40px
  line-height: 40px
.setting-menu .el-menu-item.is-active
  background-color: var(--el-color-primary-light-9)
.setting-content
  flex: 1
  overflow-y: auto
  padding-right: 10px
.setting-panel
  min-height: 100%
</style>