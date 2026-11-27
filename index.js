import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const name = "dsh-memory-hint";
export const inject = ["webServer"];

const ACTIONS = [
  { key: "merge", pat: /合并|合入|merge|cherry.?pick|rebase/i, words: ["合并", "合入", "merge", "rebase"] },
  { key: "commit", pat: /提交|commit|推送|push|暂存|stash/i, words: ["提交", "commit", "推送", "push"] },
  { key: "create", pat: /新增|添加|新建|新写|开发|实现|加一个|做一个|写一个|add|create|implement|build/i, words: ["新增", "添加", "新建", "开发", "实现", "add", "create"] },
  { key: "modify", pat: /修改|改动|调整|重构|改一下|编辑|替换|update|refactor|change|edit|fix/i, words: ["修改", "调整", "重构", "编辑", "update", "refactor"] },
  { key: "delete", pat: /删除|移除|删掉|清理|remove|delete|clean/i, words: ["删除", "移除", "清理", "remove", "delete"] },
  { key: "config", pat: /配置|设置|config|环境变量|接入|setting|env/i, words: ["配置", "设置", "接入", "config"] },
  { key: "doc", pat: /文档|doc|readme|说明|注释|联调记录|documentation/i, words: ["文档", "readme", "说明"] },
  { key: "test", pat: /测试|联调|验证|自测|debug|test|qa/i, words: ["测试", "联调", "验证", "test"] },
  { key: "release", pat: /发布|上线|发版|打包|部署|release|deploy|publish/i, words: ["发布", "上线", "部署", "release"] },
  { key: "query", pat: /查|查询|看下|看一下|排查|定位|分析|search|find|investigate/i, words: ["查询", "排查", "分析", "search"] },
  { key: "price", pat: /比价|报价|价格|成本|price|fare|quote|rate/i, words: ["比价", "报价", "价格", "成本"] },
  { key: "video", pat: /视频|剪辑|文案|脚本|分镜|字幕|动效|渲染|video|clip|subtitle|render/i, words: ["视频", "剪辑", "文案", "字幕"] },
  { key: "sql", pat: /sql|数据库|表结构|字段|索引|database|schema|migration/i, words: ["sql", "数据库", "字段"] },
  { key: "api", pat: /接口|api|请求|返回|参数|endpoint|request|response/i, words: ["接口", "api", "参数"] },
];

const actionsOf = (text) => {
  const s = String(text || "").toLowerCase();
  const out = new Set();
  for (const a of ACTIONS) if (a.pat.test(s)) out.add(a.key);
  return out;
};

function tokenize(text) {
  const out = new Set();
  const s = String(text || "").toLowerCase();
  for (const w of s.match(/[a-z0-9][a-z0-9_.\-]{1,}/g) || []) if (w.length >= 2) out.add(w);
  for (const run of s.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

const makeEntry = (title, body, type) => {
  const t = String(title || "").trim();
  if (!t) return null;
  const b = String(body || "").replace(/\s+/g, " ").trim().slice(0, 600);
  const full = t + " " + b;
  return { title: t.slice(0, 120), type, body: b, terms: new Set(tokenize(full)), actions: actionsOf(full) };
};

/** 解析一条规则文件：支持 ## 标题块、§ 分段、- 列表三种常见写法 */
function parseAny(text, type) {
  const out = [];
  const src = String(text || "").replace(/\r\n/g, "\n");

  // 1) ## 标题 + 正文（mneme 镜像）
  if (/^## /m.test(src)) {
    for (const block of src.split(/^## /m).slice(1)) {
      const nl = block.indexOf("\n");
      const title = (nl < 0 ? block : block.slice(0, nl)).trim();
      const rest = nl < 0 ? "" : block.slice(nl + 1);
      const body = rest
        .replace(/<!--[\s\S]*?-->/g, "")
        .split(/\n---\s*$/m)[0]
        .split("\n")
        .filter((l) => l.trim() && !/^\s*[-*]\s*\*\*(ID|类型|重要性|标签|更新时间|来源)\*\*/.test(l))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const e = makeEntry(title, body, type);
      if (e) out.push(e);
    }
    if (out.length) return out;
  }

  // 2) § 分段（DSH 个人笔记 MEMORY.md）
  if (src.includes("§")) {
    for (const para of src.split(/^§\s*$/m)) {
      const line = para.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
      if (line.length < 8) continue;
      const m = /^([^：:]{1,24})[：:]\s*(.*)$/.exec(line);
      const e = m ? makeEntry(m[1], m[2], type) : makeEntry(line.slice(0, 24), line.slice(24), type);
      if (e) out.push(e);
    }
    if (out.length) return out;
  }

  // 3) 列表项（AGENTS.md / CLAUDE.md 常见写法）
  const bullets = src.split("\n").filter((l) => /^\s*[-*+]\s+\S/.test(l));
  if (bullets.length >= 2) {
    for (const line of bullets) {
      const raw = line.replace(/^\s*[-*+]\s+/, "").replace(/^\[[ x]\]\s*/, "").trim();
      if (raw.length < 6) continue;
      const m = /^([^：:]{1,24})[：:]\s*(.*)$/.exec(raw);
      const e = m ? makeEntry(m[1], m[2], type) : makeEntry(raw.slice(0, 24), raw.slice(24), type);
      if (e) out.push(e);
    }
    if (out.length) return out;
  }

  // 4) 兜底：按空行分段
  for (const para of src.split(/\n\s*\n/)) {
    const line = para.replace(/^#.*$/gm, "").replace(/\s+/g, " ").trim();
    if (line.length < 10) continue;
    const e = makeEntry(line.slice(0, 24), line.slice(24), type);
    if (e) out.push(e);
  }
  return out;
}

const TYPE_OF = (name) => (/preference|规则|偏好/i.test(name) ? "规则/偏好" : /pitfall|坑/i.test(name) ? "坑" : "规则");

export function apply(ctx, config = {}) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const stateFile = path.join(home, "memory-hint.json");
  const cwd = process.cwd();
  const limit = Number.isFinite(config.limit) ? config.limit : 3;
  const minScore = Number.isFinite(config.minScore) ? config.minScore : 0.22;

  const readJson = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  const writeJson = (p, v) => {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(v, null, 2), "utf8");
      return true;
    } catch {
      return false;
    }
  };

  /** 候选规则库：路径存在且能解析出条目才算有效 */
  const candidates = () => {
    const list = [];
    const push = (id, label, dir, files) => {
      const paths = files.map((f) => path.join(dir, f)).filter((p) => {
        try {
          return fs.statSync(p).isFile();
        } catch {
          return false;
        }
      });
      if (!paths.length) return;
      let count = 0;
      for (const p of paths) {
        try {
          count += parseAny(fs.readFileSync(p, "utf8"), TYPE_OF(path.basename(p))).length;
        } catch {}
      }
      if (count > 0) list.push({ id, label, dir, files, count });
    };

    push("mneme", "dsh-mneme 记忆镜像", path.join(home, "memory"), ["preferences.md", "pitfalls.md", "rules.md"]);
    push("notes", "个人笔记 MEMORY.md", path.join(home, "memories"), ["MEMORY.md"]);
    push("agents-cwd", "AGENTS.md（当前工作区）", cwd, ["AGENTS.md", "CLAUDE.md", ".dsh/AGENTS.md"]);
    push("agents-home", "AGENTS.md（DSH 主目录）", home, ["AGENTS.md", "CLAUDE.md"]);
    return list;
  };

  const resolveBinding = () => {
    if (config && typeof config.dir === "string" && config.dir.trim()) {
      return { id: "config", label: "配置文件指定", dir: config.dir, files: null };
    }
    const saved = readJson(stateFile);
    if (saved && saved.id && saved.dir) return saved;
    const auto = candidates()[0];
    return auto ? { id: auto.id, label: auto.label, dir: auto.dir, files: auto.files, auto: true } : null;
  };

  let binding = resolveBinding();

  const loadEntries = (b) => {
    if (!b) return { entries: [], files: [] };
    let files = [];
    if (Array.isArray(config.files) && config.files.length) {
      files = config.files.map((f) => path.join(b.dir, f));
    } else if (b.files && b.files.length) {
      files = b.files.map((f) => path.join(b.dir, f));
    } else {
      try {
        files = fs.readdirSync(b.dir).filter((f) => f.toLowerCase().endsWith(".md")).map((f) => path.join(b.dir, f));
      } catch {}
    }
    const usable = files.filter((p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    });
    const entries = [];
    for (const p of usable) {
      try {
        entries.push(...parseAny(fs.readFileSync(p, "utf8"), TYPE_OF(path.basename(p))));
      } catch {}
    }
    return { entries, files: usable };
  };

  let cache = { key: "", entries: [], df: new Map(), N: 1, files: [] };
  const store = () => {
    if (!binding) return cache;
    const { entries, files } = loadEntries(binding);
    let mtime = 0;
    for (const p of files) {
      try {
        mtime = Math.max(mtime, fs.statSync(p).mtimeMs);
      } catch {}
    }
    const key = `${binding.id}|${binding.dir}|${files.length}|${mtime}`;
    if (key === cache.key) return cache;
    const df = new Map();
    for (const e of entries) for (const term of e.terms) df.set(term, (df.get(term) || 0) + 1);
    cache = { key, entries, df, N: Math.max(entries.length, 1), files };
    if (process.env.MH_DEBUG === "1") {
      console.log("[memory-hint]", JSON.stringify({ binding, files: files.map((f) => path.basename(f)), rules: entries.length }));
    }
    return cache;
  };

  const search = (query) => {
    const { entries, df, N } = store();
    const qTerms = tokenize(query);
    if (!qTerms.length) return [];
    const qActions = actionsOf(query);
    if (!qActions.size) return [];

    const actionTerms = new Set();
    // 「文档/接口/数据库/视频/价格」本身可能是宾语，不能当动作词排除掉
    const NOUN_LIKE = new Set(["doc", "api", "sql", "price", "video"]);
    for (const a of ACTIONS) {
      if (!qActions.has(a.key) || NOUN_LIKE.has(a.key)) continue;
      for (const t of tokenize(a.words.join(" "))) actionTerms.add(t);
    }

    const weightOf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
    const totalWeight = qTerms.reduce((a, t) => a + weightOf(t), 0) || 1;
    const rareLimit = Math.max(2, N * 0.03);

    const scored = [];
    for (const e of entries) {
      const matched = qTerms.filter((t) => e.terms.has(t));
      if (!matched.length) continue;
      const sharedActions = [...qActions].filter((a) => e.actions.has(a));
      if (!sharedActions.length) continue;
      const objectMatched = matched.filter((t) => !actionTerms.has(t));
      if (!objectMatched.length) continue;
      const rare = objectMatched.filter((t) => (df.get(t) || 0) <= rareLimit);
      let score = objectMatched.reduce((a, t) => a + weightOf(t), 0) / totalWeight;
      score += sharedActions.length * 0.22;
      if (rare.length >= 1) score += 0.05;
      if (score >= minScore) scored.push({ title: e.title, type: e.type, body: e.body, score: Math.round(score * 100) / 100 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  };

  const webServer = typeof ctx.reflect?.get === "function" ? ctx.reflect.get("webServer") : ctx.webServer;
  if (!webServer || typeof webServer.register !== "function") {
    ctx.logger?.warn?.("[memory-hint] webServer 不可用，跳过路由注册");
    return;
  }

  const json = (res, code, data) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(data));
  };

  ctx.effect(() => {
    const disposers = [];
    let reqCount = 0;

    disposers.push(
      webServer.register({
        path: "/api/dsh-memory-hint/search",
        method: "GET",
        handler(req, res) {
          try {
            const url = new URL(req.url, "http://127.0.0.1");
            const q = url.searchParams.get("q") || "";
            const items = search(q);
            const { entries } = store();
            // 调试开关：MH_DEBUG=1 时记录前几次请求，便于区分「没请求」与「没命中」
            if (process.env.MH_DEBUG === "1" && reqCount < 5) {
              reqCount++;
              ctx.logger?.info?.(`[memory-hint] search hits=${items.length} rules=${entries.length} q=${q.slice(0, 24)}`);
            }
            json(res, 200, {
              bound: binding ? binding.id : null,
              label: binding ? binding.label : null,
              rules: entries.length,
              setup: !binding || entries.length === 0,
              items,
            });
          } catch (error) {
            json(res, 500, { error: String(error && error.message ? error.message : error) });
          }
        },
      }),
    );

    disposers.push(
      webServer.register({
        path: "/api/dsh-memory-hint/sources",
        method: "GET",
        handler(req, res) {
          json(res, 200, { candidates: candidates(), bound: binding ? binding.id : null, dir: binding ? binding.dir : null });
        },
      }),
    );

    disposers.push(
      webServer.register({
        path: "/api/dsh-memory-hint/bind",
        method: "POST",
        handler(req, res) {
          let body = "";
          req.on("data", (c) => {
            body += c;
            if (body.length > 4096) req.destroy();
          });
          req.on("end", () => {
            try {
              const payload = JSON.parse(body || "{}");
              if (payload.id === "custom") {
                const dir = String(payload.dir || "").trim();
                if (!dir) return json(res, 400, { error: "缺少目录路径" });
                binding = { id: "custom", label: "自定义目录", dir, files: null };
              } else {
                const hit = candidates().find((c) => c.id === payload.id);
                if (!hit) return json(res, 404, { error: "未找到该来源" });
                binding = { id: hit.id, label: hit.label, dir: hit.dir, files: hit.files };
              }
              writeJson(stateFile, { id: binding.id, label: binding.label, dir: binding.dir, files: binding.files || null });
              cache = { key: "", entries: [], df: new Map(), N: 1, files: [] };
              const { entries } = store();
              json(res, 200, { ok: true, bound: binding.id, label: binding.label, rules: entries.length });
            } catch (error) {
              json(res, 500, { error: String(error && error.message ? error.message : error) });
            }
          });
        },
      }),
    );

    return () => {
      for (const d of disposers) {
        try {
          d?.();
        } catch {}
      }
    };
  });
}
