# picgo-plugin-obs

华为云 OBS PicGo 上传插件，支持 PicGo Core CLI 和 PicGo Electron GUI。

## 文档 / Documentation

- [简体中文](./README.zh-CN.md)
- [English](./README.en.md)
- [繁體中文](./README.zh-TW.md)

## 快速特性

- 支持华为云 OBS `putObject` 普通上传。
- 支持 OBS 分片上传，适合大文件和超过 5GB 的本地文件。
- 支持 PicGo CLI / GUI 配置。
- 兼容新版 `uploader.华为云.configList` 和旧版 `picBed.obs` 配置。
- 支持图片、mp4、pptx、pdf、zip、docx 等文件上传。
- 自动识别 MIME / `ContentType`。
- 上传成功后写入 `item.url` 和 `item.imgUrl`，图片可在 PicGo GUI 中预览。
- 内置 GitHub Actions：CI、mock 上传测试、手动 OBS 真传测试、npm 发布。

## 安装

```bash
picgo install obs
```

本地开发：

```bash
npm install
picgo add ./path/to/picgo-plugin-obs
```

## 使用

```bash
picgo use uploader obs
picgo set uploader obs
picgo upload ./demo.png
picgo upload ./demo.mp4
picgo upload ./demo.pptx
```

## 安全提醒

不要把华为云 AK/SK 写进 README、issue、日志或 GitHub Actions workflow。真实上传测试请使用 GitHub Secrets；如果密钥已经泄露，请立即在华为云 IAM/OBS 里轮换。
