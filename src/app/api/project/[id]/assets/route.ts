import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, projects, scripts } from "@/lib/db/schema";
import { renderShotPlaceholderImage } from "@/lib/project-media";

async function getProjectAndScript(projectId: string) {
  const db = getDb();

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error("项目不存在");
  }

  const selectedScripts = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .orderBy(desc(scripts.selected), asc(scripts.createdAt));

  const selectedScript = selectedScripts[0];
  if (!selectedScript) {
    throw new Error("项目还没有脚本");
  }
  const selectedShots = selectedScript.shots;
  if (!selectedShots) {
    throw new Error("脚本内容为空");
  }

  return { db, project, selectedScript, selectedShots };
}

function buildProductImageFallback(projectImages: string[], shotId: number) {
  if (projectImages.length === 0) return undefined;
  return projectImages[(shotId - 1) % projectImages.length];
}

function mapAssetType(source: "ai_generate" | "product_image" | "user_upload") {
  if (source === "product_image") return "product_image" as const;
  if (source === "user_upload") return "user_upload" as const;
  return "ai_generated" as const;
}

async function buildMergedAssets(projectId: string) {
  const { db, project, selectedScript, selectedShots } = await getProjectAndScript(projectId);
  const assetRows = await db.select().from(assets).where(eq(assets.projectId, projectId)).orderBy(asc(assets.shotId));
  const assetMap = new Map(assetRows.map((item) => [item.shotId, item]));

  return {
    project,
    selectedScript,
    items: selectedShots.map((shot) => {
      const existing = assetMap.get(shot.shotId);
      const fallbackPath = buildProductImageFallback(project.productImages || [], shot.shotId);
      return {
        id: existing?.id,
        shotId: shot.shotId,
        type: shot.type,
        duration: shot.duration,
        description: shot.description,
        prompt: shot.prompt || "",
        visualSource: shot.visualSource,
        status: existing?.status || (shot.visualSource === "product_image" ? "done" : "pending"),
        filePath: existing?.filePath || fallbackPath || null,
        thumbnailPath: existing?.thumbnailPath || fallbackPath || null,
      };
    }),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await buildMergedAssets(id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "素材加载失败" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { db, project, selectedShots } = await getProjectAndScript(id);
    const targetShotId = typeof body.shotId === "number" ? body.shotId : null;
    const targetShots = selectedShots.filter((shot) => !targetShotId || shot.shotId === targetShotId);

    if (targetShots.length === 0) {
      return NextResponse.json({ error: "未找到要生成的分镜" }, { status: 400 });
    }

    for (const shot of targetShots) {
      const existing = await db
        .select()
        .from(assets)
        .where(and(eq(assets.projectId, id), eq(assets.shotId, shot.shotId)));

      let filePath = buildProductImageFallback(project.productImages || [], shot.shotId) || null;

      if (shot.visualSource === "ai_generate" || !filePath) {
        filePath = await renderShotPlaceholderImage({
          projectId: id,
          productName: project.productName || project.name,
          shot,
        });
      }

      const payload = {
        projectId: id,
        shotId: shot.shotId,
        type: mapAssetType(shot.visualSource),
        filePath,
        thumbnailPath: filePath,
        prompt: shot.prompt || "",
        status: "done" as const,
        provider: shot.visualSource === "ai_generate" ? "local-render" : "project-image",
        model: shot.visualSource === "ai_generate" ? "ffmpeg-drawtext" : "uploaded-image",
      };

      if (existing[0]) {
        await db
          .update(assets)
          .set(payload)
          .where(and(eq(assets.projectId, id), eq(assets.shotId, shot.shotId)));
      } else {
        await db.insert(assets).values(payload);
      }
    }

    await db
      .update(projects)
      .set({
        status: "assets",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    const data = await buildMergedAssets(id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("生成素材失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成素材失败" },
      { status: 500 }
    );
  }
}
