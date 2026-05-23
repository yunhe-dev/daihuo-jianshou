"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  LuArrowLeft,
  LuBox,
  LuCheck,
  LuEye,
  LuLayoutGrid,
  LuLoader,
  LuPackage,
  LuVideo,
  LuZap,
} from "react-icons/lu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useSettingsStore } from "@/lib/stores/settings-store";

type Product = {
  id: string;
  name: string;
  category: "beauty" | "food" | "home" | "fashion" | "tech" | "other";
  description?: string | null;
  images: string[];
  price?: string | null;
  targetAudience?: string | null;
  videoCount: number | null;
};

type TaskStatus = "pending" | "generating" | "done" | "failed";

interface BatchTask {
  id: string;
  productName: string;
  projectId?: string;
  status: TaskStatus;
  message?: string;
}

const videoModeOptions = [
  { value: "product_closeup", label: "产品特写", icon: LuBox },
  { value: "graphic_montage", label: "图文混剪", icon: LuLayoutGrid },
  { value: "scene_demo", label: "场景演示", icon: LuEye },
  { value: "live_presenter", label: "真人出镜", icon: LuVideo },
];

const scriptStyleOptions = [
  { value: "pain_point", label: "痛点种草" },
  { value: "scene", label: "场景安利" },
  { value: "comparison", label: "对比测评" },
  { value: "story", label: "剧情故事" },
  { value: "auto", label: "智能推荐" },
];

const durationOptions = [
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
];

const categoryLabels: Record<string, string> = {
  home: "家居日用",
  tech: "数码3C",
  beauty: "美妆护肤",
  food: "食品零食",
  fashion: "服饰鞋包",
  other: "其他",
};

const statusLabels: Record<TaskStatus, string> = {
  pending: "等待中",
  generating: "生成中",
  done: "已完成",
  failed: "失败",
};

const statusColors: Record<TaskStatus, string> = {
  pending: "bg-zinc-500/20 text-zinc-400 border-0",
  generating: "bg-amber-500/20 text-amber-400 border-0",
  done: "bg-emerald-500/20 text-emerald-400 border-0",
  failed: "bg-red-500/20 text-red-400 border-0",
};

export default function BatchPage() {
  const { llm, providers, defaultImageModel, defaultVideoModel } = useSettingsStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [videoMode, setVideoMode] = useState("product_closeup");
  const [scriptStyle, setScriptStyle] = useState("auto");
  const [duration, setDuration] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef(false);

  const hasLLM = Boolean(llm.baseUrl && llm.apiKey && llm.model);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        throw new Error("商品列表加载失败");
      }
      const data = (await res.json()) as Product[];
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "商品列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const selectedProductList = useMemo(
    () => products.filter((product) => selectedProducts.has(product.id)),
    [products, selectedProducts]
  );

  const updateTask = useCallback((productId: string, patch: Partial<BatchTask>) => {
    setBatchTasks((prev) =>
      prev.map((task) => (task.id === productId ? { ...task, ...patch } : task))
    );
  }, []);

  const handleStartBatch = useCallback(async () => {
    if (selectedProductList.length === 0 || isGenerating) return;
    if (!hasLLM) {
      setError("请先在设置中配置可用的 LLM 服务");
      return;
    }

    abortRef.current = false;
    setIsGenerating(true);
    setIsComplete(false);
    setError(null);

    const tasks: BatchTask[] = selectedProductList.map((product) => ({
      id: product.id,
      productName: product.name,
      status: "pending",
      message: "等待开始",
    }));
    setBatchTasks(tasks);

    for (const product of selectedProductList) {
      if (abortRef.current) break;

      try {
        updateTask(product.id, { status: "generating", message: "正在创建项目..." });

        const projectRes = await fetch("/api/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${product.name} 批量推广`,
            productId: product.id,
            productName: product.name,
            productCategory: product.category,
            productDescription: product.description || "",
            productImages: product.images || [],
            videoMode,
          }),
        });
        if (!projectRes.ok) {
          const errData = await projectRes.json().catch(() => ({}));
          throw new Error(errData.error || "创建项目失败");
        }
        const project = (await projectRes.json()) as { id: string };
        updateTask(product.id, { projectId: project.id, message: "正在生成脚本..." });

        const scriptRes = await fetch("/api/llm/script", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            productName: product.name,
            productCategory: product.category,
            productDescription: product.description || "",
            duration: Number(duration),
            styleType: scriptStyle,
            videoMode,
            productImages: product.images,
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

        updateTask(product.id, { message: "正在生成素材..." });
        const assetsRes = await fetch(`/api/project/${project.id}/assets`, {
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
        if (!assetsRes.ok) {
          const errData = await assetsRes.json().catch(() => ({}));
          throw new Error(errData.error || "素材生成失败");
        }

        updateTask(product.id, { message: "正在合成视频..." });
        const videoRes = await fetch(`/api/project/${project.id}/video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ttsEnabled: true,
            ttsVoice: "female-gentle",
            bgm: "upbeat",
            subtitleSize: 24,
            subtitlePosition: "bottom",
            aspectRatio: "9:16",
            resolution: "1080p",
            settings: {
              providers,
              defaultImageModel,
              defaultVideoModel,
            },
          }),
        });
        if (!videoRes.ok) {
          const errData = await videoRes.json().catch(() => ({}));
          throw new Error(errData.error || "视频合成失败");
        }

        await fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoCount: (product.videoCount ?? 0) + 1,
          }),
        }).catch(() => undefined);

        updateTask(product.id, {
          status: "done",
          message: "脚本、素材与视频已生成完成",
        });
      } catch (err) {
        updateTask(product.id, {
          status: "failed",
          message: err instanceof Error ? err.message : "生成失败",
        });
      }
    }

    setIsGenerating(false);
    setIsComplete(true);
    await loadProducts();
  }, [
    duration,
    defaultImageModel,
    defaultVideoModel,
    hasLLM,
    isGenerating,
    llm.apiKey,
    llm.baseUrl,
    llm.model,
    llm.visionModel,
    loadProducts,
    providers,
    scriptStyle,
    selectedProductList,
    updateTask,
    videoMode,
  ]);

  const doneCount = batchTasks.filter((task) => task.status === "done").length;

  return (
    <div className="min-h-screen grid-bg">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
                <LuArrowLeft className="h-4 w-4" />
                <span className="ml-1">返回</span>
              </Button>
            </Link>
            <div className="h-5 w-px bg-border/50" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md brand-gradient">
                <svg
                  width="14"
                  height="14"
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
              <span className="text-sm font-semibold tracking-tight">带货剪手</span>
            </div>
            <div className="h-5 w-px bg-border/50" />
            <span className="text-sm font-medium">批量出片</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="brand-gradient-text">批量出片</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            选择多个商品并统一配置，批量生成脚本、素材与成片
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!hasLLM && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            当前还没有可用的 LLM 配置，批量出片前请先去设置页填写。
          </div>
        )}

        <div className="space-y-6">
          <Card className="glass-card">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <Label className="text-sm font-medium">
                  步骤 1：选择商品
                  <span className="ml-0.5 text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  已选 {selectedProducts.size}/{products.length} 个商品
                </span>
              </div>

              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">正在加载商品...</div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                    <LuPackage className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">请先在商品库中添加商品</p>
                  <Link href="/products">
                    <Button variant="outline" size="sm">
                      前往商品库
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => {
                    const isSelected = selectedProducts.has(product.id);
                    return (
                      <button
                        key={product.id}
                        onClick={() => !isGenerating && toggleProduct(product.id)}
                        disabled={isGenerating}
                        className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border/50 bg-muted/20 hover:border-primary/40"
                        } ${isGenerating ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                            isSelected
                              ? "brand-gradient border-transparent"
                              : "border-border/80 bg-muted/30"
                          }`}
                        >
                          {isSelected && <LuCheck className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/30 bg-muted/30">
                          {product.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <LuPackage className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{product.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {categoryLabels[product.category] || product.category}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="space-y-5 p-5">
              <Label className="block text-sm font-medium">步骤 2：统一配置</Label>

              <div>
                <Label className="mb-2.5 block text-xs text-muted-foreground">视频模式</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {videoModeOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => !isGenerating && setVideoMode(opt.value)}
                        disabled={isGenerating}
                        className={`relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                          videoMode === opt.value
                            ? "border-primary bg-primary/10"
                            : "border-border/50 bg-muted/20 hover:border-primary/40"
                        } ${isGenerating ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            videoMode === opt.value ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <span
                          className={`text-xs font-medium ${
                            videoMode === opt.value ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="mb-2.5 block text-xs text-muted-foreground">脚本风格</Label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {scriptStyleOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isGenerating && setScriptStyle(opt.value)}
                      disabled={isGenerating}
                      className={`relative flex h-9 items-center justify-center rounded-lg border text-xs font-medium transition-all ${
                        scriptStyle === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      } ${isGenerating ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2.5 block text-xs text-muted-foreground">目标时长</Label>
                <div className="grid grid-cols-3 gap-2">
                  {durationOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => !isGenerating && setDuration(opt.value)}
                      disabled={isGenerating}
                      className={`relative flex h-9 items-center justify-center rounded-lg border text-sm font-medium transition-all ${
                        duration === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      } ${isGenerating ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {batchTasks.length > 0 && (
            <Card className="glass-card">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <Label className="text-sm font-medium">生成进度</Label>
                  <span className="text-xs text-muted-foreground">
                    {doneCount}/{batchTasks.length} 已完成
                  </span>
                </div>

                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full brand-gradient transition-all duration-500"
                    style={{
                      width: `${batchTasks.length > 0 ? (doneCount / batchTasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>

                <div className="space-y-2">
                  {batchTasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-lg border border-border/30 bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/30">
                            <LuPackage className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <span className="block text-sm">{task.productName}</span>
                            {task.projectId && (
                              <Link
                                href={`/project/${task.projectId}/export`}
                                className="text-xs text-primary underline-offset-2 hover:underline"
                              >
                                查看结果
                              </Link>
                            )}
                          </div>
                        </div>
                        <Badge className={statusColors[task.status]}>
                          {task.status === "generating" && <LuLoader className="mr-1 h-3 w-3 animate-spin" />}
                          {task.status === "done" && <LuCheck className="mr-1 h-3 w-3" />}
                          {statusLabels[task.status]}
                        </Badge>
                      </div>
                      {task.message && <p className="mt-2 text-xs text-muted-foreground">{task.message}</p>}
                    </div>
                  ))}
                </div>

                {isComplete && (
                  <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-center">
                    <p className="text-sm font-medium text-emerald-400">
                      批量流程执行完成，成功 {doneCount} 个
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="pb-10 pt-2">
            <Button
              onClick={() => void handleStartBatch()}
              disabled={selectedProducts.size === 0 || isGenerating || !hasLLM}
              className="h-12 w-full text-base font-semibold text-white shadow-lg transition-opacity brand-gradient hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? (
                <>
                  <LuLoader className="mr-2 h-5 w-5 animate-spin" />
                  批量生成中...
                </>
              ) : isComplete ? (
                <>
                  <LuCheck className="mr-2 h-5 w-5" />
                  再来一批
                </>
              ) : (
                <>
                  <LuZap className="mr-2 h-5 w-5" />
                  开始批量生成
                </>
              )}
            </Button>
            {!isGenerating && !isComplete && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {selectedProducts.size > 0
                  ? `将为 ${selectedProducts.size} 个商品批量生成完整带货视频`
                  : "请先选择至少 1 个商品"}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
