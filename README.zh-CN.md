# picgo-plugin-obs

华为云 OBS 上传插件，适用于 PicGo Core CLI 与 PicGo Electron GUI。

## 功能

- 使用 `esdk-obs-nodejs` 上传到华为云 OBS。
- 支持 PicGo CLI 和 GUI 的 uploader `config()` 配置。
- 兼容新版 `uploader.华为云.configList` 配置结构。
- 兼容旧版 `picBed.obs` 配置结构。
- 支持基础目录、日期目录、自定义域名、HTTPS 链接、ACL、存储类别。
- 开启 `allowAnyFile` 后可上传非图片文件，例如 mp4、pptx、pdf、zip、docx、xlsx。
- 根据文件后缀自动识别 MIME，并向 OBS 传递 `ContentType`。
- 支持 OBS 分片上传，适合大文件和超过 5GB 的本地文件。
- 大文件上传前会写日志并弹出提示。
- 内置 GitHub Actions：CI、mock 上传测试、手动 OBS 真传测试、npm 发布。

## 安装

```bash
picgo install obs
```

插件开发调试：

```bash
npm install
picgo add ./path/to/picgo-plugin-obs
```

## CLI 使用

```bash
picgo use uploader obs
picgo set uploader obs
picgo upload ./demo.png
picgo upload ./demo.mp4
picgo upload ./demo.pptx
```

调试当前配置：

```bash
picgo obs-config-json
```

## PicGo 配置示例

不要提交真实 AK/SK。

```json
{
  "uploader": {
    "华为云": {
      "configList": [
        {
          "accessKeyId": "<YOUR_ACCESS_KEY_ID>",
          "secretAccessKey": "<YOUR_SECRET_ACCESS_KEY>",
          "server": "obs.cn-north-4.myhuaweicloud.com",
          "bucket": "huqi-blog",
          "path": "",
          "datePath": "YYYY/MM/DD",
          "customDomain": "",
          "forceHttps": true,
          "acl": "",
          "storageClass": "",
          "keepFileName": true,
          "allowAnyFile": true,
          "largeFileWarningSize": "100MB",
          "enableMultipartUpload": true,
          "multipartThreshold": "100MB",
          "multipartPartSize": "100MB",
          "multipartConcurrency": 3,
          "_id": "default",
          "_configName": "Default"
        }
      ],
      "defaultId": "default"
    }
  }
}
```

旧版 PicGo 配置也支持：

```json
{
  "picBed": {
    "current": "obs",
    "obs": {
      "accessKeyId": "<YOUR_ACCESS_KEY_ID>",
      "secretAccessKey": "<YOUR_SECRET_ACCESS_KEY>",
      "server": "obs.cn-north-4.myhuaweicloud.com",
      "bucket": "huqi-blog",
      "path": "",
      "datePath": "YYYY/MM/DD",
      "customDomain": "",
      "forceHttps": true,
      "acl": "",
      "storageClass": "",
      "keepFileName": true,
      "allowAnyFile": true,
      "largeFileWarningSize": "100MB",
      "enableMultipartUpload": true,
      "multipartThreshold": "100MB",
      "multipartPartSize": "100MB",
      "multipartConcurrency": 3
    }
  }
}
```

## 上传行为

| 文件大小 / 来源 | 上传方式 |
| --- | --- |
| 小于 `multipartThreshold` 的普通文件 | `putObject` |
| 本地文件大于等于 `multipartThreshold` 且 `enableMultipartUpload=true` | OBS 分片上传 |
| 本地文件超过 5GB | 必须使用 OBS 分片上传 |
| Buffer/base64 超过 5GB | 拒绝上传，因为本插件的分片上传依赖本地 `SourceFile` |

## 分片上传配置

- `enableMultipartUpload`：是否启用 OBS 分片上传，建议开启。
- `multipartThreshold`：超过该大小后自动切换到分片上传，默认 `100MB`。
- `multipartPartSize`：单个分片大小，默认 `100MB`，插件会限制在 5MB 到 5GB。
- `multipartConcurrency`：分片并发数，默认 `3`，网络不稳定时建议调小。

插件内部流程：

```text
initiateMultipartUpload
  -> uploadPart by Offset + PartSize + SourceFile
  -> completeMultipartUpload
  -> if failed, abortMultipartUpload
```

## MIME / Content-Type

插件会根据文件名或路径识别 MIME，并传递给 OBS：

```text
.png  -> image/png
.mp4  -> video/mp4
.pdf  -> application/pdf
.pptx -> application/vnd.openxmlformats-officedocument.presentationml.presentation
.zip  -> application/zip
```

## URL 生成

未配置自定义域名：

```text
https://<bucket>.<endpoint>/<path>/<datePath>/<filename>
```

配置自定义域名：

```text
https://<customDomain>/<path>/<datePath>/<filename>
```

## 预览行为

PicGo GUI 主要通过 `imgUrl` 预览图片。本插件上传成功后会同时设置：

```js
item.url = finalUrl
item.imgUrl = finalUrl
```

图片可以在 PicGo GUI 中预览。mp4、pptx、pdf、zip 等非图片文件主要用于复制链接；浏览器是否可预览取决于文件类型、`ContentType`、桶权限、自定义域名和浏览器支持。

## GitHub Actions

本项目包含三条 workflow：

```text
.github/workflows/ci.yml
.github/workflows/obs-upload-manual.yml
.github/workflows/publish.yml
```

真实 OBS 上传测试只通过 `workflow_dispatch` 手动触发，不会在 PR/push 自动运行。需要在 GitHub Secrets 中配置 `OBS_ACCESS_KEY_ID`、`OBS_SECRET_ACCESS_KEY`、`OBS_SERVER`、`OBS_BUCKET`。

`publish.yml` 只在推送 `v*` tag 时运行，推荐在 npm 后台配置 Trusted Publishing，使用 GitHub Actions OIDC 发布，避免长期 npm token。

## 安全

如果 AK/SK 曾经粘贴到聊天、issue、README、日志或 GitHub Actions 输出里，请立即在华为云 IAM/OBS 里轮换。不要把真实 AK/SK 写入仓库。
