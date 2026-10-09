# V0.3 交付验证记录

日期：2026-10-09 UTC。环境：Linux、Node.js 24.19.0、npm 11.9.0。

## 已运行并通过

- `npm run check`：ESLint、Prettier、Vitest、TypeScript strict 和 Vite 生产构建通过。
- Vitest：7 个文件、143 项测试全部通过：基础规则/代理/存储 30，后台事务与订阅命令 8，格式转换 45，本地导入 UI 6，订阅与受限下载 27，广告/WebRTC/诊断 19，新增页面交互 8。
- HTTPS URL 校验、明显私有地址拒绝、出口映射、旧 schema 附加升级、12 秒下载参数、无 Cookie/referrer/重定向、实际字节/报告/缓存上限、HTTP/HTML/无效 UTF-8、网络异常隐私处理。
- 下载与定时任务不应用活动配置，旧候选保留、转换错误报告、显式应用替换、token/revision/参数摘要校验、部分导入确认、候选消费后不能重用；每轮 3 个来源与 alarm 生命周期。
- 广告三种模式下的 DNR 编译、域名边界、主页面/资源类型、广告优先于路由允许与默认关闭。
- WebRTC 可选权限、控制冲突、regular 策略、关闭只清自己的覆盖、代理失败后的 DNR/privacy 恢复与部分恢复失败提示。
- 诊断代理控制权、固定代理/PAC/额外绕过项/备用出口与 DNR 条件漂移、WebRTC 期望未生效、广告/路由拒绝、站点权限、HTTP 错误、超时及同期/历史代理错误区别。
- jsdom React：站点与 privacy 用户授权、拒绝授权、广告与 WebRTC 开关、订阅保存不下载、映射错误、候选确认绑定与过期、诊断仅发送 TEST。
- 保留 V0.2 解析安全与 V0.1 PAC JavaScript VM 测试覆盖。以上均使用受控 fetch/Chrome API mock 或 jsdom，不是浏览器网络实测。

## 构建与包检查

构建输出 `dist`，应用与 manifest 版本 0.3.0，存储 schema version 1。打包脚本检查 MV3 入口、16/32/48/128 图标、许可证、必需/可选权限、运行时代码无 eval/new Function，以及 ZIP 完整性；安装包不含源码，源码另包。SHA256SUMS 保留各阶段包的校验值。

必需权限为 proxy、storage、declarativeNetRequest、alarms；可选 privacy 与用户按主机授予的 HTTP/HTTPS origin。没有默认授予全部站点访问，没有远程脚本。

## 实际浏览器与平台限制

V0.1 加载 Chromium 时曾报告：

> Loading of unpacked extensions is disabled by the administrator.

V0.3 只读复核 `/etc/chromium/policies/managed/extensions.json`，`ExtensionInstallBlocklist` 仍为 `["*"]`。没有修改策略或再次尝试受阻的扩展加载。

因此本次没有验证实际扩展页面、Chrome 代理/PAC/DNR 请求、HTTPS 订阅、WebRTC UDP 效果、Windows 客户端或 Chrome 新增权限升级表现；没有提供实机截图，不将单元/UI 测试当成实机验收。`scripts/smoke.mjs` 已补充广告跨模式和 AD_BLOCKED 诊断步骤，但尚未实机通过；WebRTC 与可信 HTTPS 来源验收见 TESTING.md。

当前为 V0.3 开发预览，未完成 V1.0 或 Chrome Web Store 审核。不承诺完整广告规则库、完整源配置兼容、DNS/QUIC 控制或完全防止 IP 泄漏。跨 proxy/DNR/privacy/storage 事务、DNS 重绑定和故障归因边界见 ADVANCED.md。
