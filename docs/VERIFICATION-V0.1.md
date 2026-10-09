# V0.1 交付验证记录

日期：2026-10-08 UTC。
环境：Linux、Node.js 24.19.0、npm 11.9.0；项目要求 Node.js 22+。

## 已运行并通过

- ESLint 与 Prettier 格式检查。
- Vitest：2 个测试文件、34 项测试全部通过。
- TypeScript strict 类型检查与 Vite 生产构建。
- 规则、CIDR、首次匹配、指定出口、PAC 输出在 JavaScript VM 实际执行。
- Chrome API mock 下的三种模式、权限冲突、DNR 排序、正则不兼容与回滚。
- 并发配置保存、版本冲突、存储失败恢复、拒绝非扩展页面消息。
- 导入导出、异常输入、超限文件、诊断权限、拒绝、HTTP 错误与网络失败限制说明。

## 未通过环境安装阶段

尝试运行 `npm run smoke`，本环境 Chromium 151.0.7922.173 未启动扩展 service worker。浏览器日志明确报告：

> Loading of unpacked extensions is disabled by the administrator.

没有修改管理员策略，也没有完成扩展实机代理请求、DNR、Popup、主题或连接故障验证。`scripts/smoke.mjs` 保留了用临时本地 HTTP 代理执行这些检查的脚本，供允许加载扩展的环境运行；脚本通过时才会产生测试截图，当前不提供冒充已验证的截图。

Windows、真实客户端、HTTPS/SOCKS4/SOCKS5 网络连通性、DNS/WebRTC/QUIC 泄漏边界均待按 TESTING.md 执行。构建成功说明可生成标准 MV3 解压扩展，不代表商店审核、实际 Chrome 接管或全部网络路径已经验收。
