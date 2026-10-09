# V1.0 验证记录

日期：2026-10-09（北京时间）。本地环境：Linux、Node.js 24.19.0、npm 11.9.0。旧记录保存在 VERIFICATION-V0.1/V0.2/V0.3.md。

## 自动化验证

`npm run check`：ESLint、Prettier、174 项 Vitest 测试、TypeScript strict 与生产构建通过。测试分布：基础核心 30、解析兼容 45、后台 12、订阅 27、安全诊断 19、高级页面 8、本地导入页面 6、在线下载/更新单元 15、在线导入/更新页面 6、备份单元 3、备份页面 3。

新增覆盖：授权拒绝、来源地址校验、下载上限/超时/UTF-8/HTML/重定向处理、下载不保存/应用、只读请求不阻塞配置写入、安装渠道与更新状态、开发副本禁止在线更新、备份格式/危险键/超限/版本冲突、WebRTC 权限拒绝保留旧配置、保存成功后状态失败准确提示、持久化失败且回滚失败显式报告。下载和原生授权的这些测试使用受控 fetch/Chrome API mock 与 jsdom。

Vitest 更新到 4.1.11，`npm audit` 检查当前锁定依赖为 **0 个已知漏洞**；这是检查时数据库结果，不承诺未来无漏洞。

## 真实浏览器

独立 GitHub-hosted Linux 与 Windows runner 已执行真实 Chrome for Testing 156.0.8078.4 验收。最早两平台通过的完整基线运行：[37891951085](https://github.com/ihatetheworld-ckl/ProxyFlow/actions/runs/37891951085)。正式发布流水线在**发布标签的同一提交**再次运行两平台脚本；任一失败不会发布，最终 JSON 证据随商店素材包提供。以附件内 commit、platform、browser、verified 和 checks 为准。

实测范围：加载安装向导、保存 HTTP 入口、HTTP fixed_servers 请求到达临时代理、PAC 请求到达代理、DNR 按序允许/拒绝、停止代理后新请求失败且未改变为直连、主动直连与路由 DNR 清除、存储重新加载、Clash 规则预览/映射/应用、广告跨模式拦截、AD_BLOCKED 诊断、开发安装渠道、未授权在线下载与 WebRTC 保护、确认后的备份恢复、明暗主题与 Popup。截图由这些真实扩展页面生成；440×280 品牌图是独立宣传素材。

当前工作区本地 Chromium 的管理员策略阻止解压扩展安装。未修改/绕过该策略；浏览器验收在允许加载的独立 GitHub runner 执行。

## 明确未实测

- Windows 10/11 桌面与 v2rayN、Clash、sing-box、Shadowsocks 等第三方客户端；Windows runner 使用临时 HTTP 代理，不代替客户端验收。
- HTTPS/SOCKS4/SOCKS5 入口网络兼容、代理认证（不支持）。
- 有效证书 HTTPS 来源的真实下载成功、原生主机授权提示、WebRTC 授权提示与 STUN/UDP 效果、真实定时周期。
- Chrome Web Store 签名安装/审核、旧商店版本升级、禁用/卸载、企业控制冲突与实际全量流量泄漏。

这些待验收项有单元验证或设计限制，但不得视为真实浏览器网络验证通过。操作清单见 TESTING.md。没有宣称完整节点/策略组兼容、全系统代理、完全防止 IP 泄漏或已完成商店发布。

## 包验证

应用/manifest 版本 1.0.0，存储 schema 保持 1。安装包检查 MV3 入口、图标、权限、许可证、无 eval/new Function、无伪造 update_url 和 ZIP 完整性。源码仅打包 git 跟踪文件，拒绝敏感扩展名与构建目录，ZIP 固定时间/权限；发布附件有 SHA256SUMS。素材包验证两平台报告一致、版本/提交匹配、截图/宣传图 PNG 尺寸。

跨 proxy/DNR/privacy/storage API 无原子事务，恢复失败显式提示；DNS 重绑定和底层网络故障归因仍有限制。具体边界见 README、ADVANCED.md、PRIVACY.md。
