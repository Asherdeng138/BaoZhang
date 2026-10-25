# 本地小票 OCR 的改进选择

本次源码改动增加了商家快捷填写、常见商家匹配、非实付总额排除和有限的带警告数字修正；没有更换 OCR 引擎，也没有真实小票准确率对比结果。文字识别正确但商家/金额选错，属于字段提取问题，换引擎并不一定解决。

## 适用于当前架构的候选

| 方案 | 适用范围 | 取舍 |
| --- | --- | --- |
| 保留 ML Kit / Tesseract，先改善输入和提取 | 两端现有架构 | 优先测试裁边、纠偏、透视矫正、去阴影、足够文字分辨率，再匹配商家和实付总额；维护成本较低 |
| Tesseract `tessdata_best` | Windows 当前 Tesseract.js 架构 | 官方说明为以较多速度换取略好的准确率；可与当前 `tessdata_fast` 对比，不能保证每张小票更准确 |
| PaddleOCR PP-OCRv5 mobile / 英文识别模型 | 两端的离线替代引擎候选 | 有文字检测、识别模型和端侧部署资料；适合评估英文超市小票，但需要处理推理运行时、资源打包、方向/图像处理、延迟和内存 |

这是一份针对本项目的工程建议，而非各引擎在 Tesco、麦当劳、Sainsbury's、ASDA、Costco 票据上的已验证排名。可先在 Windows 比较 `tessdata_best` 与 PP-OCRv5 的效果；Android 在取得对比结果后决定是否替换已经内置的 ML Kit。

## 验收方法

使用同一批获授权的真实小票，覆盖清晰扫描、斜拍、阴影、长票、模糊总额、优惠和分次付款。分别记录：

- 商家名称、费用日期、实际付款金额的准确匹配率，不只比较文字数量。
- 未识别与错误候选的比例；特别检查税额、找零、优惠、刷卡与现金分次付款。
- 单张延迟、峰值内存、离线模型大小及在目标手机/电脑上的稳定性。

固定输入和人工核对答案后再比较引擎及预处理组合。相互矛盾或低置信度的金额应交由用户选择；不得自动确认、推测缺失价格或覆盖人工填写。

模型和推理库需随客户端打包，运行时只从本地加载。网页示例中的 CDN 和在线模型 URL 不能直接带入本项目；Android 新增原生库还需验证最低 API、ABI 和 16 KB 页对齐。

## 官方资料

- [ML Kit 输入图像要求](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)：图像分辨率和对焦影响识别，建议字符至少约 16×16 像素。
- [Tesseract 图像质量与分段建议](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)：纠偏、边界、二值化以及分段模式的影响。
- [tessdata_best 的速度与精度取舍](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-tessdata_best.html)。
- [PaddleOCR PP-OCRv5 技术说明](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv5/PP-OCRv5.en.md)。
- [PaddleOCR 文字识别模型资料](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/text_recognition.en.md)。
