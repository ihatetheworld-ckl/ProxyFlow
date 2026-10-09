# Chrome Web Store 发布操作

V1.0 软件及 GitHub 发布流程已准备完成；商店发布需要维护者自己的开发者账号、条目、身份/联系信息与审核。当前**未提交、未上架**，GitHub 正式版不等于商店审核通过。

## 可提交材料

- `proxyflow-1.0.0.zip`：安装/商店上传包，根目录为 manifest.json，包含本地 JS/CSS、图标、许可证，不含测试/源码/密钥。
- `proxyflow-1.0.0-source.zip`：MIT 开源源码，独立附件。
- `proxyflow-1.0.0-store-assets.zip`：四张真实扩展页面截图（1280×800）、小型宣传图（440×280）、128 PNG 图标、Linux/Windows 浏览器报告和发布文档。
- `SHA256SUMS`：校验上述附件。截图使用自动化的本地测试代理与保留测试域名，没有个人代理凭据。小型宣传图为品牌图形，**不是产品截图**。

参照 [商店图片规范](https://developer.chrome.com/docs/webstore/images)。宣传图与截图由 `scripts/smoke.mjs` 在真实浏览器生成，素材包脚本检查 PNG 尺寸。Popup 的 380×620 截图是补充验收证据，不作为合规尺寸的商店截图提交。

## 提交步骤

1. 登录 [开发者控制台](https://chrome.google.com/webstore/devconsole)，完成当前要求的注册、身份验证与联系信息。账号、付款和身份资料由维护者提交，不将密码/令牌写入仓库。
2. 新建 ProxyFlow 条目，上传安装 ZIP。选择与代理网络工具相符的类别、中文语言，填写 [上架文案](STORE-LISTING.md)，确认名称可用。
3. 上传素材包内的 128 图标、440×280 宣传图与四张 1280×800 截图；检查实际显示效果。
4. 项目主页：`https://github.com/ihatetheworld-ckl/ProxyFlow`；支持：`https://github.com/ihatetheworld-ckl/ProxyFlow/issues`；公开政策：`https://github.com/ihatetheworld-ckl/ProxyFlow/blob/main/docs/PRIVACY.md`。使用这些真实公开 URL，发布前检查可访问；若控制台要求其他政策托管形式，由维护者提供。
5. 填写隐私问卷与 [权限说明](PERMISSIONS.md)：无浏览历史采集、无遥测/销售/外传、无远程代码；用户来源请求及本地配置存储见隐私政策。按**最新控制台字段和实际行为**回答，不承诺未知审核结果。
6. 根据 [验收清单](TESTING.md) 补做真实客户端、原生授权、升级及平台边界测试；查看 [已完成与未完成验证](VERIFICATION.md)。发布前处理发现的问题，不伪称未测场景通过。
7. 选择公开或不公开列表分发，提交审核。审核通过且发布后，记录真实扩展 ID 与安装链接，更新 README。用户从该商店条目安装后才能获得标准 Chrome 自动更新。
8. 后续更新在**同一条目**上传更高版本，审核发布。首次从开发目录迁移请使用备份，不假定两个 ID 共享存储，详见 [更新指南](UPDATES.md)。

## 可复现流水线

`npm ci && npm run check`，在允许加载扩展的环境运行 `npm run smoke`。GitHub 的 browser workflow 分别在 Linux 与 Windows 执行真实 Chrome for Testing 请求验收，保存带 commit 的报告与截图。

推送版本匹配的 `v*` 标签，且存在 `docs/releases/<标签>.md`，Release workflow 会等待两平台浏览器通过，再执行全量检查、依赖审查、打包与 SHA 校验；两个证据报告必须匹配当前标签提交。所有附件先上传到草稿 Release，成功后才公开。`v0.*` 为预发布，`v1.0.0` 为 GitHub 正式发布。流水线**不上传 Chrome Web Store，也不持有商店发布密钥**。
