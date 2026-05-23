import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

// 数据库文件路径，放在项目根目录的 data 目录下
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "sqlite.db");

// 确保 data 目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// 创建 better-sqlite3 连接实例
const sqlite = new Database(DB_PATH);

// 开启 WAL 模式，提升并发读写性能
sqlite.pragma("journal_mode = WAL");
// 开启外键约束
sqlite.pragma("foreign_keys = ON");

type ColumnDefinition = {
  name: string;
  sql: string;
};

function ensureTable(tableName: string, createSql: string) {
  sqlite.exec(createSql);

  const existingColumns = new Set(
    sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => (column as { name: string }).name)
  );

  return (columns: ColumnDefinition[]) => {
    for (const column of columns) {
      if (!existingColumns.has(column.name)) {
        sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.sql}`);
      }
    }
  };
}

function bootstrapSchema() {
  const ensureProjects = ensureTable(
    "projects",
    `CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      status text DEFAULT 'draft' NOT NULL,
      product_name text,
      product_category text,
      product_description text,
      product_images text DEFAULT '[]',
      product_analysis text,
      product_id text,
      brand_id text,
      template_id text,
      video_mode text DEFAULT 'product_closeup',
      source_type text DEFAULT 'manual',
      source_video_url text,
      character_id text,
      created_at integer,
      updated_at integer
    )`
  );

  const ensureProducts = ensureTable(
    "products",
    `CREATE TABLE IF NOT EXISTS products (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      category text NOT NULL,
      description text,
      images text DEFAULT '[]',
      price text,
      target_audience text,
      analysis text,
      video_count integer DEFAULT 0,
      created_at integer,
      updated_at integer
    )`
  );

  const ensureBrandSettings = ensureTable(
    "brand_settings",
    `CREATE TABLE IF NOT EXISTS brand_settings (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      logo_path text,
      primary_color text,
      secondary_color text,
      font_family text,
      watermark text,
      intro_template_path text,
      outro_template_path text,
      is_default integer DEFAULT true,
      created_at integer
    )`
  );

  const ensureScriptTemplates = ensureTable(
    "script_templates",
    `CREATE TABLE IF NOT EXISTS script_templates (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      description text,
      category text,
      video_mode text,
      style_type text,
      shots text DEFAULT '[]',
      source_project_id text,
      use_count integer DEFAULT 0,
      created_at integer
    )`
  );

  const ensureCharacters = ensureTable(
    "characters",
    `CREATE TABLE IF NOT EXISTS characters (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      description text,
      appearance text,
      reference_images text DEFAULT '[]',
      voice_profile text,
      is_default integer DEFAULT false,
      created_at integer,
      updated_at integer
    )`
  );

  const ensureSettings = ensureTable(
    "settings",
    `CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY NOT NULL,
      value text,
      updated_at integer
    )`
  );

  const ensureScripts = ensureTable(
    "scripts",
    `CREATE TABLE IF NOT EXISTS scripts (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      version integer DEFAULT 1 NOT NULL,
      style_type text NOT NULL,
      title text,
      total_duration integer,
      shots text DEFAULT '[]',
      selected integer DEFAULT false,
      created_at integer,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    )`
  );

  const ensureAssets = ensureTable(
    "assets",
    `CREATE TABLE IF NOT EXISTS assets (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      shot_id integer NOT NULL,
      type text NOT NULL,
      file_path text,
      thumbnail_path text,
      provider text,
      model text,
      prompt text,
      status text DEFAULT 'pending' NOT NULL,
      created_at integer,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    )`
  );

  const ensureVideoClips = ensureTable(
    "video_clips",
    `CREATE TABLE IF NOT EXISTS video_clips (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      shot_id integer NOT NULL,
      asset_id text,
      file_path text,
      duration integer,
      provider text,
      model text,
      transition_type text DEFAULT 'ai_start_end',
      status text DEFAULT 'pending' NOT NULL,
      created_at integer,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    )`
  );

  const ensureCompositions = ensureTable(
    "compositions",
    `CREATE TABLE IF NOT EXISTS compositions (
      id text PRIMARY KEY NOT NULL,
      project_id text NOT NULL,
      output_path text,
      resolution text DEFAULT '1080p',
      aspect_ratio text DEFAULT '9:16',
      duration integer,
      bgm_path text,
      tts_enabled integer DEFAULT false,
      subtitle_style text,
      status text DEFAULT 'pending' NOT NULL,
      created_at integer,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    )`
  );

  ensureProjects([
    { name: "product_id", sql: "product_id text" },
    { name: "brand_id", sql: "brand_id text" },
    { name: "template_id", sql: "template_id text" },
    { name: "video_mode", sql: "video_mode text DEFAULT 'product_closeup'" },
    { name: "source_type", sql: "source_type text DEFAULT 'manual'" },
    { name: "source_video_url", sql: "source_video_url text" },
    { name: "character_id", sql: "character_id text" },
  ]);

  ensureProducts([
    { name: "price", sql: "price text" },
    { name: "target_audience", sql: "target_audience text" },
    { name: "analysis", sql: "analysis text" },
    { name: "video_count", sql: "video_count integer DEFAULT 0" },
    { name: "updated_at", sql: "updated_at integer" },
  ]);

  ensureBrandSettings([
    { name: "secondary_color", sql: "secondary_color text" },
    { name: "font_family", sql: "font_family text" },
    { name: "watermark", sql: "watermark text" },
    { name: "intro_template_path", sql: "intro_template_path text" },
    { name: "outro_template_path", sql: "outro_template_path text" },
    { name: "is_default", sql: "is_default integer DEFAULT true" },
  ]);

  ensureScriptTemplates([
    { name: "source_project_id", sql: "source_project_id text" },
    { name: "use_count", sql: "use_count integer DEFAULT 0" },
  ]);

  ensureCharacters([
    { name: "appearance", sql: "appearance text" },
    { name: "reference_images", sql: "reference_images text DEFAULT '[]'" },
    { name: "voice_profile", sql: "voice_profile text" },
    { name: "is_default", sql: "is_default integer DEFAULT false" },
    { name: "updated_at", sql: "updated_at integer" },
  ]);

  ensureVideoClips([
    { name: "transition_type", sql: "transition_type text DEFAULT 'ai_start_end'" },
  ]);

  ensureCompositions([
    { name: "tts_enabled", sql: "tts_enabled integer DEFAULT false" },
    { name: "subtitle_style", sql: "subtitle_style text" },
  ]);
}

bootstrapSchema();

// 创建 drizzle ORM 实例，绑定 schema 以支持关系查询
export const db = drizzle(sqlite, { schema });

// 兼容函数式调用
export function getDb() {
  return db;
}
