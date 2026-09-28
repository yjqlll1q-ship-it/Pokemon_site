/**
 * lib/db.ts
 * ---------------------------------------------------------------------------
 * SQLite 连接（单例，只读）。
 *
 * 驱动：Node 内置的 node:sqlite（Node ≥ 22.5 自带）。
 *   - 不需要 better-sqlite3 那类原生模块，省掉编译/预编译包下载的不确定性；
 *   - 是真正的 SQLite 引擎，「文件即数据库」，可直接用任何 SQLite 客户端打开。
 *
 * 数据库文件由 scripts/build-db.mjs 生成：
 *   npm run db          # 从 data/pokedex.json 重建 data/pokedex.db
 *   npm run db:check    # 体检（行数、外键、索引命中）
 *
 * 注意：本模块**只能在服务端使用**。客户端组件不要 import 它 ——
 * 图鉴查询页一律通过 /api/* 拿数据。
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';

let cached: DatabaseSync | null = null;

/** 数据库文件位置，可用环境变量 POKEDEX_DB 覆盖（测试时会用到） */
export function dbPath(): string {
  return process.env.POKEDEX_DB ?? path.join(process.cwd(), 'data', 'pokedex.db');
}

export function getDb(): DatabaseSync {
  if (cached) return cached;

  const file = dbPath();
  /*
   * turbopackIgnore 注释不是装饰：路径来自环境变量，构建期的静态分析无法确定它
   * 指向哪里，就会「把整个项目（包含 public/ 下 55MB 立绘）都算作服务端代码的一部分」
   * 打进产物，同时报一条 tracing 警告。这里明确告诉打包器不要追踪这次访问 ——
   * 数据库是运行时才需要的本地文件，与打包无关。
   */
  if (!existsSync(/* turbopackIgnore: true */ file)) {
    throw new Error(
      `找不到数据库 ${file}。请先执行 npm run db（从 data/pokedex.json 建库）。`,
    );
  }

  // 只读打开：查询接口没有写路径，避免任何意外的写锁与文件改动
  cached = new DatabaseSync(file, { readOnly: true });
  return cached;
}

/**
 * 执行一次查询并返回普通对象数组。
 * node:sqlite 返回的是 null 原型对象，这里统一转成普通对象，
 * 免得下游 JSON.stringify / Object.keys 出现意外行为。
 */
export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const st: StatementSync = getDb().prepare(sql);
  const rows = st.all(...(params as never[])) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r })) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  const st = getDb().prepare(sql);
  const row = st.get(...(params as never[])) as Record<string, unknown> | undefined;
  return row ? ({ ...row } as T) : undefined;
}
