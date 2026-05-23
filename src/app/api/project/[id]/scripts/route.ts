import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { projects, scripts } from "@/lib/db/schema";
import type { Shot } from "@/lib/db/schema";

type ScriptPayload = {
  title?: string;
  styleType: "pain_point" | "scene" | "comparison" | "story" | "custom";
  totalDuration?: number;
  shots?: Shot[];
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const result = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, id))
    .orderBy(desc(scripts.selected), desc(scripts.createdAt));

  return NextResponse.json(result);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const payload = Array.isArray(body?.scripts) ? (body.scripts as ScriptPayload[]) : [];

  if (payload.length === 0) {
    return NextResponse.json({ error: "请提供要保存的脚本数据" }, { status: 400 });
  }

  const db = getDb();
  const project = await db.select().from(projects).where(eq(projects.id, id));
  if (project.length === 0) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  await db.delete(scripts).where(eq(scripts.projectId, id));

  const inserted = await db
    .insert(scripts)
    .values(
      payload.map((script, index) => ({
        projectId: id,
        version: index + 1,
        title: script.title || `脚本方案 ${index + 1}`,
        styleType: script.styleType,
        totalDuration: script.totalDuration ?? 0,
        shots: script.shots ?? [],
        selected: index === 0,
      }))
    )
    .returning();

  await db
    .update(projects)
    .set({
      status: "scripting",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));

  return NextResponse.json(inserted, { status: 201 });
}
