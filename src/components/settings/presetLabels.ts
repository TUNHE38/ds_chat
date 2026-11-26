import type { TranslationKey, useTranslate } from '../../i18n/index.js'
import { DEFAULT_INSTRUCTION_PRESETS, type InstructionPreset } from '../../services/settings.js'

const labels: Record<string, [TranslationKey, TranslationKey]> = {
  complete: ['presetComplete', 'presetCompleteDescription'],
  literal: ['presetLiteral', 'presetLiteralDescription'],
  natural: ['presetNatural', 'presetNaturalDescription'],
  markdown: ['presetMarkdown', 'presetMarkdownDescription'],
  'json-en': ['presetJson', 'presetJsonDescription'],
  'polite-ja': ['presetPolite', 'presetPoliteDescription'],
  'spell-out-en': ['presetNumbers', 'presetNumbersDescription'],
}

/** 内置名称与说明跟随界面语言，用户编辑的内容保留原文。 */
export const getPresetLabels = (preset: InstructionPreset, t: ReturnType<typeof useTranslate>) => {
  const original = DEFAULT_INSTRUCTION_PRESETS.find((item) => item.id === preset.id)
  const keys = original && labels[original.id]
  return {
    name: preset.name || (keys ? t(keys[0]) : preset.description || t('customPreset')),
    description:
      keys && original.description === preset.description ? t(keys[1]) : preset.description,
  }
}
