import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Upload } from './components/Upload'
import { Progress } from './components/Progress'
import { DecisionStrip } from './components/DecisionStrip'
import { DecisionPanel } from './components/DecisionPanel'
import { SummaryPanel } from './components/SummaryPanel'
import { LSEGInsightsPanel } from './components/LSEGInsightsPanel'
import { SentimentPanel } from './components/SentimentPanel'
import { QoQPanel } from './components/QoQPanel'
import { GuidancePanel } from './components/GuidancePanel'
import { TranscriptDrawer } from './components/TranscriptDrawer'
import { MethodologyDrawer } from './components/MethodologyDrawer'
import { TranscriptProvider } from './context/TranscriptContext'
import { MethodologyProvider } from './context/MethodologyContext'
import { DedupRegistryProvider } from './lib/dedup'
import { useSSE } from './hooks/useSSE'
import { useAnalysis } from './hooks/useAnalysis'
import { logger } from './lib/logger'

type View = 'upload' | 'progress' | 'dashboard'

export default function App() {
  const [view, setView] = useState<View>('upload')
  const [jobId, setJobId] = useState<string | null>(null)

  const { events, done } = useSSE(view === 'progress' ? jobId : null)
  const { report, loading, error } = useAnalysis(jobId, done)
  const currentReport = report?.job_id === jobId ? report : null

  useEffect(() => {
    logger.info('App', 'MAECAS frontend loaded | view=upload')
  }, [])

  const handleJobStarted = (id: string) => {
    logger.info('App', `Job started | job_id=${id}`)
    setJobId(id)
    setView('progress')
    logger.info('App', 'View transition: upload -> progress')
  }

  useEffect(() => {
    if (currentReport && view === 'progress') {
      logger.info('App', `Report ready — transitioning to dashboard | job_id=${jobId}`)
      setView('dashboard')
    }
  }, [currentReport, view, jobId])

  useEffect(() => {
    if (error) {
      logger.error('App', `Pipeline error | job_id=${jobId} | error=${error}`)
    }
  }, [error, jobId])

  const handleReset = () => {
    logger.info('App', `Reset | returning to upload from ${view}`)
    setView('upload')
    setJobId(null)
  }

  // Pre-dashboard views keep the simple branded header. The dashboard view
  // swaps in the persistent DecisionStrip so the verdict and LSEG surprise
  // are always visible while scrolling.
  const showLightHeader = view !== 'dashboard' || !currentReport

  return (
    <div className="min-h-screen bg-surface-base">
      {showLightHeader && (
        <header className="sticky top-0 z-20 border-b border-border bg-bone-50/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              {view !== 'upload' && (
                <button
                  onClick={handleReset}
                  className="rounded-md border border-border px-2 py-1 text-text-muted transition hover:bg-surface-muted hover:text-text-primary"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-bold">MAECAS</h1>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Earnings Intelligence Console</p>
              </div>
            </div>
          </div>
        </header>
      )}

      {view === 'dashboard' && currentReport && (
        <DecisionStrip report={currentReport} onReset={handleReset} />
      )}

      <main className="w-full px-4 py-8 sm:px-6">
        {view === 'upload' && (
          <div className="mx-auto flex w-full max-w-3xl justify-center">
            <div className="w-full">
              <Upload onJobStarted={handleJobStarted} />
            </div>
          </div>
        )}

        {view === 'progress' && (
          <div className="mx-auto flex w-full max-w-3xl justify-center">
            <div className="w-full">
              <Progress events={events} done={done} />
            </div>
          </div>
        )}

        {view === 'progress' && done && loading && (
          <p className="mt-4 text-center text-sm text-text-secondary">Loading report...</p>
        )}

        {view === 'progress' && error && (
          <div className="mt-4 text-center">
            <p className="text-sm text-bear-700">{error}</p>
            <button onClick={handleReset} className="mt-2 text-sm text-accent-700 underline">
              Try again
            </button>
          </div>
        )}

        {view === 'dashboard' && currentReport && (
          <TranscriptProvider utterances={currentReport.transcript_utterances ?? []}>
            <MethodologyProvider entries={currentReport.methodology ?? []}>
              <DedupRegistryProvider>
                <div className="mx-auto w-full max-w-[1120px] space-y-6">
                  <DecisionPanel signals={currentReport.signals} riskFlags={currentReport.risk_flags ?? []} />
                  <SummaryPanel report={currentReport} />
                  <LSEGInsightsPanel
                    lseg_data={currentReport.lseg_data}
                    market={currentReport.market}
                    metadata={currentReport.metadata}
                    financials={currentReport.financials}
                  />
                  <SentimentPanel sentiment={currentReport.sentiment} />
                  <QoQPanel delta={currentReport.delta} />
                  <GuidancePanel guidance={currentReport.guidance} />
                </div>
              </DedupRegistryProvider>
              <TranscriptDrawer />
              <MethodologyDrawer />
            </MethodologyProvider>
          </TranscriptProvider>
        )}
      </main>
    </div>
  )
}
