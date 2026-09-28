import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { CSSProperties, ReactNode } from 'react'
import ToolBar from './components/ToolBar'
import ThumbnailList from './components/ThumbnailList'
import LabelPopover from './components/LabelPopover'
import { CanvasEngine } from './engine/CanvasEngine'
import type { AllAnnotations, AnnotationData, ImageItem } from './types'
import { clamp } from './utils'

export interface ImageCaptionProps {
  /** 图片列表（项内含已有标注则回显） */
  images?: ImageItem[]
  /** 预设标签列表，标签输入时可选择 */
  labels?: string[]
  /** 是否开启下载功能（工具栏显示下载按钮，导出含标注的图片） */
  downloadable?: boolean
  /** 标注数据发生变化（新增/删除/移动/标签修改/撤销/重做/清空） */
  onChange?: (imageId: string, annotations: AnnotationData[]) => void
  /** 点击下载按钮导出成功后触发（需开启 downloadable） */
  onDownload?: (imageId: string, filename: string) => void
  /** 自定义操作区，渲染在工具栏最右侧，适合放置保存/提交/下一步等宿主业务按钮 */
  actions?: ReactNode
  className?: string
  style?: CSSProperties
}

/** 通过 ref 调用的组件方法（与 Vue3 版 defineExpose 对齐） */
export interface ImageCaptionRef {
  /** 获取标注数据（不传 imageId 为当前图片） */
  getAnnotations(imageId?: string): AnnotationData[]
  /** 获取全部图片标注数据 */
  getAllAnnotations(): AllAnnotations
  /** 撤销 */
  undo(): void
  /** 反撤销 */
  redo(): void
  /** 删除当前选中标注 */
  deleteSelected(): void
  /** 清空当前图片标注 */
  clearCurrent(): void
  /** 放大 */
  zoomIn(): void
  /** 缩小 */
  zoomOut(): void
  /** 适应视野 */
  fitView(): void
  /** 导出当前图片（含标注）的 PNG dataURL（原始像素尺寸） */
  exportImage(): string | null
  /** 切换图片 */
  switchImage(id: string): void
  /** 当前图片 id（无图时为空字符串） */
  readonly currentImageId: string
}

/** 保存最新值的 ref（长生命周期闭包中安全访问每次渲染的新值） */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

const POPOVER_WIDTH = 268
const POPOVER_HEIGHT = 132

const ImageCaption = forwardRef<ImageCaptionRef, ImageCaptionProps>(function ImageCaption(
  props,
  ref
) {
  const {
    images = [],
    labels = [],
    downloadable = false,
    onChange,
    onDownload,
    actions,
    className,
    style,
  } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  /** 标签输入浮层状态 */
  const [popover, setPopover] = useState({
    visible: false,
    mode: 'create' as 'create' | 'edit',
    label: '',
    x: 0,
    y: 0,
  })
  const popoverRef = useLatest(popover)

  /** 轻量提示条（替代全局 Message，避免 UI 框架依赖） */
  const [toast, setToast] = useState({
    visible: false,
    text: '',
    type: 'success' as 'success' | 'error',
  })
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // 最新 props（供 engine 回调、键盘监听等长生命周期闭包读取）
  const onChangeRef = useLatest(onChange)
  const onDownloadRef = useLatest(onDownload)
  const imagesRef = useLatest(images)

  function openPopover(mode: 'create' | 'edit', label: string, screen: { x: number; y: number }) {
    const wrap = wrapRef.current
    const w = wrap ? wrap.clientWidth : 0
    const h = wrap ? wrap.clientHeight : 0
    setPopover({
      visible: true,
      mode,
      label,
      // 优先显示在标注上方
      x: clamp(screen.x - POPOVER_WIDTH / 2, 8, Math.max(w - POPOVER_WIDTH - 8, 8)),
      y: clamp(screen.y - POPOVER_HEIGHT - 24, 8, Math.max(h - POPOVER_HEIGHT - 8, 8)),
    })
  }

  function closePopover() {
    setPopover((p) => (p.visible ? { ...p, visible: false } : p))
  }

  // 引擎单例（仅创建一次，状态通过 useSyncExternalStore 订阅）
  const engineRef = useRef<CanvasEngine | null>(null)
  if (!engineRef.current) {
    engineRef.current = new CanvasEngine({
      onChange(imageId, list) {
        onChangeRef.current?.(imageId, list)
      },
      onSelect(id, label) {
        if (id) {
          const screen = engineRef.current?.getSelectedScreenPoint()
          if (screen) openPopover('edit', label, screen)
        } else {
          closePopover()
        }
      },
      onPendingDrawn({ screen }) {
        openPopover('create', '', screen)
      },
      onPendingCancelled() {
        if (popoverRef.current.mode === 'create') closePopover()
      },
    })
  }
  const engine = engineRef.current
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)

  // ---------- 浮层 ----------

  function handlePopoverConfirm() {
    const label = popover.label.trim()
    if (!label) return // 空标签校验与提示由浮层内部完成，此处兜底
    if (popover.mode === 'create') {
      engine.confirmPending(label)
    } else {
      engine.updateSelectedLabel(label)
    }
    closePopover()
  }

  function handlePopoverCancel() {
    if (popoverRef.current.mode === 'create') {
      engine.cancelPending()
    }
    closePopover()
  }

  function handlePopoverDelete() {
    engine.deleteSelected()
    closePopover()
  }

  // ---------- 工具栏 ----------

  function handleClear() {
    // 二次确认由工具栏按钮的确认态交互完成，此处直接执行
    engine.clearCurrent()
  }

  // ---------- 图片下载 ----------

  function showToast(text: string, type: 'success' | 'error') {
    setToast({ visible: true, text, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }))
    }, 2600)
  }

  function handleDownload() {
    const imageId = engine.state.currentImageId
    if (!imageId) return
    const dataUrl = engine.exportImage()
    if (!dataUrl) {
      showToast('导出失败，请重试', 'error')
      return
    }
    // 文件名：图片名（去扩展名）-annotated.png，无名时用图片 id
    const item = imagesRef.current.find((i) => i.id === imageId)
    const base = (item?.name || imageId).replace(/\.[^.]+$/, '')
    const filename = `${base}-annotated.png`

    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    onDownloadRef.current?.(imageId, filename)
    showToast(`已导出：${filename}`, 'success')
  }

  // ---------- 图片 ----------

  function handleSelectImage(id: string) {
    const img = imagesRef.current.find((i) => i.id === id)
    if (img) {
      closePopover()
      engine.loadImage(img)
    }
  }

  // images 引用变化时同步（与 Vue3 版 watch(() => props.images) 行为一致）
  const prevImagesRef = useRef(images)
  useEffect(() => {
    if (prevImagesRef.current === images) return
    prevImagesRef.current = images
    engine.preloadAnnotations(images)
    if (!images.some((i) => i.id === engine.state.currentImageId)) {
      closePopover()
      if (images.length) engine.loadImage(images[0])
    }
  }, [images, engine])

  // ---------- 生命周期 ----------

  useEffect(() => {
    if (canvasRef.current && wrapRef.current) {
      engine.init(canvasRef.current, wrapRef.current)
    }
    const list = imagesRef.current
    if (list.length) {
      engine.preloadAnnotations(list)
      engine.loadImage(list[0])
    }

    function onKeydown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const inInput =
        !!t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          (t as unknown as { isContentEditable?: boolean }).isContentEditable)
      if (inInput) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) engine.redo()
        else engine.undo()
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        engine.redo()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (engine.state.selectedId) {
          e.preventDefault()
          engine.deleteSelected()
        }
      } else if (e.key === 'Escape') {
        if (popoverRef.current.visible) handlePopoverCancel()
        else engine.handleEscape()
      } else if (e.key === 'Enter') {
        engine.handleEnter()
      }
    }

    window.addEventListener('keydown', onKeydown)

    return () => {
      window.removeEventListener('keydown', onKeydown)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      engine.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // ---------- 对外方法（ref 调用） ----------

  useImperativeHandle(
    ref,
    () => ({
      getAnnotations: (imageId?: string) => engine.getAnnotations(imageId),
      getAllAnnotations: () => engine.getAllAnnotations(),
      undo: () => engine.undo(),
      redo: () => engine.redo(),
      deleteSelected: () => engine.deleteSelected(),
      clearCurrent: () => engine.clearCurrent(),
      zoomIn: () => engine.zoomIn(),
      zoomOut: () => engine.zoomOut(),
      fitView: () => engine.fitView(),
      exportImage: () => engine.exportImage(),
      switchImage: (id: string) => handleSelectImage(id),
      get currentImageId() {
        return engine.state.currentImageId
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine]
  )

  const rootClass = className ? `ic-container ${className}` : 'ic-container'

  return (
    <div className={rootClass} style={style}>
      <ThumbnailList
        images={images}
        currentId={state.currentImageId}
        counts={state.annotationCounts}
        onSelect={handleSelectImage}
      />
      <div className="ic-main">
        <ToolBar
          mode={state.mode}
          zoomPercent={state.zoomPercent}
          canUndo={state.canUndo}
          canRedo={state.canRedo}
          hasSelected={!!state.selectedId}
          hasImage={!!state.currentImageId}
          hasAnnotations={(state.annotationCounts[state.currentImageId] || 0) > 0}
          downloadable={downloadable}
          onSetMode={(m) => engine.setMode(m)}
          onZoomIn={() => engine.zoomIn()}
          onZoomOut={() => engine.zoomOut()}
          onFit={() => engine.fitView()}
          onUndo={() => engine.undo()}
          onRedo={() => engine.redo()}
          onDelete={() => engine.deleteSelected()}
          onClear={handleClear}
          onDownload={handleDownload}
          actions={actions}
        />
        <div ref={wrapRef} className="ic-canvas-wrap">
          <canvas ref={canvasRef} className="ic-canvas" />
          <LabelPopover
            visible={popover.visible}
            mode={popover.mode}
            labels={labels}
            value={popover.label}
            x={popover.x}
            y={popover.y}
            onChange={(v) => setPopover((p) => ({ ...p, label: v }))}
            onConfirm={handlePopoverConfirm}
            onCancel={handlePopoverCancel}
            onDelete={handlePopoverDelete}
          />
          {state.imageError ? (
            <div className="ic-empty">{state.imageError}</div>
          ) : !images.length ? (
            <div className="ic-empty">暂无图片</div>
          ) : !state.imageLoaded ? (
            <div className="ic-empty">图片加载中…</div>
          ) : null}
        </div>
        {toast.visible && <div className={`ic-toast is-${toast.type}`}>{toast.text}</div>}
      </div>
    </div>
  )
})

export default ImageCaption
