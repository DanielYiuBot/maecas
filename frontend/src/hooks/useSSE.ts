import { useEffect, useState } from 'react'
import type { SSEEvent } from '../types/api'
import { logger } from '../lib/logger'

export function useSSE(jobId: string | null) {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    // New job => clear stale progress from any previous run.
    setEvents([])
    setDone(false)
    if (!jobId) return
    logger.info('SSE', `Connecting | job_id=${jobId}`)
    const es = new EventSource(`/api/analysis/${jobId}/stream`)

    es.onopen = () => {
      logger.info('SSE', `Connected | job_id=${jobId}`)
    }

    es.onmessage = (e) => {
      const evt: SSEEvent = JSON.parse(e.data)
      logger.info('SSE', `Event | stage=${evt.stage} | agent=${evt.agent} | status=${evt.status} | pct=${evt.progress_pct} | msg=${evt.message}`)
      if (evt.stage !== 'heartbeat') {
        setEvents((prev) => [...prev, evt])
      }
      if (evt.stage === 'complete' || evt.stage === 'error') {
        logger.info('SSE', `Stream ended | job_id=${jobId} | stage=${evt.stage}`)
        setDone(true)
        es.close()
      }
    }
    es.onerror = () => {
      logger.error('SSE', `Connection interrupted; browser will retry | job_id=${jobId}`)
    }
    return () => {
      logger.info('SSE', `Cleanup | job_id=${jobId}`)
      es.close()
    }
  }, [jobId])

  return { events, done }
}
