import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "../index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const routes = new Map();
const fakeServer = { register: (r) => (routes.set(`${r.method || "GET"} ${r.path}`, r), () => {}) };
apply(
  { reflect: { get: (n) => (n === "webServer" ? fakeServer : undefined) }, effect: (f) => f(), logger: { warn: (m) => console.log("[warn]", m) } },
  { dir: path.join(here, "fixture"), limit: 3, minScore: 0.22 },
);

const call = (route, { url = "/", body = null } = {}) =>
  new Promise((resolve) => {
    const req = new EventEmitter();
    req.url = url;
    const res = { writeHead() {}, end: (b) => resolve(JSON.parse(b)) };
    route.handler(req, res);
    if (body !== null) {
      req.emit("data", JSON.stringify(body));
      req.emit("end");
    }
  });

const sources = await call(routes.get("GET /api/dsh-memory-hint/sources"));
console.log("=== 检测到的规则库 ===");
for (const c of sources.candidates) console.log(`  ${c.id.padEnd(12)} ${String(c.count).padStart(4)} 条  ${c.label}  → ${c.dir}`);
console.log("当前绑定:", sources.bound, sources.dir || "");

const queries = [
  "现在可以",
  "把这次改动合并到 Release 分支",
  "提交之前先跑一下测试",
  "新增一个接口，顺便补下文档",
  "不要直接改生产配置",
  "今天天气不错",
];
for (const q of queries) {
  const d = await call(routes.get("GET /api/dsh-memory-hint/search"), { url: "/?q=" + encodeURIComponent(q) });
  console.log(`\n${d.items.length} hits | ${q}  (bound=${d.bound}, rules=${d.rules}, setup=${d.setup})`);
  for (const it of d.items) console.log(`   ${it.score}  ${it.title}`);
}
