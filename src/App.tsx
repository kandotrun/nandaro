import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import JSZip from 'jszip'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
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

type AudioSource = {
  file: File
  name: string
  size: number
  previewUrl: string
}

type AudioResult = {
  name: string
  originalBytes: number
  convertedBytes: number
  bitrateKbps: number
  blob: Blob
  previewUrl: string
  mimeType: string
}

const OUTPUT_OPTIONS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'image/webp', label: 'WebP' },
  { value: 'image/jpeg', label: 'JPEG' },
]

const MAX_EDGE_OPTIONS = [0, 1024, 1600, 2048, 2560, 3840]
const AUDIO_BITRATE_OPTIONS = [64, 96, 128, 192]
const FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd'

let ffmpegPromise: Promise<FFmpeg> | null = null

function App() {
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)

  const [sourceImages, setSourceImages] = useState<SourceImage[]>([])
  const [results, setResults] = useState<ProcessedImage[]>([])
  const [failures, setFailures] = useState<FailedImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [audioDragging, setAudioDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [quality, setQuality] = useState(78)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('auto')
  const [maxEdge, setMaxEdge] = useState(2048)
  const [previewModal, setPreviewModal] = useState<PreviewModal | null>(null)
  const [activeTab, setActiveTab] = useState<'image' | 'audio'>('image')

  const [audioSource, setAudioSource] = useState<AudioSource | null>(null)
  const [audioResult, setAudioResult] = useState<AudioResult | null>(null)
  const [audioBitrate, setAudioBitrate] = useState(128)
  const [audioStatus, setAudioStatus] = useState('')
  const [audioError, setAudioError] = useState('')
  const [isAudioProcessing, setIsAudioProcessing] = useState(false)

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

  useEffect(() => {
    return () => {
      if (audioSource) {
        URL.revokeObjectURL(audioSource.previewUrl)
      }
      if (audioResult) {
        URL.revokeObjectURL(audioResult.previewUrl)
      }
    }
  }, [audioSource, audioResult])

  const totalOriginal = results.reduce((sum, item) => sum + item.originalBytes, 0)
  const totalCompressed = results.reduce((sum, item) => sum + item.compressedBytes, 0)
  const savedBytes = Math.max(totalOriginal - totalCompressed, 0)
  const savingsRate = totalOriginal > 0 ? Math.round((savedBytes / totalOriginal) * 100) : 0

  const handleBrowseImages = () => imageInputRef.current?.click()
  const handleBrowseAudio = () => audioInputRef.current?.click()

  const handleImageFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      replaceSourceFiles(files)
    }
    event.target.value = ''
  }

  const handleAudioFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(event.target.files ?? []).find((item) => item.type.startsWith('audio/'))
    if (file) {
      replaceAudioFile(file)
    }
    event.target.value = ''
  }

  const handleImageDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      replaceSourceFiles(files)
    }
  }

  const handleAudioDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setAudioDragging(false)
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('audio/'))
    if (file) {
      replaceAudioFile(file)
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

  const replaceAudioFile = (file: File) => {
    if (audioSource) {
      URL.revokeObjectURL(audioSource.previewUrl)
    }
    if (audioResult) {
      URL.revokeObjectURL(audioResult.previewUrl)
    }

    setAudioSource({
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
    })
    setAudioResult(null)
    setAudioError('')
    setAudioStatus('Ready to convert')
  }

  const clearAllImages = () => {
    cleanupResultUrls(results)
    cleanupSourceUrls(sourceImages)
    setSourceImages([])
    setResults([])
    setFailures([])
    setPreviewModal(null)
  }

  const clearAudio = () => {
    if (audioSource) {
      URL.revokeObjectURL(audioSource.previewUrl)
    }
    if (audioResult) {
      URL.revokeObjectURL(audioResult.previewUrl)
    }
    setAudioSource(null)
    setAudioResult(null)
    setAudioStatus('')
    setAudioError('')
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

  const processAudio = async () => {
    if (!audioSource || isAudioProcessing) return

    setIsAudioProcessing(true)
    setAudioError('')
    setAudioStatus('Loading audio engine… first run is slower')

    if (audioResult) {
      URL.revokeObjectURL(audioResult.previewUrl)
      setAudioResult(null)
    }

    try {
      const converted = await convertAudioToMp3(audioSource.file, audioBitrate, (status) => setAudioStatus(status))
      setAudioResult(converted)
      setAudioStatus('Done')
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Audio conversion failed')
      setAudioStatus('')
    } finally {
      setIsAudioProcessing(false)
    }
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

  const downloadAudio = () => {
    if (!audioResult) return
    const link = document.createElement('a')
    link.href = audioResult.previewUrl
    link.download = audioResult.name.replace(/\.[^.]+$/, '') + '-compressed.mp3'
    link.click()
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
            <h1>Compress media in your browser.</h1>
            <p className="hero-copy">
              No upload wait, no server-side media processing, no metadata leakage from the original file.
              Everything happens in your browser.
            </p>
          </div>
        </section>

        <section className="tab-bar card">
          <button
            type="button"
            className={`tab-button ${activeTab === 'image' ? 'active' : ''}`}
            onClick={() => setActiveTab('image')}
          >
            Image Compress
          </button>
          <button
            type="button"
            className={`tab-button ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            Audio Converter
          </button>
        </section>

        {activeTab === 'image' ? (
          <>
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
                  onDrop={handleImageDrop}
                >
                  <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageFileInput} hidden />
                  <div className="dropzone-copy">
                    <strong>Drop images here</strong>
                    <span>or</span>
                    <button type="button" className="secondary-button" onClick={handleBrowseImages}>
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
                    <h2>2. Image settings</h2>
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
                  <button type="button" className="ghost-button" onClick={clearAllImages} disabled={isProcessing && sourceImages.length === 0}>
                    Clear
                  </button>
                </div>
              </div>
            </section>

            <section className="card stack-lg">
              <div className="section-head">
                <div>
                  <h2>3. Image results</h2>
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
          </>
        ) : null}

        {activeTab === 'audio' ? (
          <section className="card stack-lg">
            <div className="section-head">
              <div>
                <h2>Audio converter</h2>
                <p>M4A, AAC, WAV, MP3 and other browser-readable audio can be converted to MP3 locally.</p>
              </div>
              {audioSource ? <span className="pill">1 file</span> : null}
            </div>

            <div className="audio-grid">
              <div className="stack-lg">
                <label
                  className={`dropzone ${audioDragging ? 'dragging' : ''}`}
                  onDragEnter={() => setAudioDragging(true)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setAudioDragging(false)}
                  onDrop={handleAudioDrop}
                >
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*,.m4a,.aac,.mp3,.wav,.ogg,.webm"
                    onChange={handleAudioFileInput}
                    hidden
                  />
                  <div className="dropzone-copy">
                    <strong>Drop one audio file here</strong>
                    <span>or</span>
                    <button type="button" className="secondary-button" onClick={handleBrowseAudio}>
                      Choose audio
                    </button>
                  </div>
                </label>

                {audioSource ? (
                  <article className="audio-file-card">
                    <div className="audio-file-head">
                      <div>
                        <strong>{audioSource.name}</strong>
                        <p className="muted">{formatBytes(audioSource.size)} · source</p>
                      </div>
                    </div>
                    <audio controls src={audioSource.previewUrl} className="audio-player" />
                  </article>
                ) : (
                  <p className="muted">No audio loaded yet.</p>
                )}
              </div>

              <div className="stack-lg">
                <div className="controls audio-controls">
                  <label>
                    <span>Output</span>
                    <select value="mp3" disabled>
                      <option value="mp3">MP3</option>
                    </select>
                  </label>

                  <label>
                    <span>Bitrate</span>
                    <select value={audioBitrate} onChange={(event) => setAudioBitrate(Number(event.target.value))}>
                      {AUDIO_BITRATE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value} kbps
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="note-box">
                  <strong>Reality check</strong>
                  <p>
                    This stays browser-only, which is great for privacy, but 200MB files still hit local memory and CPU hard.
                    Desktop should be fine. Older phones may struggle.
                  </p>
                </div>

                <div className="action-row">
                  <button type="button" className="primary-button" onClick={processAudio} disabled={!audioSource || isAudioProcessing}>
                    {isAudioProcessing ? 'Converting…' : 'Convert to MP3'}
                  </button>
                  <button type="button" className="ghost-button" onClick={clearAudio}>
                    Clear
                  </button>
                </div>

                {audioStatus ? (
                  <div className="summary-bar">
                    <span>{audioStatus}</span>
                    {audioSource ? <span>{formatBytes(audioSource.size)} source</span> : null}
                  </div>
                ) : null}

                {audioError ? (
                  <div className="error-box">
                    <strong>Audio conversion failed</strong>
                    <p>{audioError}</p>
                  </div>
                ) : null}

                {audioResult ? (
                  <article className="audio-result-card">
                    <div className="audio-file-head">
                      <div>
                        <strong>{audioResult.name.replace(/\.[^.]+$/, '')}-compressed.mp3</strong>
                        <p className="muted">MP3 · {audioResult.bitrateKbps} kbps</p>
                      </div>
                      <button type="button" className="primary-button" onClick={downloadAudio}>
                        Download MP3
                      </button>
                    </div>
                    <div className="stat-grid audio-stat-grid">
                      <div>
                        <span>Original</span>
                        <strong>{formatBytes(audioResult.originalBytes)}</strong>
                      </div>
                      <div>
                        <span>Converted</span>
                        <strong>{formatBytes(audioResult.convertedBytes)}</strong>
                      </div>
                      <div>
                        <span>Delta</span>
                        <strong>{formatDelta(audioResult.originalBytes, audioResult.convertedBytes)}</strong>
                      </div>
                    </div>
                    <audio controls src={audioResult.previewUrl} className="audio-player" />
                  </article>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
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

async function convertAudioToMp3(file: File, bitrateKbps: number, onStatus: (status: string) => void): Promise<AudioResult> {
  const ffmpeg = await getFfmpeg()
  const inputName = makeSafeFileName(file.name)
  const outputName = `${stripExtension(inputName)}-compressed.mp3`

  onStatus('Reading audio file…')
  await ffmpeg.writeFile(inputName, await fetchFile(file))

  try {
    onStatus(`Converting to MP3 at ${bitrateKbps} kbps…`)
    await ffmpeg.exec(['-i', inputName, '-vn', '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`, outputName])

    const data = await ffmpeg.readFile(outputName)
    const buffer = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
    const copied = new Uint8Array(buffer.byteLength)
    copied.set(buffer)
    const blob = new Blob([copied], { type: 'audio/mpeg' })

    return {
      name: file.name,
      originalBytes: file.size,
      convertedBytes: blob.size,
      bitrateKbps,
      blob,
      previewUrl: URL.createObjectURL(blob),
      mimeType: 'audio/mpeg',
    }
  } finally {
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}

async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })().catch((error) => {
      ffmpegPromise = null
      throw error
    })
  }

  return ffmpegPromise
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

async function safeDelete(ffmpeg: FFmpeg, path: string) {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // ignore cleanup failure
  }
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

function formatDelta(before: number, after: number) {
  const delta = after - before
  const sign = delta > 0 ? '+' : ''
  return `${sign}${formatBytes(delta)}`
}

function mimeLabel(mimeType: string) {
  return mimeType.replace('image/', '').toUpperCase()
}

function renamedFile(originalName: string, mimeType: string) {
  const baseName = stripExtension(originalName)
  const extension = mimeType.split('/')[1] ?? 'bin'
  return `${baseName}-compressed.${extension}`
}

function stripExtension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

function makeSafeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

export default App
