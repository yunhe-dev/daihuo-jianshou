import { mkdir, writeFile } from "fs/promises";
import { extname, join } from "path";

function inferExtension(contentType: string | null, sourceUrl: string, fallback: string) {
  const known = extname(new URL(sourceUrl).pathname || "").replace(".", "").toLowerCase();
  if (known) return known;

  if (!contentType) return fallback;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("webm")) return "webm";
  return fallback;
}

export async function downloadRemoteMedia(params: {
  projectId: string;
  sourceUrl: string;
  subdir: string;
  fileBaseName: string;
  fallbackExt: string;
}) {
  const response = await fetch(params.sourceUrl);
  if (!response.ok) {
    throw new Error(`下载远程媒体失败: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const extension = inferExtension(
    response.headers.get("content-type"),
    params.sourceUrl,
    params.fallbackExt
  );

  const outputDir = join(process.cwd(), "data", "uploads", params.projectId, params.subdir);
  await mkdir(outputDir, { recursive: true });

  const fileName = `${params.fileBaseName}.${extension}`;
  const localPath = join(outputDir, fileName);
  await writeFile(localPath, buffer);

  return `/api/files/${params.projectId}/${params.subdir}/${fileName}`;
}
