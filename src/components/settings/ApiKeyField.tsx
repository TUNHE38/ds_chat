import { useId, useState } from 'react'
import { IconEditOutline16 } from '../base/icons.js'
import { useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './Settings.module.css'

export const useApiKeyEditor = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return { apiKey, editing, setEditing, form }
}

export const ApiKeyField = ({ editor }: { editor: ReturnType<typeof useApiKeyEditor> }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const inputId = useId()
  const { apiKey, editing, setEditing, form } = editor
  return (
    <div className={styles.apiKey}>
      <label className={styles.label} htmlFor={inputId}>
        {t('apiKeyLabel')}
      </label>
      {apiKey && !editing ? (
        <div className={styles.apiKeySaved}>
          <span className={styles.apiKeyMask}>•••• •••• ••••</span>
          <IconButton
            tone="primary"
            icon={<IconEditOutline16 />}
            tooltip={t('apiKeyEdit')}
            onClick={() => setEditing(true)}
          />
        </div>
      ) : (
        <form
          className={styles.apiKeyInput}
          onSubmit={(event) => {
            event.preventDefault()
            void form.submit()
          }}
        >
          <input
            id={inputId}
            type="password"
            placeholder={t('apiKeyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            autoFocus={!isMobile || editing}
            value={form.value}
            aria-describedby={`${inputId}-hint`}
            aria-invalid={!!form.error}
            onChange={(event) => form.setValue(event.target.value)}
            onBlur={() => {
              if (apiKey && !form.value.trim()) {
                setEditing(false)
              }
            }}
          />
          <Button type="submit" size="m" disabled={form.verifying || !form.value.trim()}>
            {t(form.verifying ? 'apiKeyVerifying' : 'confirm')}
          </Button>
        </form>
      )}
      <div id={`${inputId}-hint`} className={styles.description}>
        {t('apiKeyLocal')}
      </div>
      {(!apiKey || editing) && form.error ? (
        <div className={styles.error} role="alert">
          {form.error}
        </div>
      ) : null}
    </div>
  )
}
