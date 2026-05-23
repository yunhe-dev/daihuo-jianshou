"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LuArrowLeft, LuPlay, LuChevronDown, LuArrowRight, LuTriangleAlert } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Shot } from "@/lib/db/schema";

interface VideoClipItem {
  id: string;
  shotId: number;
  duration: number | null;
  transitionType: "ai_start_end" | "ai_reference" | "direct_concat" | "ffmpeg_fade";
  filePath: string | null;
}

interface ComposeConfig {
  ttsEnabled: boolean;
  ttsVoice: string;
  bgm: string;
  subtitleSize: number;
  subtitlePosition: "bottom" | "center" | "top";
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
}

type VideoResponse = {
  project: {
    id: string;
    name: string;
  };
  script: {
    shots: Shot[];
  };
  clips: VideoClipItem[];
  composition: {
    outputPath: string | null;
    duration: number | null;
  } | null;
};

const transitionLabels: Record<string, string> = {
  ai_start_end: "AI 智能过渡",
  ai_reference: "AI 参考过渡",
  direct_concat: "直接拼接",
  ffmpeg_fade: "渐变过渡",
};

const shotTypeLabels: Record<Shot["type"], { label: string; color: string }> = {
  hook: { label: "钩子", color: "bg-red-500/20 text-red-400" },
  pain_point: { label: "痛点", color: "bg-orange-500/20 text-orange-400" },
  product_reveal: { label: "产品", color: "bg-blue-500/20 text-blue-400" },
  demo: { label: "演示", color: "bg-green-500/20 text-green-400" },
  social_proof: { label: "背书", color: "bg-purple-500/20 text-purple-400" },
  cta: { label: "转化", color: "bg-amber-500/20 text-amber-400" },
};

export default function VideoPage() {
  const { id } = useParams<{ id: string }>();
  const [projectName, setProjectName] = useState("加载中...");
  const [shots, setShots] = useState<Shot[]>([]);
  const [clips, setClips] = useState<VideoClipItem[]>([]);
  const [compositionPath, setCompositionPath] = useState<string | null>(null);
  const [config, setConfig] = useState<ComposeConfig>({
    ttsEnabled: true,
    ttsVoice: "female-gentle",
    bgm: "upbeat",
    subtitleSize: 24,
    subtitlePosition: "bottom",
    aspectRatio: "9:16",
    resolution: "1080p",
  });
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState(0);
  const [composeDone, setComposeDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVideoData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/project/${id}/video`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "视频信息加载失败");
      }

      const data = (await res.json()) as VideoResponse;
      setProjectName(data.project.name);
      setShots(data.script.shots);
      setClips(data.clips);
      setCompositionPath(data.composition?.outputPath || null);
      setComposeDone(Boolean(data.composition?.outputPath));
      setComposeProgress(data.composition?.outputPath ? 100 : 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "视频信息加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadVideoData();
  }, [loadVideoData]);

  const totalDuration = useMemo(
    () => shots.reduce((sum, shot) => sum + shot.duration, 0),
    [shots]
  );

  const enrichedClips = useMemo(
    () =>
      clips.map((clip) => ({
        ...clip,
        shot: shots.find((shot) => shot.shotId === clip.shotId),
      })),
    [clips, shots]
  );

  const startCompose = useCallback(async () => {
    setIsComposing(true);
    setComposeDone(false);
    setComposeProgress(15);
    setError(null);

    const progressTimer = setInterval(() => {
      setComposeProgress((prev) => (prev >= 90 ? prev : prev + 7));
    }, 300);

    try {
      const res = await fetch(`/api/project/${id}/video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "合成视频失败");
      }

      const data = (await res.json()) as { composition: { outputPath: string } };
      setCompositionPath(data.composition.outputPath);
      setComposeProgress(100);
      setComposeDone(true);
      await loadVideoData();
    } catch (composeError) {
      setError(composeError instanceof Error ? composeError.message : "合成视频失败");
      setComposeProgress(0);
    } finally {
      clearInterval(progressTimer);
      setIsComposing(false);
    }
  }, [config, id, loadVideoData]);

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
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 2 ? "bg-primary text-primary-foreground" : i < 2 ? "text-primary" : "text-muted-foreground"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 2 ? "bg-white/20" : i < 2 ? "bg-primary/20" : "bg-muted"}`}>
                    {i < 2 ? "✓" : i + 1}
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
        {error && (
          <Card className="glass-card mb-6">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
              <LuTriangleAlert className="h-4 w-4" />
              {error}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">视频时间线</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{loading ? "加载中..." : `${clips.length} 个片段 · 总时长 ${totalDuration}s`}</p>
              </div>
              <Link href={`/project/${id}/assets`}>
                <Button variant="outline" size="sm" className="text-xs">
                  <LuArrowLeft className="mr-1 h-3.5 w-3.5" />
                  返回素材
                </Button>
              </Link>
            </div>

            <div className="space-y-1">
              {enrichedClips.map((clip, index) => {
                const shot = clip.shot;
                if (!shot) return null;
                const typeInfo = shotTypeLabels[shot.type];
                return (
                  <div key={clip.id}>
                    <Card className="glass-card">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/30 bg-muted/30">
                            {clip.filePath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={clip.filePath} alt={shot.description} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                                <LuPlay className="h-4 w-4 text-primary/60" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <Badge className={`${typeInfo.color} border-0 text-[10px]`}>{typeInfo.label}</Badge>
                              <span className="text-xs text-muted-foreground">{Math.round((clip.duration || 0) / 1000)}s</span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">🎙 {shot.voiceover}</p>
                          </div>

                          <span className="shrink-0 text-sm font-bold text-muted-foreground/30">{String(clip.shotId).padStart(2, "0")}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {index < enrichedClips.length - 1 && (
                      <div className="flex items-center justify-center py-1.5">
                        <div className="flex items-center gap-2 rounded-full border border-border/30 bg-muted/20 px-3 py-1">
                          <LuChevronDown className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{transitionLabels[clip.transitionType]}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 lg:col-span-1">
            <h2 className="text-base font-semibold">合成设置</h2>

            <Card className="glass-card">
              <CardContent className="space-y-4 p-4">
                <Label className="text-sm font-medium">配音 (TTS)</Label>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">启用自动配音</span>
                  <button
                    onClick={() => setConfig((current) => ({ ...current, ttsEnabled: !current.ttsEnabled }))}
                    className={`relative h-5 w-10 rounded-full transition-colors ${config.ttsEnabled ? "bg-primary" : "bg-muted"}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${config.ttsEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {config.ttsEnabled && (
                  <Select value={config.ttsVoice} onValueChange={(value) => setConfig((current) => ({ ...current, ttsVoice: value ?? current.ttsVoice }))}>
                    <SelectTrigger className="border-border/50 bg-muted/30 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female-gentle">女声 - 温柔</SelectItem>
                      <SelectItem value="female-energetic">女声 - 活力</SelectItem>
                      <SelectItem value="male-warm">男声 - 温暖</SelectItem>
                      <SelectItem value="male-pro">男声 - 专业</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="space-y-3 p-4">
                <Label className="text-sm font-medium">背景音乐</Label>
                <Select value={config.bgm} onValueChange={(value) => setConfig((current) => ({ ...current, bgm: value ?? current.bgm }))}>
                  <SelectTrigger className="border-border/50 bg-muted/30 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无背景音乐</SelectItem>
                    <SelectItem value="upbeat">轻快节奏</SelectItem>
                    <SelectItem value="chill">舒缓放松</SelectItem>
                    <SelectItem value="energetic">动感活力</SelectItem>
                    <SelectItem value="emotional">情感温暖</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="space-y-3 p-4">
                <Label className="text-sm font-medium">字幕</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["bottom", "center", "top"] as const).map((position) => (
                    <button
                      key={position}
                      onClick={() => setConfig((current) => ({ ...current, subtitlePosition: position }))}
                      className={`h-9 rounded-md border text-xs transition-all ${
                        config.subtitlePosition === position
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {position === "bottom" ? "底部" : position === "center" ? "居中" : "顶部"}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="space-y-4 p-4">
                <Label className="text-sm font-medium">画面设置</Label>
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">画面比例</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(["9:16", "16:9", "1:1"] as const).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setConfig((current) => ({ ...current, aspectRatio: ratio }))}
                        className={`h-9 rounded-md border text-xs transition-all ${
                          config.aspectRatio === ratio
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {ratio === "9:16" ? "竖屏" : ratio === "16:9" ? "横屏" : "方形"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">分辨率</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["720p", "1080p"] as const).map((resolution) => (
                      <button
                        key={resolution}
                        onClick={() => setConfig((current) => ({ ...current, resolution }))}
                        className={`h-9 rounded-md border text-xs transition-all ${
                          config.resolution === resolution
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {resolution}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {(isComposing || composeDone) && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/30">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${composeDone ? "bg-emerald-500" : "brand-gradient"}`}
                      style={{ width: `${composeProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    {composeDone ? "合成完成！" : `正在合成视频... ${composeProgress}%`}
                  </p>
                </div>
              )}

              <Button onClick={() => void startCompose()} disabled={isComposing || loading || clips.length === 0} className="brand-gradient w-full text-white">
                {isComposing ? (
                  <>
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    合成中...
                  </>
                ) : composeDone ? (
                  "重新合成"
                ) : (
                  <>
                    <LuPlay className="mr-1 h-4 w-4" />
                    开始合成
                  </>
                )}
              </Button>

              {composeDone && compositionPath && (
                <Link href={`/project/${id}/export`}>
                  <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                    下一步：导出视频
                    <LuArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
