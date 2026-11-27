import fs from "node:fs";

const buf = fs.readFileSync(process.env.ASAR);
const jsonLen = buf.readUInt32LE(12);
const header = JSON.parse(buf.subarray(16, 16 + jsonLen).toString("utf8"));
const needle = process.argv[2] || "dsh-llm";

const out = [];
(function walk(node, prefix) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + "/" + name : name;
    if (child.files) walk(child, p);
    else if (p.includes(needle)) out.push(`${p}  (${child.size}B)`);
  }
})({ files: header.files }, "");

console.log(`包含 "${needle}" 的文件 ${out.length} 个：`);
for (const line of out.slice(0, 40)) console.log("  " + line);
