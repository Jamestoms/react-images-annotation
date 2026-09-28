# react-images-annotation

[English](./README.en.md) | **简体中文**

[![npm version](https://img.shields.io/npm/v/react-images-annotation.svg)](https://www.npmjs.com/package/react-images-annotation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![test](https://img.shields.io/badge/test-vitest-green.svg)]()

A React image annotation component based on [fabric.js](https://www.fabricjs.com/) — draw rect / circle / polygon annotations on images, with zoom & pan, undo/redo, data echo and PNG export.

基于 [fabric.js](https://www.fabricjs.com/) 的 React 在线图片标注组件，是 [vue3-image-annotation](https://www.npmjs.com/package/vue3-image-annotation) 的 React 版本（功能、交互与数据格式完全一致）。

提供 `<ImageCaption />` 组件：缩略图区域 + 主标注区域 + 工具区域，支持矩形、圆形、多边形标注，支持选中拖动、删除、撤销/反撤销、标签管理、标注数据回显与获取。

## 特性

- 矩形 / 圆形拖拽绘制，多边形逐点点击绘制（双击或回车结束，ESC 取消）
- 已标注区域点击选中、按住拖动调整位置（自动限制在图片范围内，松开后重新计算标注坐标）
- 删除标注（工具栏按钮或 Delete / Backspace 键）
- 撤销 / 反撤销（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y，按图片独立记录）
- 每个标注可关联标签名称，支持自由输入或从预设标签列表选择
- 鼠标滚轮缩放（以鼠标位置为中心）、左键拖动空白平移、fit 视野
- 标注坐标基于图片原始像素存储，任何缩放/平移状态下坐标不会错位
- 屏幕尺寸变化自适应
- 支持已有标注数据回显、继续编辑
- 提供 TypeScript 类型声明，同时兼容非 TS 项目
- 零 UI 框架依赖（按钮/下拉/提示均为自绘实现，不引入 antd 等组件库，与宿主项目任何 UI 框架无冲突）

## 示例截图

![demo1 整体界面与标注效果](https://raw.githubusercontent.com/Jamestoms/react-images-annotation/HEAD/demo1.png)

![demo2 标注编辑交互](https://raw.githubusercontent.com/Jamestoms/react-images-annotation/HEAD/demo2.png)

## 环境要求

- React `^18.0.0 || ^19.0.0`
- Node `>= 18`（仅本地开发/构建需要）

`fabric` 为组件库唯一运行时依赖（dependencies），安装本组件时会自动安装，无需手动处理。

## 安装

```bash
pnpm add react-images-annotation
# 或
npm install react-images-annotation
# 或
yarn add react-images-annotation
```

## 使用方式

### 方式一：默认导入（推荐）

```tsx
import { useState } from 'react'
import ImageCaption from 'react-images-annotation'
import 'react-images-annotation/style.css'

function App() {
  const [images] = useState([{ id: 'img-1', url: 'https://example.com/a.jpg' }])
  const [labels] = useState(['行人', '车辆', '建筑'])

  function handleSave() {
    // 宿主保存逻辑，见下方「保存数据最佳实践」
  }

  return (
    <ImageCaption
      images={images}
      labels={labels}
      style={{ height: 640 }}
      // 可选：自定义操作区（工具栏右侧），如保存按钮
      actions={
        <button className="ic-btn ic-btn--primary" onClick={handleSave}>
          保存
        </button>
      }
    />
  )
}
```

### 方式二：具名导入

```tsx
import { ImageCaption } from 'react-images-annotation'
import 'react-images-annotation/style.css'

function App() {
  return <ImageCaption images={images} />
}
```

> 非 TypeScript 项目中按普通组件使用即可（组件已编译为 JS，类型声明可选）。

## 组件 API

### Props

| 名称 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `images` | `ImageItem[]` | 是 | `[]` | 图片列表，项内含 `annotations` 则加载后回显 |
| `labels` | `string[]` | 否 | `[]` | 预设标签列表，标签输入时可选择（也可自由输入） |
| `downloadable` | `boolean` | 否 | `false` | 是否开启下载功能（工具栏显示下载按钮，导出含标注的 PNG 图片） |
| `onChange` | `(imageId: string, annotations: AnnotationData[]) => void` | 否 | - | 标注数据发生变化时触发（新增/删除/移动/标签修改/撤销/重做/清空） |
| `onDownload` | `(imageId: string, filename: string) => void` | 否 | - | 点击下载按钮导出成功后触发（需开启 `downloadable`） |
| `actions` | `ReactNode` | 否 | - | 自定义操作区，渲染在工具栏最右侧，适合放置保存/提交/下一步等宿主业务按钮。可直接复用内置按钮样式类 `ic-btn`（默认）、`ic-btn--primary`（主要）、`ic-btn--danger-plain`（危险），也可完全自定义 |
| `className` | `string` | 否 | - | 容器类名 |
| `style` | `CSSProperties` | 否 | - | 容器样式（通常用于指定高度，如 `{ height: 640 }`） |

> 从 Vue3 版迁移：`change` 事件 → `onChange` 属性，`download` 事件 → `onDownload` 属性，`actions` 插槽 → `actions` 属性。

### 保存数据最佳实践

组件不内置保存按钮（数据何时、如何持久化由宿主决定），提供两种常用模式：

**模式一：实时保存** —— 监听 `onChange`，标注每次变化自动提交：

```tsx
import { useState } from 'react'
import ImageCaption from 'react-images-annotation'
import type { AnnotationData, ImageItem } from 'react-images-annotation'

function App() {
  const [images] = useState<ImageItem[]>([
    { id: 'img-1', url: 'https://example.com/a.jpg' },
  ])

  async function handleChange(imageId: string, annotations: AnnotationData[]) {
    await fetch(`/api/annotations/${imageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotations),
    })
  }

  return <ImageCaption images={images} onChange={handleChange} style={{ height: 640 }} />
}
```

**模式二：手动保存** —— 通过 `actions` 属性放自己的按钮，点击时从 ref 获取数据（可携带页面其他表单字段一起提交）：

```tsx
import { useRef, useState } from 'react'
import ImageCaption from 'react-images-annotation'
import type { ImageCaptionRef, ImageItem } from 'react-images-annotation'

function App() {
  const [images] = useState<ImageItem[]>([
    { id: 'img-1', url: 'https://example.com/a.jpg' },
  ])
  const captionRef = useRef<ImageCaptionRef>(null)

  async function handleSave() {
    const imageId = captionRef.current?.currentImageId || ''
    const annotations = captionRef.current?.getAnnotations() || []
    await fetch(`/api/annotations/${imageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotations),
    })
  }

  return (
    <ImageCaption
      ref={captionRef}
      images={images}
      style={{ height: 640 }}
      actions={
        <button className="ic-btn ic-btn--primary" onClick={handleSave}>
          保存
        </button>
      }
    />
  )
}
```

### 组件方法（通过 ref 调用）

```tsx
import { useRef } from 'react'
import type { ImageCaptionRef } from 'react-images-annotation'

const captionRef = useRef<ImageCaptionRef>(null)

// 获取当前图片标注数据
captionRef.current?.getAnnotations()
// 获取指定图片标注数据
captionRef.current?.getAnnotations('img-1')
// 获取全部图片标注数据 { [imageId]: AnnotationData[] }
captionRef.current?.getAllAnnotations()
// 撤销 / 反撤销
captionRef.current?.undo()
captionRef.current?.redo()
// 删除当前选中标注
captionRef.current?.deleteSelected()
// 清空当前图片标注
captionRef.current?.clearCurrent()
// 视图控制
captionRef.current?.zoomIn()
captionRef.current?.zoomOut()
captionRef.current?.fitView()
// 导出当前图片（含标注）的 PNG dataURL（图片原始像素尺寸，可用于自定义上传等场景）
const dataUrl = captionRef.current?.exportImage()
// 当前图片 id（手动保存时配合 getAnnotations 使用）
const imageId = captionRef.current?.currentImageId
// 切换图片
captionRef.current?.switchImage('img-2')
```

### 数据类型

```ts
type AnnotationType = 'rect' | 'circle' | 'polygon'

interface Point {
  x: number
  y: number
}

interface AnnotationData {
  id: string
  type: AnnotationType
  label: string
  /** rect / circle：外接框左上角坐标与宽高 */
  x?: number
  y?: number
  width?: number
  height?: number
  /** polygon：顶点列表 */
  points?: Point[]
}

interface ImageItem {
  id: string
  url: string
  name?: string
  /** 已有标注，加载后回显 */
  annotations?: AnnotationData[]
}
```

> 所有坐标均为**图片原始像素坐标**（与画布缩放无关），可直接用于业务存储与换算。
> 与 `vue3-image-annotation` 的数据格式完全一致，同一份标注数据可在 Vue3 / React 项目间互通。

## 交互说明

| 操作 | 行为 |
| --- | --- |
| 鼠标滚轮 | 以鼠标位置为中心放大 / 缩小 |
| 左键拖动空白处 | 平移图片 |
| 点击标注 | 选中（弹出标签编辑浮层，可改标签、删除） |
| 拖动选中标注 | 移动位置（限制在图片范围内），松开后自动更新坐标 |
| Delete / Backspace | 删除选中标注 |
| Ctrl+Z / Ctrl+Shift+Z（或 Ctrl+Y） | 撤销 / 反撤销 |
| 清空按钮 | 首次点击进入红色确认态，3 秒内再次点击执行清空，超时自动还原 |
| ESC | 取消绘制 / 取消选中 / 关闭浮层 |
| Enter | 结束多边形绘制 |
| 双击 / 点击起始顶点 | 结束多边形绘制 |

> 标注对象不支持控制柄缩放（避免坐标换算误差），画错可删除重画或撤销。

## 与 Vue 版本的关系

本组件是 [vue3-image-annotation](https://github.com/Jamestoms/image-annotation) 的 React 版本：

- 功能、交互、UI 与 Vue 版完全一致
- 标注数据（`AnnotationData` / `ImageItem`）格式完全互通
- 标注坐标同样基于图片原始像素存储，业务侧无需感知框架差异

## 本地开发

本项目统一使用 **pnpm** 作为包管理工具。

```bash
# 安装依赖
pnpm install

# 启动 demo 演示页（examples/）
pnpm dev

# 库构建（产物输出至 dist/）
pnpm build

# 类型检查
pnpm typecheck

# 运行单元测试
pnpm test
```

## License

MIT
