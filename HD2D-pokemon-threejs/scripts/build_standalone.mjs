import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const indexPath = path.join(dist, 'index.html');
const outPath = path.join(dist, 'standalone.html');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function slash(value) {
  return value.split(path.sep).join('/');
}

async function walk(dir) {
  const out = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function ffmpegAvailable() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function assetPayload(file, canCompressAudio, tempDir) {
  const ext = path.extname(file).toLowerCase();
  let bytes = await fsp.readFile(file);
  let mime = MIME[ext] || 'application/octet-stream';

  if (ext === '.wav' && canCompressAudio) {
    const target = path.join(
      tempDir,
      path.basename(file, ext) + '-' + Math.random().toString(36).slice(2) + '.m4a',
    );
    try {
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-i', file,
        '-vn',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        target,
      ], { stdio: 'ignore' });
      const encoded = await fsp.readFile(target);
      if (encoded.length > 0 && encoded.length < bytes.length) {
        bytes = encoded;
        mime = 'audio/mp4';
      }
    } catch {
      // Keep the original WAV for this asset if conversion fails.
    } finally {
      await fsp.rm(target, { force: true }).catch(() => {});
    }
  }

  return { mime, data: bytes.toString('base64'), bytes: bytes.length };
}

function cleanRef(value) {
  return value
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0];
}

function assetKeyFor(value, assets) {
  if (!value || /^(data:|blob:|https?:|#)/i.test(value)) return undefined;
  const raw = cleanRef(value);
  if (assets[raw]) return raw;
  const marker = raw.indexOf('assets/');
  if (marker >= 0 && assets[raw.slice(marker)]) return raw.slice(marker);
  return undefined;
}

function inlineCssUrls(css, assets) {
  return css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (whole, quote, value) => {
    const key = assetKeyFor(value, assets);
    if (!key) return whole;
    const item = assets[key];
    return 'url("data:' + item.mime + ';base64,' + item.data + '")';
  });
}

function cssAscii(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[^\x00-\x7F]/g, (ch) =>
      '\\' + ch.codePointAt(0).toString(16) + ' ',
    );
}

const html = await fsp.readFile(indexPath, 'utf8');
const scriptMatch = html.match(/<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/i);
if (!scriptMatch) throw new Error('Vite JS bundle not found in dist/index.html');

const cssMatches = [...html.matchAll(
  /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
)];

const scriptPath = path.join(dist, cleanRef(scriptMatch[1]));
let js = await fsp.readFile(scriptPath, 'utf8');

let css = '';
for (const match of cssMatches) {
  css += '\n' + await fsp.readFile(path.join(dist, cleanRef(match[1])), 'utf8');
}

const excluded = new Set([
  path.resolve(indexPath),
  path.resolve(scriptPath),
  ...cssMatches.map((m) => path.resolve(path.join(dist, cleanRef(m[1])))),
  path.resolve(outPath),
]);

const allFiles = await walk(dist);
const assetFiles = allFiles.filter((file) => {
  if (excluded.has(path.resolve(file))) return false;
  return !['.js', '.css', '.map', '.html'].includes(path.extname(file).toLowerCase());
});

const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'meowa-single-'));
const canCompressAudio = ffmpegAvailable();
const assets = {};
let sourceBytes = 0;
let packedBytes = 0;

for (let i = 0; i < assetFiles.length; i++) {
  const file = assetFiles[i];
  const rel = slash(path.relative(dist, file));
  const stat = await fsp.stat(file);
  sourceBytes += stat.size;
  const payload = await assetPayload(file, canCompressAudio, tempDir);
  assets[rel] = { mime: payload.mime, data: payload.data };
  packedBytes += payload.bytes;
  if ((i + 1) % 25 === 0 || i + 1 === assetFiles.length) {
    console.log('Packing asset', i + 1, '/', assetFiles.length, rel);
  }
}
await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});

css = inlineCssUrls(css, assets);

const cssBase64 = Buffer.from(css, 'utf8').toString('base64');
const jsBase64 = Buffer.from(js, 'utf8').toString('base64');

const assetJson = JSON.stringify(assets)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

const runtime = String.raw`
(function(){
  "use strict";
  var node=document.getElementById("__MEOWA_ASSETS__");
  var assets=JSON.parse(node.textContent||"{}");
  node.remove();

  function keyFor(value){
    if(typeof value!=="string"||!value||/^(data:|blob:|javascript:|#)/i.test(value)) return null;
    var raw=value.replace(/\\/g,"/").split(/[?#]/)[0];
    raw=raw.replace(/^\.\//,"").replace(/^\/+/, "");
    if(assets[raw]) return raw;
    var marker=raw.indexOf("assets/");
    if(marker>=0&&assets[raw.slice(marker)]) return raw.slice(marker);
    try{
      var u=new URL(value,document.baseURI);
      var p=decodeURIComponent(u.pathname).replace(/^\/+/, "");
      if(assets[p]) return p;
      marker=p.indexOf("assets/");
      if(marker>=0&&assets[p.slice(marker)]) return p.slice(marker);
    }catch(e){}
    return null;
  }

  function resolve(value){
    if(typeof value!=="string") return value;
    var key=keyFor(value);
    if(!key) return value;
    var item=assets[key];
    return "data:"+item.mime+";base64,"+item.data;
  }

  window.__MEOWA_ASSET__=resolve;

  var nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    if(typeof input==="string"||input instanceof URL){
      return nativeFetch(resolve(String(input)),init);
    }
    if(input instanceof Request){
      var resolved=resolve(input.url);
      if(resolved!==input.url) return nativeFetch(resolved,init);
    }
    return nativeFetch(input,init);
  };

  var nativeOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    var args=Array.prototype.slice.call(arguments);
    args[1]=resolve(String(url));
    return nativeOpen.apply(this,args);
  };

  var nativeSetAttribute=Element.prototype.setAttribute;
  Element.prototype.setAttribute=function(name,value){
    var n=String(name).toLowerCase();
    if(n==="src"||n==="href"||n==="poster") value=resolve(String(value));
    return nativeSetAttribute.call(this,name,value);
  };

  function patchUrlProperty(proto,prop){
    if(!proto) return;
    var descriptor=Object.getOwnPropertyDescriptor(proto,prop);
    if(!descriptor||!descriptor.set||!descriptor.get) return;
    try{
      Object.defineProperty(proto,prop,{
        configurable:descriptor.configurable,
        enumerable:descriptor.enumerable,
        get:descriptor.get,
        set:function(value){descriptor.set.call(this,resolve(String(value)));}
      });
    }catch(e){}
  }

  patchUrlProperty(window.HTMLImageElement&&HTMLImageElement.prototype,"src");
  patchUrlProperty(window.HTMLMediaElement&&HTMLMediaElement.prototype,"src");
  patchUrlProperty(window.HTMLSourceElement&&HTMLSourceElement.prototype,"src");

  var nativeSetProperty=CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty=function(name,value,priority){
    var v=String(value);
    if(/url\(/i.test(v)){
      v=v.replace(/url\((['"]?)([^)'"]+)\1\)/g,function(_,q,u){
        return "url("+q+resolve(u)+q+")";
      });
    }
    return nativeSetProperty.call(this,name,v,priority);
  };
})();
`;

const bootstrap = String.raw`
(function(){
  "use strict";

  function decode(id){
    var node=document.getElementById(id);
    var raw=atob(node.textContent||"");
    node.remove();
    var bytes=new Uint8Array(raw.length);
    for(var i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  var style=document.createElement("style");
  style.textContent=decode("__MEOWA_CSS__");
  document.head.appendChild(style);

  var module=document.createElement("script");
  module.type="module";
  module.textContent=decode("__MEOWA_JS__");
  document.body.appendChild(module);
})();
`;

const output =
  '<!doctype html>\n' +
  '<html lang="en">\n<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">\n' +
  '<meta name="theme-color" content="#000000">\n' +
  '<title>HD2D Pokemon World</title>\n' +
  '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;overscroll-behavior:none;touch-action:none}' +
  'body{min-height:100dvh}canvas{display:block}</style>\n' +
  '</head>\n<body>\n' +
  '<script id="__MEOWA_ASSETS__" type="application/json">' + assetJson + '</script>\n' +
  '<script id="__MEOWA_CSS__" type="application/octet-stream">' + cssBase64 + '</script>\n' +
  '<script id="__MEOWA_JS__" type="application/octet-stream">' + jsBase64 + '</script>\n' +
  '<script>' + runtime + '</script>\n' +
  '<script>' + bootstrap + '</script>\n' +
  '</body>\n</html>\n';

const invalid = [...output].filter((ch) => ch.codePointAt(0) > 127);
if (invalid.length) {
  throw new Error('Non-ASCII characters remain in standalone output');
}

await fsp.writeFile(outPath, output, 'ascii');
const stat = await fsp.stat(outPath);

console.log(JSON.stringify({
  output: 'dist/standalone.html',
  assetCount: Object.keys(assets).length,
  sourceAssetMB: +(sourceBytes / 1024 / 1024).toFixed(2),
  embeddedAssetMB: +(packedBytes / 1024 / 1024).toFixed(2),
  standaloneMB: +(stat.size / 1024 / 1024).toFixed(2),
  audio: canCompressAudio ? 'AAC 96k embedded' : 'WAV embedded',
  asciiOnly: true
}, null, 2));
