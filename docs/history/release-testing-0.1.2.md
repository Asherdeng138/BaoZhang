# 2026-10-10 本地更新包验证

本次实际构建版本：Android **0.1.2 / versionCode 3**，Windows **0.2.1 x64 portable**。保留原 Android applicationId `com.asher.baozhang` 和桌面 appId/productName。Android 签名使用原本地私下备份，与已交付的 0.1.1 APK 证书 SHA-256 完全一致。

## 实际执行结果

- 解析/规则测试 24 项通过；SQLite 升级 SQL 检查 2 项通过。
- Windows 存储/导出/回收站测试 10 项通过。
- 两端浏览器界面回归通过；恢复了旧 0.1.1 的附件移除大按钮、原生确认弹窗和安全区域容器修复，附件移除/重新导入及已保存发票删除的浏览器回归通过。
- Android `testDebugUnitTest lintRelease assembleRelease` 成功：Java 单元测试 3 项，lint 没有 Error/Fatal，签名 v2 验证通过，16 KB ZIP 与 64 位 ELF LOAD 对齐检查通过。
- APK 内四个前端资源与本次源码逐字节一致；实际 APK 包名/版本检查为 `com.asher.baozhang`、versionCode 3、versionName 0.1.2。
- 打包后的 Windows 程序通过真实本地 OCR、批量导入、人工修改、完整 PDF/Excel 导出、月份文件名、归档、回收站跨重载恢复、月额度非阻塞提示、日历及持久化测试。
- 最终便携 EXE 实际解包启动，通过版本、日历控件和归档界面检查。首次解包等待超过最初自动化的 45 秒期限；读取本次程序自身的调试端口后完成检查并关闭测试窗口。
- 已核对打包目录的主进程、桥接、服务、解析器和前端文件与当前源码一致。签名私钥没有放入交付目录。

Windows 测试使用隔离数据目录，没有读取用户真实发票。本次没有执行安卓真机或模拟器的相机、ML Kit、SQLite 完整流程验收；由用户在手机上继续测试。历史网页验证说明中的“尚未打包”描述对应之前的源码阶段，当前打包结果以本记录为准。

## 使用

Android 直接覆盖安装 0.1.2，不要先卸载；可以先从旧版导出原件备份。Windows 先关闭旧程序，再运行 0.2.1 的 EXE，首次启动需等待解包。两端仍各自保存数据，没有自动同步。

输出位置：Android `output/BaoZhang-0.1.2.apk`；Windows `desktop/release/BaoZhang-Desktop-0.2.1.exe`。另已复制到本任务工作区的 `outputs/`，包含两份安装文件、SHA-256、测试 JSON 和中文测试说明。
