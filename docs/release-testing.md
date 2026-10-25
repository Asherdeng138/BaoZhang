# 新版测试说明（Android 0.1.3 / Windows 0.2.2）

## 安装

- 安卓：安装 BaoZhang-0.1.3.apk，直接覆盖原随手报账，不要先卸载。包名与签名沿用旧版，versionCode 提升至 4。
- Windows 单文件：关闭旧版后运行 BaoZhang-Desktop-0.2.2.exe。
- Windows 文件夹版：将 BaoZhang-Desktop-0.2.2.zip 完整解压到普通文件夹，双击其中“随手报账.exe”；保留同目录其他文件，不要仅复制该 EXE，也不要直接在 ZIP 中运行。
- 桌面两种形式使用相同的本机数据目录；备份后再开始实际测试。

## 新功能

1. Windows 把图片或 PDF 拖到窗口任意位置，选费用类别后导入。如果微信未提供可读取的拖拽文件，先在微信复制图片，然后在“批量添加发票”中点击“粘贴微信图片”；也支持非输入框内 Ctrl+V。
2. 两端 Excel 不再导出地址/所在地列。本机已有所在地数据保留。
3. 安卓点附件图片或“查看原件”，在软件内看图/PDF；左转、右转、缩放、翻页，右上角 × 或手机返回键关闭。旋转只用于查看，保留原始文件，关闭预览后表单修改保留。
4. 安卓批量导入时在文件选择器中长按多选，每批最多 30 个文件、原件合计最多 250 MB。每个文件建立独立发票，按顺序识别、核对、确认保存；保存/放弃当前票据后进入下一张。关闭核对页或重启后可以继续本批。追加附件用于同一张多页发票，不能把不同消费合成一条。

## 验证结果与安装限制

- 共享解析测试 24 项、Android 数据升级 SQL 测试 2 项、Windows 存储/导出测试 11 项、Android Java 单元测试 6 项通过；Android lint 无 Error/Fatal，APK 签名与 16 KB 对齐通过。
- 两端原有浏览器界面回归、新安卓预览/批量界面回归通过。Windows 源码与实际打包程序均通过真实离线 OCR、导入、核对、PDF/Excel、归档/回收站/恢复与额度测试；实际打包程序拖入虚拟图片和粘贴测试通过。
- 未连接 Android 设备，因此小米文件选择器、原生 PDF 渲染、相机、ML Kit 和覆盖更新尚需手机验证。浏览器测试模拟原生桥接，不代表小米实机测试。
- 本机 Microsoft Defender 4.18.26080.4-0 对旧版 EXE、新版 EXE、新版完整目录和 ZIP 定向扫描均未发现威胁。此结果不能证明其他电脑的浏览器/云查杀不会继续拦截。
- Windows 新版具有正式的应用图标、名称和版本资源，但仍未使用受信任的 Authenticode 证书。调整打包并不能保证消除安全拦截。不要通过关闭安全防护来安装。
- 小米“允许当前来源安装”和安装检查是系统要求，应用无法取消。覆盖更新保留旧签名，但不免除系统安装确认。
- 未向 Microsoft 或其他服务上传程序；未更改任何安全设置、排除项或证书。

若对方仍检测到 Trojan:Win32/Wacatac.B!ml，应保留拦截，核对 .sha256 文件并将具体发布文件提交 Microsoft 误报复核。正式分发还可考虑受信任代码签名或应用商店渠道；签名也不保证新发布文件立即获得信誉。

官方说明：
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/en-us/defender-xdr/developer-faq
- https://www.microsoft.com/en-us/wdsi/filesubmission
- https://developer.android.com/distribute/marketing-tools/alternative-distribution
