import clsx from 'clsx'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss, type Align } from './anchored.js'
import { IconCheckOutline16, IconChevronDownOutline14 } from './icons.js'
import styles from './Select.module.css'

export type SelectOption<T extends string> = {
  value: T
  label: string
  triggerLabel?: string
  description?: string
  lang?: string
}

/** 选择时焦点留在触发器，方向键预览，Enter 确认，Esc 取消。 */
export const Select = <T extends string>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  caption,
  className,
  disabled = false,
  icon,
  align = 'end',
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  ariaLabel: string
  caption?: string
  className?: string
  disabled?: boolean
  icon?: ReactNode
  align?: Align
}) => {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const search = useRef({ text: '', time: 0 })
  const menuId = useId()
  const valueId = useId()
  const currentIndex = options.findIndex((option) => option.value === value)
  const current = options[currentIndex]
  const expanded = open && !disabled
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(expanded, { align, maxHeight: 340, offset: 6 })
  useDismiss(expanded, [anchorRef, floatingRef], () => setOpen(false), { captureEscape: true })
  useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])
  useLayoutEffect(() => {
    if (expanded && position) {
      document.getElementById(`${menuId}-${highlight}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [expanded, highlight, menuId, position])

  const show = () => {
    setHighlight(Math.max(0, currentIndex))
    setOpen(true)
  }
  const choose = (option: SelectOption<T>) => {
    onChange(option.value)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.altKey || event.ctrlKey || event.metaKey || !options.length) {
      return
    }
    const index = expanded ? highlight : currentIndex
    let next = index
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (expanded && options[index]) {
          choose(options[index])
        } else {
          show()
        }
        return
      case 'ArrowDown':
        next = expanded ? Math.min(index + 1, options.length - 1) : Math.max(0, index)
        break
      case 'ArrowUp':
        next = expanded ? Math.max(index - 1, 0) : index < 0 ? options.length - 1 : index
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = options.length - 1
        break
      default: {
        if (event.key.length !== 1) {
          return
        }
        const now = Date.now()
        const prefix =
          (now - search.current.time < 600 ? search.current.text : '') +
          event.key.toLocaleLowerCase()
        search.current = { text: prefix, time: now }
        next = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(prefix))
        if (next < 0) {
          return
        }
      }
    }
    event.preventDefault()
    setOpen(true)
    setHighlight(next)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        role="combobox"
        className={clsx(styles.trigger, className)}
        aria-label={ariaLabel}
        aria-describedby={valueId}
        aria-controls={expanded ? menuId : undefined}
        aria-expanded={expanded}
        aria-activedescendant={expanded ? `${menuId}-${highlight}` : undefined}
        disabled={disabled}
        onClick={() => (expanded ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        {icon ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className={styles.text}>
          {caption ? <span className={styles.caption}>{caption}</span> : null}
          <span
            id={valueId}
            className={clsx(styles.value, !current && styles.placeholder)}
            lang={current?.lang}
          >
            {current?.triggerLabel ?? current?.label ?? placeholder}
          </span>
        </span>
        <span className={styles.arrow} aria-hidden="true">
          <IconChevronDownOutline14 />
        </span>
      </button>
      {expanded
        ? createPortal(
            <div
              ref={floatingRef}
              id={menuId}
              className={styles.menu}
              style={position ?? { visibility: 'hidden' }}
              role="listbox"
              aria-label={ariaLabel}
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${menuId}-${index}`}
                  role="option"
                  lang={option.lang}
                  aria-selected={option.value === value}
                  className={clsx(styles.option, highlight === index && styles.highlight)}
                  onClick={() => choose(option)}
                >
                  <span>
                    {option.label}
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {option.value === value ? <IconCheckOutline16 /> : null}
                </div>
              ))}
            </div>,
            anchorRef.current?.closest('[role="dialog"]') ?? document.body
          )
        : null}
    </>
  )
}
