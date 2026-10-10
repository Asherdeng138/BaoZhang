# 随手报账 · Android 项目

**0.1.0 APK 已于 2026-10-10 成功编译并签名。** Java 单元测试、发票解析测试、Android lint、APK 签名和 16 KB ZIP/ELF 对齐检查已通过。尚未在 Android 16 真机/模拟器执行完整流程。

[下载构建产物](https://github.com/Asherdeng138/BaoZhang/actions/runs/38008637242)：登录 GitHub，在 Artifacts 中下载 `BaoZhang-Android16`，解压得到 `BaoZhang-0.1.0.apk`，传到手机并安装。若系统询问，请允许当前文件管理器安装此来源的应用。

## 已实现的功能

- 中文界面，金额固定为英镑，没有币种选择。
- 五类费用：市内交通（地铁）、市外交通、出差餐补、办公用品、客户招待。
- 先选择费用类别，再拍照或从本机相册/文件导入图片、PDF。
- 手机上的 OCR 识别文字，自动建议日期、实付金额、商家；允许人工修改。
- 核对后保存。照片/PDF 原件与信息存放在手机的应用私有目录。
- 日历按天查看票据：绿色出差、红色办公、蓝色休假，同时显示文字标签与发票张数。可以批量标记一段日期。
- 导出顺序：**先选择五类中的一类 → 日期范围 → 勾选发票**。
- 同时生成：一份合并发票 PDF、一份 Excel（发票明细 + 分类汇总）；明细包括日期、商家、所在地、金额、备注、附件数和 PDF 页码。
- 修改/删除发票、商家与备注搜索、草稿保存、重复原件提示、原件 ZIP 备份。

## 先看界面

双击 `BaoZhang-preview.html`，用电脑或手机浏览器查看。预览使用明确标注的模拟数据，可以点日历、分类、导出筛选和模拟导入。

**预览文件不是真实报账工具**：拍照、实际文字识别、原生保存和 PDF/Excel 导出只在安卓应用中执行。不要把真实票据录入预览文件。

## 在 Windows 上生成安装包

1. 把整个源码包解压到较短的路径，例如 `C:\BaoZhang`，不要直接在 ZIP 里运行。
2. 双击 `build.cmd`。
3. 阅读并接受 Android SDK 许可。首次运行会从官方来源下载 JDK、Gradle、Android SDK 和应用依赖，需要网络和数 GB 空间。
4. 构建脚本会运行 Java 单元测试、Android lint、编译、签名及 APK ZIP 对齐检查。
5. 成功后，安装包位于 `output/BaoZhang-0.1.0.apk`。
6. 将 APK 传到安卓手机，点击安装；如果系统询问，允许当前文件管理器安装此来源的应用。安装后先用测试发票检查流程。

脚本只将工具放入项目的 `.tools` 目录；不需要安装 Android Studio，也不会永久更改系统环境变量。下载源为 Eclipse Adoptium、Gradle、Google。若公司网络拦截这些下载，需要在可以正常访问这些源的网络上构建。

如果已经安装 Android Studio：打开项目目录，选择 JDK 17、安装 Android API 36 和 Build Tools 36.0.0，Gradle 使用 8.13。项目提供的 Windows 脚本会自动生成个人签名；手动在 Android Studio 构建时，请使用 Generate Signed APK 创建并保管自己的签名密钥。

## 日常使用

### 添加票据

“添加发票” → 五类费用选一类 → “拍照扫描”或“导入图片 / PDF” → 核对日期、金额、商家 → 可填写所在地与备注 → 勾选核对 → 保存。

本地导入会打开安卓系统文件选择器，可选择本机图片、相册提供的图片或 PDF。无需授予读取全部相册的权限，只读取你选择的文件。

多页的同一张发票可追加附件。不同的发票应分开创建记录。日期没有识别出来时会留空，不会自动用今天代替。

### 日历

点击具体日期查看当天全部类别的发票。通过“标记出差 / 办公 / 休假”设置一天或日期范围。日历状态与你的费用种类独立，例如出差当天可以同时保存地铁、餐补与客户招待发票。

### 导出

进入“导出”，先点“市内交通（地铁）/ 市外交通 / 出差餐补 / 办公用品 / 客户招待”之一，再选开始与结束日期，日期两端都包含。检查勾选项和合计金额，生成 PDF + Excel，随后保存到手机文件夹或分享。

PDF 顺序与 Excel 明细一致，按日期从早到晚排列。Excel 的“合并PDF页码”可以对应回具体原件。

### 备份与更新

设置里可以导出全部原件 ZIP，包含原始图片/PDF、信息和日历标记。当前版本尚未提供一键恢复；ZIP 可以解压后独立查看原件和 JSON 数据。

卸载应用、清除应用数据会删除本机数据；请先导出备份。后续覆盖更新必须使用同一签名密钥。Windows 首次构建会创建 `.tools/personal-release.p12` 和 `.tools/signing.properties`，请把这两个文件私下备份，不要上传公开仓库。

## 当前限制与待验收项目

- APK 已编译签名；**尚未在 Android 16 真机/模拟器执行**，未宣称完成真机验收。
- Android 编译和目标版本为 API 36；最低 Android 8.0，包含 arm64-v8a 和 x86_64 架构。
- OCR 使用内置的 ML Kit 拉丁文和中文模型，在设备上识别。发票照片需清楚；金额识别是规则提取候选值，不能保证准确，必须核对。
- 商家取候选文字，所在地由你手动填写。
- PDF OCR 读取前 3 页；导出包括所有页面。加密、损坏或系统无法渲染的 PDF 会提示错误。
- 合并 PDF 将原件页面转换为图像页，因此合并文件不保留原 PDF 的可搜索文字、表单、链接或数字签名；原始 PDF 仍完整保存，可从原件备份取回。
- 单个附件最多 50 MB、单个 PDF 最多 200 页、一张记录最多 30 个附件、一次导出最多 200 页。较大批次可能需要分批。
- 当前使用系统相机拍照，没有自动裁边和透视矫正。可先在相册编辑图片再导入。
- 本机存储，无账号、云同步或多人共享；已从合并 Manifest 移除联网权限。
- 已通过 16 KB APK ZIP 对齐和所有已打包 64 位原生库 ELF LOAD 对齐检查；仍需设备上的 OCR 实测。

## 验证情况

已运行：

- `node --test tests/parser.test.cjs`：12 项解析/筛选测试通过。
- `node --check app/src/main/assets/app.js`：JavaScript 语法检查通过。
- `tests/ui.test.cjs`：浏览器交互测试通过，覆盖彩色日历、每日票据、分类优先导出、选择合计、日期标记、模拟本地图片导入、固定英镑、文本转义、预览数据保存、360px 宽度布局。
- `Build-Windows.ps1`：PowerShell 语法检查通过。

GitHub Actions 已运行通过：Java 编译、`XlsxWriterTest`、Android lint、release APK 打包、APK v2 签名验证、16 KB ZIP/ELF 对齐。

APK SHA-256：`d6f7bbbcced26398037298bd678cd75a1ef6cc2ed0d526fd06e74dd58c6de249`。

未运行：安卓真机/模拟器上的相机、文件选择器、ML Kit、SQLite 和 PDF 导出完整流程。

截图位于 `verification/`。浏览器测试只验证界面和模拟交互，不代表安卓端功能已经通过。

## 源码结构

- `app/src/main/assets/`：应用内界面与金额日期解析规则。
- `MainActivity.java`：安卓相机/文件选择器、界面桥接、草稿、分享和文件导出。
- `Documents.java`：原件导入、图片旋转处理、PDF 预览和 OCR。
- `ReceiptStore.java`：SQLite 发票信息及日历状态。
- `ExportService.java`：PDF 合集和原件备份。
- `XlsxWriter.java`：Excel 明细与汇总；文字按文本写入，金额按数字写入。
- `app/src/test/`：Excel 文件结构和金额测试（需要 JDK/Gradle）。
- `tests/`：可以在 Node.js 中运行的解析和浏览器测试。
- `.github/workflows/android.yml`：GitHub 手动构建流程。首个 APK 已由云端构建。后续构建必须复用已交付签名备份，并设置 `ANDROID_KEYSTORE_BASE64`（personal-release.p12 的 Base64）和 `ANDROID_KEYSTORE_PASSWORD`（signing.properties 中的 storePassword）两个仓库 Secret；不会自动生成不同签名的新安装包。
- `BaoZhang-Signing-Backup.zip` 为私下交付的更新签名备份；不要提交仓库或公开分享。本地构建前把其中 `.tools/` 放回项目根目录。

## 官方开发参考

- Android 16 SDK：https://developer.android.com/about/versions/16/setup-sdk
- Android Gradle Plugin 8.13：https://developer.android.com/build/releases/agp-8-13-0-release-notes
- ML Kit 文字识别：https://developers.google.com/ml-kit/vision/text-recognition/v2/android
- Android 16 KB 内存页：https://developer.android.com/guide/practices/page-sizes

版本：0.1.0 · 2026-10-10
