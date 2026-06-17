'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const pluginFactory = require('../index')

function requireEnv (name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function makeTestFile () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picgo-obs-smoke-'))
  const filePath = path.join(dir, `smoke-${Date.now()}.txt`)
  fs.writeFileSync(filePath, `picgo-plugin-obs smoke test ${new Date().toISOString()}\n`)
  return filePath
}

async function main () {
  const filePath = makeTestFile()
  let uploader = null
  const config = {
    accessKeyId: requireEnv('OBS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('OBS_SECRET_ACCESS_KEY'),
    server: requireEnv('OBS_SERVER'),
    bucket: requireEnv('OBS_BUCKET'),
    path: process.env.OBS_TEST_PATH || 'picgo-plugin-obs-ci',
    datePath: 'YYYY/MM/DD',
    customDomain: process.env.OBS_CUSTOM_DOMAIN || '',
    forceHttps: process.env.OBS_FORCE_HTTPS !== 'false',
    acl: process.env.OBS_ACL || '',
    storageClass: process.env.OBS_STORAGE_CLASS || '',
    allowAnyFile: true,
    enableMultipartUpload: true,
    multipartThreshold: process.env.OBS_MULTIPART_THRESHOLD || '100MB',
    multipartPartSize: process.env.OBS_MULTIPART_PART_SIZE || '100MB',
    multipartConcurrency: Number(process.env.OBS_MULTIPART_CONCURRENCY || 3)
  }

  const ctx = {
    output: [{ path: filePath, fileName: path.basename(filePath) }],
    getConfig (key) {
      if (key === 'uploader.华为云') {
        return { configList: [{ _id: 'ci', _configName: 'CI', ...config }], defaultId: 'ci' }
      }
      return undefined
    },
    helper: {
      uploader: {
        register (id, value) {
          uploader = value
        }
      }
    },
    log: {
      info: msg => console.log(msg),
      warn: msg => console.warn(msg)
    },
    emit (event, payload) {
      console.log(`[${event}] ${payload.title}: ${payload.body || payload.text || ''}`)
    }
  }

  const plugin = pluginFactory(ctx)
  plugin.register()
  if (!uploader) throw new Error('Uploader was not registered')
  await uploader.handle(ctx)
  console.log(`OBS smoke upload succeeded: ${ctx.output[0].url}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
