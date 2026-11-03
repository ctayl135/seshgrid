import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const result = await build({
  entryPoints: ["tests/browser-engine.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
});
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>SeshGrid audio integration test</title><style>body{background:#14171b;color:#edf2e7;font:17px system-ui;max-width:800px;margin:70px auto;padding:20px}button{background:#c6f778;border:0;border-radius:8px;padding:15px;font:inherit}output{display:block;line-height:1.8;margin-top:30px}p{color:#a3aeb9}</style><h1>SeshGrid audio integration test</h1><p>Uses the studio's real audio engine and recording code with an oscillator stream. This test never requests microphone access.</p><button id="run">Run audio pipeline test</button><output id="result" role="status">Ready</output><script src="/harness.js"></script></html>`;
const processor = await readFile("public/recorder.js");
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } else if (req.url === "/harness.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(result.outputFiles[0].contents);
  } else if (req.url === "/recorder.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(processor);
  } else {
    res.statusCode = 404;
    res.end();
  }
});
server.listen(3002, "127.0.0.1", () =>
  console.log("Synthetic audio integration test: http://127.0.0.1:3002"),
);
process.on("SIGINT", () => server.close(() => process.exit(0)));
