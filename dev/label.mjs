import fs from "node:fs";
import path from "node:path";

const DIR = process.env.MEM_DIR || "E:\\dsh-home\\memory";
const KEY = process.env.OC_KEY;
const N = Number(process.env.N || 20);

function parse(file, type) {
  const text = fs.readFileSync(path.join(DIR, file), "utf8");
  const out = [];
  for (const block of text.split(/^## /m).slice(1)) {
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
    if (title) out.push({ title, body: body.slice(0, 400), type });
  }
  return out;
}

const rules = [...parse("preferences.md", "规则/偏好"), ...parse("pitfalls.md", "坑")];
const sample = rules.filter((r) => r.body.length > 20).slice(0, N);

const prompt = `你会看到若干条"规则/偏好/坑"。对每一条，判断：当用户准备做某件事时，这条规则才应该被提醒？

输出严格的 JSON 数组，每项：{"i":序号,"when":"一句话说明什么时候该提醒（动词开头，如：新增接口时／改配置文件时／写文案时）","triggers":["5-8个用户可能说的话或意图短语"]}
要求：triggers 是用户自己会打出来的话（中文、短、具体），不是规则原文的缩写。不要输出解释。

规则列表：
${sample.map((r, i) => `[${i}] 标题：${r.title}\n正文：${r.body}`).join("\n\n")}`;

const res = await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${KEY}`,
    "x-opencode-session": "ses_label_0001",
  },
  body: JSON.stringify({
    model: "deepseek-v4.1-flash",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  }),
});

const raw = await res.text();
if (!res.ok) {
  console.log("HTTP", res.status, raw.slice(0, 300));
  process.exit(1);
}
const json = JSON.parse(raw);
let content = json.choices?.[0]?.message?.content ?? "";
content = content.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();

let parsed;
try {
  parsed = JSON.parse(content);
} catch {
  const s = content.indexOf("[");
  const e = content.lastIndexOf("]");
  parsed = JSON.parse(content.slice(s, e + 1));
}

const merged = parsed.map((p) => ({ ...sample[p.i], when: p.when, triggers: p.triggers }));
fs.writeFileSync(path.join(process.cwd(), "triggers.pilot.json"), JSON.stringify(merged, null, 2), "utf8");

console.log(`标注 ${merged.length}/${sample.length} 条，token: ${json.usage?.total_tokens}`);
for (const m of merged.slice(0, 8)) {
  console.log(`\n[${m.type}] ${m.title}`);
  console.log(`  何时: ${m.when}`);
  console.log(`  触发: ${(m.triggers || []).join(" / ")}`);
}
