import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import { INDEX_MODELS, type IndexModel } from './api/types.js'
import { createId } from '../utils/id.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

export const TRANSLATION_LANGUAGES = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'ru',
  'it',
  'pt',
  'vi',
  'th',
  'ar',
] as const
export type TargetLanguage = (typeof TRANSLATION_LANGUAGES)[number]
export type TranslationLanguage = 'auto' | TargetLanguage

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  model: IndexModel
  sourceLanguage: TranslationLanguage
  targetLanguage: TargetLanguage
  instruction: string
  activePresetId: string | null
  instructionPresets: InstructionPreset[]
  siderCollapsed: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  model: 'chat-demo:model',
  sourceLanguage: 'chat-demo:source-language',
  targetLanguage: 'chat-demo:target-language',
  instruction: 'chat-demo:instruction',
  activePresetId: 'chat-demo:active-preset-id',
  instructionPresets: 'chat-demo:instruction-presets',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

export type InstructionPreset = {
  id: string
  name?: string
  instruction: string
  description: string
}

export const DEFAULT_INSTRUCTION = '完整翻译，保留章节与段落顺序，统一人名和术语。'
export const DEFAULT_INSTRUCTION_PRESETS: InstructionPreset[] = [
  {
    id: 'complete',
    instruction: DEFAULT_INSTRUCTION,
    description: '完整翻译并统一术语，保留原文结构。',
  },
  {
    id: 'literal',
    instruction: '直译，保持原文语气和格式，不添加解释。',
    description: '尽量贴近原文，不添加额外说明。',
  },
  {
    id: 'natural',
    instruction: '自然翻译，使译文符合目标语言表达习惯。',
    description: '优先保证译文自然、地道。',
  },
  {
    id: 'markdown',
    instruction: '仅输出译文，保留 Markdown、章节和段落结构。',
    description: '保留 Markdown、章节和段落结构。',
  },
  {
    id: 'json-en',
    instruction: '将以下文本翻译为英文，以合法的 JSON 格式输出，不要包含其他说明。',
    description: '翻译成英文，并只输出合法 JSON。',
  },
  {
    id: 'polite-ja',
    instruction: '把下面的文本翻译成日语，使用敬体(です・ます调)，语气客气得体。',
    description: '翻译成客气得体的日语敬体。',
  },
  {
    id: 'spell-out-en',
    instruction: '把下面的文本翻译成英语，并将译文中所有的阿拉伯数字全部拼写为英文单词。',
    description: '翻译成英语，并将数字拼写为英文单词。',
  },
]
const initialInstructionPresets = (): InstructionPreset[] => {
  try {
    const saved = JSON.parse(read(KEYS.instructionPresets) ?? 'null')
    if (Array.isArray(saved)) {
      return saved.filter(
        (item): item is InstructionPreset =>
          item &&
          typeof item.id === 'string' &&
          item.id.length > 0 &&
          (item.name === undefined || typeof item.name === 'string') &&
          typeof item.instruction === 'string' &&
          typeof item.description === 'string'
      )
    }
  } catch {
    // 使用内置预设
  }
  return DEFAULT_INSTRUCTION_PRESETS
}
const initialPresetSelection = () => {
  const instructionPresets = initialInstructionPresets()
  const instruction = read(KEYS.instruction) ?? DEFAULT_INSTRUCTION
  const savedId = read(KEYS.activePresetId)
  let active = instructionPresets.find(
    (item) => item.id === savedId && item.instruction === instruction
  )
  // 旧版本只保存指令正文。保留曾经单独保存、未出现在列表中的自定义指令。
  if (!active && instruction) {
    active = instructionPresets.find((item) => item.instruction === instruction)
    if (!active) {
      active = { id: createId(), instruction, description: '' }
      return {
        instructionPresets: [...instructionPresets, active],
        instruction,
        activePresetId: active.id,
      }
    }
  }
  return { instructionPresets, instruction, activePresetId: active?.id ?? null }
}

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  model: INDEX_MODELS.find((model) => model === read(KEYS.model)) ?? INDEX_MODELS[0],
  sourceLanguage:
    TRANSLATION_LANGUAGES.find((lang) => lang === read(KEYS.sourceLanguage)) ?? 'auto',
  targetLanguage: TRANSLATION_LANGUAGES.find((lang) => lang === read(KEYS.targetLanguage)) ?? 'zh',
  ...initialPresetSelection(),
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setModel = (model: IndexModel) => {
  write(KEYS.model, model)
  useSettings.setState({ model })
}

export const setTranslationLanguages = (
  sourceLanguage: TranslationLanguage,
  targetLanguage: TargetLanguage
) => {
  write(KEYS.sourceLanguage, sourceLanguage)
  write(KEYS.targetLanguage, targetLanguage)
  useSettings.setState({ sourceLanguage, targetLanguage })
}

export const selectInstructionPreset = (id: string | null) => {
  const preset = useSettings.getState().instructionPresets.find((item) => item.id === id)
  const activePresetId = preset?.id ?? null
  const instruction = preset?.instruction ?? ''
  write(KEYS.activePresetId, activePresetId)
  write(KEYS.instruction, instruction)
  useSettings.setState({ activePresetId, instruction })
}

export const saveInstructionPreset = (preset: InstructionPreset) => {
  const { activePresetId, instructionPresets: previous } = useSettings.getState()
  const isNew = !previous.some((item) => item.id === preset.id)
  const instructionPresets = isNew
    ? [...previous, preset]
    : previous.map((item) => (item.id === preset.id ? preset : item))
  write(KEYS.instructionPresets, JSON.stringify(instructionPresets))
  if (isNew || preset.id === activePresetId) {
    write(KEYS.activePresetId, preset.id)
    write(KEYS.instruction, preset.instruction)
    useSettings.setState({
      instructionPresets,
      activePresetId: preset.id,
      instruction: preset.instruction,
    })
  } else {
    useSettings.setState({ instructionPresets })
  }
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
