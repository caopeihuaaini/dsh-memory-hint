import { apply } from "../index.js";

const dir = process.argv[2];
const captured = [];
const fakeServer = { register: (r) => (captured.push(r), () => {}) };
apply(
  { reflect: { get: (n) => (n === "webServer" ? fakeServer : undefined) }, effect: (f) => f(), logger: { warn: (m) => console.log("[warn]", m) } },
  { dir, limit: 3, minScore: 0.22 },
);
const route = captured.find((r) => r.path === "/api/dsh-memory-hint/search");

const queries = process.argv.slice(3);
for (const q of queries) {
  await new Promise((resolve) => {
    route.handler(
      { url: "/api/dsh-memory-hint/search?q=" + encodeURIComponent(q) },
      {
        writeHead() {},
        end(body) {
          const d = JSON.parse(body);
          console.log(`${String(d.items.length).padStart(2)} | ${q}`);
          for (const it of d.items) console.log(`     ${it.score}  ${it.title}`);
          resolve();
        },
      },
    );
  });
}
