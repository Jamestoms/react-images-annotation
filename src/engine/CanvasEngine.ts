import { Canvas, Rect, Ellipse, Polygon, Polyline, Line, FabricImage, Point, util } from 'fabric'
import type { FabricObject, Text as FabricText } from 'fabric'
import type { AllAnnotations, AnnotationData, ImageItem, Point as IPT } from '../types'
import type { ToolMode } from '../constants'
import {
  MIN_ZOOM,
  MAX_ZOOM,
  WHEEL_ZOOM_FACTOR,
  FIT_PADDING,
  MIN_SHAPE_SIZE,
  POLYGON_MIN_POINTS,
  POLYGON_CLOSE_DISTANCE,
  POLYGON_DEDUPE_DISTANCE,
  POLYGON_VERTEX_RADIUS,
  BUTTON_ZOOM_RATIO,
} from '../constants'
import { clamp, deepClone, dist, genId } from '../utils'
import { createHistory } from './history'
import {
  createShapeFromData,
  createLabelText,
  getAnnotationId,
  isAnnotationShape,
  setLabelText,
  shapeToData,
  syncLabelText,
  annotationShapeProps,
} from '../shapeFactory'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface EngineOptions {
  /** 标注数据发生变化（新增/删除/移动/标签修改/撤销/重做/清空） */
  onChange?: (imageId: string, annotations: AnnotationData[]) => void
  /** 选中标注变化 */
  onSelect?: (annotationId: string | null, label: string) => void
  /** 图形绘制完成，等待输入标签（screen 为画布容器内的屏幕坐标） */
  onPendingDrawn?: (payload: { id: string; screen: { x: number; y: number } }) => void
  /** 待确认标签的图形被取消（切换工具/切图/ESC） */
  onPendingCancelled?: () => void
}

/**
 * 引擎对外快照状态（不可变对象，每次变更整体替换）
 * React 组件层通过 useSyncExternalStore(subscribe, getSnapshot) 订阅
 */
export interface EngineState {
  mode: ToolMode
  currentImageId: string
  imageLoaded: boolean
  imageError: string
  selectedId: string | null
  zoomPercent: number
  annotationCounts: Record<string, number>
  canUndo: boolean
  canRedo: boolean
}

/**
 * fabric 画布引擎：视图（缩放/平移/fit/自适应）、三种图形绘制、
 * 选中/拖动/删除、标签、撤销重做、数据序列化与回显。
 *
 * 纯 class 实现（不依赖任何框架），状态以不可变快照对外发布。
 *
 * 坐标约定：所有标注对象均在图片原始像素坐标系，缩放平移仅通过
 * viewportTransform 实现，保证任何缩放状态下坐标不会错位。
 */
export class CanvasEngine {
  /** 对外快照（每次变更替换新对象） */
  private _state: EngineState = {
    mode: 'pan',
    currentImageId: '',
    imageLoaded: false,
    imageError: '',
    selectedId: null,
    zoomPercent: 100,
    annotationCounts: {},
    canUndo: false,
    canRedo: false,
  }

  private listeners = new Set<() => void>()

  private options: EngineOptions

  private history = createHistory((flags) => this.setState(flags))

  private canvas: Canvas | null = null
  private canvasWrap: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private bgImage: FabricObject | null = null
  private imgW = 0
  private imgH = 0

  /** annotationId -> { shape 图形, label 标签文本 } */
  private shapeMap = new Map<string, { shape: FabricObject; label: FabricText }>()
  /** imageId -> 标注数据（组件内部权威数据源） */
  private annotationsByImage = new Map<string, AnnotationData[]>()

  // ---------- 交互中间状态 ----------

  private panning = false
  private panLast = { x: 0, y: 0 }
  private drawing = false
  private drawStart: IPT = { x: 0, y: 0 }
  /** 矩形/圆/多边形绘制完成、等待标签确认的图形 */
  private pendingShape: FabricObject | null = null
  private polygonPts: IPT[] = []
  private tempPolyline: Polyline | null = null
  private tempGuideLine: Line | null = null
  private tempDots: Ellipse[] = []
  private loadToken = 0

  constructor(options: EngineOptions = {}) {
    this.options = options
  }

  // ---------- 状态订阅（useSyncExternalStore 协议） ----------

  /** 订阅状态变化，返回取消订阅函数 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 获取当前状态快照（未变更时返回相同引用） */
  getSnapshot = (): EngineState => this._state

  /** 只读状态访问器 */
  get state(): EngineState {
    return this._state
  }

  private setState(patch: Partial<EngineState>) {
    this._state = { ...this._state, ...patch }
    this.listeners.forEach((l) => l())
  }

  // ---------- 工具函数 ----------

  private getZoom(): number {
    return this.canvas ? this.canvas.getZoom() : 1
  }

  private clampToImage(p: IPT): IPT {
    if (!this.imgW || !this.imgH) return p
    return { x: clamp(p.x, 0, this.imgW), y: clamp(p.y, 0, this.imgH) }
  }

  private updateCounts(imageId: string, count: number) {
    this.setState({
      annotationCounts: { ...this._state.annotationCounts, [imageId]: count },
    })
  }

  /** 缩放变化后同步标签字号/位置与多边形顶点视觉大小（保持视觉恒定） */
  private afterZoomChanged() {
    if (!this.canvas) return
    this.setState({ zoomPercent: Math.round(this.canvas.getZoom() * 100) })
    const zoom = this.canvas.getZoom()
    this.shapeMap.forEach(({ shape, label }) => syncLabelText(label, shape, zoom))
    this.tempDots.forEach((d) => d.set({ radius: POLYGON_VERTEX_RADIUS / zoom }))
    this.canvas.requestRenderAll()
  }

  // ---------- 数据同步 ----------

  private serializeFromCanvas(): AnnotationData[] {
    const list: AnnotationData[] = []
    this.shapeMap.forEach(({ shape }) => {
      const d = shapeToData(shape)
      if (d) list.push(d)
    })
    return list
  }

  /** 提交一次变更：以画布为数据源入历史栈并通知外部 */
  private commit() {
    const imageId = this._state.currentImageId
    if (!imageId || !this.canvas) return
    const list = this.serializeFromCanvas()
    this.annotationsByImage.set(imageId, list)
    this.updateCounts(imageId, list.length)
    this.history.commit(imageId, list)
    this.options.onChange?.(imageId, deepClone(list))
  }

  /** 用快照重建画布标注对象（撤销/重做/清空） */
  private applySnapshot(imageId: string, list: AnnotationData[]) {
    if (!this.canvas) return
    this.annotationsByImage.set(imageId, list)
    this.updateCounts(imageId, list.length)
    if (imageId === this._state.currentImageId) {
      this.rebuildShapes(list)
      if (this._state.selectedId && !this.shapeMap.has(this._state.selectedId)) {
        this.canvas.discardActiveObject()
        this.setState({ selectedId: null })
        this.options.onSelect?.(null, '')
      }
    }
    this.options.onChange?.(imageId, deepClone(list))
  }

  private rebuildShapes(list: AnnotationData[]) {
    if (!this.canvas) return
    this.shapeMap.forEach(({ shape, label }) => {
      this.canvas!.remove(shape)
      this.canvas!.remove(label)
    })
    this.shapeMap.clear()
    const zoom = this.canvas.getZoom() || 1
    list.forEach((data) => {
      const shape = createShapeFromData(data)
      if (!shape) return
      this.canvas!.add(shape)
      const label = createLabelText(shape, data.label, zoom)
      this.canvas!.add(label)
      this.shapeMap.set(data.id, { shape, label })
    })
    this.canvas.requestRenderAll()
  }

  // ---------- 视图：缩放 / 平移 / fit ----------

  private zoomAt(viewportPoint: { x: number; y: number }, factor: number) {
    if (!this.canvas) return
    const zoom = clamp(this.getZoom() * factor, MIN_ZOOM, MAX_ZOOM)
    this.canvas.zoomToPoint(new Point(viewportPoint.x, viewportPoint.y), zoom)
    this.afterZoomChanged()
  }

  private zoomByCenter(ratio: number) {
    if (!this.canvas) return
    this.zoomAt({ x: this.canvas.getWidth() / 2, y: this.canvas.getHeight() / 2 }, ratio)
  }

  zoomIn() {
    this.zoomByCenter(BUTTON_ZOOM_RATIO)
  }

  zoomOut() {
    this.zoomByCenter(1 / BUTTON_ZOOM_RATIO)
  }

  fitView() {
    if (!this.canvas || !this.imgW || !this.imgH) return
    const vw = this.canvas.getWidth()
    const vh = this.canvas.getHeight()
    if (!vw || !vh) return
    const zoom = clamp(
      Math.min((vw - FIT_PADDING * 2) / this.imgW, (vh - FIT_PADDING * 2) / this.imgH),
      MIN_ZOOM,
      MAX_ZOOM
    )
    this.canvas.setViewportTransform([
      zoom,
      0,
      0,
      zoom,
      (vw - this.imgW * zoom) / 2,
      (vh - this.imgH * zoom) / 2,
    ])
    this.afterZoomChanged()
  }

  // ---------- 模式切换 ----------

  setMode(m: ToolMode) {
    if (!this.canvas) {
      this.setState({ mode: m })
      return
    }
    if (this._state.mode !== m || this.pendingShape || this.polygonPts.length) {
      this.cancelDrawState()
    }
    this.setState({ mode: m })
    this.canvas.skipTargetFind = m !== 'pan'
    this.canvas.defaultCursor = m === 'pan' ? 'grab' : 'crosshair'
    if (m !== 'pan') {
      this.canvas.discardActiveObject()
      this.canvas.requestRenderAll()
      if (this._state.selectedId) {
        this.setState({ selectedId: null })
        this.options.onSelect?.(null, '')
      }
    }
  }

  /** 取消进行中的绘制（未确认标签的图形、多边形临时元素） */
  private cancelDrawState() {
    if (this.pendingShape) {
      this.canvas?.remove(this.pendingShape)
      this.pendingShape = null
      this.options.onPendingCancelled?.()
    }
    this.cleanupPolygonTemp()
    this.polygonPts = []
    this.drawing = false
  }

  // ---------- 矩形 / 椭圆 拖拽绘制 ----------

  private startRectEllipseDraw(p: IPT) {
    if (!this.canvas) return
    const common = annotationShapeProps()
    const extra = { selectable: false, evented: false, strokeUniform: true }
    this.drawStart = p
    this.drawing = true
    if (this._state.mode === 'rect') {
      this.pendingShape = new Rect({ left: p.x, top: p.y, width: 1, height: 1, ...common, ...extra })
    } else {
      this.pendingShape = new Ellipse({ left: p.x, top: p.y, rx: 0.5, ry: 0.5, ...common, ...extra })
    }
    this.canvas.add(this.pendingShape)
    this.canvas.requestRenderAll()
  }

  private updateRectEllipseDraw(p: IPT) {
    if (!this.pendingShape) return
    const left = Math.min(this.drawStart.x, p.x)
    const top = Math.min(this.drawStart.y, p.y)
    if (this.pendingShape.type === 'rect') {
      this.pendingShape.set({
        left,
        top,
        width: Math.abs(p.x - this.drawStart.x),
        height: Math.abs(p.y - this.drawStart.y),
      })
    } else {
      this.pendingShape.set({
        left,
        top,
        rx: Math.max(Math.abs(p.x - this.drawStart.x) / 2, 0.5),
        ry: Math.max(Math.abs(p.y - this.drawStart.y) / 2, 0.5),
      })
    }
    this.canvas?.requestRenderAll()
  }

  private finishRectEllipseDraw() {
    if (!this.pendingShape) return
    this.drawing = false
    const zoom = this.getZoom()
    const w =
      this.pendingShape.type === 'rect'
        ? (this.pendingShape as any).width
        : (this.pendingShape as any).rx * 2
    const h =
      this.pendingShape.type === 'rect'
        ? (this.pendingShape as any).height
        : (this.pendingShape as any).ry * 2
    if (w * zoom < MIN_SHAPE_SIZE || h * zoom < MIN_SHAPE_SIZE) {
      // 尺寸过小视为误触，丢弃
      this.canvas?.remove(this.pendingShape)
      this.pendingShape = null
      this.canvas?.requestRenderAll()
      return
    }
    this.notifyPendingDrawn()
  }

  // ---------- 多边形逐点绘制 ----------

  private cleanupPolygonTemp() {
    if (!this.canvas) {
      this.tempPolyline = null
      this.tempGuideLine = null
      this.tempDots = []
      return
    }
    if (this.tempPolyline) this.canvas.remove(this.tempPolyline)
    if (this.tempGuideLine) this.canvas.remove(this.tempGuideLine)
    this.tempDots.forEach((d) => this.canvas!.remove(d))
    this.tempPolyline = null
    this.tempGuideLine = null
    this.tempDots = []
  }

  private rebuildTempPolyline() {
    if (!this.canvas || !this.polygonPts.length) return
    if (this.tempPolyline) this.canvas.remove(this.tempPolyline)
    this.tempPolyline = new Polyline(this.polygonPts.map((p) => ({ ...p })), {
      ...annotationShapeProps(),
      fill: 'rgba(64, 158, 255, 0.06)',
      strokeUniform: true,
      selectable: false,
      evented: false,
      strokeDashArray: [6 / this.getZoom(), 4 / this.getZoom()],
    })
    this.canvas.add(this.tempPolyline)
    this.canvas.requestRenderAll()
  }

  private addPolygonDot(p: IPT) {
    if (!this.canvas) return
    const dot = new Ellipse({
      left: p.x - POLYGON_VERTEX_RADIUS / this.getZoom(),
      top: p.y - POLYGON_VERTEX_RADIUS / this.getZoom(),
      rx: POLYGON_VERTEX_RADIUS / this.getZoom(),
      ry: POLYGON_VERTEX_RADIUS / this.getZoom(),
      fill: '#ffffff',
      stroke: '#409eff',
      strokeWidth: 2,
      strokeUniform: true,
      selectable: false,
      evented: false,
      objectCaching: false,
    })
    this.tempDots.push(dot)
    this.canvas.add(dot)
  }

  private showGuideLine(p: IPT) {
    if (!this.canvas || !this.polygonPts.length) return
    const last = this.polygonPts[this.polygonPts.length - 1]
    if (!this.tempGuideLine) {
      this.tempGuideLine = new Line([last.x, last.y, p.x, p.y], {
        stroke: '#409eff',
        strokeWidth: 1.5,
        strokeUniform: true,
        strokeDashArray: [4 / this.getZoom(), 3 / this.getZoom()],
        selectable: false,
        evented: false,
        objectCaching: false,
      })
      this.canvas.add(this.tempGuideLine)
    } else {
      ;(this.tempGuideLine as any).set({ x1: last.x, y1: last.y, x2: p.x, y2: p.y })
    }
    this.canvas.requestRenderAll()
  }

  private handlePolygonDown(p: IPT) {
    if (!this.canvas) return
    if (!this.polygonPts.length) {
      this.polygonPts = [p]
      this.addPolygonDot(p)
      this.rebuildTempPolyline()
      this.showGuideLine(p)
      return
    }
    const zoom = this.getZoom()
    if (
      this.polygonPts.length >= POLYGON_MIN_POINTS &&
      dist(p, this.polygonPts[0]) * zoom < POLYGON_CLOSE_DISTANCE
    ) {
      // 点击起始顶点附近：闭合完成
      this.finishPolygon()
      return
    }
    this.polygonPts.push(p)
    this.addPolygonDot(p)
    this.rebuildTempPolyline()
  }

  private finishPolygon() {
    if (!this.canvas) return
    const zoom = this.getZoom()
    const dedupe = POLYGON_DEDUPE_DISTANCE / zoom
    // 去除双击等产生的相邻重复顶点
    const pts: IPT[] = []
    this.polygonPts.forEach((p) => {
      if (!pts.length || dist(p, pts[pts.length - 1]) >= dedupe) pts.push({ ...p })
    })
    if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < dedupe) pts.pop()

    this.cleanupPolygonTemp()
    this.polygonPts = []

    if (pts.length < POLYGON_MIN_POINTS) {
      this.canvas.requestRenderAll()
      return
    }
    // 与 createShapeFromData 保持一致：以包围盒左上角为局部原点构造，
    // left/top 承载绝对坐标，保证序列化往返不错位
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    this.pendingShape = new Polygon(
      pts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      {
        ...annotationShapeProps(),
        left: minX,
        top: minY,
        selectable: false,
        evented: false,
      }
    )
    this.canvas.add(this.pendingShape)
    this.canvas.requestRenderAll()
    this.notifyPendingDrawn()
  }

  /** 通知组件层弹出标签输入浮层（附带标注中心点的屏幕坐标） */
  private notifyPendingDrawn() {
    if (!this.canvas || !this.pendingShape) return
    const id = genId()
    ;(this.pendingShape as any).annotationId = id
    ;(this.pendingShape as any).label = ''
    const center = this.pendingShape.getCenterPoint()
    const screen = util.transformPoint(center, this.canvas.viewportTransform)
    this.options.onPendingDrawn?.({ id, screen: { x: screen.x, y: screen.y } })
    this.canvas.requestRenderAll()
  }

  // ---------- 待确认标签的图形 ----------

  /** 标签确认：转正式标注并提交历史 */
  confirmPending(label: string): string | null {
    if (!this.canvas || !this.pendingShape) return null
    const shape = this.pendingShape
    this.pendingShape = null
    const id = getAnnotationId(shape as any) || genId()
    ;(shape as any).annotationId = id
    ;(shape as any).label = label
    shape.set({ selectable: true, evented: true })
    const text = createLabelText(shape, label, this.canvas.getZoom())
    this.canvas.add(text)
    this.shapeMap.set(id, { shape, label: text })
    this.commit()
    this.setMode('pan')
    this.canvas.setActiveObject(shape)
    this.canvas.requestRenderAll()
    return id
  }

  /** 标签取消：丢弃图形 */
  cancelPending() {
    if (this.pendingShape) {
      this.canvas?.remove(this.pendingShape)
      this.pendingShape = null
      this.canvas?.requestRenderAll()
    }
    this.options.onPendingCancelled?.()
    this.setMode('pan')
  }

  // ---------- 选中 / 拖动 / 删除 ----------

  private handleSelection() {
    if (!this.canvas) return
    const obj = this.canvas.getActiveObject()
    if (obj && isAnnotationShape(obj)) {
      const id = getAnnotationId(obj as any) || ''
      this.setState({ selectedId: id })
      this.options.onSelect?.(id, String((obj as any).label ?? ''))
    } else {
      this.handleSelectionClear()
    }
  }

  private handleSelectionClear() {
    if (this._state.selectedId) {
      this.setState({ selectedId: null })
      this.options.onSelect?.(null, '')
    }
  }

  private handleObjectMoving(e: any) {
    const obj: FabricObject = e.target
    if (!obj || !isAnnotationShape(obj)) return
    // 拖动时限制标注整体保持在图片范围内
    const w = (obj.width || 0) * (obj.scaleX || 1)
    const h = (obj.height || 0) * (obj.scaleY || 1)
    obj.set({
      left: clamp(obj.left ?? 0, 0, Math.max(this.imgW - w, 0)),
      top: clamp(obj.top ?? 0, 0, Math.max(this.imgH - h, 0)),
    })
    obj.setCoords()
    const entry = this.shapeMap.get(getAnnotationId(obj as any) || '')
    if (entry) syncLabelText(entry.label, obj, this.getZoom())
    this.canvas?.requestRenderAll()
  }

  /** 删除当前选中标注 */
  deleteSelected() {
    const id = this._state.selectedId
    if (!id || !this.canvas) return
    const entry = this.shapeMap.get(id)
    if (entry) {
      this.canvas.remove(entry.shape)
      this.canvas.remove(entry.label)
    }
    this.shapeMap.delete(id)
    this.canvas.discardActiveObject()
    this.setState({ selectedId: null })
    this.options.onSelect?.(null, '')
    this.canvas.requestRenderAll()
    this.commit()
  }

  /** 修改选中标注的标签 */
  updateSelectedLabel(label: string) {
    const id = this._state.selectedId
    if (!id) return
    const entry = this.shapeMap.get(id)
    if (!entry) return
    ;(entry.shape as any).label = label
    setLabelText(entry.label, label)
    this.canvas?.requestRenderAll()
    this.commit()
  }

  /** 清空当前图片标注 */
  clearCurrent() {
    if (!this.canvas || !this._state.currentImageId) return
    this.cancelDrawState()
    this.shapeMap.forEach(({ shape, label }) => {
      this.canvas!.remove(shape)
      this.canvas!.remove(label)
    })
    this.shapeMap.clear()
    this.canvas.discardActiveObject()
    this.setState({ selectedId: null })
    this.options.onSelect?.(null, '')
    this.canvas.requestRenderAll()
    this.commit()
  }

  // ---------- 撤销 / 反撤销 ----------

  undo() {
    const imageId = this._state.currentImageId
    if (!imageId) return
    this.cancelDrawState()
    const snap = this.history.undo(imageId)
    if (snap) this.applySnapshot(imageId, snap)
  }

  redo() {
    const imageId = this._state.currentImageId
    if (!imageId) return
    this.cancelDrawState()
    const snap = this.history.redo(imageId)
    if (snap) this.applySnapshot(imageId, snap)
  }

  // ---------- 键盘 ----------

  handleEnter() {
    if (this._state.mode === 'polygon' && this.polygonPts.length >= POLYGON_MIN_POINTS) {
      this.finishPolygon()
    }
  }

  handleEscape() {
    if (this.pendingShape || this.polygonPts.length) {
      this.cancelDrawState()
      return
    }
    if (this._state.mode !== 'pan') {
      this.setMode('pan')
      return
    }
    this.canvas?.discardActiveObject()
    this.canvas?.requestRenderAll()
  }

  // ---------- 图片加载 ----------

  async loadImage(item: ImageItem) {
    if (!this.canvas) return
    const token = ++this.loadToken
    this.cancelDrawState()
    this.panning = false
    this.canvas.discardActiveObject()
    if (this._state.selectedId) {
      this.setState({ selectedId: null })
      this.options.onSelect?.(null, '')
    }
    this.setState({ currentImageId: item.id })
    this.history.setCurrent(item.id)
    this.setState({ imageLoaded: false, imageError: '' })

    // 清空画布
    this.canvas.remove(...this.canvas.getObjects())
    this.bgImage = null
    this.imgW = 0
    this.imgH = 0
    this.shapeMap.clear()

    try {
      const img = await FabricImage.fromURL(item.url, { crossOrigin: 'anonymous' })
      if (token !== this.loadToken) return // 加载期间已切换图片，丢弃
      img.set({
        left: 0,
        top: 0,
        selectable: false,
        evented: false,
        hoverCursor: 'default',
        moveCursor: 'default',
      })
      this.bgImage = img
      this.imgW = img.width || 0
      this.imgH = img.height || 0
      this.canvas.add(img)

      let list = this.annotationsByImage.get(item.id)
      if (!list) {
        list = (item.annotations || []).map((a) => deepClone(a))
      }
      if (!this.history.has(item.id)) this.history.init(item.id, list)
      this.rebuildShapes(list)
      this.annotationsByImage.set(item.id, list)
      this.updateCounts(item.id, list.length)
      this.fitView()
      this.setState({ imageLoaded: true })
    } catch (err) {
      if (token !== this.loadToken) return
      this.setState({ imageError: '图片加载失败，请检查图片地址' })
      console.error('[ImageCaption] 图片加载失败:', err)
    }
  }

  /** 预填充各图片初始标注（用于 getAnnotations / getAllAnnotations 覆盖未打开过的图片） */
  preloadAnnotations(images: ImageItem[]) {
    images.forEach((img) => {
      if (!this.annotationsByImage.has(img.id) && img.annotations && img.annotations.length) {
        const list = img.annotations.map((a) => deepClone(a))
        this.annotationsByImage.set(img.id, list)
        this.updateCounts(img.id, list.length)
      }
    })
  }

  // ---------- 事件绑定 ----------

  private bindEvents() {
    if (!this.canvas) return

    this.canvas.on('mouse:wheel', (opt: any) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()
      const factor = Math.pow(WHEEL_ZOOM_FACTOR, e.deltaY)
      this.zoomAt({ x: opt.viewportPoint.x, y: opt.viewportPoint.y }, factor)
    })

    this.canvas.on('mouse:down', (opt: any) => {
      if (!this.canvas) return
      const e = opt.e as MouseEvent
      if (e.button !== 0) return // 仅左键
      const scene: IPT = { x: opt.scenePoint.x, y: opt.scenePoint.y }
      if (this._state.mode === 'pan') {
        if (!opt.target) {
          // 点击空白处：开始平移（点中标注时由 fabric 处理选中与拖动）
          this.panning = true
          this.panLast = { x: e.clientX, y: e.clientY }
          this.canvas.defaultCursor = 'grabbing'
        }
      } else if (this._state.mode === 'rect' || this._state.mode === 'circle') {
        if (!this.pendingShape) this.startRectEllipseDraw(this.clampToImage(scene))
      } else if (this._state.mode === 'polygon') {
        if (!this.pendingShape) this.handlePolygonDown(this.clampToImage(scene))
      }
    })

    this.canvas.on('mouse:move', (opt: any) => {
      if (!this.canvas) return
      const scene: IPT = { x: opt.scenePoint.x, y: opt.scenePoint.y }
      if (this.panning) {
        const e = opt.e as MouseEvent
        const vpt = this.canvas.viewportTransform
        vpt[4] += e.clientX - this.panLast.x
        vpt[5] += e.clientY - this.panLast.y
        this.canvas.setViewportTransform(vpt)
        this.panLast = { x: e.clientX, y: e.clientY }
        return
      }
      if (this.drawing && this.pendingShape) {
        this.updateRectEllipseDraw(this.clampToImage(scene))
      } else if (this._state.mode === 'polygon' && this.polygonPts.length && !this.pendingShape) {
        this.showGuideLine(this.clampToImage(scene))
      }
    })

    this.canvas.on('mouse:up', () => {
      if (this.panning) {
        this.panning = false
        if (this.canvas) {
          this.canvas.defaultCursor = this._state.mode === 'pan' ? 'grab' : 'crosshair'
        }
      }
      if (this.drawing) this.finishRectEllipseDraw()
    })

    this.canvas.on('mouse:dblclick', () => {
      if (this._state.mode === 'polygon' && this.polygonPts.length) this.finishPolygon()
    })

    this.canvas.on('selection:created', () => this.handleSelection())
    this.canvas.on('selection:updated', () => this.handleSelection())
    this.canvas.on('selection:cleared', () => this.handleSelectionClear())

    this.canvas.on('object:moving', (e: any) => this.handleObjectMoving(e))
    this.canvas.on('object:modified', (e: any) => {
      const obj: FabricObject = e.target
      if (obj && isAnnotationShape(obj)) this.commit() // 拖动结束，重新计算并更新标注坐标
    })
  }

  private onGlobalMouseUp = () => {
    if (this.panning) {
      this.panning = false
      if (this.canvas) {
        this.canvas.defaultCursor = this._state.mode === 'pan' ? 'grab' : 'crosshair'
      }
    }
    if (this.drawing) this.finishRectEllipseDraw()
  }

  // ---------- 初始化 / 销毁 ----------

  init(canvasEl: HTMLCanvasElement, wrapEl: HTMLElement) {
    this.canvas = new Canvas(canvasEl, {
      selection: false, // 禁用框选
      preserveObjectStacking: true, // 选中时保持对象层级（背景图不置顶）
      stopContextMenu: true,
      fireRightClick: false,
      enableRetinaScaling: true,
    })
    this.canvas.defaultCursor = 'grab'
    this.canvasWrap = wrapEl

    const w = wrapEl.clientWidth
    const h = wrapEl.clientHeight
    if (w > 0 && h > 0) this.canvas.setDimensions({ width: w, height: h })

    this.bindEvents()
    window.addEventListener('mouseup', this.onGlobalMouseUp)

    // 屏幕尺寸适配：容器尺寸变化时重设画布尺寸（保持当前视口缩放平移）
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.canvas || !this.canvasWrap) return
      const w = this.canvasWrap.clientWidth
      const h = this.canvasWrap.clientHeight
      if (w > 0 && h > 0) {
        this.canvas.setDimensions({ width: w, height: h })
        this.canvas.requestRenderAll()
      }
    })
    this.resizeObserver.observe(wrapEl)
  }

  destroy() {
    window.removeEventListener('mouseup', this.onGlobalMouseUp)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.canvasWrap = null
    this.cancelDrawState()
    if (this.canvas) {
      this.canvas.off()
      this.canvas.dispose()
      this.canvas = null
    }
  }

  // ---------- 图片导出 ----------

  /**
   * 导出当前图片（含标注与标签）为 PNG dataURL，尺寸为图片原始像素。
   * 导出时临时重置视口为 1:1 并隐藏未确认/绘制中的临时对象，导出后恢复原状。
   * 失败（无图片或画布异常）返回 null。
   */
  exportImage(): string | null {
    if (!this.canvas || !this.bgImage || !this.imgW || !this.imgH) return null
    const zoom = this.getZoom()
    const savedVpt = [...this.canvas.viewportTransform] as typeof this.canvas.viewportTransform

    // 临时隐藏未确认图形与多边形绘制辅助元素
    const hidden: FabricObject[] = []
    if (this.pendingShape) {
      this.pendingShape.visible = false
      hidden.push(this.pendingShape)
    }
    ;[this.tempPolyline, this.tempGuideLine].forEach((o) => {
      if (o) {
        o.visible = false
        hidden.push(o)
      }
    })
    this.tempDots.forEach((d) => {
      d.visible = false
      hidden.push(d)
    })

    let url: string | null = null
    try {
      // 视口重置为 1:1（图片原始像素），标签字号同步为基准字号（视觉恒定）
      this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
      this.shapeMap.forEach(({ shape, label }) => syncLabelText(label, shape, 1))
      this.canvas.renderAll()
      url = this.canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        left: 0,
        top: 0,
        width: this.imgW,
        height: this.imgH,
      })
    } catch (err) {
      console.error('[ImageCaption] 导出图片失败:', err)
      url = null
    } finally {
      // 恢复视口、标签字号与临时对象可见性
      this.canvas.setViewportTransform(savedVpt)
      this.shapeMap.forEach(({ shape, label }) => syncLabelText(label, shape, zoom))
      hidden.forEach((o) => {
        o.visible = true
      })
      this.canvas.requestRenderAll()
    }
    return url
  }

  // ---------- 数据获取 ----------

  getAnnotations(imageId?: string): AnnotationData[] {
    const id = imageId || this._state.currentImageId
    if (!id) return []
    return deepClone(this.annotationsByImage.get(id) || [])
  }

  getAllAnnotations(): AllAnnotations {
    const res: AllAnnotations = {}
    this.annotationsByImage.forEach((v, k) => {
      res[k] = deepClone(v)
    })
    return res
  }

  /** 获取选中标注中心的屏幕坐标（画布容器内，用于标签浮层定位） */
  getSelectedScreenPoint(): { x: number; y: number } | null {
    if (!this.canvas || !this._state.selectedId) return null
    const entry = this.shapeMap.get(this._state.selectedId)
    if (!entry) return null
    const center = entry.shape.getCenterPoint()
    const screen = util.transformPoint(center, this.canvas.viewportTransform)
    return { x: screen.x, y: screen.y }
  }
}
