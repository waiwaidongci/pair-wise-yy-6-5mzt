// 存储层：JSON 文件读写、原子落盘与串行事务。
// 所有“读-改-写”都经过 transact 排队，并发提交按到达顺序先后生效。
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATA_FILE || join(__dirname, "..", "data", "ink-stick-testing.json");

const seed = {
  items: [
    {
      code: "IS-001",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      status: "已试磨",
      logs: [{ at: "2026-06-11", step: "试磨", note: "宣纸20滴水，出墨快，评分86", score: 86 }],
    },
    {
      code: "IS-002",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      status: "待试磨",
      logs: [],
    },
  ],
};

let queue = Promise.resolve();

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await saveDb(seed);
  }
  return JSON.parse(await readFile(dbPath, "utf8"));
}

export async function saveDb(db) {
  const tmp = dbPath + ".tmp";
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, dbPath);
}

// 串行执行 fn(db)：先读、再改、后写，前一笔落盘后才处理下一笔。
export function transact(fn) {
  const run = queue.then(async () => {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}
