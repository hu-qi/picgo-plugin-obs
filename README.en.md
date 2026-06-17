# picgo-plugin-obs

Huawei Cloud OBS uploader plugin for PicGo Core CLI and PicGo Electron GUI.

## Features

- Uploads to Huawei Cloud OBS through `esdk-obs-nodejs`.
- Supports PicGo CLI and GUI uploader `config()`.
- Compatible with the newer `uploader.华为云.configList` configuration style.
- Compatible with legacy `picBed.obs` configuration.
- Supports base path, date path, custom domain, HTTPS URLs, ACL, and storage class.
- Supports non-image files when `allowAnyFile` is enabled, such as mp4, pptx, pdf, zip, docx, and xlsx.
- Detects MIME type from file extension and passes `ContentType` to OBS.
- Supports OBS multipart upload for large local files and files larger than 5GB.
- Logs and notifies before uploading large files.
- Includes GitHub Actions workflows for CI, mock tests, manual OBS smoke upload, and npm publishing.

## Installation

```bash
picgo install obs
```

For local development:

```bash
npm install
picgo add ./path/to/picgo-plugin-obs
```

## CLI usage

```bash
picgo use uploader obs
picgo set uploader obs
picgo upload ./demo.png
picgo upload ./demo.mp4
picgo upload ./demo.pptx
```

Debug current configuration:

```bash
picgo obs-config-json
```

## PicGo configuration example

Do not commit real AK/SK values.

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

Legacy PicGo configuration is also supported.

## Upload behavior

| File size / source | Upload method |
| --- | --- |
| Normal files below `multipartThreshold` | `putObject` |
| Local files >= `multipartThreshold` and `enableMultipartUpload=true` | OBS multipart upload |
| Local files larger than 5GB | OBS multipart upload is required |
| Buffer/base64 files larger than 5GB | Rejected, because multipart upload relies on local `SourceFile` |

## Multipart upload options

- `enableMultipartUpload`: enables OBS multipart upload. Recommended: `true`.
- `multipartThreshold`: switches to multipart upload above this size. Default: `100MB`.
- `multipartPartSize`: size of each part. Default: `100MB`. The plugin clamps it to 5MB-5GB.
- `multipartConcurrency`: number of concurrent part uploads. Default: `3`. Lower it if your network is unstable.

Internal flow:

```text
initiateMultipartUpload
  -> uploadPart by Offset + PartSize + SourceFile
  -> completeMultipartUpload
  -> if failed, abortMultipartUpload
```

## MIME / Content-Type

The plugin detects MIME type from file name or path and passes it to OBS:

```text
.png  -> image/png
.mp4  -> video/mp4
.pdf  -> application/pdf
.pptx -> application/vnd.openxmlformats-officedocument.presentationml.presentation
.zip  -> application/zip
```

## URL generation

Without a custom domain:

```text
https://<bucket>.<endpoint>/<path>/<datePath>/<filename>
```

With a custom domain:

```text
https://<customDomain>/<path>/<datePath>/<filename>
```

## Preview behavior

PicGo GUI previews images through `imgUrl`. This plugin sets both values after a successful upload:

```js
item.url = finalUrl
item.imgUrl = finalUrl
```

Images can be previewed in PicGo GUI. Non-image files are mainly used as copied links; browser preview depends on file type, `ContentType`, bucket permissions, custom domain, and browser support.

## GitHub Actions

This project includes CI, manual OBS smoke upload, and npm publishing workflows. Real OBS upload tests are manually triggered through `workflow_dispatch` and require GitHub Secrets: `OBS_ACCESS_KEY_ID`, `OBS_SECRET_ACCESS_KEY`, `OBS_SERVER`, and `OBS_BUCKET`.

`publish.yml` runs only on `v*` tags. Trusted Publishing with GitHub Actions OIDC is recommended to avoid long-lived npm tokens.

## Security

If AK/SK values were ever pasted into chat, issues, README files, logs, or GitHub Actions output, rotate them immediately in Huawei Cloud IAM/OBS. Never commit real AK/SK values to the repository.
