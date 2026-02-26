const { Sequelize, DataTypes } = require('sequelize')
const { nanoid } = require('nanoid')

const prepareMangaModel = (databasePath) => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: databasePath,
    logging: false,
    // PERFORMANCE: Enable WAL mode for better concurrent read/write
    dialectOptions: {
      mode: require('sqlite3').OPEN_READWRITE | require('sqlite3').OPEN_CREATE
    }
  })
  
  // Enable WAL mode and optimize for 900k records
  sequelize.query('PRAGMA journal_mode=WAL;').catch(() => {})
  sequelize.query('PRAGMA synchronous=NORMAL;').catch(() => {})
  sequelize.query('PRAGMA cache_size=-256000;').catch(() => {}) // 256MB cache for 900k records
  sequelize.query('PRAGMA temp_store=MEMORY;').catch(() => {})
  sequelize.query('PRAGMA mmap_size=268435456;').catch(() => {}) // 256MB mmap
  
  const Manga = sequelize.define('Manga', {
    id: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true
    },
    title: DataTypes.TEXT,
    coverPath: DataTypes.TEXT,
    hash: DataTypes.TEXT,
    filepath: DataTypes.TEXT,
    type: DataTypes.TEXT,
    pageCount: DataTypes.INTEGER,
    bundleSize: DataTypes.INTEGER,
    mtime: DataTypes.TEXT,
    fileSize: DataTypes.BIGINT,
    coverHash: DataTypes.TEXT,
    status: DataTypes.TEXT,
    date: DataTypes.INTEGER,
    rating: DataTypes.FLOAT,
    tags: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    title_jpn: DataTypes.TEXT,
    filecount: DataTypes.INTEGER,
    posted: DataTypes.INTEGER,
    exFilesize: DataTypes.INTEGER,
    category: DataTypes.TEXT,
    url: DataTypes.TEXT,
    mark: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hiddenBook: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    exist: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    libraryId: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  })
  return Manga
}

const prepareMetadataModel = (databasePath) => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: databasePath,
    logging: false
  })
  const Metadata = sequelize.define('Metadata', {
    hash: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true
    },
    title: DataTypes.TEXT,
    status: DataTypes.TEXT,
    rating: DataTypes.FLOAT,
    tags: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    title_jpn: DataTypes.TEXT,
    filecount: DataTypes.INTEGER,
    posted: DataTypes.INTEGER,
    exFilesize: DataTypes.INTEGER,
    category: DataTypes.TEXT,
    url: DataTypes.TEXT,
    mark: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  })
  return Metadata
}

const prepareLibraryModel = (databasePath) => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: databasePath,
    logging: false
  })
  const Library = sequelize.define('Library', {
    id: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true,
      defaultValue: () => nanoid()
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    path: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    scanCbx: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    scanPdf: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    scanDirectoryExclusions: {
      type: DataTypes.JSON,
      defaultValue: []
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  })
  return Library
}

module.exports = {
  prepareMangaModel,
  prepareMetadataModel,
  prepareLibraryModel
}