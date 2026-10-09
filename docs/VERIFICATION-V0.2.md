# V0.2 交付验证记录

日期：2026-10-08 UTC。
环境：Linux、Node.js 24.19.0、npm 11.9.0。开发测试需 Node 22.22.2+ 或 24.15.0+ 的 LTS 版本。

## 已运行并通过

- `npm run check`：ESLint、Prettier、Vitest、TypeScript strict 和 Vite 生产构建。
- Vitest：4 个文件、86 项测试全部通过。其中基础规则/代理/存储/诊断 30 项、后台事务与升级保留 5 项、格式转换与输入安全 45 项、导入页面交互 6 项。
- Shadowrocket CONF、Clash/Mihomo YAML、Xray 完整/独立路由 JSON，域名语义、出口映射、规则优先级与 PAC 实际 JavaScript VM 执行。
- inline 与本地附件规则集展开、缺失附件、未知策略、AND 规则、DNS 策略限制、IPv6 与 regexp/geosite/geoip 不兼容报告。
- YAML 重复键、执行标签、别名/递归对象，JSON 危险键、结构深度、文件与规则数量上限。
- jsdom 下真实 React 导入页面：先预览后保存、出口重新映射、错误阻止应用、部分导入确认、源编辑失效、过期配置与 busy 状态。
- V0.1 存储 schema version 1 升级保留验证（Chrome API mock），不重置现有配置。

## 浏览器与平台验收限制

V0.1 曾尝试加载 Chromium 151.0.7922.173 的扩展，浏览器报告：

> Loading of unpacked extensions is disabled by the administrator.

V0.2 再次只读检查当前管理员策略，`ExtensionInstallBlocklist` 仍为 `["*"]`。没有修改策略，也没有再次运行受阻的扩展加载。因此本次没有完成实际扩展页面、Chrome 代理请求、DNR 或 Windows 客户端验证；jsdom 交互测试与 API mock 不代替这些验收。

`scripts/smoke.mjs` 已补充 V0.2 导入预览/映射/保存步骤，供允许加载扩展的 Linux Chromium 环境运行。该脚本尚未实机通过，不提供测试截图。Windows 与真实客户端的新增验收清单见 TESTING.md。

本版本完成规则提取与保守转换，不承诺完整客户端配置、远程订阅、策略组运行、DNS 策略或完全防漏 IP。商店素材、正式审核与平台连通性仍待 V1.0 前验收。
