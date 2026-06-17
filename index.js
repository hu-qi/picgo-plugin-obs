'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const mime = require('mime-types')
const dayjs = require('dayjs')
const ObsClient = require('esdk-obs-nodejs')

const UPLOADER_ID = 'obs'
const DISPLAY_NAME = '华为云 OBS'
const CONFIG_GROUP_NAME = '华为云'

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB
const TB = 1024 * GB
const PUT_OBJECT_MAX_SIZE = 5 * GB
const OBS_MULTIPART_MAX_SIZE = Math.floor(48.8 * TB)
const DEFAULT_LARGE_FILE_WARNING_SIZE = 100 * MB
const DEFAULT_MULTIPART_THRESHOLD = 100 * MB
const DEFAULT_MULTIPART_PART_SIZE = 100 * MB
const DEFAULT_MULTIPART_CONCURRENCY = 3
const MIN_PART_SIZE = 5 * MB
const MAX_PART_SIZE = 5 * GB

function trimSlash (value) {
  return String(value || '').replace(/^\/+|\/+$/g, '')
}

function normalizeEndpoint (server = '') {
  return String(server).trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function getProtocol (config) {
  return config.forceHttps === false ? 'http' : 'https'
}

function safeEncodeKey (key) {
  return String(key).split('/').map(part => encodeURIComponent(part)).join('/')
}

function getExtFromFile (item) {
  if (item.extname) return item.extname.startsWith('.') ? item.extname : `.${item.extname}`
  const fromFileName = path.extname(item.fileName || '')
  if (fromFileName) return fromFileName
  const fromPath = path.extname(item.path || '')
  return fromPath || '.png'
}

function randomName (item) {
  const ext = getExtFromFile(item)
  const base = (item.fileName || item.name || '').replace(/\.[^.]+$/, '')
  const safeBase = base ? base.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') : ''
  return `${safeBase || dayjs().format('HHmmssSSS')}-${crypto.randomBytes(4).toString('hex')}${ext}`
}

function buildObjectKey (item, config) {
  const parts = []
  const basePath = trimSlash(config.path)
  const datePath = trimSlash(config.datePath)
  if (basePath) parts.push(basePath)
  if (datePath) parts.push(dayjs().format(datePath))
  const fileName = config.keepFileName === false ? randomName(item) : (item.fileName || randomName(item))
  parts.push(fileName.replace(/^\/+/, ''))
  return parts.filter(Boolean).join('/')
}

function buildUrl (key, config) {
  const protocol = getProtocol(config)
  const encodedKey = safeEncodeKey(key)
  const customDomain = trimSlash(config.customDomain)
  if (customDomain) return `${protocol}://${customDomain.replace(/^https?:\/\//, '')}/${encodedKey}`
  return `${protocol}://${config.bucket}.${normalizeEndpoint(config.server)}/${encodedKey}`
}

function pickActiveConfigFromNewPicGo (ctx) {
  const uploaderConfig = ctx.getConfig(`uploader.${CONFIG_GROUP_NAME}`)
  if (!uploaderConfig || !Array.isArray(uploaderConfig.configList)) return null
  return uploaderConfig.configList.find(item => item._id === uploaderConfig.defaultId) || uploaderConfig.configList[0] || null
}

function pickActiveConfigFromLegacyPicGo (ctx) {
  return ctx.getConfig(`picBed.${UPLOADER_ID}`) || ctx.getConfig(`picBed.${CONFIG_GROUP_NAME}`) || null
}

function parseBoolean (value, defaultValue = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false
  }
  return defaultValue
}

function parsePositiveInteger (value, defaultValue) {
  const parsed = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function parseSize (value, defaultValue) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  if (typeof value !== 'string') return defaultValue
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|k|mb|m|gb|g|tb|t)?$/i)
  if (!match) return defaultValue
  const amount = Number.parseFloat(match[1])
  const unit = (match[2] || 'b').toLowerCase()
  const multiplier = { b: 1, kb: KB, k: KB, mb: MB, m: MB, gb: GB, g: GB, tb: TB, t: TB }[unit] || 1
  return Math.floor(amount * multiplier)
}

function formatSize (bytes) {
  if (!Number.isFinite(bytes)) return 'unknown'
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)}TB`
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)}GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)}MB`
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)}KB`
  return `${bytes}B`
}

function getConfig (ctx) {
  const config = pickActiveConfigFromNewPicGo(ctx) || pickActiveConfigFromLegacyPicGo(ctx) || {}
  const multipartPartSize = Math.min(MAX_PART_SIZE, Math.max(MIN_PART_SIZE, parseSize(config.multipartPartSize, DEFAULT_MULTIPART_PART_SIZE)))
  return {
    accessKeyId: config.accessKeyId || config.ak || '',
    secretAccessKey: config.secretAccessKey || config.sk || '',
    server: normalizeEndpoint(config.server || config.endpoint || ''),
    bucket: config.bucket || '',
    path: config.path || '',
    datePath: config.datePath || '',
    customDomain: config.customDomain || '',
    forceHttps: config.forceHttps !== false,
    acl: config.acl || '',
    storageClass: config.storageClass || '',
    keepFileName: config.keepFileName !== false,
    allowAnyFile: parseBoolean(config.allowAnyFile, false),
    largeFileWarningSize: parseSize(config.largeFileWarningSize, DEFAULT_LARGE_FILE_WARNING_SIZE),
    enableMultipartUpload: parseBoolean(config.enableMultipartUpload, true),
    multipartThreshold: parseSize(config.multipartThreshold, DEFAULT_MULTIPART_THRESHOLD),
    multipartPartSize,
    multipartConcurrency: Math.max(1, Math.min(20, parsePositiveInteger(config.multipartConcurrency, DEFAULT_MULTIPART_CONCURRENCY)))
  }
}

function validateConfig (config) {
  const missing = []
  if (!config.accessKeyId) missing.push('accessKeyId')
  if (!config.secretAccessKey) missing.push('secretAccessKey')
  if (!config.server) missing.push('server')
  if (!config.bucket) missing.push('bucket')
  if (missing.length) throw new Error(`Huawei OBS config missing: ${missing.join(', ')}`)
}

function stripDataUrlPrefix (value) {
  const text = String(value || '').trim()
  const matched = text.match(/^data:([^;,]+)?(;charset=[^;,]+)?;base64,(.*)$/is)
  return matched ? matched[3].replace(/\s/g, '') : text.replace(/\s/g, '')
}

function bufferFromUnknown (value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  if (Array.isArray(value)) return Buffer.from(value)
  return null
}

function bufferFromBase64Like (value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value))
  if (typeof value !== 'string') return null
  return Buffer.from(stripDataUrlPrefix(value), 'base64')
}

function isLikelyDataUrl (value) {
  return typeof value === 'string' && /^data:[^;,]+(?:;charset=[^;,]+)?;base64,/i.test(value.trim())
}

function getUploadSource (item) {
  if (item.path && fs.existsSync(item.path)) {
    const stat = fs.statSync(item.path)
    return { type: 'file', SourceFile: item.path, size: stat.size }
  }

  const bodyFromBuffer = bufferFromUnknown(item.buffer)
  if (bodyFromBuffer) return { type: 'body', Body: bodyFromBuffer, size: bodyFromBuffer.length }

  const bodyFromBase64Image = bufferFromBase64Like(item.base64Image)
  if (bodyFromBase64Image) return { type: 'body', Body: bodyFromBase64Image, size: bodyFromBase64Image.length }

  if (isLikelyDataUrl(item.imgUrl)) {
    const bodyFromImgUrl = bufferFromBase64Like(item.imgUrl)
    if (bodyFromImgUrl) return { type: 'body', Body: bodyFromImgUrl, size: bodyFromImgUrl.length }
  }

  throw new Error(`Cannot find upload source for ${item.fileName || item.path || 'unknown file'}`)
}

function getUploadBody (source) {
  return source.type === 'file' ? { SourceFile: source.SourceFile } : { Body: source.Body }
}

function checkObsResponse (result, action) {
  const status = Number(result && result.CommonMsg && result.CommonMsg.Status)
  if (status >= 200 && status < 300) return result
  const message = result && result.CommonMsg ? JSON.stringify(result.CommonMsg) : 'Unknown OBS response'
  throw new Error(`OBS ${action} failed: ${message}`)
}

function obsRequest (client, action, params) {
  return new Promise((resolve, reject) => {
    const method = client[action]
    if (typeof method !== 'function') return reject(new Error(`OBS SDK method not found: ${action}`))
    let settled = false
    const done = (err, result) => {
      if (settled) return
      settled = true
      if (err) return reject(err)
      try { resolve(checkObsResponse(result, action)) } catch (error) { reject(error) }
    }
    try {
      const maybePromise = method.call(client, params, done)
      if (maybePromise && typeof maybePromise.then === 'function') maybePromise.then(result => done(null, result)).catch(done)
    } catch (error) {
      done(error)
    }
  })
}

function logInfo (ctx, message) {
  if (ctx.log && typeof ctx.log.info === 'function') ctx.log.info(message)
}

function logWarn (ctx, message) {
  if (ctx.log && typeof ctx.log.warn === 'function') ctx.log.warn(message)
  else if (ctx.log && typeof ctx.log.warning === 'function') ctx.log.warning(message)
}

function notify (ctx, title, message) {
  if (typeof ctx.emit === 'function') ctx.emit('notification', { title, body: message, text: message })
}

function isImageContentType (contentType) {
  return /^image\//i.test(contentType || '')
}

function buildBaseObjectParams (config, key, contentType) {
  const params = { Bucket: config.bucket, Key: key, ContentType: contentType }
  if (config.acl) params.ACL = config.acl
  if (config.storageClass) params.StorageClass = config.storageClass
  return params
}

function buildPartParams ({ bucket, key, uploadId, filePath, fileSize, partSize }) {
  const partCount = Math.ceil(fileSize / partSize)
  const uploadPartParams = []
  for (let i = 0; i < partCount; i++) {
    const Offset = i * partSize
    uploadPartParams.push({ Bucket: bucket, Key: key, PartNumber: i + 1, UploadId: uploadId, Offset, SourceFile: filePath, PartSize: Math.min(partSize, fileSize - Offset) })
  }
  return uploadPartParams
}

async function runWithConcurrency (items, limit, handler) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker () {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await handler(items[currentIndex], currentIndex)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function multipartUpload (client, ctx, options) {
  const { Bucket, Key, ContentType, ACL, StorageClass, SourceFile, fileSize, partSize, concurrency } = options
  let uploadId = ''
  const initParams = { Bucket, Key, ContentType }
  if (ACL) initParams.ACL = ACL
  if (StorageClass) initParams.StorageClass = StorageClass

  try {
    const initResult = await obsRequest(client, 'initiateMultipartUpload', initParams)
    uploadId = initResult.InterfaceResult && initResult.InterfaceResult.UploadId
    if (!uploadId) throw new Error('OBS initiateMultipartUpload did not return UploadId')
    const uploadPartParams = buildPartParams({ bucket: Bucket, key: Key, uploadId, filePath: SourceFile, fileSize, partSize })
    let uploadedSize = 0
    let uploadedCount = 0
    logInfo(ctx, `[OBS] multipart upload started: ${Key}, size=${formatSize(fileSize)}, parts=${uploadPartParams.length}, partSize=${formatSize(partSize)}, concurrency=${concurrency}`)
    const parts = await runWithConcurrency(uploadPartParams, concurrency, async (partParam) => {
      const result = await obsRequest(client, 'uploadPart', partParam)
      uploadedSize += partParam.PartSize
      uploadedCount += 1
      logInfo(ctx, `[OBS] multipart progress: ${uploadedCount}/${uploadPartParams.length}, ${((uploadedSize / fileSize) * 100).toFixed(2)}%, part=${partParam.PartNumber}`)
      const etag = result.InterfaceResult && result.InterfaceResult.ETag
      if (!etag) throw new Error(`OBS uploadPart did not return ETag for part ${partParam.PartNumber}`)
      return { PartNumber: partParam.PartNumber, ETag: etag }
    })
    await obsRequest(client, 'completeMultipartUpload', { Bucket, Key, UploadId: uploadId, Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) })
    logInfo(ctx, `[OBS] multipart upload completed: ${Key}`)
  } catch (error) {
    if (uploadId) {
      try {
        await obsRequest(client, 'abortMultipartUpload', { Bucket, Key, UploadId: uploadId })
        logWarn(ctx, `[OBS] multipart upload aborted: ${Key}`)
      } catch (abortError) {
        logWarn(ctx, `[OBS] abortMultipartUpload failed: ${abortError.message || String(abortError)}`)
      }
    }
    throw error
  }
}

async function uploadItem (client, ctx, item, config) {
  const key = buildObjectKey(item, config)
  const contentType = mime.lookup(item.fileName || item.path || key) || 'application/octet-stream'
  const isImage = isImageContentType(contentType)
  if (!isImage && !config.allowAnyFile) throw new Error(`当前仅允许上传图片。如需上传 ${path.extname(item.fileName || item.path || key) || '非图片'} 文件，请开启 allowAnyFile。`)

  const source = getUploadSource(item)
  const fileSize = source.size
  const baseParams = buildBaseObjectParams(config, key, contentType)
  if (fileSize > OBS_MULTIPART_MAX_SIZE) throw new Error(`文件过大：${formatSize(fileSize)}。OBS 分片上传单对象最大约 48.8TB。`)
  if (fileSize >= config.largeFileWarningSize) {
    const msg = `大文件上传提示：${item.fileName || item.path || key} 大小为 ${formatSize(fileSize)}，上传可能较慢。`
    logWarn(ctx, `[OBS] ${msg}`)
    notify(ctx, 'Huawei OBS 大文件上传', msg)
  }

  const shouldUseMultipart = source.type === 'file' && config.enableMultipartUpload && (fileSize > PUT_OBJECT_MAX_SIZE || fileSize >= config.multipartThreshold)
  if (fileSize > PUT_OBJECT_MAX_SIZE && !shouldUseMultipart) throw new Error(`putObject 单次上传不支持超过 5GB，当前文件 ${formatSize(fileSize)}，请开启 enableMultipartUpload。`)

  if (shouldUseMultipart) await multipartUpload(client, ctx, { ...baseParams, SourceFile: source.SourceFile, fileSize, partSize: config.multipartPartSize, concurrency: config.multipartConcurrency })
  else await obsRequest(client, 'putObject', { ...baseParams, ...getUploadBody(source) })

  const url = buildUrl(key, config)
  item.url = url
  item.imgUrl = url
  item.contentType = contentType
  item.fileSize = fileSize
  return item
}

const uploader = {
  async handle (ctx) {
    const config = getConfig(ctx)
    validateConfig(config)
    const client = new ObsClient({ access_key_id: config.accessKeyId, secret_access_key: config.secretAccessKey, server: config.server })
    try {
      const output = ctx.output || []
      for (const item of output) await uploadItem(client, ctx, item, config)
      ctx.output = output
      return ctx
    } catch (err) {
      notify(ctx, 'Huawei OBS Upload Error', err && err.message ? err.message : String(err))
      throw err
    } finally {
      if (typeof client.close === 'function') {
        try { client.close() } catch (_) {}
      }
    }
  },

  config (ctx) {
    const old = getConfig(ctx)
    return [
      { name: 'accessKeyId', type: 'input', required: true, message: 'AccessKeyId', default: old.accessKeyId },
      { name: 'secretAccessKey', type: 'password', required: true, message: 'SecretAccessKey', default: old.secretAccessKey },
      { name: 'server', type: 'input', required: true, message: 'OBS Endpoint，例如 obs.cn-north-4.myhuaweicloud.com', default: old.server || 'obs.cn-north-4.myhuaweicloud.com' },
      { name: 'bucket', type: 'input', required: true, message: 'Bucket', default: old.bucket },
      { name: 'path', type: 'input', required: false, message: '基础目录，例如 images/blog；可留空', default: old.path },
      { name: 'datePath', type: 'input', required: false, message: '日期目录，dayjs 格式，例如 YYYY/MM/DD；可留空', default: old.datePath || 'YYYY/MM/DD' },
      { name: 'customDomain', type: 'input', required: false, message: '自定义域名，例如 cdn.example.com；可留空', default: old.customDomain },
      { name: 'forceHttps', type: 'confirm', required: false, message: '生成 HTTPS 链接', default: old.forceHttps !== false },
      { name: 'acl', type: 'list', required: false, message: '对象 ACL，可留空使用桶默认策略', choices: ['', 'public-read', 'private'], default: old.acl || '' },
      { name: 'storageClass', type: 'list', required: false, message: '存储类别，可留空使用桶默认类别', choices: ['', 'STANDARD', 'WARM', 'COLD'], default: old.storageClass || '' },
      { name: 'keepFileName', type: 'confirm', required: false, message: '保留原始文件名', default: old.keepFileName !== false },
      { name: 'allowAnyFile', type: 'confirm', required: false, message: '允许上传非图片文件，例如 mp4、pptx、pdf、zip', default: old.allowAnyFile === true },
      { name: 'largeFileWarningSize', type: 'input', required: false, message: '大文件提示阈值，例如 100MB、1GB', default: formatSize(old.largeFileWarningSize || DEFAULT_LARGE_FILE_WARNING_SIZE) },
      { name: 'enableMultipartUpload', type: 'confirm', required: false, message: '启用 OBS 分片上传，超过阈值或超过 5GB 时自动使用', default: old.enableMultipartUpload !== false },
      { name: 'multipartThreshold', type: 'input', required: false, message: '分片上传阈值，例如 100MB、1GB；超过 5GB 强制分片', default: formatSize(old.multipartThreshold || DEFAULT_MULTIPART_THRESHOLD) },
      { name: 'multipartPartSize', type: 'input', required: false, message: '单个分片大小，例如 50MB、100MB；范围建议 5MB 到 5GB', default: formatSize(old.multipartPartSize || DEFAULT_MULTIPART_PART_SIZE) },
      { name: 'multipartConcurrency', type: 'input', required: false, message: '分片并发数，建议 3，网络不稳定时调小', default: String(old.multipartConcurrency || DEFAULT_MULTIPART_CONCURRENCY) }
    ]
  }
}

function registerCliCommand (ctx) {
  if (!ctx.cmd || !ctx.cmd.program || !ctx.cmd.register) return
  ctx.cmd.register('obs-config-json', {
    handle: () => {
      const config = getConfig(ctx)
      console.log(JSON.stringify({ ...config, accessKeyId: config.accessKeyId ? `${config.accessKeyId.slice(0, 4)}***` : '', secretAccessKey: config.secretAccessKey ? '***' : '', largeFileWarningSize: formatSize(config.largeFileWarningSize), multipartThreshold: formatSize(config.multipartThreshold), multipartPartSize: formatSize(config.multipartPartSize) }, null, 2))
    }
  })
}

const guiMenu = ctx => [
  {
    label: '检查华为云 OBS 配置',
    async handle (ctx, guiApi) {
      try {
        const config = getConfig(ctx)
        validateConfig(config)
        await guiApi.showMessageBox({ type: 'info', title: DISPLAY_NAME, message: `配置可用：bucket=${config.bucket}, endpoint=${config.server}, multipart=${config.enableMultipartUpload ? 'on' : 'off'}, threshold=${formatSize(config.multipartThreshold)}` })
      } catch (err) {
        await guiApi.showMessageBox({ type: 'error', title: `${DISPLAY_NAME} 配置错误`, message: err.message || String(err) })
      }
    }
  }
]

module.exports = ctx => {
  const register = () => {
    ctx.helper.uploader.register(UPLOADER_ID, uploader)
    registerCliCommand(ctx)
  }
  return { register, uploader: UPLOADER_ID, guiMenu }
}
