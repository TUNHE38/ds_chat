import { useId, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useChatStore } from '../../services/chat/store.js'
import {
  saveInstructionPreset,
  selectInstructionPreset,
  useSettings,
  type InstructionPreset,
} from '../../services/settings.js'
import { createId } from '../../utils/id.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconEditOutline16 } from '../base/icons.js'
import { getPresetLabels } from './presetLabels.js'
import styles from './Settings.module.css'

export const PresetSettings = () => {
  const t = useTranslate()
  const radioGroup = useId()
  const presets = useSettings((state) => state.instructionPresets)
  const activeId = useSettings((state) => state.activePresetId)
  const disabled = useChatStore(
    (state) =>
      state.importingHistory ||
      (state.activeId !== null && Object.hasOwn(state.streaming, state.activeId))
  )
  const [editor, setEditor] = useState<{ preset?: InstructionPreset } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeEditor = () => {
    const id = editor?.preset?.id ?? ''
    setEditor(null)
    requestAnimationFrame(() => {
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-edit-id]')
      Array.from(buttons ?? [])
        .find((button) => button.dataset.editId === id)
        ?.focus()
    })
  }
  if (editor) {
    return <PresetEditor preset={editor.preset} disabled={disabled} onClose={closeEditor} />
  }
  return (
    <div ref={listRef}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeading}>{t('presetLibrary')}</h2>
        <Button
          size="m"
          variant="outlined"
          data-edit-id=""
          disabled={disabled}
          onClick={() => setEditor({})}
        >
          <span aria-hidden="true">＋</span> {t('newPreset')}
        </Button>
      </div>
      <div role="radiogroup" aria-label={t('translationPresets')} className={styles.presetList}>
        {presets.map((preset) => {
          const { name, description } = getPresetLabels(preset, t)
          return (
            <div
              key={preset.id}
              className={styles.presetRow}
              data-selected={preset.id === activeId}
            >
              <label>
                <input
                  type="radio"
                  name={radioGroup}
                  checked={preset.id === activeId}
                  disabled={disabled}
                  onChange={() => selectInstructionPreset(preset.id)}
                />
                <span className={styles.presetCopy}>
                  <strong>{name}</strong>
                  <small>{description || preset.instruction}</small>
                </span>
              </label>
              <IconButton
                size="m"
                icon={<IconEditOutline16 />}
                tooltip={t('editNamedPreset', { name })}
                data-edit-id={preset.id}
                disabled={disabled}
                onClick={() => setEditor({ preset })}
              />
            </div>
          )
        })}
        <div className={styles.presetRow} data-selected={activeId === null}>
          <label>
            <input
              type="radio"
              name={radioGroup}
              checked={activeId === null}
              disabled={disabled}
              onChange={() => selectInstructionPreset(null)}
            />
            {t('noPreset')}
          </label>
        </div>
      </div>
    </div>
  )
}

const PresetEditor = ({
  preset,
  disabled,
  onClose,
}: {
  preset?: InstructionPreset
  disabled: boolean
  onClose: () => void
}) => {
  const t = useTranslate()
  const initial = preset ? getPresetLabels(preset, t) : { name: '', description: '' }
  const [name, setName] = useState(initial.name)
  const [instruction, setInstruction] = useState(preset?.instruction ?? '')
  const [description, setDescription] = useState(initial.description)
  const canSave = !disabled && !!name.trim() && !!instruction.trim()

  return (
    <form
      className={styles.presetEditor}
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSave) {
          return
        }
        saveInstructionPreset({
          id: preset?.id ?? createId(),
          name: preset && name.trim() === initial.name ? preset.name : name.trim(),
          instruction: instruction.trim(),
          description:
            preset && description.trim() === initial.description
              ? preset.description
              : description.trim(),
        })
        onClose()
      }}
    >
      <h2 className={styles.sectionHeading}>{t(preset ? 'editPreset' : 'newPreset')}</h2>
      <label>
        {t('presetName')}
        <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        {t('translationInstruction')}
        <textarea
          required
          rows={5}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      <label>
        {t('presetDescription')}
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className={styles.editorActions}>
        <Button size="m" variant="outlined" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button size="m" type="submit" disabled={!canSave}>
          {t('savePreset')}
        </Button>
      </div>
    </form>
  )
}
