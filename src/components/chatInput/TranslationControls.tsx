import { useMemo } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { INDEX_MODELS } from '../../services/api/types.js'
import {
  selectInstructionPreset,
  setModel,
  setTranslationLanguages,
  TRANSLATION_LANGUAGES,
  useSettings,
} from '../../services/settings.js'
import { IconButton } from '../base/IconButton.js'
import {
  IconEditOutline16,
  IconLayersOutline16,
  IconPresetOutline16,
  IconSwapOutline16,
} from '../base/icons.js'
import { Select } from '../base/Select.js'
import { getPresetLabels } from '../settings/presetLabels.js'
import { openSettings } from '../settings/settingsDialogState.js'
import styles from './ChatInput.module.css'

export const LanguagePair = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const source = useSettings((state) => state.sourceLanguage)
  const target = useSettings((state) => state.targetLanguage)
  const languages = useMemo(() => {
    const names = new Intl.DisplayNames(locale, { type: 'language' })
    return TRANSLATION_LANGUAGES.map((value) => ({ value, label: names.of(value) ?? value }))
  }, [locale])
  return (
    <div className={styles.languagePair}>
      <Select
        className={styles.languageSelect}
        ariaLabel={t('sourceLanguage')}
        caption={t('sourceLanguage')}
        align="start"
        value={source}
        options={[{ value: 'auto', label: t('languageAuto') }, ...languages]}
        onChange={(value) => setTranslationLanguages(value, target)}
        disabled={disabled}
      />
      <IconButton
        size="m"
        className={styles.swap}
        icon={<IconSwapOutline16 />}
        tooltip={t('swapLanguages')}
        disabled={disabled || source === 'auto' || source === target}
        onClick={() => source !== 'auto' && setTranslationLanguages(target, source)}
      />
      <Select
        className={styles.languageSelect}
        ariaLabel={t('targetLanguage')}
        caption={t('targetLanguage')}
        align="start"
        value={target}
        options={languages}
        onChange={(value) => setTranslationLanguages(source, value)}
        disabled={disabled}
      />
    </div>
  )
}

const modelOptions = INDEX_MODELS.map((value) => ({
  value,
  label: value,
  triggerLabel: value.replace('Index-', '').replace('-', ' '),
}))

export const TranslationOptions = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const model = useSettings((state) => state.model)
  const presets = useSettings((state) => state.instructionPresets)
  const activeId = useSettings((state) => state.activePresetId)
  const presetOptions = useMemo(
    () => [
      ...presets.map((preset) => {
        const { name, description } = getPresetLabels(preset, t)
        return { value: preset.id, label: name, description }
      }),
      { value: '', label: t('noPreset') },
    ],
    [presets, t]
  )
  return (
    <div className={styles.preferences}>
      <Select
        className={styles.preferenceSelect}
        icon={<IconLayersOutline16 />}
        ariaLabel={t('translationModel')}
        caption={t('translationModel')}
        align="start"
        value={model}
        options={modelOptions}
        onChange={setModel}
        disabled={disabled}
      />
      <div className={styles.presetControl}>
        <Select
          className={styles.preferenceSelect}
          icon={<IconPresetOutline16 />}
          ariaLabel={t('translationPresets')}
          caption={t('translationPresets')}
          align="start"
          value={activeId ?? ''}
          options={presetOptions}
          onChange={(id) => selectInstructionPreset(id || null)}
          disabled={disabled}
        />
        <IconButton
          size="m"
          className={styles.managePresets}
          icon={<IconEditOutline16 />}
          tooltip={t('managePresets')}
          onClick={() => openSettings('presets')}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
