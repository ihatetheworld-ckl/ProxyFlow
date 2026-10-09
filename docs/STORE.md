# Chrome Web Store 发布准备

V0.3 提供构建包、源码与图标，尚未提交商店。V1.0 前需完成：

- 执行 TESTING.md 的真实 Chrome/Windows 兼容、订阅、WebRTC、升级与故障测试，保存验收记录。
- 复核 proxy、storage、DNR、alarms 与可选 privacy/站点权限；解释单一用途：用户自主控制 Chrome 代理与路由及相关网络安全。订阅需用户添加与授权，规则更新不自动应用。
- 审核受限下载、外部配置校验、DNS 重绑定边界、候选确认、持久化和回滚；检查依赖与许可证。
- 提供公开隐私政策 URL、维护者邮箱、项目主页与支持链接，禁止杜撰发布身份。
- 截图来自真正加载的 Popup、服务器、规则、订阅、安全、诊断页，准备商店所需尺寸（如 1280×800），不用未实现功能素材。
- 检查 16/32/48/128 PNG 图标，补齐 listing、版本说明、隐私问卷与开发者身份。
- CSP 只允许打包本地代码；订阅不是远程代码加载，不使用 CDN、eval 或外部 PAC。不宣称完整配置兼容、完整广告拦截或完全防漏 IP。
- `npm ci && npm run check` 后运行 `python3 scripts/package.py`。安装 ZIP 根目录含 manifest.json，不包含源码、测试与敏感数据；源码单独打包。
- 全新 Chrome profile 验证安装、旧版升级及新增 alarms 权限处理、重启、禁用/卸载、站点与 privacy 权限撤销，以及其他扩展/企业策略干扰。

## 0.3.0 发布说明草稿

新增经授权的 HTTPS 规则订阅、6/24 小时定时下载、兼容性候选报告与确认后替换规则；默认关闭的可编辑广告域名 DNR 拦截；可选 WebRTC 非代理 UDP 限制；实际代理/DNR/WebRTC 配置检查与分层网络诊断。旧配置附加升级，保留代理、模式和规则。失败不静默回退直连。

未实现远程规则提供者递归展开、运行源节点/策略组、完整 Adblock 或元素隐藏、认证代理和故障切换。没有提交商店；未经真实浏览器/Windows 验证的行为不视为已验收。

## GitHub 开发预览发布

`.github/workflows/release.yml` 在推送 `v*` 标签时执行版本/发布说明校验、全量检查和打包，并创建预发布 Release，上传安装 ZIP、源码 ZIP 与 SHA256SUMS，附件上传成功后才公开 Release。标签必须等于 `v` 加 package.json 版本，并存在对应 `docs/releases/<标签>.md`。该流程只发布 GitHub 开发预览，不向 Chrome Web Store 提交。V1.0 正式发布前需另行调整预发布标记并完成以上验收。
