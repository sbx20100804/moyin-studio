// Dev helper: run JS inside the app's WebView2 and capture a screenshot.
// Usage: CDP_PORT=9337 EVAL_FILE=script.js node tools/dev-cdp.cjs out.png
const fs = require("fs");
const http = require("http");

const PORT = Number(process.env.CDP_PORT || 9333);
const OUT = process.argv[2] || "shot.png";

function getJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error("bad json"));
          }
        });
      })
      .on("error", reject);
  });
}

(async () => {
  const targets = await getJson("/json/list");
  const page = targets.find((t) => t.type === "page");
  if (!page) {
    console.log("NO_PAGE");
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });

  if (process.env.RELOAD) {
    await send("Network.enable");
    await send("Network.clearBrowserCache");
    await send("Page.enable");
    await send("Page.reload", { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 3000));
  }

  const expr = process.env.EVAL_FILE ? fs.readFileSync(process.env.EVAL_FILE, "utf8") : "";
  if (expr) {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log("EVAL=" + JSON.stringify(r.result.value ?? r.result.description ?? r.result));
    await new Promise((r2) => setTimeout(r2, Number(process.env.WAIT || 500)));
  }

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("SAVED=" + OUT);
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.log("ERR=" + e.message);
  process.exit(1);
});
