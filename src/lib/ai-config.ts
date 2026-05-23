export type RuntimeAIConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  imageModel: string;
  videoModel: string;
};

type ProviderSetting = {
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
};

type SettingsLike = {
  providers: Record<string, ProviderSetting>;
  defaultImageModel?: string;
  defaultVideoModel?: string;
};

const PROVIDER_ORDER = ["atlas-cloud", "fal-ai", "alibaba", "volcengine", "siliconflow"] as const;

const DEFAULT_BASE_URLS: Record<string, string> = {
  "atlas-cloud": "https://api.atlascloud.ai",
  "fal-ai": "https://queue.fal.run",
  alibaba: "https://dashscope.aliyuncs.com/api/v1",
  volcengine: "https://visual.volcengineapi.com",
  siliconflow: "https://api.siliconflow.cn/v1",
};

const DEFAULT_IMAGE_MODELS: Record<string, string> = {
  "atlas-cloud": "bytedance/seedream-v5.0-lite",
  "fal-ai": "fal-ai/flux-pro/v1.1",
  alibaba: "wanx-v1",
  volcengine: "doubao-seedream-5-0-lite",
  siliconflow: "Qwen/Qwen-Image",
};

const DEFAULT_VIDEO_MODELS: Record<string, string> = {
  "atlas-cloud": "kwaivgi/kling-v3.0-pro/text-to-video",
  "fal-ai": "fal-ai/kling-video/v3/pro/text-to-video",
  alibaba: "wan2.6-i2v-flash",
  volcengine: "doubao-seedance-1-5-pro-251215",
  siliconflow: "",
};

export function resolveRuntimeAIConfig(settings: SettingsLike): RuntimeAIConfig | null {
  for (const providerName of PROVIDER_ORDER) {
    const provider = settings.providers?.[providerName];
    if (!provider?.enabled || !provider.apiKey) continue;

    const imageModel =
      settings.defaultImageModel && settings.defaultImageModel.trim()
        ? settings.defaultImageModel
        : DEFAULT_IMAGE_MODELS[providerName];
    const videoModel =
      settings.defaultVideoModel && settings.defaultVideoModel.trim()
        ? settings.defaultVideoModel
        : DEFAULT_VIDEO_MODELS[providerName];

    if (!imageModel && !videoModel) continue;

    return {
      provider: providerName,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl || DEFAULT_BASE_URLS[providerName],
      imageModel,
      videoModel,
    };
  }

  return null;
}
