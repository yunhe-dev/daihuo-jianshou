"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LuWand, LuClock, LuImage, LuArrowRight, LuBookmarkPlus, LuTriangleAlert } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Shot } from "@/lib/db/schema";
import { useTemplateStore } from "@/lib/stores/template-store";

type Project = {
  id: string;
  name: string;
  productName: string | null;
};

type ProjectScript = {
  id: string;
  title: string | null;
  styleType: "pain_point" | "scene" | "comparison" | "story" | "custom";
  totalDuration: number | null;
  shots: Shot[];
  selected: boolean | null;
};

const shotTypeLabels: Record<Shot["type"], { label: string; color: string }> = {
  hook: { label: "钩子", color: "bg-red-500/20 text-red-400" },
  pain_point: { label: "痛点", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { label: "产品", color: "bg-blue-500/20 text-blue-400" },
  demo: { label: "演示", color: "bg-green-500/20 text-green-400" },
  social_proof: { label: "背书", color: "bg-purple-500/20 text-purple-400" },
  cta: { label: "转化", color: "bg-amber-500/20 text-amber-400" },
};

const styleLabels: Record<ProjectScript["styleType"], string> = {
  pain_point: "痛点种草",
  scene: "场景安利",
  comparison: "对比测评",
  story: "剧情故事",
  custom: "自定义",
};

export default function ScriptPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [selectedScript, setSelectedScript] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating] = useState(false);

  const { addTemplate } = useTemplateStore();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savedTip, setSavedTip] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [projectRes, scriptsRes] = await Promise.all([
          fetch(`/api/project/${id}`),
          fetch(`/api/project/${id}/scripts`),
        ]);

        if (!projectRes.ok) {
          const errData = await projectRes.json().catch(() => ({}));
          throw new Error(errData.error || "项目加载失败");
        }

        if (!scriptsRes.ok) {
          const errData = await scriptsRes.json().catch(() => ({}));
          throw new Error(errData.error || "脚本加载失败");
        }

        const [projectData, scriptsData] = await Promise.all([
          projectRes.json() as Promise<Project>,
          scriptsRes.json() as Promise<ProjectScript[]>,
        ]);

        if (!cancelled) {
          setProject(projectData);
          setScripts(scriptsData);
          const selectedIndex = scriptsData.findIndex((script) => script.selected);
          setSelectedScript(selectedIndex >= 0 ? selectedIndex : 0);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "页面加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const currentScript = scripts[selectedScript];
  const combinedVoiceover = useMemo(
    () => currentScript?.shots.map((shot) => shot.voiceover).filter(Boolean).join("\n\n") || "",
    [currentScript]
  );
  const totalWords = useMemo(
    () => currentScript?.shots.reduce((sum, shot) => sum + (shot.voiceover?.length || 0), 0) || 0,
    [currentScript]
  );

  const handleSaveAsTemplate = () => {
    setTemplateName("");
    setShowSaveDialog(true);
  };

  const doSaveTemplate = () => {
    if (!templateName.trim() || !currentScript) return;
    addTemplate({
      id: crypto.randomUUID(),
      name: templateName.trim(),
      styleType: currentScript.styleType,
      shots: currentScript.shots,
      totalDuration: currentScript.totalDuration || 0,
      useCount: 0,
      createdAt: new Date(),
    });
    setShowSaveDialog(false);
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 3000);
  };

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
            <span className="text-sm text-muted-foreground">{project?.name || "加载中..."}</span>
          </div>

          <div className="flex items-center gap-1">
            {["脚本", "素材", "视频", "导出"].map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 0 ? "bg-white/20" : "bg-muted"}`}>
                    {i + 1}
                  </span>
                  {step}
                </div>
                {i < 3 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error ? (
          <Card className="glass-card">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                <LuTriangleAlert className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : loading ? (
          <Card className="glass-card">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <p className="text-muted-foreground">正在加载脚本...</p>
            </CardContent>
          </Card>
        ) : scripts.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <p className="text-muted-foreground mb-4">这个项目还没有保存脚本。</p>
              <Link href="/project/new">
                <Button className="brand-gradient text-white">重新生成脚本</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">脚本方案</h2>
                <div className="flex items-center gap-2">
                  {savedTip && (
                    <span className="animate-in fade-in text-xs text-green-400">已保存为模板</span>
                  )}
                  <Button variant="outline" size="sm" className="text-xs" onClick={handleSaveAsTemplate}>
                    <LuBookmarkPlus className="mr-1 h-3.5 w-3.5" />
                    存为模板
                  </Button>
                  <Button variant="outline" size="sm" disabled={isGenerating} className="text-xs">
                    <LuWand className="mr-1 h-3.5 w-3.5" />
                    重新生成
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {scripts.map((script, index) => (
                  <Card
                    key={script.id}
                    className={`cursor-pointer transition-all ${selectedScript === index ? "ring-2 ring-primary neon-glow" : "glass-card card-hover"}`}
                    onClick={() => setSelectedScript(index)}
                  >
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-start justify-between">
                        <h3 className="text-sm font-medium">{script.title || `脚本方案 ${index + 1}`}</h3>
                        <Badge variant="secondary" className="ml-2 shrink-0 text-xs">
                          {styleLabels[script.styleType]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{script.shots.length} 个镜头</span>
                        <span>{script.totalDuration || 0}s</span>
                      </div>
                      <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                        {script.shots.map((shot) => {
                          const colors: Record<string, string> = {
                            hook: "bg-red-500",
                            pain_point: "bg-orange-500",
                            product_reveal: "bg-blue-500",
                            demo: "bg-green-500",
                            social_proof: "bg-purple-500",
                            cta: "bg-amber-500",
                          };
                          return (
                            <div
                              key={shot.shotId}
                              className={`${colors[shot.type]} opacity-70`}
                              style={{ flex: shot.duration }}
                            />
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2">
              <Tabs defaultValue="timeline" className="w-full">
                <div className="mb-4 flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="timeline">分镜时间线</TabsTrigger>
                    <TabsTrigger value="text">文案编辑</TabsTrigger>
                  </TabsList>
                  <Link href={`/project/${id}/assets`}>
                    <Button className="brand-gradient text-sm text-white">
                      下一步：生成素材
                      <LuArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                <TabsContent value="timeline" className="mt-0">
                  <div className="space-y-3">
                    {currentScript?.shots.map((shot, index) => {
                      const typeInfo = shotTypeLabels[shot.type];
                      return (
                        <Card key={shot.shotId} className="glass-card overflow-hidden">
                          <CardContent className="p-0">
                            <div className="flex">
                              <div className="w-16 shrink-0 border-r border-border/50 py-4 flex flex-col items-center justify-center">
                                <span className="text-lg font-bold text-muted-foreground/50">{String(index + 1).padStart(2, "0")}</span>
                                <Badge className={`${typeInfo.color} mt-1 border-0 text-[10px]`}>{typeInfo.label}</Badge>
                                <span className="mt-1 text-[10px] text-muted-foreground">{shot.duration}s</span>
                              </div>
                              <div className="flex-1 p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <p className="mb-2 text-sm leading-relaxed">{shot.description}</p>
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <LuClock className="h-3 w-3" />
                                        {shot.camera}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        {shot.visualSource === "product_image"
                                          ? "📷 商品原图"
                                          : shot.visualSource === "ai_generate"
                                            ? "✨ AI 生成"
                                            : "📁 用户上传"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md border border-border/30 bg-muted/30">
                                    {shot.visualSource === "product_image" ? (
                                      <span className="text-[10px] text-muted-foreground">商品图</span>
                                    ) : (
                                      <LuImage className="h-4 w-4 text-muted-foreground/40" />
                                    )}
                                  </div>
                                </div>
                                {shot.voiceover && (
                                  <div className="mt-3 rounded-md bg-muted/30 p-2.5">
                                    <p className="text-xs leading-relaxed text-muted-foreground">🎙 {shot.voiceover}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="text" className="mt-0">
                  <Card className="glass-card">
                    <CardContent className="space-y-4 p-6">
                      <h3 className="mb-2 text-sm font-medium">完整配音文案</h3>
                      <Textarea className="min-h-[300px] bg-background/50 text-sm leading-relaxed" value={combinedVoiceover} readOnly />
                      <p className="text-xs text-muted-foreground">
                        总字数：{totalWords} 字 · 预计时长：{currentScript?.totalDuration || 0}s · 语速：约{" "}
                        {Math.round((totalWords / Math.max(currentScript?.totalDuration || 1, 1)) * 10) / 10} 字/秒
                      </p>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </main>

      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Card className="glass-card mx-4 w-full max-w-md">
            <CardContent className="space-y-4 p-6">
              <h3 className="text-base font-semibold">保存为模板</h3>
              <p className="text-xs text-muted-foreground">保存当前脚本结构为模板，下次可直接套用到其他商品</p>
              <Input
                placeholder="模板名称，如：痛点种草-美妆通用"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(false)}>
                  取消
                </Button>
                <Button size="sm" className="brand-gradient text-white" onClick={doSaveTemplate} disabled={!templateName.trim()}>
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
