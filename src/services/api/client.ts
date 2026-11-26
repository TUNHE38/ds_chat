import { translate, type TranslationMessage } from '../../i18n/index.js'
import { resizeUploadImage } from '../../utils/resizeUploadImage.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageParam,
  MessageStreamEvent,
  OpenAIChatRequest,
  OpenAIChatMessage,
  OpenAIContentPart,
  OpenAIChatChunk,
  OpenAIResponse,
  OpenAIResponseRequest,
} from './types.js'

/** 构建期 API 地址，默认 Index-Translate；本地开发支持开发服务器代理 */
export const API_ORIGIN = __API_ORIGIN__
/** Index-Translate OpenAI 兼容接口前缀 */
const OPENAI_BASE_URL = `${API_ORIGIN}/v1`
/** Anthropic 兼容接口的前缀 */
const ANTHROPIC_BASE_URL = `${API_ORIGIN}/anthropic/v1`
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 用 GET /models 校验 API Key（不产生费用） */
export const verifyApiKey = async (apiKey: string, signal?: AbortSignal): Promise<void> => {
  await request(`${OPENAI_BASE_URL}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
}

/** Index-Translate 的 OpenAI Chat Completions 流式接口。支持 text 与 image_url 内容块。 */
export async function* streamOpenAIChat(
  apiKey: string,
  body: OpenAIChatRequest,
  signal: AbortSignal
): AsyncGenerator<OpenAIChatChunk> {
  const response = await request(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': 'Index-Translate-Client/1.0',
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: true,
    }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { data } of readServerSentEvents(response.body, signal)) {
    if (data === '[DONE]') {
      return
    }
    try {
      const payload = JSON.parse(data) as OpenAIChatChunk
      if (payload.error) {
        throw new ApiError('stream', payload.error.message)
      }
      yield payload
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
    }
  }
}

/** 将本轮附件转为 Chat Completions 的 image_url 内容块。 */
const openAIContent = (
  content: Extract<MessageParam, { role: 'user' }>['content'],
  imageDataUrls: Record<string, string> = {}
): OpenAIChatMessage['content'] => {
  if (typeof content === 'string') {
    return content
  }
  const parts: OpenAIContentPart[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      parts.push({ type: 'text', text: part.text })
    } else if (part.type === 'image') {
      const url = part.data_url ?? imageDataUrls[part.source.file_id]
      if (url) {
        parts.push({ type: 'image_url', image_url: { url } })
      }
    }
  }
  return parts
}

/** 将应用内部的消息请求转换为 OpenAI Chat Completions 请求，并统一输出应用事件。 */
export async function* streamOpenAIMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  // Index-Translate 接口要求将翻译指令和原文合并到唯一的 user 消息中，
  // 不发送 system、target、source、instruction 或内部 reminder 字段。
  const languageNames: Record<string, string> = {
    auto: '目标语言',
    zh: '中文',
    en: '英文',
    ja: '日语',
    ko: '韩语',
    fr: '法语',
    de: '德语',
    es: '西班牙语',
    ru: '俄语',
    it: '意大利语',
    pt: '葡萄牙语',
    vi: '越南语',
    th: '泰语',
    ar: '阿拉伯语',
  }
  const targetLanguage = languageNames[body.target ?? ''] ?? body.target ?? '目标语言'
  const sourceLanguage =
    body.source && body.source !== 'auto' ? languageNames[body.source] : undefined
  const sourceMessage = [...body.messages].reverse().find((message) => message.role === 'user')
  const sourceContent = openAIContent(sourceMessage?.content ?? '', body.imageDataUrls)
  const hasImage =
    Array.isArray(sourceContent) && sourceContent.some((part) => part.type === 'image_url')
  const instruction = body.instruction?.trim() || '直接输出翻译结果，不要进行任何解释'
  // 图片使用语言选择器指定的方向，避免文本预设中写死的语言覆盖目标语言。
  const prompt = hasImage
    ? `请将图片中的${sourceLanguage ?? '文字'}翻译为${targetLanguage}。`
    : `请将以下${sourceLanguage ?? ''}文本翻译为${targetLanguage}。${instruction}\n\n`
  const messages: OpenAIChatRequest['messages'] = [
    {
      role: 'user',
      content:
        typeof sourceContent === 'string'
          ? prompt + sourceContent
          : [{ type: 'text', text: prompt }, ...sourceContent],
    },
  ]
  yield {
    type: 'message_start',
    message: { id: `openai-${Date.now()}`, model: body.model },
  }
  yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
  for await (const chunk of streamOpenAIChat(apiKey, { model: body.model, messages }, signal)) {
    const delta = chunk.choices?.[0]?.delta
    const text = delta?.content ?? ''
    if (text) {
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }
    }
  }
  yield { type: 'content_block_stop', index: 0 }
  yield {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
  }
  yield { type: 'message_stop' }
}

/** Responses API 的非流式兼容请求，供调用方或集成测试使用。 */
export const createOpenAIResponse = async (
  apiKey: string,
  body: OpenAIResponseRequest,
  signal?: AbortSignal
): Promise<OpenAIResponse> => {
  const response = await request(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Index-Translate-Client/1.0',
    },
    body: JSON.stringify(body),
    signal,
  })
  return (await response.json()) as OpenAIResponse
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  apiKey: string,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', purpose === null ? await resizeUploadImage(file, signal) : file)
  const response = await request(`${ANTHROPIC_BASE_URL}/files`, {
    method: 'POST',
    headers: anthropicHeaders(apiKey, true),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (apiKey: string, fileId: string): Promise<void> => {
  await request(`${ANTHROPIC_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders(apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST /anthropic/v1/messages（stream: true），逐个产出流式事件，收到 message_stop 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const response = await request(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders(apiKey, hasFile(body)),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, imageDataUrls: undefined, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
