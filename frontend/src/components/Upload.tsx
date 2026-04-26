import { useState, useCallback } from 'react'
import { Upload as UploadIcon, FileText, X, AlertCircle } from 'lucide-react'
import { startAnalysis } from '../lib/api'

interface Props {
  onJobStarted: (jobId: string) => void
}

export function Upload({ onJobStarted }: Props) {
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [priorFile, setPriorFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const validateFile = (file: File): boolean => {
    if (!file.name.endsWith('.xml')) {
      setError('Only .xml files are accepted')
      return false
    }
    setError(null)
    return true
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0 && validateFile(files[0])) {
      setCurrentFile(files[0])
    }
    if (files.length > 1 && validateFile(files[1])) {
      setPriorFile(files[1])
    }
  }, [])

  const handleSubmit = async () => {
    if (!currentFile) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await startAnalysis(currentFile, priorFile || undefined)
      onJobStarted(result.job_id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <p className="maecas-eyebrow">Analysis Intake</p>
        <h1 className="mt-2 text-4xl font-bold text-ink-900">MAECAS</h1>
        <p className="maecas-subtitle mt-2">Multi-Agent Earnings Call Analysis System</p>
      </div>

      <div
        className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? 'border-accent-500 bg-accent-50' : 'border-border-strong bg-surface-card hover:border-accent-300'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <UploadIcon className="mx-auto mb-4 h-12 w-12 text-text-muted" />
        <p className="mb-2 text-lg font-medium text-text-primary">
          Drop earnings call transcript XML here
        </p>
        <p className="mb-4 text-sm text-text-secondary">or click to browse</p>
        <input
          type="file"
          accept=".xml"
          className="hidden"
          id="current-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f && validateFile(f)) setCurrentFile(f)
          }}
        />
        <label
          htmlFor="current-file"
          className="inline-block cursor-pointer rounded-lg bg-accent-700 px-6 py-2 text-sm font-medium text-white transition hover:bg-accent-900"
        >
          Select Current Quarter XML
        </label>
      </div>

      {currentFile && (
        <div className="maecas-card mt-4 flex items-center gap-3 p-3">
          <FileText className="h-5 w-5 text-accent-700" />
          <span className="flex-1 text-sm font-medium">{currentFile.name}</span>
          <button onClick={() => setCurrentFile(null)} className="text-text-muted transition hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <p className="mb-2 text-sm text-text-secondary">Optional: Prior quarter transcript for QoQ comparison</p>
        <input
          type="file"
          accept=".xml"
          className="hidden"
          id="prior-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f && validateFile(f)) setPriorFile(f)
          }}
        />
        <label
          htmlFor="prior-file"
          className="inline-block cursor-pointer rounded-lg border border-border-strong bg-surface-card px-4 py-1.5 text-sm text-text-secondary transition hover:bg-surface-muted"
        >
          Select Prior Quarter XML
        </label>
        {priorFile && (
          <div className="mt-2 flex justify-center">
            <div className="maecas-card flex w-full max-w-xl items-center gap-3 p-3 text-left">
              <FileText className="h-5 w-5 text-text-muted" />
              <span className="flex-1 text-sm">{priorFile.name}</span>
              <button onClick={() => setPriorFile(null)} className="text-text-muted transition hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-bear-100 bg-bear-50 p-3 text-sm text-bear-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!currentFile || submitting}
        className="mt-6 w-full rounded-xl bg-accent-700 py-3 font-medium text-white transition hover:bg-accent-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Uploading...' : 'Analyze Transcript'}
      </button>
    </div>
  )
}
