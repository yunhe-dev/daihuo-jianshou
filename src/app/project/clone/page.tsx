"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSettingsStore } from "@/lib/stores/settings-store";

interface StoryboardCard {
  id: number;
  title: string;
  description: string;
  duration: string;
}

interface ProductImage {
  id: string;
  file: File;
  previewUrl: string;
}

export default function ClonePage() {
  const router = useRouter();
  const { llm } = useSettingsStore();

  const [videoUrl, setVideoUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [storyboards, setStoryboards] = useState<StoryboardCard[]>([]);
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [productName, setProductName] = useState("");
  const [productFeatures, setProductFeatures] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = useCallback(async () => {
    if (!videoUrl.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setError(null);
    setStoryboards([]);

    try {
      const res = await fetch("/api/project/clone/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          llmConfig: {
            baseUrl: llm.baseUrl,
            apiKey: llm.apiKey,
            model: llm.model,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "爆款分析失败");
      }

      const data = (await res.json()) as { storyboards: StoryboardCard[] };
      setStoryboards(data.storyboards || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "爆款分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, llm.apiKey, llm.baseUrl, llm.model, videoUrl]);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = 5 - productImages.length;
      if (remaining <= 0) return;

      const newImages: ProductImage[] = [];
      for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        newImages.push({
          id: `${Date.now()}-${i}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      setProductImages((prev) => [...prev, ...newImages]);
    },
    [productImages.length]
  );

  const removeImage = useCallback((id: string) => {
    setProductImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleGenerate = useCallback(async () => {
    if (
      isSubmitting ||
      storyboards.length === 0 ||
      productImages.length === 0 ||
      !productName.trim() ||
      !productFeatures.trim()
    ) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      setProgress("正在创建复刻项目...");
      const projectRes = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${productName} 爆款复刻`,
          productName,
          productCategory: "other",
          productDescription: productFeatures,
          productImages: [],
          sourceType: "clone",
          sourceVideoUrl: videoUrl,
        }),
      });
      if (!projectRes.ok) {
        const errData = await projectRes.json().catch(() => ({}));
        throw new Error(errData.error || "项目创建失败");
      }
      const project = (await projectRes.json()) as { id: string };

      setProgress("正在上传商品图片...");
      const formData = new FormData();
      productImages.forEach((img) => formData.append("files", img.file));
      formData.append("projectId", project.id);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || "商品图片上传失败");
      }
      const uploadData = (await uploadRes.json()) as { paths: string[] };

      await fetch(`/api/project/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productImages: uploadData.paths,
          productDescription: `${productFeatures}\n\n参考爆款链接：${videoUrl}`,
        }),
      });

      setProgress("AI 正在复刻爆款脚本...");
      const scriptRes = await fetch("/api/llm/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          productName,
          productCategory: "other",
          productDescription: `${productFeatures}\n参考爆款结构：${storyboards
            .map((item) => `${item.title}(${item.duration}) ${item.description}`)
            .join("；")}`,
          duration: 30,
          styleType: "comparison",
          videoMode: "graphic_montage",
          productImages: uploadData.paths,
          llmConfig: {
            baseUrl: llm.baseUrl,
            apiKey: llm.apiKey,
            model: llm.model,
            visionModel: llm.visionModel,
          },
        }),
      });
      if (!scriptRes.ok) {
        const errData = await scriptRes.json().catch(() => ({}));
        throw new Error(errData.error || "脚本生成失败");
      }
      const scriptData = (await scriptRes.json()) as { scripts: unknown[] };

      const saveScriptRes = await fetch(`/api/project/${project.id}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts: scriptData.scripts }),
      });
      if (!saveScriptRes.ok) {
        const errData = await saveScriptRes.json().catch(() => ({}));
        throw new Error(errData.error || "脚本保存失败");
      }

      setProgress("脚本复刻完成，正在跳转...");
      router.push(`/project/${project.id}/script`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "复刻生成失败");
      setIsSubmitting(false);
      setProgress(null);
    }
  }, [
    isSubmitting,
    llm.apiKey,
    llm.baseUrl,
    llm.model,
    llm.visionModel,
    productFeatures,
    productImages,
    productName,
    router,
    storyboards,
    videoUrl,
  ]);

  const hasAnalysis = storyboards.length > 0;
  const canGenerate =
    hasAnalysis &&
    productImages.length > 0 &&
    productName.trim() !== "" &&
    productFeatures.trim() !== "" &&
    !isSubmitting;

  return (
    <div className="min-h-screen grid-bg">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </Button>
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">带货剪手</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight">
            <span className="brand-gradient-text">爆款复刻</span>
          </h1>
          <p className="mx-auto max-w-lg text-base text-muted-foreground">
            输入爆款视频链接，AI 提取脚本逻辑并用你的商品重新生成
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {progress && (
          <div className="mb-6 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            {progress}
          </div>
        )}

        <div className="mb-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
              1
            </div>
            <h2 className="text-lg font-semibold">输入爆款视频</h2>
          </div>

          <Card className="glass-card card-hover">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <Label htmlFor="video-url">视频链接</Label>
                <div className="flex gap-3">
                  <Input
                    id="video-url"
                    placeholder="粘贴抖音 / 快手 / 小红书视频链接"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    className="shrink-0 brand-gradient text-white"
                    disabled={!videoUrl.trim() || isAnalyzing || !llm.baseUrl || !llm.apiKey || !llm.model}
                    onClick={() => void handleAnalyze()}
                  >
                    {isAnalyzing ? (
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        分析中...
                      </span>
                    ) : (
                      "分析视频"
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">支持抖音、快手、小红书平台的视频链接</p>
              </div>

              {hasAnalysis && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">提取到的脚本结构</h3>
                    <Badge variant="secondary" className="text-xs">
                      {storyboards.length} 个分镜
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {storyboards.map((card) => (
                      <div
                        key={card.id}
                        className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{card.title}</span>
                          <Badge variant="outline" className="text-xs font-mono">
                            {card.duration}
                          </Badge>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">{card.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mb-10">
          <div className="mb-5 flex items-center gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                hasAnalysis ? "brand-gradient" : "bg-muted text-muted-foreground"
              }`}
            >
              2
            </div>
            <h2 className={`text-lg font-semibold ${hasAnalysis ? "" : "text-muted-foreground"}`}>上传你的商品</h2>
          </div>

          <Card className={`glass-card card-hover ${!hasAnalysis ? "pointer-events-none opacity-50" : ""}`}>
            <CardContent className="space-y-6 p-6">
              <div className="space-y-2">
                <Label>
                  商品图片 <span className="font-normal text-muted-foreground">(1-5张)</span>
                </Label>
                <div
                  className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-colors ${
                    isDragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />

                  {productImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <p className="mb-1 text-sm text-muted-foreground">拖拽图片到此处，或点击上传</p>
                      <p className="text-xs text-muted-foreground/70">支持 JPG、PNG 格式，最多 5 张</p>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                        {productImages.map((img) => (
                          <div
                            key={img.id}
                            className="group relative aspect-square overflow-hidden rounded-lg bg-muted/30"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.previewUrl}
                              alt="商品图片"
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(img.id);
                              }}
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-name">商品名称</Label>
                <Input
                  id="product-name"
                  placeholder="输入你的商品名称"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-features">商品卖点</Label>
                <Textarea
                  id="product-features"
                  placeholder="描述商品的核心卖点、优势特性等..."
                  rows={4}
                  value={productFeatures}
                  onChange={(e) => setProductFeatures(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center pb-10">
          <Button
            size="lg"
            className="px-10 text-base font-semibold brand-gradient text-white"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {isSubmitting ? "复刻生成中..." : "开始复刻生成"}
          </Button>
        </div>
      </main>
    </div>
  );
}
