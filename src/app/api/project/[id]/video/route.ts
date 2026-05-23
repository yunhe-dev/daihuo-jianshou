import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assets, compositions, projects, scripts, videoClips } from "@/lib/db/schema";
import { composeStoryboardVideo, probeVideoDurationMs, renderShotPlaceholderImage } from "@/lib/project-media";
import { createProvider } from "@/lib/providers";
import { resolveRuntimeAIConfig } from "@/lib/ai-config";
import { downloadRemoteMedia } from "@/lib/remote-media";

async function getProjectState(projectId: string) {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error("项目不存在");
  }

  const scriptRows = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .orderBy(desc(scripts.selected), asc(scripts.createdAt));

  const selectedScript = scriptRows[0];
  if (!selectedScript) {
    throw new Error("项目还没有脚本");
  }
  const selectedShots = selectedScript.shots;
  if (!selectedShots) {
    throw new Error("脚本内容为空");
  }

  const assetRows = await db.select().from(assets).where(eq(assets.projectId, projectId)).orderBy(asc(assets.shotId));
  const clipRows = await db.select().from(videoClips).where(eq(videoClips.projectId, projectId)).orderBy(asc(videoClips.shotId));
  const compositionRows = await db
    .select()
    .from(compositions)
    .where(eq(compositions.projectId, projectId))
    .orderBy(desc(compositions.createdAt));

  return {
    db,
    project,
    selectedScript,
    selectedShots,
    assetRows,
    clipRows,
    composition: compositionRows[0] || null,
  };
}

function fallbackProjectImage(images: string[], shotId: number) {
  if (images.length === 0) return null;
  return images[(shotId - 1) % images.length];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { project, selectedScript, selectedShots, assetRows, clipRows, composition } = await getProjectState(id);
    const assetMap = new Map(assetRows.map((asset) => [asset.shotId, asset]));

    const derivedClips =
      clipRows.length > 0
        ? clipRows
        : selectedShots.map((shot) => ({
            id: `derived-${shot.shotId}`,
            projectId: id,
            shotId: shot.shotId,
            assetId: assetMap.get(shot.shotId)?.id || null,
            filePath: assetMap.get(shot.shotId)?.filePath || fallbackProjectImage(project.productImages || [], shot.shotId),
            duration: shot.duration * 1000,
            provider: assetMap.get(shot.shotId)?.provider || null,
            model: assetMap.get(shot.shotId)?.model || null,
            transitionType: shot.transition,
            status: "done" as const,
            createdAt: new Date(),
          }));

    return NextResponse.json({
      project,
      script: selectedScript,
      clips: derivedClips,
      composition,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视频信息加载失败" },
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
    const runtimeAI = resolveRuntimeAIConfig(body.settings || { providers: {} });
    const { db, project, selectedShots, assetRows } = await getProjectState(id);

    const assetMap = new Map(assetRows.map((asset) => [asset.shotId, asset]));
    const resolvedSlides = [];

    for (const shot of selectedShots) {
      let asset = assetMap.get(shot.shotId);

      if (!asset?.filePath) {
        const generatedPath =
          fallbackProjectImage(project.productImages || [], shot.shotId) ||
          (await renderShotPlaceholderImage({
            projectId: id,
            productName: project.productName || project.name,
            shot,
          }));

        if (asset) {
          await db
            .update(assets)
            .set({
              filePath: generatedPath,
              thumbnailPath: generatedPath,
              status: "done" as const,
            })
            .where(and(eq(assets.projectId, id), eq(assets.shotId, shot.shotId)));
          asset = {
            ...asset,
            filePath: generatedPath,
            thumbnailPath: generatedPath,
            status: "done",
          };
        } else {
          const inserted = await db
            .insert(assets)
            .values({
              projectId: id,
              shotId: shot.shotId,
              type: shot.visualSource === "product_image" ? "product_image" : "ai_generated",
              filePath: generatedPath,
              thumbnailPath: generatedPath,
              prompt: shot.prompt || "",
              status: "done" as const,
              provider: shot.visualSource === "product_image" ? "project-image" : "local-render",
              model: shot.visualSource === "product_image" ? "uploaded-image" : "ffmpeg-drawtext",
            })
            .returning();
          asset = inserted[0];
        }
      }

      resolvedSlides.push({
        shot,
        asset,
      });
    }

    await db.delete(videoClips).where(eq(videoClips.projectId, id));
    await db.delete(compositions).where(eq(compositions.projectId, id));

    const insertedClips = await db
      .insert(videoClips)
      .values(
        resolvedSlides.map(({ shot, asset }) => ({
          projectId: id,
          shotId: shot.shotId,
          assetId: asset?.id || null,
          filePath: asset?.filePath || null,
          duration: shot.duration * 1000,
          provider: asset?.provider || "local-render",
          model: asset?.model || "ffmpeg-drawtext",
          transitionType: shot.transition,
          status: "done" as const,
        }))
      )
      .returning();

    let compositionResult;
    let compositionProvider = "local-render";
    let compositionModel = "ffmpeg-storyboard";
    const totalDuration = selectedShots.reduce((sum, shot) => sum + shot.duration, 0);
    let compositionDurationMs = totalDuration * 1000;

    if (runtimeAI?.videoModel) {
      try {
        const providerClient = createProvider({
          name: runtimeAI.provider,
          apiKey: runtimeAI.apiKey,
          baseUrl: runtimeAI.baseUrl,
        });
        const firstFrame = resolvedSlides[0]?.asset?.filePath || null;
        const firstFrameUrl =
          firstFrame && firstFrame.startsWith("/")
            ? `${req.nextUrl.origin}${firstFrame}`
            : firstFrame;
        const videoPrompt = selectedShots
          .map((shot) => `${shot.shotId}. ${shot.description} 旁白:${shot.voiceover}`)
          .join("\n");
        const videoResult = await providerClient.generateVideo({
          modelId: runtimeAI.videoModel,
          mode: firstFrameUrl ? "image-to-video" : "text-to-video",
          prompt: `${project.productName || project.name} 电商短视频。${videoPrompt}`,
          firstFrameUrl: firstFrameUrl || undefined,
          duration: Math.min(Math.max(Math.round(selectedShots.reduce((sum, shot) => sum + shot.duration, 0) / 2), 5), 10),
          width: body.aspectRatio === "16:9" ? 1280 : 720,
          height: body.aspectRatio === "16:9" ? 720 : body.aspectRatio === "1:1" ? 1024 : 1280,
          audioEnabled: Boolean(body.ttsEnabled),
          voiceover: selectedShots.map((shot) => shot.voiceover).join(" "),
        });
        const remoteVideoUrl = videoResult.videoUrls[0];
        if (!remoteVideoUrl) {
          throw new Error("AI 生视频未返回可用视频地址");
        }
        const localVideoPath = await downloadRemoteMedia({
          projectId: id,
          sourceUrl: remoteVideoUrl,
          subdir: "compositions",
          fileBaseName: `ai-video-${Date.now()}`,
          fallbackExt: "mp4",
        });
        compositionResult = {
          outputPath: localVideoPath,
          width: body.aspectRatio === "16:9" ? 1280 : 720,
          height: body.aspectRatio === "16:9" ? 720 : body.aspectRatio === "1:1" ? 1024 : 1280,
        };
        compositionDurationMs =
          (videoResult.duration ? Math.round(videoResult.duration * 1000) : null) ??
          (await probeVideoDurationMs(localVideoPath)) ??
          compositionDurationMs;
        compositionProvider = runtimeAI.provider;
        compositionModel = runtimeAI.videoModel;
      } catch (error) {
        throw new Error(
          `AI 生视频失败（${runtimeAI.provider}/${runtimeAI.videoModel}）: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (!compositionResult) {
      compositionResult = await composeStoryboardVideo({
        projectId: id,
        aspectRatio: body.aspectRatio || "9:16",
        slides: resolvedSlides.map(({ shot, asset }) => ({
          duration: shot.duration,
          inputPath: asset?.filePath || "",
          subtitle: shot.voiceover,
        })),
      });
    }

    const insertedCompositions = await db
      .insert(compositions)
      .values({
        projectId: id,
        outputPath: compositionResult.outputPath,
        resolution: body.resolution || "1080p",
        aspectRatio: body.aspectRatio || "9:16",
        duration: compositionDurationMs,
        bgmPath: compositionModel === "ffmpeg-storyboard" ? body.bgm || null : `${compositionProvider}:${compositionModel}`,
        ttsEnabled: Boolean(body.ttsEnabled),
        subtitleStyle: {
          fontFamily: "Arial Unicode",
          fontSize: body.subtitleSize || 24,
          color: "#FFFFFF",
          strokeColor: "#000000",
          strokeWidth: 2,
          position: body.subtitlePosition || "bottom",
        },
        status: "done" as const,
      })
      .returning();

    await db
      .update(projects)
      .set({
        status: "done",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    return NextResponse.json({
      clips: insertedClips,
      composition: insertedCompositions[0],
    });
  } catch (error) {
    console.error("合成视频失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "合成视频失败" },
      { status: 500 }
    );
  }
}
