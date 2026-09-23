// 存储层:JSON 文件持久化。写操作经事务队列串行执行,
// 并发提交按到达顺序落库,先到的先赢。
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, "..", "data", "ink-stick-testing.json");

const seed = {
  items: [
    {
      id: "IS-seed-03",
      code: "IS-003",
      smokeSource: "漆烟",
      glueRatio: "7%",
      ageYears: 1,
      storage: "试样盒A",
      status: "待试磨",
      sessions: [],
      logs: [{ at: "2026-09-20T01:00:00.000Z", step: "建档", note: "创建墨锭" }]
    },
    {
      id: "IS-seed-02",
      code: "IS-002",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "试样盒C",
      status: "待冷却",
      sessions: [
        {
          id: "S-seed-02",
          requestId: null,
          at: "2026-09-22T02:10:00.000Z",
          stone: "歙州罗纹",
          weight: 98.2,
          minutes: 24,
          surfaceTemp: 46.2,
          tester: "陆墨生",
          state: "cooling",
          reasons: ["超时长:24分钟", "高温:46.2℃"],
          rechecks: [
            { at: "2026-09-22T04:00:00.000Z", temp: 36.1, by: "沈砚农", requestId: null }
          ],
          rechecksArchived: [],
          corrections: [],
          admission: null
        }
      ],
      logs: [
        { at: "2026-09-22T02:10:00.000Z", step: "试磨", note: "登记转待冷却:超时长:24分钟;高温:46.2℃" },
        { at: "2026-09-22T04:00:00.000Z", step: "复测", note: "沈砚农复测磨面36.1℃,等待第二次复测" }
      ]
    },
    {
      id: "IS-seed-01",
      code: "IS-001",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      status: "已试磨",
      sessions: [
        {
          id: "S-seed-01",
          requestId: null,
          at: "2026-09-21T06:30:00.000Z",
          stone: "端溪老坑",
          weight: 126.5,
          minutes: 15,
          surfaceTemp: 38.4,
          tester: "沈砚农",
          state: "done",
          reasons: [],
          rechecks: [],
          rechecksArchived: [],
          corrections: [],
          admission: null
        }
      ],
      logs: [
        { at: "2026-09-21T06:30:00.000Z", step: "试磨", note: "登记合格,计入已试磨(试磨人沈砚农)" }
      ]
    }
  ]
};

let chain = Promise.resolve();

function normalize(db) {
  db.items ||= [];
  for (const item of db.items) {
    item.sessions ||= [];
    item.logs ||= [];
  }
  return db;
}

async function saveDb(db) {
  const tmp = dbPath + ".tmp";
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, dbPath);
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await saveDb(normalize(structuredClone(seed)));
  }
  return normalize(JSON.parse(await readFile(dbPath, "utf8")));
}

// 读:每次从磁盘取最新数据,保证刷新后列表、统计、履历一致
export function read() {
  return loadDb();
}

// 写:串行事务,前一个事务落库后下一个才能开始
export function transact(fn) {
  const run = chain.then(async () => {
    const db = await loadDb();
    const result = await fn(db);
    await saveDb(db);
    return result;
  });
  chain = run.catch(() => {});
  return run;
}
