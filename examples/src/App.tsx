import { useRef, useState } from 'react'
import { ImageCaption } from '../../src/index'
import type { AnnotationData, ImageCaptionRef, ImageItem } from '../../src/index'
import './demo.css'

/** 生成 SVG data-url 图片（demo 无网络依赖） */
function makeSvgImage(w: number, h: number, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const images: ImageItem[] = [
  {
    id: 'img-1',
    name: '风景图 1200x800',
    url: makeSvgImage(
      1200,
      800,
      `
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#aee3ff"/><stop offset="1" stop-color="#f6fbff"/>
        </linearGradient>
        <linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7cc08b"/><stop offset="1" stop-color="#4e9a63"/>
        </linearGradient>
        <linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9fd0a9"/><stop offset="1" stop-color="#6aab7c"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#sky)"/>
      <circle cx="950" cy="170" r="70" fill="#ffd66b"/>
      <path d="M0,640 L260,360 L520,640 Z" fill="url(#hill1)"/>
      <path d="M380,640 L680,300 L980,640 Z" fill="url(#hill2)"/>
      <path d="M820,640 L1060,420 L1200,560 L1200,640 Z" fill="url(#hill1)"/>
      <rect y="640" width="1200" height="160" fill="#3d7d52"/>
      <path d="M0,640 Q300,600 600,640 T1200,640 L1200,800 L0,800 Z" fill="#4a8f5f"/>
      <text x="40" y="70" font-size="42" fill="#5b7a99" font-family="sans-serif">Scene 1200 x 800</text>
      `
    ),
    // 回显示例：加载后直接显示以下标注
    annotations: [
      {
        id: 'demo-a1',
        type: 'rect',
        label: '太阳',
        x: 880,
        y: 100,
        width: 140,
        height: 140,
      },
      {
        id: 'demo-a2',
        type: 'polygon',
        label: '大山',
        points: [
          { x: 380, y: 640 },
          { x: 680, y: 300 },
          { x: 980, y: 640 },
        ],
      },
    ] as AnnotationData[],
  },
  {
    id: 'img-2',
    name: '街景图 900x900',
    url: makeSvgImage(
      900,
      900,
      `
      <rect width="900" height="900" fill="#dfe7ef"/>
      <rect x="80" y="120" width="200" height="420" fill="#8aa8c4"/>
      <rect x="340" y="200" width="180" height="340" fill="#a3bed8"/>
      <rect x="580" y="100" width="240" height="560" fill="#7c9cbf"/>
      <rect x="60" y="620" width="780" height="80" fill="#b9c6d4"/>
      <rect y="700" width="900" height="200" fill="#6f7d8c"/>
      <rect x="300" y="740" width="120" height="70" fill="#c9a07a"/>
      <rect x="560" y="750" width="140" height="60" fill="#c9a07a"/>
      <text x="40" y="70" font-size="36" fill="#55677a" font-family="sans-serif">Street 900 x 900</text>
      `
    ),
  },
  {
    id: 'img-3',
    name: '宽幅图 1600x600',
    url: makeSvgImage(
      1600,
      600,
      `
      <defs>
        <linearGradient id="g3" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#364f6b"/><stop offset="0.5" stop-color="#3fc1c9"/><stop offset="1" stop-color="#f5f0da"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="600" fill="url(#g3)"/>
      <circle cx="400" cy="300" r="110" fill="#fc5185" opacity="0.85"/>
      <circle cx="800" cy="300" r="110" fill="#fcd44d" opacity="0.85"/>
      <circle cx="1200" cy="300" r="110" fill="#77e08a" opacity="0.85"/>
      <text x="40" y="70" font-size="40" fill="#ffffff" font-family="sans-serif">Panorama 1600 x 600</text>
      `
    ),
  },
]

const presetLabels = ['行人', '车辆', '建筑', '植被', '天空', '道路']

export default function App() {
  const captionRef = useRef<ImageCaptionRef>(null)
  const [saveTip, setSaveTip] = useState('')
  const [showDataPanel, setShowDataPanel] = useState(false)
  const [allDataText, setAllDataText] = useState('')

  const saveTipTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleSave() {
    // 手动保存模式：从 ref 获取当前图片 id 与标注数据，提交到宿主后端
    const imageId = captionRef.current?.currentImageId || ''
    const annotations = captionRef.current?.getAnnotations?.() || []
    console.log('[demo] save:', imageId, annotations)
    setSaveTip(`已保存图片 ${imageId} 的 ${annotations.length} 条标注（数据见控制台）`)
    if (saveTipTimerRef.current) clearTimeout(saveTipTimerRef.current)
    saveTipTimerRef.current = setTimeout(() => setSaveTip(''), 3000)
  }

  function handleChange(imageId: string, annotations: AnnotationData[]) {
    // 标注数据变化时触发，可在此做自动暂存等
    console.log('[demo] change:', imageId, annotations.length)
  }

  function handleDownload(imageId: string, filename: string) {
    console.log('[demo] download:', imageId, filename)
  }

  function showAllData() {
    const all = captionRef.current?.getAllAnnotations?.()
    setAllDataText(JSON.stringify(all, null, 2))
    setShowDataPanel(true)
  }

  return (
    <div className="demo-page">
      <div className="demo-header">
        <div>
          <h2 className="demo-title">ImageCaption 图片标注组件 Demo（React）</h2>
          <p className="demo-desc">
            滚轮缩放 / 空白处拖动平移 · 矩形、圆形拖拽绘制 · 多边形逐点点击（双击或回车结束，ESC
            取消）· 点击标注可选中、拖动、改标签、删除 · Ctrl+Z / Ctrl+Shift+Z 撤销重做
          </p>
        </div>
        <div className="demo-header-actions">
          <button className="demo-btn" onClick={showAllData}>
            获取全部标注数据
          </button>
        </div>
      </div>

      {saveTip && <div className="demo-save-tip">{saveTip}</div>}

      <ImageCaption
        ref={captionRef}
        className="demo-caption"
        images={images}
        labels={presetLabels}
        downloadable
        onChange={handleChange}
        onDownload={handleDownload}
        actions={
          <button className="ic-btn ic-btn--primary" onClick={handleSave}>
            保存
          </button>
        }
      />

      {showDataPanel && (
        <div className="demo-data-panel">
          <div className="demo-data-panel-header">
            <span>全部标注数据</span>
            <button className="demo-btn demo-btn--small" onClick={() => setShowDataPanel(false)}>
              关闭
            </button>
          </div>
          <pre className="demo-data-pre">{allDataText}</pre>
        </div>
      )}
    </div>
  )
}
