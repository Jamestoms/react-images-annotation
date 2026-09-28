import { useMemo, useState } from 'react'

/**
 * 自绘标签选择下拉：可自由输入，也可从预设列表中选择（支持过滤与键盘导航）
 * 替代 UI 组件库的 Select（allow-create + filterable 场景），零 UI 框架依赖
 */

interface LabelSelectProps {
  value: string
  options: string[]
  placeholder?: string
  onChange: (value: string) => void
  /** 选中预设项或按回车确认输入值 */
  onConfirm: () => void
}

export default function LabelSelect({
  value,
  options,
  placeholder,
  onChange,
  onConfirm,
}: LabelSelectProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const filtered = useMemo(() => {
    const kw = value.trim().toLowerCase()
    if (!kw) return options
    return options.filter((o) => o.toLowerCase().includes(kw))
  }, [value, options])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setOpen(true)
    setHighlight(0)
  }

  function select(val: string) {
    onChange(val)
    setOpen(false)
    onConfirm()
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      if (filtered.length) {
        setHighlight((h) => (h + 1) % filtered.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length) {
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered.length) {
        select(filtered[highlight])
      } else {
        setOpen(false)
        onConfirm()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="ic-select">
      <input
        className="ic-select__input"
        type="text"
        autoComplete="off"
        value={value}
        placeholder={placeholder || '输入或选择'}
        onInput={handleInput}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeydown}
      />
      {open && filtered.length > 0 && (
        <div className="ic-select__dropdown">
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`ic-select__option${i === highlight ? ' is-active' : ''}`}
              onMouseDown={(e) => {
                // 阻止 mousedown 默认行为（input blur），保证点击选项时下拉不先关闭
                e.preventDefault()
                select(opt)
              }}
              onMouseMove={() => setHighlight(i)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
