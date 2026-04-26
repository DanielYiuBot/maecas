import { useState, useEffect } from 'react'
import type { AnalysisReport } from '../types/api'
import { getResult } from '../lib/api'
import { logger } from '../lib/logger'

export function useAnalysis(jobId: string | null, done: boolean) {
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId || !done) return
    logger.info('Analysis', `Fetching report | job_id=${jobId}`)
    setLoading(true)
    getResult(jobId)
      .then((r) => {
        if ('job_id' in r && 'narrative' in r) {
          const sections = ['sentiment', 'financials', 'market', 'guidance', 'delta', 'signals'] as const
          const report = r as AnalysisReport
          const present = sections.filter((s) => report[s] != null)
          logger.info('Analysis', `Report received | job_id=${jobId} | sections=${present.join(',')} | warnings=${report.pipeline_warnings?.length ?? 0}`)
          setReport(r)
        } else {
          logger.warn('Analysis', `Report shape invalid | job_id=${jobId}`, r)
          setError('Analysis not ready or failed')
        }
      })
      .catch((e) => {
        logger.error('Analysis', `Fetch failed | job_id=${jobId} | error=${e.message}`)
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [jobId, done])

  return { report, loading, error }
}
