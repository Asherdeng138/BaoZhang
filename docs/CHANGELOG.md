# 修改记录

每次修改记录：改了什么、为什么、实际跑过的检查。基线快照：`../_backups/2026-10-13-baseline/`（含 `source-manifest.sha256`，签名文件单独在 `signing/`）。

## 2026-10-13 · 字段解析改进（P2 第一步，两端共用）

改动文件：`app/src/main/assets/parser.js`、`desktop/parser.cjs`（两份保持一致）、`tests/parser.test.cjs`（新增 7 项）、新增 `tests/parser-sync.test.cjs`、`tools/eval-ocr.cjs`；`DELEGATION.md`/`AGENTS.md` 委派规则；新增 `CLAUDE.md`（只引用 AGENTS.md）。

- 金额：区分表头/小计/税/找零/优惠行；总额、刷卡、小计互相印证；分开付款（现金+卡、券+卡）相加核对；"Total … Charges" 视为部分合计；£ 被识别成数字时只有在其他行印证时才修正；没把握时不自动填写，只给候选（警告文案保留"多个合计"）。
- 日期：支持 `10 Aug’ 26`、`22AUG25`；`12 Aug 12:39` 不再误判为 2012 年；带时间的日期优先；月份 97/87 → 07 修正；年份异常（如 2028、2050）只作为候选，不自动填写。
- 商家：英国常见商家词典（容忍 1 个字母识别错误、O/0 混淆）、网址、"Ltd" 公司名；菜品里的常见词和地名不当作商家；总额以下的广告只作低优先级候选。新增返回字段 `merchants`（候选列表），原有字段不变。
- 新增可选参数 `parse(text,{today})`，用于测试固定日期。

评测（SparkReceipt 导出的 149 张已裁剪图片，Tesseract eng+chi_sim，测试数据在项目外 `../ocr-testset/`）：

| 指标 | 旧解析器 | 新解析器 |
|---|---|---|
| 日期 正确 / 错填 | 55.7% / 8.1% | 63.1% / 5.4% |
| 金额 正确 / 错填 | 59.7% / 31.5% | 61.1% / 6.0% |
| 商家 正确 / 错填 | 53.7% / 45.6% | 77.2% / 16.1% |
| 三项全对 | 25.5% | 38.9% |

注意：规则是在同一批图片上调出来的，存在过拟合，真实提升需要用新票据复测。Android 的 ML Kit 识别结果需在手机上另测。Windows 版需重新 `npm run build` 打包后才使用新解析器。

检查：`node --test tests/parser.test.cjs tests/parser-sync.test.cjs tests/android-migration.test.cjs` 34/34 通过；`desktop: node --test tests/service.test.cjs` 11/11 通过；`node --check app/src/main/assets/app.js` 通过。未运行：APK 构建、浏览器 UI 测试、Electron 冒烟测试。

## 2026-10-13（晚）· 识别引擎对比与解析器第二轮

- 解析器：修复 £ 误读修正可能产生 0.00 并使 `parse()` 报错的缺陷；支持 OCR 把年份和时间连在一起（`20/07/202610:17AM`）；"Card Tendered" 视为刷卡付款；总额 − 优惠 = 后一个总额的核对；只有总额/付款行才算相互印证；TfL 车票水印、McDonald's 问卷网址等商家修正。新增 2 项测试（共 33 项）。
- 工具链验证：新增 `tools/build-apk-test.cmd`（测试编译，APK 输出到 `output/test/`，不覆盖正式 APK）。编译、Java 单测、lint 通过；签名证书 SHA-256 与 0.1.3 相同；16 KB 对齐通过。测试 APK 与手机版本号相同，不要安装。
- 识别引擎对比（同 149 张，新解析器，三项全对）：Tesseract（Windows 现用）41.6% · RapidOCR/PP-OCRv3 51.7% · PP-OCRv5 55.0% · **PP-OCRv6 small 61.7%** · v6+v5 融合 64.4%。正确金额出现在候选中：Tesseract 77.9%，PP-OCRv6 94.6%。OCR 文本缓存在 `../ocr-testset/ocr-text.tgz`。
- 注意：规则在同一批样本上调整，存在过拟合；标准答案来自 SparkReceipt 未审核结果，已确认至少 1 张日期标注错误。Android ML Kit 未参与对比，需真机评测。

## 2026-10-16 · Android 0.2.0（versionCode 5）/ Windows 0.3.0 正式版

新增
- 新识别引擎：离线 PP-OCRv6 small（onnxruntime-web WASM），Android 在 WebView、Windows 在主进程后台线程运行，同一份 `receipt-ocr.js`。
- 自动裁剪：按文字区域找出发票、透视矫正、自动转正（横拍/倒拍）；照片偏暗、模糊、反光、发票贴边（可能没拍完整）会提示。
- Android 裁剪编辑：编辑页“裁剪 / 矫正”按钮，可拖动四角、旋转 90°、恢复原图、自动识别边缘；确定后重新识别。裁剪只保存四角坐标（附件 JSON 的 `crop` 字段），原图不变；预览和合并 PDF 按裁剪显示。
- Android 结果融合：先显示原 ML Kit 结果，新引擎完成后逐项融合；两者冲突时留空并提示，给出合并后的金额/日期/商家候选；手动修改过的字段不会被覆盖。新增商家候选按钮。
- Windows：识别前自动裁剪与转正；新引擎失败自动回退原 Tesseract。

数据与升级
- 未改数据库结构（SQLite 仍为 v2）、未改备份格式；Android 包名与签名不变，可覆盖安装 0.1.3。Windows 数据目录与格式不变。
- 新增 `CropSpec.java`（裁剪校验）及单元测试；`setCrop` 桥接接口；预览路由支持 `raw=1`；OCR 资源按正确 MIME 返回；CSP 允许 `wasm-unsafe-eval` 与同源读取模型。

测试（实际执行）
- 根目录 Node 测试 36/36；Android Java 单测 9/9（含 CropSpec 3 项）、lint、签名（证书与 0.1.3 相同）、16 KB 对齐通过。
- Android 浏览器测试：ui、preview-batch、deletion、smart-scan（真实引擎、裁剪编辑器、手改字段保留）全部通过；APK 内前端文件与测试版本逐字节一致。
- Windows：服务测试 11/11、界面测试、源码版与打包版 Electron 真实 OCR 冒烟测试通过；打包目录内引擎实测自动裁剪并读出总额。
- 识别准确率（150 张 SparkReceipt 图片，三项全对）：Tesseract+旧解析 25.5% → PP-OCRv6+新解析 61.1%（JS 引擎实测）。合成手机照片 40 张：不裁剪 37.5% → 自动裁剪 55.0%；文字完整保留 38/40，平均残留背景 5%。
- 未验证：真机上的速度、内存与 WebView 兼容性；ML Kit 与新引擎融合后的真实准确率。

产物（SHA-256 见 `output/release-0.2.0-0.3.0.sha256`）
- `output/BaoZhang-0.2.0.apk`
- `desktop/release/BaoZhang-Desktop-0.3.0.exe`、`BaoZhang-Desktop-0.3.0.zip`

## 2026-10-17 · Android 0.2.1（versionCode 6）/ Windows 0.3.1

- 主界面合计不再固定为日历月份：两端可选择统计时间（本月〔默认〕、上月、日历所选月份、今年、全部时间）和费用类别（全部或五类之一），标题写明统计范围；选择在本机记住。手机统计已保存发票，电脑统计已确认发票；回收站不计入，归档计入。
- 共享解析器新增 `summaryRange`/`summarize`（含测试）；新增 `tests/summary.test.cjs`（手机界面选择、金额、重启后保留、360px）。
