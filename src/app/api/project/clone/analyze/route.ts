import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

type LLMConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

type StoryboardCard = {
  id: number;
  title: string;
  description: string;
  duration: string;
};

function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const videoUrl = body?.videoUrl?.trim();
    const llmConfig = body?.llmConfig as LLMConfig | undefined;

    if (!videoUrl) {
      return NextResponse.json({ error: "请提供视频链接" }, { status: 400 });
    }

    if (!llmConfig?.baseUrl || !llmConfig.apiKey || !llmConfig.model) {
      return NextResponse.json({ error: "请先配置 LLM 服务" }, { status: 400 });
    }

    const client = new OpenAI({
      baseURL: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
    });

    const response = await client.chat.completions.create({
      model: llmConfig.model,
      temperature: 0.6,
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "你是电商短视频策划。用户只提供爆款视频链接时，你不能假装真的看过视频，但可以根据平台爆款带货视频常见结构，输出一个适合复刻的分镜结构。返回 JSON，格式为 {\"storyboards\":[{\"title\":\"\",\"description\":\"\",\"duration\":\"\"}] }，共 5-7 个分镜。",
        },
        {
          role: "user",
          content: `请基于这个爆款视频链接推测一个可复刻的带货视频结构，并保持适合电商短视频节奏：${videoUrl}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM 未返回有效内容");
    }

    const parsed = JSON.parse(extractJSON(content)) as { storyboards?: StoryboardCard[] };
    const storyboards = Array.isArray(parsed.storyboards)
      ? parsed.storyboards.map((item, index) => ({
          id: index + 1,
          title: item.title || `分镜 ${index + 1}`,
          description: item.description || "待补充",
          duration: item.duration || `${index * 5}-${index * 5 + 5}s`,
        }))
      : [];

    if (storyboards.length === 0) {
      throw new Error("未生成有效分镜");
    }

    return NextResponse.json({ storyboards });
  } catch (error) {
    console.error("爆款分析失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "爆款分析失败" },
      { status: 500 }
    );
  }
}
