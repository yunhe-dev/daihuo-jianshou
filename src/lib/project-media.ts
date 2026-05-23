import { mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { execFile } from "child_process";
import type { Shot } from "@/lib/db/schema";

const execFileAsync = promisify(execFile);
const FFMPEG_BIN = "/opt/homebrew/bin/ffmpeg";
const DRAW_TEXT_FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

export type RenderSlide = {
  duration: number;
  inputPath: string;
  subtitle?: string;
};

function ensureFfmpeg() {
  if (!existsSync(FFMPEG_BIN)) {
    throw new Error("未找到 ffmpeg，可先安装后再生成视频");
  }
}

function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

export function apiPathToLocalFile(filePath: string): string {
  const match = filePath.match(/^\/api\/files\/(.+)$/);
  if (!match) {
    return filePath;
  }
  return join(process.cwd(), "data", "uploads", match[1]);
}

export async function renderShotPlaceholderImage(params: {
  projectId: string;
  productName: string;
  shot: Shot;
}) {
  ensureFfmpeg();

  const outputDir = join(process.cwd(), "data", "uploads", params.projectId, "generated");
  await mkdir(outputDir, { recursive: true });

  const fileName = `shot-${params.shot.shotId}.png`;
  const outputPath = join(outputDir, fileName);

  const productName = escapeDrawText(params.productName.slice(0, 28));
  const shotType = escapeDrawText(params.shot.type.replaceAll("_", " ").toUpperCase());
  const description = escapeDrawText(params.shot.description.slice(0, 48));
  const prompt = escapeDrawText((params.shot.prompt || "AI GENERATED FRAME").slice(0, 58));

  const filter = [
    "drawbox=x=42:y=42:w=996:h=1836:color=white@0.08:t=fill",
    `drawtext=fontfile='${DRAW_TEXT_FONT}':text='${productName}':fontcolor=white:fontsize=56:x=72:y=132`,
    `drawtext=fontfile='${DRAW_TEXT_FONT}':text='SHOT ${params.shot.shotId}  ${shotType}':fontcolor=0xA78BFA:fontsize=34:x=72:y=240`,
    `drawtext=fontfile='${DRAW_TEXT_FONT}':text='${description}':fontcolor=white:fontsize=42:x=72:y=360`,
    `drawtext=fontfile='${DRAW_TEXT_FONT}':text='${prompt}':fontcolor=0xCBD5E1:fontsize=28:x=72:y=1530`,
  ].join(",");

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=#111827:s=1080x1920:d=1",
    "-vf",
    filter,
    "-frames:v",
    "1",
    outputPath,
  ]);

  return `/api/files/${params.projectId}/generated/${fileName}`;
}

export async function composeStoryboardVideo(params: {
  projectId: string;
  slides: RenderSlide[];
  aspectRatio: "9:16" | "16:9" | "1:1";
}) {
  ensureFfmpeg();

  const outputDir = join(process.cwd(), "data", "uploads", params.projectId, "compositions");
  await mkdir(outputDir, { recursive: true });

  const sizeMap = {
    "9:16": { width: 1080, height: 1920 },
    "16:9": { width: 1920, height: 1080 },
    "1:1": { width: 1080, height: 1080 },
  } as const;
  const { width, height } = sizeMap[params.aspectRatio];

  const fileName = `storyboard-${Date.now()}.mp4`;
  const outputPath = join(outputDir, fileName);

  const inputArgs = params.slides.flatMap((slide) => [
    "-loop",
    "1",
    "-t",
    String(Math.max(slide.duration, 1)),
    "-i",
    apiPathToLocalFile(slide.inputPath),
  ]);

  const filterParts = params.slides.map((slide, index) => {
    const subtitle = escapeDrawText((slide.subtitle || "").slice(0, 40));
    const safeSubtitle = subtitle
      ? `,drawtext=fontfile='${DRAW_TEXT_FONT}':text='${subtitle}':fontcolor=white:fontsize=${Math.max(
          Math.round(height * 0.028),
          26
        )}:box=1:boxcolor=black@0.38:boxborderw=22:x=(w-text_w)/2:y=h-${Math.round(height * 0.18)}`
      : "";
    return `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p${safeSubtitle}[v${index}]`;
  });

  const concatInputs = params.slides.map((_, index) => `[v${index}]`).join("");
  const filterComplex = `${filterParts.join(";")};${concatInputs}concat=n=${params.slides.length}:v=1:a=0,format=yuv420p[vout]`;

  await execFileAsync(FFMPEG_BIN, [
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  return {
    outputPath: `/api/files/${params.projectId}/compositions/${fileName}`,
    width,
    height,
  };
}
