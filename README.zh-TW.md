# picgo-plugin-obs

華為雲 OBS 上傳外掛，適用於 PicGo Core CLI 與 PicGo Electron GUI。

## 功能

- 使用 `esdk-obs-nodejs` 上傳到華為雲 OBS。
- 支援 PicGo CLI 和 GUI 的 uploader `config()` 設定。
- 相容新版 `uploader.華為雲.configList` 設定結構。
- 相容舊版 `picBed.obs` 設定結構。
- 支援基礎目錄、日期目錄、自訂網域、HTTPS 連結、ACL、儲存類別。
- 開啟 `allowAnyFile` 後可上傳非圖片檔案，例如 mp4、pptx、pdf、zip、docx、xlsx。
- 根據副檔名自動辨識 MIME，並向 OBS 傳遞 `ContentType`。
- 支援 OBS 分段上傳，適合大型本機檔案和超過 5GB 的檔案。
- 大檔案上傳前會寫入日誌並彈出提示。
- 內建 GitHub Actions：CI、mock 上傳測試、手動 OBS 真實上傳測試、npm 發布。

## 安裝

```bash
picgo install obs
```

本機開發：

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

查看目前設定：

```bash
picgo obs-config-json
```

## PicGo 設定範例

請勿提交真實 AK/SK。

```json
{
  "uploader": {
    "華為雲": {
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

舊版 PicGo 設定也支援 `picBed.obs`。

## 上傳行為

| 檔案大小 / 來源 | 上傳方式 |
| --- | --- |
| 小於 `multipartThreshold` 的一般檔案 | `putObject` |
| 本機檔案大於等於 `multipartThreshold` 且 `enableMultipartUpload=true` | OBS 分段上傳 |
| 本機檔案超過 5GB | 必須使用 OBS 分段上傳 |
| Buffer/base64 超過 5GB | 拒絕上傳，因為本外掛的分段上傳依賴本機 `SourceFile` |

## 分段上傳設定

- `enableMultipartUpload`：是否啟用 OBS 分段上傳，建議開啟。
- `multipartThreshold`：超過該大小後自動切換到分段上傳，預設 `100MB`。
- `multipartPartSize`：單個分段大小，預設 `100MB`，外掛會限制在 5MB 到 5GB。
- `multipartConcurrency`：分段併發數，預設 `3`，網路不穩定時建議調小。

內部流程：

```text
initiateMultipartUpload
  -> uploadPart by Offset + PartSize + SourceFile
  -> completeMultipartUpload
  -> if failed, abortMultipartUpload
```

## MIME / Content-Type

外掛會根據檔名或路徑辨識 MIME，並傳遞給 OBS：

```text
.png  -> image/png
.mp4  -> video/mp4
.pdf  -> application/pdf
.pptx -> application/vnd.openxmlformats-officedocument.presentationml.presentation
.zip  -> application/zip
```

## URL 生成

未設定自訂網域：

```text
https://<bucket>.<endpoint>/<path>/<datePath>/<filename>
```

設定自訂網域：

```text
https://<customDomain>/<path>/<datePath>/<filename>
```

## 預覽行為

PicGo GUI 主要透過 `imgUrl` 預覽圖片。本外掛上傳成功後會同時設定：

```js
item.url = finalUrl
item.imgUrl = finalUrl
```

圖片可以在 PicGo GUI 中預覽。mp4、pptx、pdf、zip 等非圖片檔案主要用於複製連結；瀏覽器是否可預覽取決於檔案類型、`ContentType`、桶權限、自訂網域和瀏覽器支援。

## GitHub Actions

本專案包含 CI、手動 OBS 真實上傳測試、npm 發布流程。真實 OBS 上傳測試只透過 `workflow_dispatch` 手動觸發，需要 GitHub Secrets：`OBS_ACCESS_KEY_ID`、`OBS_SECRET_ACCESS_KEY`、`OBS_SERVER`、`OBS_BUCKET`。

`publish.yml` 只在推送 `v*` tag 時執行。建議在 npm 後台設定 Trusted Publishing，使用 GitHub Actions OIDC 發布，避免長期 npm token。

## 安全

如果 AK/SK 曾經貼到聊天、issue、README、日誌或 GitHub Actions 輸出中，請立即在華為雲 IAM/OBS 輪換。不要把真實 AK/SK 寫入倉庫。
