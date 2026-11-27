import fs from "node:fs";
import path from "node:path";

const DIR = process.env.MEM_DIR || "E:\\dsh-home\\memory";
const KEY = process.env.OC_KEY;
const OUT = path.join(process.cwd(), "triggers.json");
const BATCH = 15;

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

const CONSTRAINT =
  /必须|不要|不能|不得|禁止|不允许|只(?:能|要|需|用)|仅(?:限|需|用)?|优先|一律|默认|避免|切记|务必|should|must|never|only|avoid/i;

const all = [...parse("preferences.md", "规则/偏好"), ...parse("pitfalls.md", "坑")].filter(
  (r) => r.body.length > 15 && CONSTRAINT.test((r.title + " " + r.body).toLowerCase()),
);

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const done = new Set(existing.map((x) => x.title));
const todo = all.filter((r) => !done.has(r.title));
console.log(`总规则 ${all.length}，已标注 ${done.size}，待标注 ${todo.length}`);

const results = [...existing];
let tokens = 0;

for (let start = 0; start < todo.length; start += BATCH) {
  const batch = todo.slice(start, start + BATCH);
  const prompt = `你会看到若干条"规则/偏好/坑"。对每一条，判断：当用户准备做某件事时，这条规则才应该被提醒？

输出严格的 JSON 数组，每项：{"i":序号,"when":"一句话说明什么时候该提醒（动词开头，如：新增接口时／改配置文件时／写文案时）","triggers":["5-8个用户可能说的话或意图短语"]}
要求：triggers 是用户自己会打出来的话（中文、短、具体），不是规则原文的缩写。不要输出解释。

规则列表：
${batch.map((r, i) => `[${i}] 标题：${r.title}\n正文：${r.body}`).join("\n\n")}`;

  let parsed = null;
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    try {
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
        console.log(`  ! HTTP ${res.status} ${raw.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const json = JSON.parse(raw);
      tokens += json.usage?.total_tokens || 0;
      let content = json.choices?.[0]?.message?.content ?? "";
      content = content.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
      const s = content.indexOf("[");
      const e = content.lastIndexOf("]");
      parsed = JSON.parse(content.slice(s, e + 1));
    } catch (err) {
      console.log(`  ! ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!parsed) {
    console.log(`  批次 ${start}..${start + batch.length} 失败，跳过`);
    continue;
  }

  for (const p of parsed) {
    const src = batch[p.i];
    if (!src) continue;
    results.push({ title: src.title, type: src.type, when: p.when, triggers: p.triggers });
  }
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2), "utf8");
  console.log(`  进度 ${Math.min(start + BATCH, todo.length)}/${todo.length}  累计 ${results.length} 条`);
}

console.log(`\n完成：${results.length} 条，token 合计 ${tokens}`);
