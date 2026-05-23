/**
 * Atlas Cloud Provider 实现
 * 基于 Atlas Cloud 当前媒体 API，支持图片和视频生成
 * 文档参考: https://www.atlascloud.ai/docs/en/models/image
 * 文档参考: https://www.atlascloud.ai/docs/en/models/video
 * 文档参考: https://www.atlascloud.ai/docs/en/upload-files
 */

import { BaseProvider, ProviderError } from './base'
import type {
  ProviderConfig,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  TaskStatus,
  TaskStatusEnum,
  Model,
  MediaType,
} from './types'

// ==================== Atlas Cloud API 响应类型 ====================

interface AtlasCreatePredictionResponse {
  data?: {
    id?: string
    status?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface AtlasPredictionResponse {
  data?: {
    id?: string
    status?: string
    outputs?: unknown[]
    error?: string
    created_at?: string
    updated_at?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface AtlasUploadResponse {
  code?: number
  message?: string
  download_url?: string
  url?: string
  data?: {
    url?: string
    download_url?: string
  }
  [key: string]: unknown
}

interface AtlasModelResponse {
  id: string
  name: string
  description?: string
  type: string
  supported_modes?: string[]
  [key: string]: unknown
}

// ==================== Provider 实现 ====================

export class AtlasCloudProvider extends BaseProvider {
  readonly name = 'atlas-cloud'
  readonly displayName = 'Atlas Cloud'
  private readonly rootBaseUrl: string

  constructor(config: ProviderConfig) {
    const rootBaseUrl = AtlasCloudProvider.normalizeBaseUrl(
      config.baseUrl || 'https://api.atlascloud.ai'
    )
    super({
      ...config,
      baseUrl: rootBaseUrl,
    })
    this.rootBaseUrl = rootBaseUrl
  }

  /**
   * 生成图片
   */
  async generateImage(options: ImageOptions): Promise<ImageResult> {
    const imageUrl = options.referenceImageUrl
      ? await this.prepareMediaUrl(options.referenceImageUrl)
      : undefined

    const body = {
      model: options.modelId,
      prompt: options.prompt,
      negative_prompt: options.negativePrompt,
      width: options.width,
      height: options.height,
      n: options.count ?? 1,
      guidance_scale: options.guidanceScale,
      steps: options.steps,
      seed: options.seed,
      ...(imageUrl && {
        image_url: imageUrl,
      }),
      ...options.extra,
    }

    const response = await this.request<AtlasCreatePredictionResponse>('/api/v1/model/generateImage', {
      method: 'POST',
      body,
      timeout: 60000,
    })

    const taskId = response.data?.id
    if (!taskId) {
      throw new ProviderError('Atlas Cloud 未返回任务 ID', 'NO_TASK_ID', this.name)
    }

    const finalStatus = await this.pollTaskStatus(taskId, {
      interval: 5000,
      maxAttempts: 120,
    })
    return this.ensureImageResult(finalStatus, options.modelId)
  }

  /**
   * 生成视频
   */
  async generateVideo(options: VideoOptions): Promise<VideoResult> {
    const firstFrameUrl = options.firstFrameUrl
      ? await this.prepareMediaUrl(options.firstFrameUrl)
      : undefined
    const lastFrameUrl = options.lastFrameUrl
      ? await this.prepareMediaUrl(options.lastFrameUrl)
      : undefined
    const referenceVideoUrl = options.referenceVideoUrl
      ? await this.prepareMediaUrl(options.referenceVideoUrl)
      : undefined

    const body = {
      model: options.modelId,
      prompt: options.prompt,
      negative_prompt: options.negativePrompt,
      width: options.width,
      height: options.height,
      duration: options.duration,
      fps: options.fps,
      motion_strength: options.motionStrength,
      guidance_scale: options.guidanceScale,
      seed: options.seed,
      ...(firstFrameUrl && {
        image_url: firstFrameUrl,
      }),
      ...(lastFrameUrl && {
        last_frame_url: lastFrameUrl,
      }),
      ...(referenceVideoUrl && {
        video_url: referenceVideoUrl,
      }),
      ...options.extra,
    }

    const response = await this.request<AtlasCreatePredictionResponse>('/api/v1/model/generateVideo', {
      method: 'POST',
      body,
      timeout: 60000,
    })

    const taskId = response.data?.id
    if (!taskId) {
      throw new ProviderError('Atlas Cloud 未返回任务 ID', 'NO_TASK_ID', this.name)
    }

    const finalStatus = await this.pollTaskStatus(taskId, {
      interval: 5000,
      maxAttempts: 180,
    })
    return this.ensureVideoResult(finalStatus, options.modelId)
  }

  /**
   * 查询任务状态
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await this.request<AtlasPredictionResponse>(
      `/api/v1/model/prediction/${taskId}`,
      { timeout: 60000 }
    )
    const data = response.data
    if (!data?.id) {
      throw new ProviderError('Atlas Cloud 未返回任务状态数据', 'INVALID_STATUS', this.name)
    }

    const status = this.mapStatus(data.status || '')

    const taskStatus: TaskStatus = {
      taskId: data.id,
      status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    if (status === 'completed') {
      taskStatus.result = this.buildTaskResult(data.id, data.outputs ?? [])
    }

    if (status === 'failed') {
      taskStatus.error = data.error || '未知错误'
      taskStatus.errorCode = 'ATLAS_GENERATION_FAILED'
    }

    return taskStatus
  }

  /**
   * 获取可用模型列表
   */
  async listModels(mediaType?: MediaType): Promise<Model[]> {
    try {
      const response = await this.request<{ data?: AtlasModelResponse[] }>('/v1/models')
      let models = (response.data || []).map((m) => this.mapModel(m))
      if (mediaType) {
        models = models.filter((m) => m.mediaType === mediaType)
      }
      return models
    } catch {
      // API 不可用时返回静态 fallback 列表
      // 基于 Atlas Cloud 官方模型页面确认（2026-03）
      // 来源：https://www.atlascloud.ai/models/media
      let models: Model[] = [
        // ==================== 视频生成 ====================
        // --- 可灵 Kling 3.0 ---
        { id: 'kwaivgi/kling-v3.0-pro/text-to-video', name: 'Kling 3.0 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video', provider: this.name },
        { id: 'kwaivgi/kling-v3.0-pro/image-to-video', name: 'Kling 3.0 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        { id: 'kwaivgi/kling-v3.0-std/text-to-video', name: 'Kling 3.0 Std (文生视频)', modes: ['text-to-video'], mediaType: 'video', provider: this.name },
        { id: 'kwaivgi/kling-v3.0-std/image-to-video', name: 'Kling 3.0 Std (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        // --- Vidu Q3 ---
        { id: 'vidu/q3-pro/text-to-video', name: 'Vidu Q3 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video', provider: this.name },
        { id: 'vidu/q3-pro/image-to-video', name: 'Vidu Q3 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        { id: 'vidu/q3-pro/start-end-to-video', name: 'Vidu Q3 Pro (首尾帧过渡)', description: '指定首尾帧生成过渡视频', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        { id: 'vidu/q3-turbo/image-to-video', name: 'Vidu Q3 Turbo (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        // --- 豆包 Seedance ---
        { id: 'bytedance/seedance-v1.5-pro/text-to-video', name: 'Seedance 1.5 Pro (文生视频)', modes: ['text-to-video'], mediaType: 'video', provider: this.name },
        { id: 'bytedance/seedance-v1.5-pro/image-to-video', name: 'Seedance 1.5 Pro (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        // --- 万相 Wan ---
        { id: 'alibaba/wan-2.6/image-to-video-flash', name: '万相 2.6 Flash (图生视频)', modes: ['image-to-video'], mediaType: 'video', provider: this.name },
        // ==================== 图片生成 ====================
        { id: 'bytedance/seedream-v5.0-lite', name: 'Seedream 5.0 Lite (文生图)', modes: ['text-to-image'], mediaType: 'image', provider: this.name },
        { id: 'google/nano-banana-2/text-to-image', name: 'Nano Banana 2 (文生图)', modes: ['text-to-image'], mediaType: 'image', provider: this.name },
      ]
      if (mediaType) {
        models = models.filter((m) => m.mediaType === mediaType)
      }
      return models
    }
  }

  // ==================== 私有方法 ====================

  /** 映射 Atlas Cloud 任务状态到统一状态 */
  private mapStatus(atlasStatus: string): TaskStatusEnum {
    const statusMap: Record<string, TaskStatusEnum> = {
      starting: 'pending',
      queued: 'pending',
      pending: 'pending',
      processing: 'processing',
      running: 'processing',
      in_progress: 'processing',
      succeeded: 'completed',
      completed: 'completed',
      failed: 'failed',
      canceled: 'cancelled',
      cancelled: 'cancelled',
    }
    return statusMap[atlasStatus] ?? 'pending'
  }

  private static normalizeBaseUrl(baseUrl: string): string {
    const url = new URL(baseUrl)
    return url.origin
  }

  private async prepareMediaUrl(url: string): Promise<string> {
    return this.uploadMedia(url, '/api/v1/model/uploadMedia')
  }

  private buildTaskResult(taskId: string, outputs: unknown[]) {
    const urls = this.extractOutputUrls(outputs)
    if (urls.length === 0) {
      return undefined
    }

    const hasVideo = urls.some((url) => /\.(mp4|webm|mov)(\?|$)/i.test(url))
    if (hasVideo) {
      return {
        taskId,
        videoUrls: urls,
        modelId: '',
      } satisfies VideoResult
    }

    return {
      taskId,
      imageUrls: urls,
      modelId: '',
    } satisfies ImageResult
  }

  private ensureImageResult(status: TaskStatus, modelId: string): ImageResult {
    const result = status.result
    if (!result || !('imageUrls' in result) || result.imageUrls.length === 0) {
      throw new ProviderError('任务完成但未返回图片结果', 'NO_IMAGE_RESULT', this.name)
    }

    return {
      ...result,
      modelId,
    }
  }

  private ensureVideoResult(status: TaskStatus, modelId: string): VideoResult {
    const result = status.result
    if (!result || !('videoUrls' in result) || result.videoUrls.length === 0) {
      throw new ProviderError('任务完成但未返回视频结果', 'NO_VIDEO_RESULT', this.name)
    }

    return {
      ...result,
      modelId,
    }
  }

  private extractOutputUrls(outputs: unknown[]): string[] {
    return outputs
      .map((item) => {
        if (typeof item === 'string') return item
        if (!item || typeof item !== 'object') return null
        const record = item as Record<string, unknown>
        const candidates = [
          record.url,
          record.output,
          record.image_url,
          record.video_url,
          record.file_url,
        ]
        return candidates.find((value): value is string => typeof value === 'string') ?? null
      })
      .filter((value): value is string => Boolean(value))
  }

  protected async uploadMedia(fileUrl: string, uploadPath: string): Promise<string> {
    const source = await fetch(fileUrl)
    if (!source.ok) {
      throw new ProviderError(
        `读取待上传媒体失败: ${source.status} ${source.statusText}`,
        'MEDIA_FETCH_FAILED',
        this.name,
        source.status
      )
    }

    const contentType = source.headers.get('content-type') || 'application/octet-stream'
    const fileBuffer = Buffer.from(await source.arrayBuffer())
    const fileName = this.inferUploadFilename(fileUrl, contentType)
    const form = new FormData()
    form.append('file', new Blob([fileBuffer], { type: contentType }), fileName)

    const response = await fetch(`${this.rootBaseUrl}${uploadPath}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: form,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new ProviderError(
        `上传媒体失败: ${response.status} ${response.statusText} - ${errorBody}`,
        'MEDIA_UPLOAD_FAILED',
        this.name,
        response.status
      )
    }

    const result = await response.json() as AtlasUploadResponse
    const uploadedUrl =
      result.url ||
      result.download_url ||
      result.data?.url ||
      result.data?.download_url
    if (!uploadedUrl) {
      throw new ProviderError('上传媒体成功但未返回 URL', 'MEDIA_UPLOAD_NO_URL', this.name)
    }

    return uploadedUrl
  }

  private inferUploadFilename(fileUrl: string, contentType: string): string {
    try {
      const { pathname } = new URL(fileUrl)
      const tail = pathname.split('/').pop()
      if (tail && tail.includes('.')) return tail
    } catch {
      // noop
    }

    if (contentType.includes('png')) return 'upload.png'
    if (contentType.includes('jpeg')) return 'upload.jpg'
    if (contentType.includes('webp')) return 'upload.webp'
    if (contentType.includes('mp4')) return 'upload.mp4'
    if (contentType.includes('webm')) return 'upload.webm'
    return 'upload.bin'
  }

  /** 映射 Atlas Cloud 模型到统一模型格式 */
  private mapModel(atlasModel: AtlasModelResponse): Model {
    const isVideo =
      atlasModel.type === 'video' ||
      atlasModel.type === 'video-generation' ||
      atlasModel.id.includes('video')
    return {
      id: atlasModel.id,
      name: atlasModel.name,
      description: atlasModel.description,
      modes: (atlasModel.supported_modes as Model['modes']) ?? (isVideo
        ? ['text-to-video', 'image-to-video']
        : ['text-to-image']),
      mediaType: isVideo ? 'video' : 'image',
      provider: this.name,
    }
  }
}
