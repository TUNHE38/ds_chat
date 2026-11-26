import clsx from 'clsx'
import { useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: HTMLElement[] = []

/** 遮罩 + 居中卡片，Esc / 点遮罩关闭 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  className,
  mainClassName,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [opener] = useState(() => document.activeElement)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    openModals.push(dialog)
    if (!dialog.contains(document.activeElement)) {
      dialog.focus({ preventScroll: true })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (openModals.at(-1) !== dialog) {
        return
      }
      if (event.key === 'Escape') {
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:enabled, input:enabled, textarea:enabled, select:enabled, a[href], [tabindex]'
          )
        ).filter((item) => item.tabIndex >= 0 && item.getClientRects().length)
        const first = focusable[0] ?? dialog
        const last = focusable.at(-1) ?? dialog
        const outside =
          !dialog.contains(document.activeElement) || document.activeElement === dialog
        if (outside || document.activeElement === (event.shiftKey ? first : last)) {
          event.preventDefault()
          const target = event.shiftKey ? last : first
          target.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      openModals.splice(openModals.indexOf(dialog), 1)
      document.removeEventListener('keydown', onKeyDown)
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [opener])

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(styles.content, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={onClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
