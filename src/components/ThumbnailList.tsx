import type { ImageItem } from '../types'

interface ThumbnailListProps {
  images: ImageItem[]
  currentId: string
  counts: Record<string, number>
  onSelect: (id: string) => void
}

export default function ThumbnailList({ images, currentId, counts, onSelect }: ThumbnailListProps) {
  return (
    <div className="ic-thumbnails">
      {images.map((img) => (
        <div
          key={img.id}
          className={`ic-thumb-item${img.id === currentId ? ' active' : ''}`}
          onClick={() => onSelect(img.id)}
        >
          <div className="ic-thumb-img">
            <img src={img.url} alt={img.name || img.id} loading="lazy" draggable={false} />
          </div>
          <div className="ic-thumb-name" title={img.name || img.id}>
            {img.name || img.id}
          </div>
          {counts[img.id] ? <span className="ic-thumb-count">{counts[img.id]}</span> : null}
        </div>
      ))}
      {!images.length && <div className="ic-thumb-empty">暂无图片</div>}
    </div>
  )
}
