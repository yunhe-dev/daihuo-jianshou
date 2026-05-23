import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { compositions, projects, scripts } from "@/lib/db/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const scriptRows = await db
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, id))
      .orderBy(desc(scripts.selected), asc(scripts.createdAt));

    const compositionRows = await db
      .select()
      .from(compositions)
      .where(eq(compositions.projectId, id))
      .orderBy(desc(compositions.createdAt));

    return NextResponse.json({
      project,
      script: scriptRows[0] || null,
      composition: compositionRows[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出信息加载失败" },
      { status: 500 }
    );
  }
}
