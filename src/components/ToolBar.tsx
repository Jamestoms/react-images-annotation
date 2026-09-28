import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ToolMode } from '../constants'

interface ToolBarProps {
  mode: ToolMode
  zoomPercent: number
  canUndo: boolean
  canRedo: boolean
  hasSelected: boolean
  hasImage: boolean
  hasAnnotations: boolean
  /** 是否开启导出功能（显示下载按钮） */
  downloadable: boolean
  onSetMode: (mode: ToolMode) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onClear: () => void
  onDownload: () => void
  /** 宿主自定义操作区（如保存/提交按钮），渲染在工具栏最右侧 */
  actions?: ReactNode
}

export default function ToolBar({
  mode,
  zoomPercent,
  canUndo,
  canRedo,
  hasSelected,
  hasImage,
  hasAnnotations,
  downloadable,
  onSetMode,
  onZoomIn,
  onZoomOut,
  onFit,
  onUndo,
  onRedo,
  onDelete,
  onClear,
  onDownload,
  actions,
}: ToolBarProps) {
  // 清空二次确认：首次点击进入确认态（按钮变红），3 秒内再次点击执行，超时自动还原
  const [confirmingClear, setConfirmingClear] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleClearClick() {
    if (confirmingClear) {
      setConfirmingClear(false)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      onClear()
    } else {
      setConfirmingClear(true)
      clearTimerRef.current = setTimeout(() => {
        setConfirmingClear(false)
      }, 3000)
    }
  }

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  return (
    <div className="ic-toolbar">
      {/* 绘制工具 */}
      <div className="ic-toolbar-group">
        <div className="ic-tip">
          <button
            type="button"
            className={`ic-btn ic-btn--icon${mode === 'pan' ? ' is-active' : ''}`}
            onClick={() => onSetMode('pan')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M5 2 5 18 9.5 14.5 12 20.5 14.5 19.5 12 13.5 18 13 Z" fill="currentColor" />
            </svg>
          </button>
          <span className="ic-tip__bubble">选择 / 平移（空白拖动平移，滚轮缩放）</span>
        </div>
        <div className="ic-tip">
          <button
            type="button"
            className={`ic-btn ic-btn--icon${mode === 'rect' ? ' is-active' : ''}`}
            onClick={() => onSetMode('rect')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <rect x="3" y="6" width="18" height="12" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <span className="ic-tip__bubble">矩形标注（按住拖拽绘制）</span>
        </div>
        <div className="ic-tip">
          <button
            type="button"
            className={`ic-btn ic-btn--icon${mode === 'circle' ? ' is-active' : ''}`}
            onClick={() => onSetMode('circle')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <span className="ic-tip__bubble">圆形标注（按住拖拽绘制）</span>
        </div>
        <div className="ic-tip">
          <button
            type="button"
            className={`ic-btn ic-btn--icon${mode === 'polygon' ? ' is-active' : ''}`}
            onClick={() => onSetMode('polygon')}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <polygon points="12,3.5 21,18 3,18" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <span className="ic-tip__bubble">多边形标注（逐点点击，双击或回车结束，ESC 取消）</span>
        </div>
      </div>

      <span className="ic-toolbar-sep" />

      {/* 视图控制 */}
      <div className="ic-toolbar-group">
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" onClick={onZoomOut}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="ic-tip__bubble">缩小</span>
        </div>
        <span className="ic-zoom-text">{zoomPercent}%</span>
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" onClick={onZoomIn}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="ic-tip__bubble">放大</span>
        </div>
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" onClick={onFit}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="ic-tip__bubble">适应视野</span>
        </div>
      </div>

      <span className="ic-toolbar-sep" />

      {/* 撤销 / 重做 */}
      <div className="ic-toolbar-group">
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" disabled={!canUndo} onClick={onUndo}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M8 4 3.5 8.5 8 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.5 8.5H14a6 6 0 0 1 0 12h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="ic-tip__bubble">撤销（Ctrl+Z）</span>
        </div>
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" disabled={!canRedo} onClick={onRedo}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M16 4l4.5 4.5L16 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20.5 8.5H10a6 6 0 0 0 0 12h3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="ic-tip__bubble">反撤销（Ctrl+Shift+Z / Ctrl+Y）</span>
        </div>
      </div>

      <span className="ic-toolbar-sep" />

      {/* 删除 / 清空 */}
      <div className="ic-toolbar-group">
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" disabled={!hasSelected} onClick={onDelete}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 14h9l1-14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M10.5 10.5v6M13.5 10.5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <span className="ic-tip__bubble">删除选中标注（Delete）</span>
        </div>
        <div className="ic-tip">
          <button
            type="button"
            className={`ic-btn ic-btn--icon${confirmingClear ? ' is-danger' : ''}`}
            disabled={!hasAnnotations}
            title={confirmingClear ? '' : '清空当前图片标注'}
            onClick={handleClearClick}
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M4.5 6.5h15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path
                d="M9.5 6.5v-2h5v2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M6.5 6.5l1 14h9l1-14z" fill="currentColor" />
            </svg>
            {confirmingClear && <span className="ic-btn__text">确认清空？</span>}
          </button>
          <span className={`ic-tip__bubble${confirmingClear ? ' is-hidden' : ''}`}>清空当前图片标注</span>
        </div>
      </div>

      <div className="ic-toolbar-spacer" />

      {downloadable && (
        <div className="ic-tip">
          <button type="button" className="ic-btn ic-btn--icon" disabled={!hasImage} onClick={onDownload}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M12 3v10M7 8.5l5 5 5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 17v3h16v-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="ic-tip__bubble">下载标注后的图片（PNG，原始像素）</span>
        </div>
      )}

      {/* 宿主自定义操作区（如保存/提交按钮），渲染在工具栏最右侧 */}
      {actions}
    </div>
  )
}
