import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import { URL, pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";
import { Buffer } from "node:buffer";

const extensionPath = resolve("dist");
const profile = await mkdtemp(join(tmpdir(), "proxyflow-smoke-"));
const requests = [];
const sockets = new Set();
const server = createServer((req, res) => {
  requests.push(req.url);
  res.writeHead(200, { "Content-Type": "text/plain", Connection: "close" });
  res.end("ProxyFlow local proxy fixture");
});
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
async function stopProxy() {
  if (!server.listening) return;
  const closed = new Promise((done) => server.close(done));
  for (const socket of sockets) socket.destroy();
  await closed;
}
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROMIUM_PATH ||
      (process.env.CI ? chromium.executablePath() : "/usr/bin/chromium"),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
    viewport: { width: 1280, height: 900 },
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  context.setDefaultTimeout(20000);
  context.setDefaultNavigationTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.getByText("从你的第一个代理开始").waitFor();
  await page.locator('input[name="name"]').fill("Smoke Proxy");
  await page.locator('input[name="host"]').fill("127.0.0.1");
  await page.locator('input[name="port"]').fill(String(port));
  await page.getByRole("button", { name: "添加并应用配置" }).click();
  await page.getByText("配置已应用", { exact: true }).waitFor();
  await page
    .locator(".mode-grid")
    .getByRole("button", { name: "全局代理", exact: false })
    .click();
  await page.waitForFunction(
    async () =>
      (await globalThis.chrome.proxy.settings.get({ incognito: false })).value
        .mode === "fixed_servers",
  );
  const target = await context.newPage();
  await target.goto("http://proxyflow-test.invalid/global");
  assert.equal(
    await target.locator("body").innerText(),
    "ProxyFlow local proxy fixture",
  );
  assert(requests.includes("http://proxyflow-test.invalid/global"));
  console.log("Verified fixed HTTP proxy request.");
  await page
    .locator(".mode-grid")
    .getByRole("button", { name: "智能分流", exact: false })
    .click();
  await page.waitForFunction(
    async () =>
      (await globalThis.chrome.proxy.settings.get({ incognito: false })).value
        .mode === "pac_script",
  );
  await target.goto("http://proxyflow-test.invalid/smart");
  assert(requests.includes("http://proxyflow-test.invalid/smart"));
  console.log("Verified PAC HTTP proxy request.");
  // Exercise real DNR including main_frame and earlier explicit allow exceptions.
  const saved = await page.evaluate(async () => {
    const { config } = await globalThis.chrome.runtime.sendMessage({
      type: "GET",
    });
    config.rules = [
      {
        id: "allow",
        type: "DOMAIN",
        value: "safe.block.invalid",
        action: "PROXY",
      },
      {
        id: "block",
        type: "DOMAIN-SUFFIX",
        value: "block.invalid",
        action: "REJECT",
      },
      { id: "match", type: "MATCH", value: "", action: "PROXY" },
    ];
    return globalThis.chrome.runtime.sendMessage({ type: "SAVE", config });
  });
  assert(!saved.error, saved.error);
  await target.goto("http://safe.block.invalid/allow");
  assert(requests.includes("http://safe.block.invalid/allow"));
  await assert.rejects(
    () => target.goto("http://bad.block.invalid/reject"),
    /ERR_BLOCKED_BY_CLIENT/,
  );
  assert(!requests.includes("http://bad.block.invalid/reject"));
  console.log("Verified ordered DNR reject/allow.");
  // Stop the proxy. A newly issued proxied request must fail and mode must stay smart.
  await stopProxy();
  await assert.rejects(() =>
    target.goto("http://proxyflow-test.invalid/offline", { timeout: 15000 }),
  );
  const failed = await page.evaluate(async () =>
    globalThis.chrome.proxy.settings.get({ incognito: false }),
  );
  assert.equal(failed.value.mode, "pac_script");
  assert(!requests.includes("http://proxyflow-test.invalid/offline"));
  console.log("Verified proxy outage without mode fallback.");
  // Explicit direct is a user mode change, never a failure fallback.
  await page
    .locator(".mode-grid")
    .getByRole("button", { name: "全局直连", exact: false })
    .click();
  await page.waitForFunction(async () => {
    const response = await globalThis.chrome.runtime.sendMessage({
      type: "GET",
    });
    const rules =
      await globalThis.chrome.declarativeNetRequest.getDynamicRules();
    return (
      response.config.mode === "direct" &&
      rules.length === 0 &&
      (await globalThis.chrome.proxy.settings.get({ incognito: false })).value
        .mode === "direct"
    );
  });
  const dnr = await page.evaluate(() =>
    globalThis.chrome.declarativeNetRequest.getDynamicRules(),
  );
  assert.equal(dnr.length, 0);
  console.log("Verified explicit direct mode and cleared routing DNR.");
  await page.reload();
  await page.getByText("Smoke Proxy", { exact: true }).waitFor();
  // V0.2 import UI uses real extension messaging only after preview and mapping.
  await page
    .getByRole("button", { name: "配置文件导入", exact: false })
    .click();
  await page
    .getByLabel("配置文本")
    .fill(
      "proxy-groups:\n  - name: ImportGroup\n    type: select\nrules:\n  - DOMAIN,imported.invalid,ImportGroup\n  - MATCH,DIRECT",
    );
  await page.getByRole("button", { name: "解析并预览" }).click();
  const selectedId = await page.evaluate(
    async () =>
      (await globalThis.chrome.runtime.sendMessage({ type: "GET" })).config
        .selectedId,
  );
  await page.getByLabel("映射 ImportGroup").selectOption("PROXY:" + selectedId);
  await page.getByRole("button", { name: "解析并预览" }).click();
  await page
    .getByRole("button", { name: "用预览规则替换全部现有规则" })
    .click();
  await page.waitForFunction(
    async () =>
      (await globalThis.chrome.runtime.sendMessage({ type: "GET" })).config
        .rules[0].value === "imported.invalid",
  );
  console.log("Verified import preview, mapping and apply.");
  // V0.3 ads apply in all modes and diagnostics identify blocking without fetch.
  for (const mode of ["direct", "global", "smart"]) {
    const result = await page.evaluate(async (nextMode) => {
      const { config } = await globalThis.chrome.runtime.sendMessage({
        type: "GET",
      });
      config.mode = nextMode;
      config.blocking = { enabled: true, domains: ["ads.invalid"] };
      return globalThis.chrome.runtime.sendMessage({ type: "SAVE", config });
    }, mode);
    assert(!result.error, result.error);
    await assert.rejects(
      () => target.goto(`http://sub.ads.invalid/${mode}`),
      /ERR_BLOCKED_BY_CLIENT/,
    );
    const diagnosis = await page.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({
        type: "TEST",
        url: "http://ads.invalid/diagnostic",
      }),
    );
    assert(!diagnosis.error, diagnosis.error);
    assert.equal(diagnosis.diagnostics.code, "AD_BLOCKED");
    assert(!requests.includes(`http://sub.ads.invalid/${mode}`));
  }
  console.log("Verified ads and diagnostics in three modes.");
  const restored = await page.evaluate(async () => {
    const { config } = await globalThis.chrome.runtime.sendMessage({
      type: "GET",
    });
    config.mode = "direct";
    config.blocking.enabled = false;
    return globalThis.chrome.runtime.sendMessage({ type: "SAVE", config });
  });
  assert(!restored.error, restored.error);
  const installed = await page.evaluate(async () =>
    globalThis.chrome.runtime.sendMessage({ type: "UPDATE_INFO" }),
  );
  assert(!installed.error, installed.error);
  assert.equal(installed.installation.channel, "development");
  assert.equal(installed.installation.canCheck, false);
  const guarded = await page.evaluate(async () => {
    const before = await globalThis.chrome.runtime.sendMessage({ type: "GET" });
    const online = await globalThis.chrome.runtime.sendMessage({
      type: "FETCH_CONFIG",
      url: "https://rules.example/list.txt",
    });
    const rtc = await globalThis.chrome.runtime.sendMessage({
      type: "SAVE",
      config: { ...before.config, webRtc: "restrict" },
    });
    const update = await globalThis.chrome.runtime.sendMessage({
      type: "UPDATE_CHECK",
    });
    const after = await globalThis.chrome.runtime.sendMessage({ type: "GET" });
    return { online, rtc, update, before: before.config, after: after.config };
  });
  assert.match(guarded.online.error, /权限/);
  assert.match(guarded.rtc.error, /privacy/);
  assert.equal(guarded.update.extensionUpdate.status, "unsupported");
  assert.deepEqual(guarded.before, guarded.after);
  await page.getByRole("button", { name: "隐私和安全", exact: false }).click();
  const restoredConfig = { ...guarded.after, theme: "light" };
  await page.getByLabel("配置备份文件").setInputFiles({
    name: "proxyflow-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "proxyflow-backup",
        schema: 1,
        config: restoredConfig,
      }),
    ),
  });
  await page.getByText("将恢复 1 个代理", { exact: false }).waitFor();
  const restoreButton = page.getByRole("button", {
    name: "确认恢复并应用配置",
  });
  assert.equal(await restoreButton.isDisabled(), true);
  await page.getByRole("checkbox", { name: "确认替换全部本地配置" }).check();
  await restoreButton.click();
  await page.waitForFunction(
    async (revision) =>
      (await globalThis.chrome.runtime.sendMessage({ type: "GET" })).config
        .revision ===
      revision + 1,
    guarded.after.revision,
  );
  console.log(
    "Verified online/RTC permission guards, development update guard and confirmed backup restore.",
  );
  await page.getByRole("button", { name: "代理服务器", exact: false }).click();
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/screenshots/options-light.png",
    fullPage: false,
  });
  await page.getByRole("combobox", { name: "主题" }).selectOption("dark");
  await page.waitForFunction(
    () => globalThis.document.documentElement.dataset.theme === "dark",
  );
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({
    path: "artifacts/screenshots/options-dark.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "配置文件导入", exact: false })
    .click();
  await page
    .getByLabel("在线配置链接")
    .fill("https://rules.example/config.yaml");
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/screenshots/import-dark.png" });
  await page
    .getByRole("button", { name: "关于 ProxyFlow", exact: false })
    .click();
  await page.getByText("此副本由已解压目录加载", { exact: false }).waitFor();
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/screenshots/update-dark.png" });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 620 });
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole("heading", { name: "Smoke Proxy" }).waitFor();
  await popup.screenshot({ path: "artifacts/screenshots/popup.png" });
  const promo = await context.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  await promo.goto(pathToFileURL(resolve("docs/store/promo.html")).href);
  await promo.screenshot({ path: "artifacts/screenshots/promo-small.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/browser-report.json",
    JSON.stringify(
      {
        verified: true,
        browser: context.browser().version(),
        platform: process.platform,
        extensionVersion: installed.installation.version,
        commit: process.env.GITHUB_SHA ?? null,
        checks: [
          "install wizard",
          "HTTP fixed proxy request",
          "HTTP PAC proxy request",
          "DNR ordered reject/allow",
          "proxy outage without mode fallback",
          "direct mode",
          "storage reload",
          "import preview/mapping/apply",
          "cross-mode ad blocking",
          "AD_BLOCKED diagnostics",
          "development update channel",
          "online config permission guard",
          "WebRTC missing permission guard",
          "confirmed backup restore",
          "themes and Popup",
        ],
        limitations: [
          "No third-party proxy client acceptance",
          "No Chrome Web Store signed update acceptance",
          "No DNS/QUIC/STUN leak guarantee",
          "HTTPS online import and WebRTC permission prompts require separate acceptance",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Chromium smoke passed: installation wizard, UI save, fixed proxy, PAC proxy, ordered DNR reject/allow, proxy outage, direct switch, storage reload, import preview/mapping/apply, V0.3 cross-mode ad blocking and AD_BLOCKED diagnostics, themes, Popup. Subscription HTTPS and WebRTC permission behavior require separate manual acceptance.",
  );
} finally {
  await stopProxy();
  if (context) await context.close();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
