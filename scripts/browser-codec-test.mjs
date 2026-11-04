import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const code = `import {convertAudio} from './src/lib/codecs';import{encodeWav}from'./src/lib/wav';document.querySelector('button').onclick=async()=>{const el=document.querySelector('pre');try{const sr=44100,x=Float32Array.from({length:sr},(_,i)=>.15*Math.sin(2*Math.PI*440*i/sr)),wav=new Blob([encodeWav([x,x],sr)],{type:'audio/wav'});for(const format of ['wav','mp3','m4a','flac','ogg','aac','aiff']){el.textContent+='Testing '+format+'...\\n';const encoded=await convertAudio(wav,format);if(!encoded.size)throw Error('Empty '+format);const restored=await convertAudio(encoded,'wav');const c=new AudioContext(),b=await c.decodeAudioData(await restored.arrayBuffer());if(Math.abs(b.duration-1)>.2||b.numberOfChannels!==2)throw Error('Roundtrip '+format+' '+b.duration);const a=b.getChannelData(0);if(!a.every(Number.isFinite)||Math.max(...a.slice(0,22050))<.05)throw Error('Silent '+format);await c.close();el.textContent+=format.toUpperCase()+' PASS '+encoded.size+' bytes '+b.duration.toFixed(3)+'s\\n';}el.textContent+='ALL SEVEN FORMATS PASS';}catch(e){el.textContent+='FAIL '+e.message;}};`;
const bundle = await build({
  stdin: { contents: code, resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: "esm",
});
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<button>Test audio formats</button><pre>Ready\\n</pre><script type="module" src="/runner.js"></script>',
      );
    } else if (url.pathname === "/runner.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].contents);
    } else if (
      [
        "/audio-codec-worker.js",
        "/codecs/ffmpeg-core.js",
        "/codecs/ffmpeg-core.wasm",
      ].includes(url.pathname)
    ) {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      );
      res.end(await readFile("public" + url.pathname));
    } else {
      res.statusCode = 404;
      res.end();
    }
  } catch {
    res.statusCode = 500;
    res.end();
  }
}).listen(3004, "127.0.0.1", () =>
  console.log("Codec browser test on http://127.0.0.1:3004"),
);
