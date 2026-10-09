# Chrome 在线更新与安装渠道

V1.0 已实现安装渠道识别和手动请求 Chrome 检查更新。在「关于 ProxyFlow」查看当前版本、渠道和结果。代码更新由 Chrome 管理，配置订阅更新仍需候选预览与确认，两者独立。

## 普通用户：Chrome Web Store

从商店安装的扩展由 Chrome 定期检查并自动更新，之后无需从 GitHub 下载、解压或重新导入。发布者在**同一个商店条目**上传更高 manifest 版本，通过审核并发布；浏览器按自身时机更新，可能不会立即生效。按钮仅调用 `runtime.requestUpdateCheck`，可能返回无更新、有更新或检查过于频繁，不保证立即安装。

本仓库 V1.0 是 GitHub 正式软件发布，**尚未拥有已发布的商店条目，尚未通过商店审核**。没有虚构商店 ID 或自建更新服务。安装 ZIP 不设置 `update_url`；商店发布流程负责签名和官方更新渠道。

## 从 GitHub 开发副本迁移

1. 在旧副本「隐私和安全」导出配置备份。备份包含代理地址和可能带令牌的订阅 URL，请妥善保存。
2. 商店版本真正上线后，从该商店条目安装。已解压副本和商店签名副本可能具有不同扩展 ID，**本地存储不会自动共享**。
3. 避免两个代理扩展同时控制 Chrome；先禁用旧副本，再在新副本读取备份、检查预览、勾选替换确认并恢复。
4. 恢复不会自动授予站点权限；逐个重新授权订阅/诊断来源。若恢复要求 WebRTC 限制，会单独申请 `privacy`，拒绝则保留原配置。
5. 验证实际代理、规则和请求后再删除旧副本；本地备份可自行删除。

当前仍使用解压目录时，备份后在**同一目录**更新文件并在 `chrome://extensions` 点击重新加载；不要用新目录代替旧目录并假定数据自动迁移。

## 企业与自托管

Windows/macOS 的普通 Chrome 用户不能仅凭 GitHub ZIP 或自托管 CRX 获得正常的外部安装/自动更新。企业管理员可通过正式的受管策略部署 CRX、稳定签名密钥和更新清单；Linux 自托管也需要签名 CRX 与更新清单。这是独立部署工作，本项目不附带签名私钥或伪造的更新地址。管理员渠道显示实际 Chrome 状态，遵循企业策略。

`chrome.management.getSelf()` 仅检查本扩展，不需要 `management` 权限，不枚举其他扩展。手动更新检查不传输用户代理配置；Chrome 的更新服务会处理扩展 ID、版本及其正常更新请求。

## 官方依据

- [分发与平台限制](https://developer.chrome.com/docs/extensions/how-to/distribute)
- [自托管 CRX 与更新清单](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)
- [更新商店扩展](https://developer.chrome.com/docs/webstore/update)
- [requestUpdateCheck](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-requestUpdateCheck)
- [management.getSelf 权限例外](https://developer.chrome.com/docs/extensions/reference/api/management)
