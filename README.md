# ProxyFlow

Chrome 独立代理管理扩展，MIT 开源，Manifest V3。本仓库交付 **V0.3 开发预览**，不依赖任何代理软件的管理 API，不修改系统代理。

## 已实现

- 任意有效端口、HTTP / HTTPS / SOCKS4 / SOCKS5，多代理添加、编辑、删除、切换、默认配置。
- 智能 PAC、全局代理、全局直连；域名、后缀、关键词、IPv4 字面地址 CIDR、MATCH 与指定出口。
- HTTP/HTTPS REJECT 使用 DNR；代理 PAC 无 DIRECT 故障回退，mandatory PAC。
- 中文 Popup、响应式 Options、首次配置引导、浅色/深色主题、Lucide 图标。
- 本地存储、规则文本导入/导出与错误报告、按网站授权的请求诊断、代理控制权与错误提示。

- V0.2：Shadowrocket CONF、Clash/Mihomo YAML、v2rayNG/Xray JSON 常见规则转换，自动识别、固定出口映射、本地规则集展开、源字段兼容性报告和应用前预览。

- V0.3：经授权的 HTTPS 订阅与定时下载、候选预览/确认应用、默认关闭的广告域名 DNR 拦截、可选 WebRTC UDP 限制，以及实际 Chrome 配置与网络错误分层诊断。

**未实现**：外部 PAC、GFWList/Adblock 完整语法、远程提供者递归展开、源策略组运行、故障切换、账号密码代理认证、广告页面元素隐藏。支持规则提取不等同于完整配置兼容。

## 构建与安装

可直接在 [GitHub Releases](https://github.com/ihatetheworld-ckl/ProxyFlow/releases) 下载 `proxyflow-0.3.0.zip`，解压后按下方步骤加载；`-source.zip` 用于源码开发。当前发布为开发预览，实机验收限制见下方说明。

需要 Node.js 22.22.2+ 或 24.15.0+（LTS）、npm、Chrome 120+。

```sh
npm ci
npm run check
```

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目 **dist** 文件夹（不是源码目录）。
3. 首次安装自动打开设置。自行运行代理服务，填入代理入口协议、地址和端口；没有预设客户端或默认端口。
4. 保存入口，选择全局代理或智能分流。Popup 可快速切换。
5. 在网络诊断中输入外部测试网站，授权单站点访问后测试。建议结合代理日志与出口 IP 网站验证路径。

运行 `python3 scripts/package.py` 可从构建结果生成安装包与源码包（Python 3 标准库，仅打包时需要）。交付工作区附构建包 `artifacts/proxyflow-0.3.0.zip`（交付工作区生成，CI 输出解压目录）。解压后加载其中的 manifest.json 所在文件夹。`npm run dev` 仅用于界面开发，网页预览不提供 Chrome 代理控制；完整功能需要加载构建后的扩展。

## 规则

按列表顺序首次匹配。新规则插入首个 MATCH 前，可上下移动。未匹配请求使用不可用本地代理地址作为拒绝后备，不直连；这不等同于所有协议的浏览器级拦截。建议保留最后的 MATCH,PROXY。默认示例 `.cn`、baidu.com、qq.com 直连，其余代理；这不是完整国内网站分类，可完全修改。

```text
DOMAIN,example.com,PROXY
DOMAIN-SUFFIX,example.org,DIRECT
DOMAIN-KEYWORD,tracker,REJECT
MATCH,PROXY
```

指定出口：`PROXY:代理ID`；原生规则导出的 ID 仅适用于同一组代理配置。文件最大 256 KiB、规则最多 500 条、代理最多 50 个。有错误时禁止导入；不兼容项与 IP 语义变化需主动确认后才能部分导入，绝不执行配置中的代码。域名须小写 ASCII，国际域名使用 punycode。IPv4 CIDR 仅匹配 URL 主机的字面地址，**不查询 DNS**。REJECT 与 IP-CIDR 混合排序不支持，会拒绝保存。REJECT 在直连/全局代理模式不启用。

## 配置导入

1. 设置页进入「配置文件导入」，选择或粘贴 CONF / YAML / JSON / 纯域名列表，先解析预览。
2. 源策略组、节点标签和非基础 Xray outbound 不会运行；将报告中出现的出口标签映射为已有代理、当前代理、DIRECT 或 REJECT，再重新解析。
3. Clash `rule-providers` 可使用 `inline` payload，或手动附加本地文件并将附件标识改为提供者名称。Shadowrocket `RULE-SET` 的附件标识必须与引用完全一致。不会联网读取 URL 或本地源路径。
4. 查看规则顺序、源字段位置和兼容性条目。错误始终禁止应用；跳过规则、仅匹配字面 IP 等变化必须先确认。最后点击「用预览规则替换全部现有规则」。
5. 原文件只保留在当前页面内存中，保存的只有转换后的规则。导出报告含规则域名和出口映射，分享前自行检查。

源文本、格式、映射或附件变更会使预览失效；浏览器配置版本变化也会禁止应用过期预览。导入不会自动切换当前模式，也不会自动添加 MATCH 或 DIRECT。规则集合的高级语义和兼容矩阵详见 [导入兼容性](docs/IMPORT.md)，本地示例位于 `examples/`。

## V0.3 订阅、安全与诊断

- 「订阅与规则更新」：添加可信 HTTPS 地址，选择格式和出口映射；支持仅手动、6 小时或 24 小时下载。下载或开启定时更新时按来源主机请求访问权限。无 Cookie、无 referrer，不跟随重定向；下载仍遵循当前 Chrome 路由，失败不切换直连。
- 下载只生成本地候选，不改活动规则。查看兼容性报告，必要时确认语义变化，再点击「用候选替换全部规则」。多个订阅分别管理，**不自动合并**；任意配置版本变更都会使旧候选过期。错误保留旧路由与已有候选。远程 `rule-providers` 不递归下载。
- 每个文件与候选报告最多 256 KiB、订阅最多 20 个、缓存总计 1 MiB。单个 15 分钟 alarm 每次最多处理 3 个到期来源；浏览器关闭/休眠会延迟下载，失败下次按配置周期重试。授权可在隐私页撤销。URL 令牌保存在本机，勿公开；DNS 重绑定无法可靠检测，仅授权可信来源。
- 「隐私和安全」：广告拦截默认关闭，内置 3 个示例域名，可编辑最多 500 个域名。开启后在三种代理模式下阻止 HTTP/HTTPS 域名及子域，优先于路由允许规则。它不是完整广告规则库，不提供浏览记录、请求计数或元素隐藏。
- WebRTC 限制需单独授予可选 `privacy` 权限，设置 Chrome 的 `disable_non_proxied_udp`；关闭只清除本扩展控制的覆盖。可能影响通话，不承诺完全防漏 IP，不替代 DNS/QUIC 实机测试。
- 「网络诊断」：先核对实际代理、DNR 和 WebRTC 策略，再请求用户授权的目标。区分权限冲突、配置漂移、规则/广告拒绝、HTTP 错误、超时与同期代理错误。普通 fetch 失败不能可靠判定代理、DNS/TLS 或目标哪一方失效；成功响应也不能独立证明出口 IP。

详细操作、限额与已知限制见 [V0.3 功能说明](docs/ADVANCED.md)。旧 schema version 1 自动补齐新设置；订阅为空，广告/WebRTC 限制默认关闭，保留原代理、规则和模式。真实升级验收仍待执行。

## 架构

- `src/background`：唯一写入入口、串行队列、乐观版本校验、安装/启动恢复、错误提示。
- `src/proxy`：chrome.proxy 控制与独立 PAC 编译器。
- `src/rules`：确定性匹配、首条优先、DNR 编译。
- `src/parsers`：统一转换报告、受限 JSON/YAML、Shadowrocket/Clash/Xray 适配器、本地规则集展开、出口映射与保守校验。
- `src/subscriptions`、`network`：受限下载、授权、候选版本校验、调度与本地缓存。
- `src/blocking`、`security`：广告 DNR 与可选 WebRTC 控制及恢复。
- `src/storage`：本地版本化配置；`utils/types.ts` 预留策略组类型（未运行）。
- `src/diagnostics`：经当前路由请求指定目标，不使用端口探测冒充成功。
- `src/components`、`popup`、`options`：共享 UI 与消息客户端。

Chrome 的 proxy、DNR 与 privacy API 不提供跨 API 原子事务。代理应用失败时尝试恢复旧 DNR 与 WebRTC 策略；持久化失败尝试恢复旧配置。更新期间仍可能出现短暂不一致，恢复失败会显示错误，不能保证跨崩溃事务。本版仅管理 regular scope，默认代理用于删除当前配置后的选择后备；不会把故障自动切换到默认代理。

## 质量与验收

`npm run check` 包含 ESLint、Prettier、Vitest、TypeScript 与生产构建。单元测试使用 Chrome API mock；PAC 在隔离 JavaScript VM 执行。`npm run smoke` 可在允许加载扩展的 Linux Chromium 环境运行真实扩展测试（通过 CHROMIUM_PATH 指定可执行文件），使用临时本地 HTTP 代理，不连接第三方代理服务。V0.1 时本环境的管理员策略阻止解压扩展加载；V0.3 只读复核时该策略仍然阻止扩展安装，因此没有再次尝试加载。当前自动化测试数量与结果见验证记录；jsdom 与 API mock 不代替真实浏览器验收。验证记录见 [交付验证](docs/VERIFICATION.md)。Windows 客户端测试流程见 [手工验收](docs/TESTING.md)，安全边界见 [隐私政策](docs/PRIVACY.md)，发布要求见 [商店准备](docs/STORE.md)。

请不要将本版本当作已完成 Chrome Web Store 审核或已通过实机漏 IP 测试的正式版。
