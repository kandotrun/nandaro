import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import JSZip from 'jszip'
import './App.css'

type OutputFormat = 'auto' | 'image/jpeg' | 'image/webp'

type SourceImage = {
  id: string
  file: File
  name: string
  size: number
  previewUrl: string
}

type PreviewModal = {
  src: string
  title: string
  meta: string
}

type ProcessedImage = {
  id: string
  name: string
  originalBytes: number
  compressedBytes: number
  width: number
  height: number
  mimeType: string
  blob: Blob
  previewUrl: string
}

type FailedImage = {
  id: string
  name: string
  error: string
}

const OUTPUT_OPTIONS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPEG' },
]

const MAX_EDGE_OPTIONS = [0, 1024, 1600, 2048, 2560, 3840]

function App() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([])
  const [results, setResults] = useState<ProcessedImage[]>([])
  const [failures, setFailures] = useState<FailedImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [quality, setQuality] = useState(78)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('auto')
  const [maxEdge, setMaxEdge] = useState(2048)
  const [previewModal, setPreviewModal] = useState<PreviewModal | null>(null)

  const webpSupported = useMemo(() => {
    const canvas = document.createElement('canvas')
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }, [])

  useEffect(() => {
    return () => {
      cleanupResultUrls(results)
      cleanupSourceUrls(sourceImages)
    }
  }, [results, sourceImages])

  const totalOriginal = results.reduce((sum, item) => sum + item.originalBytes, 0)
  const totalCompressed = results.reduce((sum, item) => sum + item.compressedBytes, 0)
  const savedBytes = Math.max(totalOriginal - totalCompressed, 0)
  const savingsRate = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0

  const handleBrowse = () => inputRef.current?.click()

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      replaceSourceFiles(files)
    }
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      replaceSourceFiles(files)
    }
  }

  const replaceSourceFiles = (files: File[]) => {
    cleanupResultUrls(results)
    cleanupSourceUrls(sourceImages)
    setSourceImages(
      files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      })),
    )
    setResults([])
    setFailures([])
  }

  const clearAll = () => {
    cleanupResultUrls(results)
    cleanupSourceUrls(sourceImages)
    setSourceImages([])
    setResults([])
    setFailures([])
    setPreviewModal(null)
  }

  const processImages = async () => {
    if (sourceImages.length === 0 || isProcessing) return

    setIsProcessing(true)
    cleanupResultUrls(results)
    setResults([])
    setFailures([])

    const nextResults: ProcessedImage[] = []
    const nextFailures: FailedImage[] = []

    for (const source of sourceImages) {
      try {
        const processed = await compressImage(source.file, {
          quality,
          maxEdge,
          outputFormat,
          webpSupported,
        })
        nextResults.push(processed)
      } catch (error) {
        nextFailures.push({
          id: crypto.randomUUID(),
          name: source.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    setResults(nextResults)
    setFailures(nextFailures)
    setIsProcessing(false)
  }

  const downloadOne = (item: ProcessedImage) => {
    const link = document.createElement('a')
    link.href = item.previewUrl
    link.download = renamedFile(item.name, item.mimeType)
    link.click()
  }

  const downloadAll = async () => {
    if (results.length === 0) return
    const zip = new JSZip()

    results.forEach((item) => {
      zip.file(renamedFile(item.name, item.mimeType), item.blob)
    })

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'nandaro-images.zip'
    link.click()
    URL.revokeObjectURL(url)
  }

  const openPreview = (src: string, title: string, meta: string) => {
    setPreviewModal({ src, title, meta })
  }

  return (
    <>
      <main className="app-shell">
        <section className="hero card">
          <div>
            <p className="eyebrow">Nandaro image lab</p>
            <h1>Browser-only image compression.</h1>
            <p className="hero-copy">
              No upload wait, no server-side image processing, no metadata leakage from the original file.
              Everything happens in your browser.
            </p>
          </div>
          <div className="hero-badges">
            <span>Cloudflare-ready</span>
            <span>Client-side only</span>
            <span>Batch download</span>
          </div>
        </section>

        <section className="grid">
          <div className="card stack-lg">
            <div className="section-head">
              <div>
                <h2>1. Add images</h2>
                <p>JPEG, PNG, WebP and most browser-decodable still images are fine.</p>
              </div>
              {sourceImages.length > 0 ? <span className="pill">{sourceImages.length} files</span> : null}
            </div>

            <label
              className={`dropzone ${dragging ? 'dragging' : ''}`}
              onDragEnter={() => setDragging(true)}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileInput} hidden />
              <div className="dropzone-copy">
                <strong>Drop images here</strong>
                <span>or</span>
                <button type="button" className="secondary-button" onClick={handleBrowse}>
                  Choose files
                </button>
              </div>
            </label>

            {sourceImages.length > 0 ? (
              <>
                <ul className="file-list">
                  {sourceImages.map((item) => (
                    <li key={item.id}>
                      <span className="file-name">{item.name}</span>
                      <span className="muted">{formatBytes(item.size)}</span>
                    </li>
                  ))}
                </ul>

                <div className="preview-grid">
                  {sourceImages.map((item) => (
                    <article key={item.id} className="preview-card">
                      <button
                        type="button"
                        className="preview-button"
                        onClick={() => openPreview(item.previewUrl, item.name, `${formatBytes(item.size)} · original`)}
                      >
                        <img src={item.previewUrl} alt={item.name} />
                      </button>
                      <div className="preview-meta">
                        <strong title={item.name}>{item.name}</strong>
                        <span>{formatBytes(item.size)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">Nothing loaded yet.</p>
            )}
          </div>

          <div className="card stack-lg">
            <div className="section-head">
              <div>
                <h2>2. Compression settings</h2>
                <p>Simple first. Good defaults, no nonsense.</p>
              </div>
            </div>

            <div className="controls">
              <label>
                <span>Output format</span>
                <select value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}>
                  {OUTPUT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Quality</span>
                <div className="range-row">
                  <input
                    type="range"
                    min="45"
                    max="95"
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                  />
                  <strong>{quality}</strong>
                </div>
              </label>

              <label>
                <span>Max edge</span>
                <select value={maxEdge} onChange={(event) => setMaxEdge(Number(event.target.value))}>
                  {MAX_EDGE_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? 'Keep original size' : `${value}px`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="note-box">
              <strong>Current behavior</strong>
              <p>
                Images are re-encoded in the browser, so EXIF metadata is stripped. Auto mode picks WebP when available,
                otherwise JPEG.
              </p>
            </div>

            <div className="action-row">
              <button type="button" className="primary-button" onClick={processImages} disabled={sourceImages.length === 0 || isProcessing}>
                {isProcessing ? 'Compressing…' : `Compress ${sourceImages.length || ''} image${sourceImages.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" className="ghost-button" onClick={clearAll} disabled={isProcessing && sourceImages.length === 0}>
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="card stack-lg">
          <div className="section-head">
            <div>
              <h2>3. Results</h2>
              <p>Compression runs fully local. What you see here is ready to download.</p>
            </div>
            {results.length > 0 ? (
              <button type="button" className="secondary-button" onClick={downloadAll}>
                Download all (.zip)
              </button>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="summary-bar">
              <span>{results.length} done</span>
              <span>
                {formatBytes(totalOriginal)} → {formatBytes(totalCompressed)}
              </span>
              <span>{savingsRate}% saved</span>
              <span>{formatBytes(savedBytes)} smaller</span>
            </div>
          ) : (
            <p className="muted">Run compression to see output here.</p>
          )}

          <div className="results-grid">
            {results.map((item) => {
              const saved = Math.max(item.originalBytes - item.compressedBytes, 0)
              const rate = Math.round((saved / item.originalBytes) * 100)
              return (
                <article key={item.id} className="result-card">
                  <button
                    type="button"
                    className="result-image-button"
                    onClick={() =>
                      openPreview(
                        item.previewUrl,
                        renamedFile(item.name, item.mimeType),
                        `${item.width} × ${item.height} · ${mimeLabel(item.mimeType)} · ${formatBytes(item.compressedBytes)}`,
                      )
                    }
                  >
                    <img src={item.previewUrl} alt={item.name} />
                  </button>
                  <div className="result-body">
                    <div>
                      <h3>{item.name}</h3>
                      <p className="muted">
                        {item.width} × {item.height} · {mimeLabel(item.mimeType)}
                      </p>
                    </div>
                    <div className="stat-grid">
                      <div>
                        <span>Original</span>
                        <strong>{formatBytes(item.originalBytes)}</strong>
                      </div>
                      <div>
                        <span>Compressed</span>
                        <strong>{formatBytes(item.compressedBytes)}</strong>
                      </div>
                      <div>
                        <span>Saved</span>
                        <strong>{rate}%</strong>
                      </div>
                    </div>
                    <button type="button" className="primary-button" onClick={() => downloadOne(item)}>
                      Download
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {failures.length > 0 ? (
            <div className="error-box">
              <strong>Some files failed</strong>
              <ul>
                {failures.map((item) => (
                  <li key={item.id}>
                    {item.name}: {item.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>

      {previewModal ? (
        <div className="modal-backdrop" onClick={() => setPreviewModal(null)} role="presentation">
          <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <strong>{previewModal.title}</strong>
                <p>{previewModal.meta}</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => setPreviewModal(null)}>
                Close
              </button>
            </div>
            <div className="modal-image-wrap">
              <img src={previewModal.src} alt={previewModal.title} className="modal-image" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

async function compressImage(
  file: File,
  options: {
    quality: number
    maxEdge: number
    outputFormat: OutputFormat
    webpSupported: boolean
  },
): Promise<ProcessedImage> {
  const image = await loadImage(file)
  const targetMime = resolveMimeType(options.outputFormat, options.webpSupported)
  const { width, height } = fitIntoBox(image.naturalWidth, image.naturalHeight, options.maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  if (targetMime === 'image/jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }

  context.drawImage(image, 0, 0, width, height)

  const blob = await canvasToBlob(canvas, targetMime, options.quality / 100)
  const previewUrl = URL.createObjectURL(blob)

  return {
    id: crypto.randomUUID(),
    name: file.name,
    originalBytes: file.size,
    compressedBytes: blob.size,
    width,
    height,
    mimeType: blob.type || targetMime,
    blob,
    previewUrl,
  }
}

function resolveMimeType(format: OutputFormat, webpSupported: boolean) {
  if (format !== 'auto') return format
  return webpSupported ? 'image/webp' : 'image/jpeg'
}

function fitIntoBox(width: number, height: number, maxEdge: number) {
  if (!maxEdge || Math.max(width, height) <= maxEdge) {
    return { width, height }
  }

  const ratio = maxEdge / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image could not be decoded.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The browser failed to encode this image.'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function cleanupResultUrls(items: ProcessedImage[]) {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl))
}

function cleanupSourceUrls(items: SourceImage[]) {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl))
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

function mimeLabel(mimeType: string) {
  return mimeType.replace('image/', '').toUpperCase()
}

function renamedFile(originalName: string, mimeType: string) {
  const dot = originalName.lastIndexOf('.')
  const baseName = dot === -1 ? originalName : originalName.slice(0, dot)
  const extension = mimeType.split('/')[1] ?? 'bin'
  return `${baseName}-compressed.${extension}`
}

export default App
