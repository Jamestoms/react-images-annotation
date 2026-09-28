# react-images-annotation

**English** | [简体中文](./README.md)

[![npm version](https://img.shields.io/npm/v/react-images-annotation.svg)](https://www.npmjs.com/package/react-images-annotation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![test](https://img.shields.io/badge/test-vitest-green.svg)]()

A React image annotation component based on [fabric.js](https://www.fabricjs.com/) — draw rect / circle / polygon annotations on images, with zoom & pan, undo/redo, data echo and PNG export.

It is the React counterpart of [vue3-image-annotation](https://www.npmjs.com/package/vue3-image-annotation) (identical features, interactions and data format).

It provides an `<ImageCaption />` component consisting of a thumbnail panel, a main annotation area and a toolbar. It supports rectangle, circle and polygon annotations, selection & dragging, deletion, undo/redo, label management, as well as annotation data echo and retrieval.

## Features

- Rectangle / circle drawing by dragging, polygon drawing by clicking point by point (double-click or Enter to finish, ESC to cancel)
- Click to select an existing annotation, hold and drag to move it (automatically constrained within the image; annotation coordinates are recalculated on release)
- Delete annotations (toolbar button or Delete / Backspace key)
- Undo / redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, recorded independently per image)
- Each annotation can be associated with a label — free input or picking from a preset label list
- Mouse wheel zooming (centered on the cursor), left-button dragging on empty space to pan, fit view
- Annotation coordinates are stored in the image's original pixels, so they never drift at any zoom / pan level
- Responsive to screen size changes
- Echo existing annotation data and continue editing
- TypeScript type declarations provided, while staying compatible with non-TS projects
- Zero UI framework dependency (buttons / dropdowns / popovers are all custom-built — no antd or any other component library is introduced, so it never conflicts with the host project's UI framework)

## Screenshots

![demo1 Overall UI and annotation result](https://raw.githubusercontent.com/Jamestoms/react-images-annotation/HEAD/demo1.png)

![demo2 Annotation editing interactions](https://raw.githubusercontent.com/Jamestoms/react-images-annotation/HEAD/demo2.png)

## Requirements

- React `^18.0.0 || ^19.0.0`
- Node `>= 18` (only needed for local development / build)

`fabric` is the only runtime dependency (dependencies) of the component library — it is installed automatically when you install this component, no manual setup required.

## Installation

```bash
pnpm add react-images-annotation
# or
npm install react-images-annotation
# or
yarn add react-images-annotation
```

## Usage

### Option 1: Default import (recommended)

```tsx
import { useState } from 'react'
import ImageCaption from 'react-images-annotation'
import 'react-images-annotation/style.css'

function App() {
  const [images] = useState([{ id: 'img-1', url: 'https://example.com/a.jpg' }])
  const [labels] = useState(['Pedestrian', 'Vehicle', 'Building'])

  function handleSave() {
    // host save logic, see "Best Practices for Saving Data" below
  }

  return (
    <ImageCaption
      images={images}
      labels={labels}
      style={{ height: 640 }}
      // optional: custom action area (right side of the toolbar), e.g. a save button
      actions={
        <button className="ic-btn ic-btn--primary" onClick={handleSave}>
          Save
        </button>
      }
    />
  )
}
```

### Option 2: Named import

```tsx
import { ImageCaption } from 'react-images-annotation'
import 'react-images-annotation/style.css'

function App() {
  return <ImageCaption images={images} />
}
```

> In non-TypeScript projects, just use it as a normal component (the component is compiled to JS; type declarations are optional).

## Component API

### Props

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `images` | `ImageItem[]` | Yes | `[]` | Image list; if an item contains `annotations`, they are echoed after loading |
| `labels` | `string[]` | No | `[]` | Preset label list, selectable while editing a label (free input is also allowed) |
| `downloadable` | `boolean` | No | `false` | Whether to enable the download feature (a download button appears in the toolbar, exporting a PNG image with annotations) |
| `onChange` | `(imageId: string, annotations: AnnotationData[]) => void` | No | - | Fired when annotation data changes (add / delete / move / label edit / undo / redo / clear) |
| `onDownload` | `(imageId: string, filename: string) => void` | No | - | Fired after a successful export triggered by the download button (requires `downloadable`) |
| `actions` | `ReactNode` | No | - | Custom action area rendered at the far right of the toolbar, suitable for host business buttons such as save / submit / next step. You can reuse the built-in button style classes `ic-btn` (default), `ic-btn--primary` (primary), `ic-btn--danger-plain` (danger), or fully customize your own |
| `className` | `string` | No | - | Container class name |
| `style` | `CSSProperties` | No | - | Container style (usually used to specify the height, e.g. `{ height: 640 }`) |

> Migrating from the Vue3 version: `change` event → `onChange` prop, `download` event → `onDownload` prop, `actions` slot → `actions` prop.

### Best Practices for Saving Data

The component does not ship a built-in save button (when and how to persist data is up to the host). Two common patterns are provided:

**Pattern 1: Real-time saving** — listen to `onChange` and submit automatically on every change:

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

**Pattern 2: Manual saving** — put your own button in the `actions` prop and read the data from a ref on click (it can be submitted along with other form fields on the page):

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
          Save
        </button>
      }
    />
  )
}
```

### Component Methods (via ref)

```tsx
import { useRef } from 'react'
import type { ImageCaptionRef } from 'react-images-annotation'

const captionRef = useRef<ImageCaptionRef>(null)

// Get annotations of the current image
captionRef.current?.getAnnotations()
// Get annotations of a specific image
captionRef.current?.getAnnotations('img-1')
// Get annotations of all images: { [imageId]: AnnotationData[] }
captionRef.current?.getAllAnnotations()
// Undo / redo
captionRef.current?.undo()
captionRef.current?.redo()
// Delete the currently selected annotation
captionRef.current?.deleteSelected()
// Clear annotations of the current image
captionRef.current?.clearCurrent()
// View control
captionRef.current?.zoomIn()
captionRef.current?.zoomOut()
captionRef.current?.fitView()
// Export a PNG dataURL of the current image (with annotations) at the image's original pixel size — useful for custom upload scenarios
const dataUrl = captionRef.current?.exportImage()
// Current image id (use together with getAnnotations for manual saving)
const imageId = captionRef.current?.currentImageId
// Switch image
captionRef.current?.switchImage('img-2')
```

### Data Types

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
  /** rect / circle: top-left corner of the bounding box, plus width and height */
  x?: number
  y?: number
  width?: number
  height?: number
  /** polygon: vertex list */
  points?: Point[]
}

interface ImageItem {
  id: string
  url: string
  name?: string
  /** existing annotations, echoed after loading */
  annotations?: AnnotationData[]
}
```

> All coordinates are **in the image's original pixel space** (independent of canvas zoom), ready to be stored and converted by your business logic.
> The data format is fully compatible with `vue3-image-annotation` — the same annotation data can be shared across Vue3 / React projects.

## Interactions

| Action | Behavior |
| --- | --- |
| Mouse wheel | Zoom in / out centered on the cursor |
| Left-button drag on empty space | Pan the image |
| Click an annotation | Select it (a label editing popover appears — rename the label or delete the annotation) |
| Drag a selected annotation | Move it (constrained within the image); coordinates are updated automatically on release |
| Delete / Backspace | Delete the selected annotation |
| Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) | Undo / redo |
| Clear button | First click enters a red confirmation state; clicking again within 3 seconds clears the annotations, otherwise it resets automatically |
| ESC | Cancel drawing / deselect / close the popover |
| Enter | Finish polygon drawing |
| Double-click / click the starting vertex | Finish polygon drawing |

> Annotations do not support control-handle scaling (to avoid coordinate conversion errors) — delete and redraw, or undo, if you make a mistake.

## Relation to the Vue Version

This component is the React counterpart of [vue3-image-annotation](https://github.com/Jamestoms/image-annotation):

- Identical features, interactions and UI as the Vue version
- Fully compatible annotation data (`AnnotationData` / `ImageItem`)
- Coordinates are likewise stored in the image's original pixel space — no framework awareness needed on the business side

## Local Development

This project uses **pnpm** as its package manager.

```bash
# Install dependencies
pnpm install

# Start the demo page (examples/)
pnpm dev

# Build the library (output in dist/)
pnpm build

# Type checking
pnpm typecheck

# Run unit tests
pnpm test
```

## License

MIT
