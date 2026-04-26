import { useState, useEffect } from 'react'
import { Upload } from './components/Upload'
import { Progress } from './components/Progress'
import { QuickRead } from './components/QuickRead'
import { CoreThesisHeader } from './components/CoreThesisHeader'
import { ExpectationRealityPanel } from './components/ExpectationRealityPanel'
import { RatingCard } from './components/RatingCard'
import { SignalFeed } from './components/SignalFeed'
import { PriceChart } from './components/PriceChart'
import { LSEGInsightsPanel } from './components/LSEGInsightsPanel'
import { FinancialsChart } from './components/FinancialsChart'
import { SentimentPanel } from './components/SentimentPanel'
import { CatalystTimeline } from './components/CatalystTimeline'
import { DeltaView } from './components/DeltaView'
import { ThesisTracker } from './components/ThesisTracker'
import { TrackRecordPanel } from './components/TrackRecordPanel'
import { WhatChangedPanel } from './components/WhatChangedPanel'
import { TranscriptDrawer } from './components/TranscriptDrawer'
import { TranscriptProvider } from './context/TranscriptContext'
import { DedupRegistryProvider } from './lib/dedup'
import { useSSE } from './hooks/useSSE'
import { useAnalysis } from './hooks/useAnalysis'
import { ArrowLeft } from 'lucide-react'
import { logger } from './lib/logger'

type View = 'upload' | 'progress' | 'dashboard'

export default function App() {
  const [view, setView] = useState<View>('upload')
  const [jobId, setJobId] = useState<string | null>(null)

  const { events, done } = useSSE(view === 'progress' ? jobId : null)
  const { report, loading, error } = useAnalysis(jobId, done)

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
    if (report && view === 'progress') {
      logger.info('App', `Report ready — transitioning to dashboard | job_id=${jobId}`)
      setView('dashboard')
    }
  }, [report, view, jobId])

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

  return (
    <div className="min-h-screen bg-surface-base">
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
          {report && (
            <div className="rounded-full border border-border bg-surface-card px-4 py-1.5 text-xs text-text-secondary">
              {report.metadata.company_name} ({report.metadata.company_ticker})
              &middot; {report.metadata.event_date.split('T')[0]}
            </div>
          )}
        </div>
      </header>

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

        {view === 'dashboard' && report && (
          <TranscriptProvider utterances={report.transcript_utterances ?? []}>
            <DedupRegistryProvider>
            <div className="mx-auto w-full max-w-[1120px] space-y-6">
              <QuickRead report={report} />

              <CoreThesisHeader signals={report.signals} />

              <TrackRecordPanel
                memory={report.thesis_memory}
                currentThesis={report.signals.core_thesis}
              />

              <ExpectationRealityPanel expectation={report.expectation_reality} />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <RatingCard report={report} />
                <SignalFeed signals={report.signals} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PriceChart
                  priceHistory={report.lseg_data?.price_history ?? []}
                  earningsDate={report.metadata.event_date}
                  prePct={report.market.price_pre_earnings_30d}
                  postPct={report.market.price_post_earnings_10d}
                />
                <FinancialsChart financials={report.financials} />
              </div>

              <LSEGInsightsPanel
                lseg_data={report.lseg_data}
                market={report.market}
                metadata={report.metadata}
              />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SentimentPanel sentiment={report.sentiment} />
                <CatalystTimeline guidance={report.guidance} />
              </div>

              <DeltaView delta={report.delta} />

              <ThesisTracker
                memory={report.thesis_memory}
                currentThesis={report.signals.core_thesis}
              />

              <WhatChangedPanel
                narrative={report.narrative}
                hiddenGems={report.hidden_gems ?? []}
                modelWarnings={report.model_warnings ?? []}
                riskFlags={report.risk_flags ?? []}
              />
            </div>
            </DedupRegistryProvider>
            <TranscriptDrawer />
          </TranscriptProvider>
        )}
      </main>
    </div>
  )
}
