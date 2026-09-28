import { useEffect, useRef, useState } from 'react'
import LabelSelect from './LabelSelect'

interface LabelPopoverProps {
  visible: boolean
  /** create：新绘制标注输入标签；edit：编辑选中标注 */
  mode: 'create' | 'edit'
  labels: string[]
  value: string
  x: number
  y: number
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
}

export default function LabelPopover({
  visible,
  mode,
  labels,
  value,
  x,
  y,
  onChange,
  onConfirm,
  onCancel,
  onDelete,
}: LabelPopoverProps) {
  // 浮层根元素（通过 DOM 方式聚焦内部输入框，避免组件实例类型泄漏到 .d.ts）
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')

  // 打开时清空错误提示并聚焦输入框（useEffect 在 DOM 提交后运行，等效 nextTick）
  useEffect(() => {
    if (visible) {
      setError('')
      rootRef.current?.querySelector('input')?.focus()
    }
  }, [visible])

  // 输入变化时清空错误提示
  useEffect(() => {
    setError('')
  }, [value])

  function confirm() {
    if (!value.trim()) {
      setError('请输入或选择标签名称')
      rootRef.current?.querySelector('input')?.focus()
      return
    }
    onConfirm()
  }

  if (!visible) return null

  return (
    <div ref={rootRef} className="ic-label-popover" style={{ left: `${x}px`, top: `${y}px` }}>
      <div className="ic-label-popover-title">
        {mode === 'create' ? '新标注' : '编辑标注'}
      </div>
      <LabelSelect
        value={value}
        options={labels}
        placeholder="输入或选择标签名称"
        onChange={onChange}
        onConfirm={confirm}
      />
      {error ? <div className="ic-label-popover-error">{error}</div> : null}
      <div className="ic-label-popover-actions">
        {mode === 'edit' && (
          <button type="button" className="ic-btn ic-btn--danger-plain" onClick={onDelete}>
            删除
          </button>
        )}
        <span className="ic-label-popover-spacer" />
        <button type="button" className="ic-btn" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="ic-btn ic-btn--primary" onClick={confirm}>
          确定
        </button>
      </div>
    </div>
  )
}
