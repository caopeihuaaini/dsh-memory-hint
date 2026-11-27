import fs from "node:fs";

const ASAR = process.env.ASAR;
const WANT = process.argv[2];
const buf = fs.readFileSync(ASAR);

// asar: 4 bytes(0x04) + 4 bytes headerPickleSize? 标准格式：
// 0..3 uint32 = 4, 4..7 uint32 = headerSize+padding, 8..11 = ?, 12..15 = jsonLen
const jsonLen = buf.readUInt32LE(12);
const header = JSON.parse(buf.subarray(16, 16 + jsonLen).toString("utf8"));
const base = 8 + buf.readUInt32LE(4);

function walk(node, prefix) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + "/" + name : name;
    if (child.files) walk(child, p);
    else if (p === WANT || p.endsWith("/" + WANT)) return { p, child };
  }
  return null;
}

const found = walk({ files: header.files }, "");
if (!found) {
  console.log("未找到:", WANT);
  process.exit(1);
}
const off = base + Number(found.child.offset);
const size = Number(found.child.size);
const data = buf.subarray(off, off + size);
console.log(`=== ${found.p} (${size} bytes) ===`);
console.log(data.toString("utf8"));
