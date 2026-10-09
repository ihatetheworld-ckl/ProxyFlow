import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { ExtensionUpdate, InstallationInfo } from "../utils/types";
import { request } from "./client";
import { PROJECT_URL } from "../updates/service";
const channels = {
  development: "已解压开发目录",
  store: "Chrome Web Store 更新渠道",
  managed: "管理员部署",
  other: "其他安装渠道",
  unknown: "无法确认安装渠道",
};
export function UpdatePanel() {
  const [info, setInfo] = useState<InstallationInfo>();
  const [result, setResult] = useState<ExtensionUpdate>();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let mounted = true;
    void request({ type: "UPDATE_INFO" })
      .then((r) => {
        if (mounted) setInfo(r.installation);
      })
      .catch(() => {
        if (mounted) setError("无法读取安装渠道");
      });
    return () => {
      mounted = false;
    };
  }, []);
  async function check() {
    setChecking(true);
    setError("");
    try {
      setResult((await request({ type: "UPDATE_CHECK" })).extensionUpdate);
    } catch {
      setError("更新检查失败，请检查 Chrome 网络和安装渠道");
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="panel prose">
      <h2>扩展版本与在线更新</h2>
      <p>
        当前版本：{info?.version ?? "正在读取…"} ·{" "}
        {info ? channels[info.channel] : "正在确认安装渠道"}
      </p>
      {info?.channel === "development" ? (
        <div className="alert">
          此副本由已解压目录加载，Chrome 不会在线替换目录中的代码。
          商店版本上架后，从 Chrome Web Store 安装即可由 Chrome 自动更新。
        </div>
      ) : (
        <p>
          已发布的商店扩展由 Chrome 定期自动更新；管理员部署遵循企业更新策略。
          点击检查仅请求 Chrome 检查该安装渠道，不下载 GitHub 代码或配置。
        </p>
      )}
      <div className="import-actions">
        <button
          disabled={!info?.canCheck || checking}
          onClick={() => void check()}
        >
          <RefreshCw size={15} />{" "}
          {checking ? "正在检查…" : "请求 Chrome 检查更新"}
        </button>
        {info?.storeUrl && (
          <a
            className="button-link"
            href={info.storeUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} /> 当前商店条目
          </a>
        )}
        <a
          className="button-link"
          href={PROJECT_URL + "/releases"}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} /> GitHub 版本与下载
        </a>
      </div>
      {result && (
        <div role="status" className="alert">
          {result.message}
          {result.version && " 版本：" + result.version}
        </div>
      )}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      <p className="footnote">
        配置订阅更新与扩展代码更新分别处理。商店发布仍需开发者账号、条目、审核与签名；GitHub
        ZIP 不会自动转为商店安装。
      </p>
    </section>
  );
}
