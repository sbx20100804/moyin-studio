// Local HTTP proxy for crates.io so cargo never has to negotiate TLS itself.
// Serves a sparse index at /index/ and crate downloads at /crates/...
const http = require("http");
const https = require("https");
const { pipeline } = require("stream");

const PORT = Number(process.env.CARGO_PROXY_PORT || 8791);
const INDEX = "https://index.crates.io";
const STATIC = "https://static.crates.io";

function proxyTo(res, url, rewriteConfig) {
  const req = https.get(
    url,
    { headers: { "user-agent": "cargo-local-proxy" }, timeout: 60000 },
    (up) => {
      if (rewriteConfig) {
        const chunks = [];
        up.on("data", (c) => chunks.push(c));
        up.on("end", () => {
          let body = Buffer.concat(chunks).toString("utf8");
          body = body.replace(/"dl"\s*:\s*"[^"]*"/, `"dl":"http://127.0.0.1:${PORT}/crates"`);
          res.writeHead(200, {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          });
          res.end(body);
        });
        return;
      }
      res.writeHead(up.statusCode || 502, {
        "content-type": up.headers["content-type"] || "application/octet-stream",
      });
      pipeline(up, res, () => {});
    }
  );
  req.on("timeout", () => req.destroy(new Error("upstream timeout")));
  req.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("proxy error: " + e.message);
  });
}

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/health") {
      res.writeHead(200);
      return res.end("ok");
    }
    if (u.pathname === "/index/config.json") {
      return proxyTo(res, INDEX + "/config.json", true);
    }
    if (u.pathname.startsWith("/index/")) {
      return proxyTo(res, INDEX + u.pathname.slice("/index".length), false);
    }
    if (u.pathname.startsWith("/crates/")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const name = decodeURIComponent(parts[1] || "");
      const version = decodeURIComponent(parts[2] || "");
      if (!name || !version) {
        res.writeHead(400);
        return res.end("bad request");
      }
      return proxyTo(res, `${STATIC}/crates/${name}/${name}-${version}.crate`, false);
    }
    res.writeHead(404);
    res.end("not found");
  })
  .listen(PORT, "127.0.0.1", () => console.log(`cargo proxy listening on http://127.0.0.1:${PORT}`));
