'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')

const calls = []
let failUploadPart = false

class MockObsClient {
  constructor (options) {
    this.options = options
    calls.push({ action: 'constructor', options })
  }

  putObject (params, cb) {
    calls.push({ action: 'putObject', params })
    cb(null, { CommonMsg: { Status: 200 }, InterfaceResult: {} })
  }

  initiateMultipartUpload (params, cb) {
    calls.push({ action: 'initiateMultipartUpload', params })
    cb(null, { CommonMsg: { Status: 200 }, InterfaceResult: { UploadId: 'upload-id-1' } })
  }

  uploadPart (params, cb) {
    calls.push({ action: 'uploadPart', params })
    if (failUploadPart) {
      cb(null, { CommonMsg: { Status: 500, Message: 'mock uploadPart failed' } })
      return
    }
    cb(null, { CommonMsg: { Status: 200 }, InterfaceResult: { ETag: `etag-${params.PartNumber}` } })
  }

  completeMultipartUpload (params, cb) {
    calls.push({ action: 'completeMultipartUpload', params })
    cb(null, { CommonMsg: { Status: 200 }, InterfaceResult: {} })
  }

  abortMultipartUpload (params, cb) {
    calls.push({ action: 'abortMultipartUpload', params })
    cb(null, { CommonMsg: { Status: 204 }, InterfaceResult: {} })
  }

  close () {
    calls.push({ action: 'close' })
  }
}

const originalLoad = Module._load
Module._load = function patchedLoad (request, parent, isMain) {
  if (request === 'esdk-obs-nodejs') return MockObsClient
  return originalLoad.call(this, request, parent, isMain)
}

const pluginFactory = require('../index')

function resetCalls () {
  calls.length = 0
  failUploadPart = false
}

function tmpFile (name, content = 'hello') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'picgo-plugin-obs-'))
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

function makeCtx ({ config, output }) {
  let uploader = null
  const notifications = []
  const logs = []
  return {
    ctx: {
      output,
      getConfig (key) {
        if (key === 'uploader.华为云') {
          return {
            configList: [{ _id: 'default', _configName: 'Default', ...config }],
            defaultId: 'default'
          }
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
        info: msg => logs.push(['info', msg]),
        warn: msg => logs.push(['warn', msg])
      },
      emit (event, payload) {
        notifications.push({ event, payload })
      }
    },
    getUploader: () => uploader,
    notifications,
    logs
  }
}

const baseConfig = {
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  server: 'obs.cn-north-4.myhuaweicloud.com',
  bucket: 'bucket',
  path: 'assets',
  datePath: '',
  forceHttps: true,
  allowAnyFile: true,
  enableMultipartUpload: true,
  multipartThreshold: '100MB',
  multipartPartSize: '100MB',
  multipartConcurrency: 2
}

async function uploadWithConfig (config, output) {
  const wrapper = makeCtx({ config: { ...baseConfig, ...config }, output })
  const plugin = pluginFactory(wrapper.ctx)
  plugin.register()
  await wrapper.getUploader().handle(wrapper.ctx)
  return wrapper
}

async function testImagePutObject () {
  resetCalls()
  const filePath = tmpFile('demo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const wrapper = await uploadWithConfig({}, [{ path: filePath, fileName: 'demo.png' }])
  assert(calls.some(call => call.action === 'putObject'), 'image should use putObject')
  assert.strictEqual(wrapper.ctx.output[0].contentType, 'image/png')
  assert(wrapper.ctx.output[0].url.includes('https://bucket.obs.cn-north-4.myhuaweicloud.com/assets/demo.png'))
  assert.strictEqual(wrapper.ctx.output[0].imgUrl, wrapper.ctx.output[0].url)
}

async function testNonImageBlocked () {
  resetCalls()
  const filePath = tmpFile('slides.pptx', 'pptx')
  await assert.rejects(
    () => uploadWithConfig({ allowAnyFile: false }, [{ path: filePath, fileName: 'slides.pptx' }]),
    /当前仅允许上传图片/
  )
}

async function testNonImageAllowedAndMime () {
  resetCalls()
  const filePath = tmpFile('slides.pptx', 'pptx')
  const wrapper = await uploadWithConfig({ allowAnyFile: true }, [{ path: filePath, fileName: 'slides.pptx' }])
  assert(calls.some(call => call.action === 'putObject'), 'pptx should upload through putObject when below threshold')
  assert.strictEqual(wrapper.ctx.output[0].contentType, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
}

async function testMultipartUpload () {
  resetCalls()
  const filePath = tmpFile('video.mp4', 'video')
  const wrapper = await uploadWithConfig({ multipartThreshold: '1B', multipartPartSize: '5MB' }, [{ path: filePath, fileName: 'video.mp4' }])
  assert(calls.some(call => call.action === 'initiateMultipartUpload'), 'should initiate multipart upload')
  assert(calls.some(call => call.action === 'uploadPart'), 'should upload parts')
  assert(calls.some(call => call.action === 'completeMultipartUpload'), 'should complete multipart upload')
  assert.strictEqual(wrapper.ctx.output[0].contentType, 'video/mp4')
}

async function testMultipartAbortOnFailure () {
  resetCalls()
  failUploadPart = true
  const filePath = tmpFile('broken.mp4', 'video')
  await assert.rejects(
    () => uploadWithConfig({ multipartThreshold: '1B', multipartPartSize: '5MB' }, [{ path: filePath, fileName: 'broken.mp4' }]),
    /uploadPart failed/
  )
  assert(calls.some(call => call.action === 'abortMultipartUpload'), 'should abort failed multipart upload')
}

async function main () {
  await testImagePutObject()
  await testNonImageBlocked()
  await testNonImageAllowedAndMime()
  await testMultipartUpload()
  await testMultipartAbortOnFailure()
  console.log('mock-upload.test.js passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
