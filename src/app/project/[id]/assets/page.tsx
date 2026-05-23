"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LuArrowLeft, LuZap, LuCheck, LuCircleX, LuImage, LuArrowRight, LuTriangleAlert } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/lib/stores/settings-store";
import type { Shot } from "@/lib/db/schema";

interface AssetItem {
  id?: string;
  shotId: number;
  type: Shot["type"];
  duration: number;
  description: string;
  prompt: string;
  visualSource: "ai_generate" | "product_image" | "user_upload";
  status: "pending" | "generating" | "done" | "failed";
  filePath?: string | null;
  thumbnailPath?: string | null;
}

type AssetResponse = {
  project: {
    id: string;
    name: string;
  };
  selectedScript: {
    id: string;
  };
  items: AssetItem[];
};

const shotTypeLabels: Record<Shot["type"], { label: string; color: string }> = {
  hook: { label: "钩子", color: "bg-red-500/20 text-red-400" },
  pain_point: { label: "痛点", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { label: "产品", color: "bg-blue-500/20 text-blue-400" },
  demo: { label: "演示", color: "bg-green-500/20 text-green-400" },
  social_proof: { label: "背书", color: "bg-purple-500/20 text-purple-400" },
  cta: { label: "转化", color: "bg-amber-500/20 text-amber-400" },
};

export default function AssetsPage() {
  const { id } = useParams<{ id: string }>();
  const { providers, defaultImageModel, defaultVideoModel } = useSettingsStore();
  const [projectName, setProjectName] = useState("加载中...");
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/project/${id}/assets`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "素材加载失败");
      }

      const data = (await res.json()) as AssetResponse;
      setProjectName(data.project.name);
      setAssets(data.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "素材加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const doneCount = useMemo(() => assets.filter((asset) => asset.status === "done").length, [assets]);
  const allDone = assets.length > 0 && doneCount === assets.length;

  const generateOne = useCallback(
    async (shotId: number) => {
      setAssets((prev) =>
        prev.map((asset) => (asset.shotId === shotId ? { ...asset, status: "generating" } : asset))
      );

      try {
        const res = await fetch(`/api/project/${id}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shotId,
            settings: {
              providers,
              defaultImageModel,
              defaultVideoModel,
            },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "生成素材失败");
        }

        const data = (await res.json()) as AssetResponse;
        setAssets(data.items);
      } catch {
        setAssets((prev) =>
          prev.map((asset) => (asset.shotId === shotId ? { ...asset, status: "failed" } : asset))
        );
      }
    },
    [defaultImageModel, defaultVideoModel, id, providers]
  );

  const generateAll = useCallback(async () => {
    const pending = assets.filter((asset) => asset.status === "pending" || asset.status === "failed");
    if (pending.length === 0) return;

    setIsBatchGenerating(true);
    try {
      const res = await fetch(`/api/project/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          all: true,
          settings: {
            providers,
            defaultImageModel,
            defaultVideoModel,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "批量生成素材失败");
      }

      const data = (await res.json()) as AssetResponse;
      setAssets(data.items);
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "批量生成素材失败");
    } finally {
      setIsBatchGenerating(false);
    }
  }, [assets, defaultImageModel, defaultVideoModel, id, providers]);

  return (
    <div className="min-h-screen grid-bg">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight">带货剪手</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm text-muted-foreground">{projectName}</span>
          </div>

          <div className="flex items-center gap-1">
            {["脚本", "素材", "视频", "导出"].map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 1 ? "bg-primary text-primary-foreground" : i < 1 ? "text-primary" : "text-muted-foreground"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 1 ? "bg-white/20" : i < 1 ? "bg-primary/20" : "bg-muted"}`}>
                    {i < 1 ? "✓" : i + 1}
                  </span>
                  {step}
                </div>
                {i < 3 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">素材生成</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "正在加载素材..." : `${doneCount}/${assets.length} 个素材已就绪`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/project/${id}/script`}>
              <Button variant="outline" size="sm" className="text-xs">
                <LuArrowLeft className="mr-1 h-3.5 w-3.5" />
                返回脚本
              </Button>
            </Link>
            <Button onClick={generateAll} disabled={loading || isBatchGenerating || allDone} className="brand-gradient text-xs text-white">
              {isBatchGenerating ? (
                <>
                  <svg className="mr-1.5 h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  生成中...
                </>
              ) : allDone ? (
                "全部完成"
              ) : (
                <>
                  <LuZap className="mr-1 h-3.5 w-3.5" />
                  一键全部生成
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <Card className="glass-card mb-6">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
              <LuTriangleAlert className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <div className="h-2 overflow-hidden rounded-full bg-muted/30">
            <div
              className="brand-gradient h-full rounded-full transition-all duration-700"
              style={{ width: `${assets.length === 0 ? 0 : (doneCount / assets.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-4">
          {assets.map((asset) => {
            const typeInfo = shotTypeLabels[asset.type];
            return (
              <Card key={asset.shotId} className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-border/50 py-4">
                      <span className="text-lg font-bold text-muted-foreground/50">{String(asset.shotId).padStart(2, "0")}</span>
                      <Badge className={`${typeInfo.color} mt-1 border-0 text-[10px]`}>{typeInfo.label}</Badge>
                      <span className="mt-1 text-[10px] text-muted-foreground">{asset.duration}s</span>
                    </div>

                    <div className="flex-1 p-4">
                      <p className="mb-2 text-sm leading-relaxed">{asset.description}</p>
                      {asset.prompt && (
                        <p className="mb-2 line-clamp-2 rounded bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                          Prompt: {asset.prompt}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {asset.visualSource === "product_image"
                            ? "📷 商品原图"
                            : asset.visualSource === "ai_generate"
                              ? "✨ AI 生成"
                              : "📁 用户上传"}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-center justify-center gap-2 p-4">
                      <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-md border border-border/30 bg-muted/30">
                        {asset.filePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.filePath} alt={asset.description} className="h-full w-full object-cover" />
                        ) : asset.status === "generating" ? (
                          <svg className="h-5 w-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : asset.status === "failed" ? (
                          <LuCircleX className="h-5 w-5 text-destructive" />
                        ) : asset.status === "done" ? (
                          <LuCheck className="h-5 w-5 text-primary" />
                        ) : (
                          <LuImage className="h-4 w-4 text-muted-foreground/40" />
                        )}
                      </div>

                      {asset.visualSource === "ai_generate" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-24 text-xs"
                          disabled={asset.status === "generating" || isBatchGenerating}
                          onClick={() => void generateOne(asset.shotId)}
                        >
                          {asset.status === "generating"
                            ? "生成中..."
                            : asset.status === "done"
                              ? "重新生成"
                              : asset.status === "failed"
                                ? "重试"
                                : "生成素材"}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 flex justify-end">
          <Link href={allDone ? `/project/${id}/video` : "#"}>
            <Button className="brand-gradient text-sm text-white" disabled={!allDone}>
              下一步：合成视频
              <LuArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
