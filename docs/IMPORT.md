# V0.2 导入兼容性

本功能提取和转换分流规则，保存到现有 Chrome 代理配置。不运行源节点，不执行源配置或远程代码，不实现 VLESS、Reality、VMess、Trojan、Hysteria2 等协议。仅保守支持下表；「能解析文件」不代表「完全兼容客户端」。

| 来源              | 可转换内容                                                                                                                             | 不能保持的内容                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ProxyFlow 文本    | DOMAIN、DOMAIN-SUFFIX、DOMAIN-KEYWORD、IPv4 IP-CIDR、MATCH/FINAL、DIRECT/PROXY/REJECT 和显式代理 ID                                    | 高级规则类型和附加复杂选项                                                                                      |
| Shadowrocket CONF | [Rule] 中常见域名规则、IPv4 CIDR、FINAL、手动映射的出口；RULE-SET 的本地 classical 附件                                                | General/Proxy/URL Rewrite/脚本、复杂策略、自动下载规则集、IPv6                                                  |
| Clash/Mihomo YAML | rules；策略/节点标签映射成固定出口；inline 或本地附件的 classical/domain/ipcidr rule-providers                                         | 测速、负载均衡、fallback、AND/OR/NOT、GEOIP/GEOSITE、进程/端口/协议规则、源 DNS、mrs 二进制、YAML 别名/锚点引用 |
| v2rayNG/Xray JSON | 完整配置 routing 或独立 routing 对象；domain 的 full/domain/keyword/普通字符串；AsIs 下 IPv4 字面值/CIDR；空条件最终规则；标签出口映射 | regexp/geosite/geoip/ext、domain 与 ip 的 AND、端口/协议/来源等多条件 AND、balancerTag、DNS 路由 IP 规则、IPv6  |
| 纯域名文本        | 每行小写 ASCII 域名转 DOMAIN-SUFFIX，默认出口可选                                                                                      | GFWList、Adblock、URL、通配符、PAC                                                                              |

## 规则语义

保持源规则顺序。Xray 同一 domain 数组的 OR 条件展开成连续规则，使用相同出口；多个不同选择器是 AND，不会误转换成多个 OR 规则，整条跳过。Xray 普通无前缀字符串按关键词匹配，`domain:` 按域名后缀，`full:` 按精确域名。

Clash domain payload 中 `example.com` 转精确 DOMAIN；`+.example.com` 或 `.example.com` 转 DOMAIN-SUFFIX；`*.example.com` 不能用后缀冒充，报告不兼容。Classical payload 仅接受类型与值（IPv4 可附 no-resolve），不接受自带出口、MATCH 或嵌套 RULE-SET。

所有 IP-CIDR 仅匹配 URL 中的 IPv4 字面地址，不查询或复用 DNS。这比源引擎的 IP 语义窄，即使源配置含 no-resolve，仍需确认报告。Xray IPOnDemand/IPIfNonMatch 下的 IP 规则直接标记不兼容，不转换。当前规则引擎不支持 REJECT 与 IP-CIDR 混合排序；组合校验失败时即使确认也不能应用。

仅无额外传输/出口选项、settings 缺省或为空的 Xray freedom/blackhole 可自动映射为 DIRECT/REJECT。其他 outbound 标签均需手动映射，即使标签名字就是 DIRECT 或 PROXY，也不推断实际动作。Clash 已声明的策略组或节点同理；映射只选择固定 Chrome 出口，不运行源策略组。

没有可转换的最终 MATCH 时明确报告；不自动补直连。未匹配网络请求依然使用 PAC 后备拒绝，浏览器特殊请求边界仍适用。源配置默认 outbound、模式、DNS 和客户端设置不会成为 ProxyFlow 默认行为。

## 本地规则集

主文件与每个附件最多 256 KiB，总计最多 1 MiB，最多 16 个附件，附件标识需唯一。Clash http/file 提供者必须附同名本地文件，支持 UTF-8 文本或带 payload 数组的 YAML；`inline` 读取 payload。Shadowrocket RULE-SET 引用可用完整 URL 作附件标识，但绝不请求该 URL。嵌套规则集不递归展开。请将二进制 mrs 手动转换为支持的文本格式后导入。

## 报告与应用

每条转换规则有源行号或 JSON/YAML 字段路径。报告列出错误、不兼容条件、语义注意事项，以及未执行的非路由字段位置。报告不复制节点设置、服务器地址、认证值或远程 URL 查询参数；转换规则、域名和标签本身会出现在报告中。

任何语法、结构、非法规则值、重复 outbound 标签、缺失代理 ID、组合冲突或数量超限是错误，始终禁止应用。有不兼容规则时默认不应用；明确确认后才可应用可转换部分，可能改变直连、代理或拒绝行为。不存在可转换规则时不能应用。导入只替换规则，不改代理入口、不改运行模式。

JSON/YAML 结构最大深度 32、最多 20,000 个节点；展开后输入条件最多 2,000、可应用规则最多 500；报告最多 2,000 项，超过限制时禁止应用。YAML 使用受限 core 标签、拒绝重复键、别名展开、自定义执行标签和危险对象键。不执行 PAC、eval、Function 或源脚本。自动识别只是启发式，遇到带特殊开头的文件请手动指定来源格式。
