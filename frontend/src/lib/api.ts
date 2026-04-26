import type { AnalysisReport, JobSummary } from '../types/api'
import { logger } from './logger'

const BASE = '/api'

export async function startAnalysis(
  currentFile: File,
  priorFile?: File
): Promise<{ job_id: string; status: string }> {
  logger.info('API', `POST /analysis/start | file=${currentFile.name} (${(currentFile.size / 1024).toFixed(1)} KB)` +
    (priorFile ? ` | prior=${priorFile.name}` : ''))
  const t0 = performance.now()

  const form = new FormData()
  form.append('current_file', currentFile)
  if (priorFile) {
    form.append('prior_file', priorFile)
  }
  const res = await fetch(`${BASE}/analysis/start`, { method: 'POST', body: form })
  const elapsed = (performance.now() - t0).toFixed(0)

  if (!res.ok) {
    const err = await res.json()
    logger.error('API', `POST /analysis/start FAILED | status=${res.status} | ${elapsed}ms`, err)
    throw new Error(err.detail || 'Upload failed')
  }
  const data = await res.json()
  logger.info('API', `POST /analysis/start OK | job_id=${data.job_id} | ${elapsed}ms`)
  return data
}

export async function getResult(jobId: string): Promise<AnalysisReport> {
  logger.info('API', `GET /analysis/${jobId}/result`)
  const t0 = performance.now()

  const res = await fetch(`${BASE}/analysis/${jobId}/result`)
  const elapsed = (performance.now() - t0).toFixed(0)

  if (!res.ok) {
    logger.error('API', `GET /analysis/${jobId}/result FAILED | status=${res.status} | ${elapsed}ms`)
    throw new Error('Failed to fetch result')
  }
  const data = await res.json()
  logger.info('API', `GET /analysis/${jobId}/result OK | ${elapsed}ms | keys=${Object.keys(data).join(',')}`)
  return data
}

export async function getHistory(limit = 20, offset = 0): Promise<JobSummary[]> {
  logger.info('API', `GET /analysis/history?limit=${limit}&offset=${offset}`)
  const res = await fetch(`${BASE}/analysis/history?limit=${limit}&offset=${offset}`)
  if (!res.ok) {
    logger.error('API', `GET /analysis/history FAILED | status=${res.status}`)
    throw new Error('Failed to fetch history')
  }
  return res.json()
}

export async function deleteAnalysis(jobId: string): Promise<void> {
  logger.info('API', `DELETE /analysis/${jobId}`)
  await fetch(`${BASE}/analysis/${jobId}`, { method: 'DELETE' })
}

export async function healthCheck(): Promise<Record<string, string>> {
  logger.info('API', 'GET /health')
  const res = await fetch(`${BASE}/health`)
  return res.json()
}
