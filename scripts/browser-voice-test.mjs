import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const bundle = await build({
  entryPoints: ["tests/browser-voice.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  write: false,
});
const processor = await readFile("public/recorder.js");
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><meta charset="utf-8"><title>NOIR synthetic voice check</title><style>body{background:#111;color:#fff;font:16px system-ui;padding:24px;max-width:700px}button,summary{padding:12px;margin:6px;cursor:pointer}small{display:block}meter{width:100%}</style><div id="app"></div><script src="/test.js"></script>',
    );
  } else if (req.url === "/test.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
  } else if (req.url === "/recorder.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(processor);
  } else {
    res.statusCode = 404;
    res.end();
  }
});
server.listen(3016, "127.0.0.1", () =>
  console.log("Synthetic voice check UI: http://127.0.0.1:3016"),
);
process.on("SIGINT", () => server.close(() => process.exit(0)));
