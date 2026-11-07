import { useCallback, useRef, useState, type DragEvent } from 'react'
import Icon from './Icon'

interface DropzoneProps {
  onFile: (file: File) => void
  compact?: boolean
  label?: string
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif'

export default function Dropzone({ onFile, compact, label }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsOver(false)
      const file = event.dataTransfer?.files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  if (compact) {
    return (
      <>
        <button
          type="button"
          className="btn"
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="image" size={15} /> {label ?? 'Replace image'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          aria-label={label ?? 'Replace image'}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFile(file)
            event.target.value = ''
          }}
        />
      </>
    )
  }

  return (
    <div
      className={`dropzone${isOver ? ' dropzone--over' : ''}`}
      data-testid="dropzone"
      onDragOver={(event) => {
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      <div className="dropzone__glow" aria-hidden="true" />
      <div className="dropzone__inner">
        <div className="dropzone__icon">
          <Icon name="upload" size={22} />
        </div>
        <h2 className="dropzone__title">Drop an image here</h2>
        <p className="dropzone__hint">
          or paste from your clipboard — everything stays on your device
        </p>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => inputRef.current?.click()}
        >
          Choose an image
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          aria-label="Choose an image"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFile(file)
            event.target.value = ''
          }}
        />
        <ul className="dropzone__badges">
          <li>PNG</li>
          <li>JPEG</li>
          <li>WebP</li>
          <li>GIF</li>
        </ul>
      </div>
    </div>
  )
}
