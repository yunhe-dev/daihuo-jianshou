"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { LuCheck, LuCircleCheck, LuFilm, LuDownload, LuLink2, LuFileText, LuPlus, LuHouse, LuSmartphone, LuCopy, LuShuffle, LuTriangleAlert } from "react-icons/lu";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ExportResponse = {
  project: {
    id: string;
    name: string;
    createdAt: string;
  };
  script: {
    styleType: "pain_point" | "scene" | "comparison" | "story" | "custom";
    totalDuration: number | null;
    shots: Array<{ voiceover: string }>;
  } | null;
  composition: {
    outputPath: string | null;
    resolution: "720p" | "1080p" | null;
    aspectRatio: "9:16" | "16:9" | "1:1" | null;
    duration: number | null;
    bgmPath: string | null;
    ttsEnabled: boolean | null;
    subtitleStyle: { position?: string } | null;
  } | null;
};

const styleLabels: Record<string, string> = {
  pain_point: "痛点种草",
  scene: "场景安利",
  comparison: "对比测评",
  story: "剧情故事",
  custom: "自定义",
};

const platformConfigs = [
  { id: "douyin", name: "抖音", ratio: "9:16", resolution: "1080p", subtitle: "居中+描边", color: "from-pink-500 to-red-500" },
  { id: "kuaishou", name: "快手", ratio: "9:16", resolution: "1080p", subtitle: "贴边框", color: "from-orange-500 to-amber-500" },
  { id: "xiaohongshu", name: "小红书", ratio: "3:4", resolution: "1440p", subtitle: "手写字体", color: "from-red-500 to-rose-500" },
];

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ExportResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/project/${id}/export`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "导出信息加载失败");
        }

        const payload = (await res.json()) as ExportResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "导出信息加载失败");
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

  const videoInfo = useMemo(() => {
    if (!data) return null;

    const durationSeconds = Math.round((data.composition?.duration || 0) / 1000);
    return {
      title: data.project.name,
      duration: durationSeconds,
      resolution: data.composition?.resolution || "1080p",
      aspectRatio: data.composition?.aspectRatio || "9:16",
      createdAt: new Date(data.project.createdAt).toLocaleDateString("zh-CN"),
      scriptStyle: data.script ? styleLabels[data.script.styleType] : "未生成脚本",
      shotCount: data.script?.shots.length || 0,
      ttsVoice: data.composition?.ttsEnabled ? "已启用" : "未启用",
      bgm: data.composition?.bgmPath || "无背景音乐",
      hasSubtitle: Boolean(data.composition?.subtitleStyle),
      videoPath: data.composition?.outputPath || null,
    };
  }, [data]);

  const copyVideoLink = useCallback(async () => {
    if (!videoInfo?.videoPath) return;
    const url = `${window.location.origin}${videoInfo.videoPath}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("链接已复制到剪贴板");
    } catch {
      showToast("复制失败，请手动复制地址栏");
    }
  }, [showToast, videoInfo?.videoPath]);

  return (
    <div className="min-h-screen grid-bg">
      {toast && (
        <div className="animate-in fade-in slide-in-from-top-2 fixed left-1/2 top-20 z-[100] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm text-white shadow-xl">
            <LuCheck className="h-4 w-4" />
            {toast}
          </div>
        </div>
      )}

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
            <span className="text-sm text-muted-foreground">{videoInfo?.title || "加载中..."}</span>
          </div>

          <div className="flex items-center gap-1">
            {["脚本", "素材", "视频", "导出"].map((step, i) => (
              <div key={step} className="flex items-center">
                <div className={`flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${i === 3 ? "bg-primary text-primary-foreground" : "text-primary"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${i === 3 ? "bg-white/20" : "bg-primary/20"}`}>
                    {i < 3 ? "✓" : i + 1}
                  </span>
                  {step}
                </div>
                {i < 3 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {error ? (
          <Card className="glass-card">
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                <LuTriangleAlert className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : loading || !videoInfo ? (
          <Card className="glass-card">
            <CardContent className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
              正在加载导出信息...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-8 text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <LuCircleCheck className="h-8 w-8 text-emerald-500" />
              </div>
              <h1 className="mb-1 text-2xl font-bold tracking-tight">
                视频<span className="brand-gradient-text">生成完成</span>
              </h1>
              <p className="text-sm text-muted-foreground">你的带货视频已准备就绪，可以下载或分享</p>
            </div>

            <Card className="glass-card neon-glow mb-6 overflow-hidden">
              <CardContent className="p-0">
                <div className="mx-auto max-w-xs">
                  <div className="relative aspect-[9/16] overflow-hidden bg-gradient-to-b from-muted/40 via-muted/20 to-muted/40">
                    {videoInfo.videoPath ? (
                      <video controls className="h-full w-full object-cover" src={videoInfo.videoPath} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <LuFilm className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                          <p className="text-xs text-muted-foreground/50">{videoInfo.title}</p>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                      0:{String(videoInfo.duration).padStart(2, "0")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-border/30 px-5 py-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{videoInfo.resolution}</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    <span>{videoInfo.aspectRatio}</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    <span>MP4</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{videoInfo.createdAt}</span>
                </div>
              </CardContent>
            </Card>

            <div className="mb-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <a href={videoInfo.videoPath || "#"} download className="inline-flex">
                <Button className="brand-gradient h-11 px-8 text-sm font-semibold text-white">
                  <LuDownload className="mr-2 h-[18px] w-[18px]" />
                  下载视频
                </Button>
              </a>
              <Button variant="outline" onClick={() => void copyVideoLink()} className="h-11 px-6 text-sm">
                <LuLink2 className="mr-2 h-4 w-4" />
                复制分享链接
              </Button>
              <Button
                variant="outline"
                onClick={() => showToast("脚本文案已在脚本页中可查看")}
                className="h-11 px-6 text-sm"
              >
                <LuFileText className="mr-2 h-4 w-4" />
                导出脚本
              </Button>
            </div>

            <Card className="glass-card mb-6">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <LuSmartphone className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">多平台导出</h3>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">当前为主版本导出，平台适配入口保留中</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {platformConfigs.map((platform) => (
                    <div key={platform.id} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <div className={`flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br ${platform.color}`}>
                          <span className="text-[10px] font-bold text-white">{platform.name[0]}</span>
                        </div>
                        <span className="text-sm font-medium">{platform.name}</span>
                      </div>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>比例: {platform.ratio}</p>
                        <p>分辨率: {platform.resolution}</p>
                        <p>字幕: {platform.subtitle}</p>
                      </div>
                      <Button variant="outline" size="sm" className="mt-2 w-full text-xs" onClick={() => showToast(`${platform.name} 适配导出待接入`)}>
                        导出{platform.name}版
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card mb-6">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <LuShuffle className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">A/B 测试版本</h3>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">当前显示主版本，变体生成入口保留中</p>
                <div className="space-y-3">
                  {["版本A - 主版本", "版本B - 强卖点", "版本C - 悬念开头"].map((name, index) => (
                    <div key={name} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium">{name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {index === 0 ? videoInfo.scriptStyle : "待生成"}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {index === 0 ? "当前主版本已生成" : "后续可在此生成不同钩子和文案变体"}
                        </p>
                      </div>
                      <div className="ml-3 flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => showToast(`${name} 入口保留中`)}>
                          <LuCopy className="mr-1 h-3 w-3" />
                          生成
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-5">
                <h3 className="mb-4 text-sm font-semibold">视频详情</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">脚本风格</p>
                      <p className="text-sm">{videoInfo.scriptStyle}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">分镜数量</p>
                      <p className="text-sm">{videoInfo.shotCount} 个镜头</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">总时长</p>
                      <p className="text-sm">{videoInfo.duration} 秒</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">配音</p>
                      <p className="text-sm">{videoInfo.ttsVoice}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">合成方式</p>
                      <Badge variant="secondary" className="text-xs">FFmpeg Storyboard</Badge>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">视频文件</p>
                      <Badge variant="secondary" className="text-xs">MP4</Badge>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">背景音乐</p>
                      <p className="text-sm">{videoInfo.bgm}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs text-muted-foreground">字幕</p>
                      <p className="text-sm">{videoInfo.hasSubtitle ? "已开启" : "未开启"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="mt-8 flex items-center justify-center gap-4">
              <Link href="/project/new">
                <Button className="brand-gradient text-white">
                  <LuPlus className="mr-1.5 h-4 w-4" />
                  再做一个
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline">
                  <LuHouse className="mr-1.5 h-4 w-4" />
                  返回项目列表
                </Button>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
