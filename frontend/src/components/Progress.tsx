import { CheckCircle, Loader2, AlertCircle, SkipForward, Clock } from 'lucide-react'
import type { SSEEvent } from '../types/api'

interface Props {
  events: SSEEvent[]
  done: boolean
}

const AGENT_LABELS: Record<string, string> = {
  pipeline: 'Pipeline',
  parse: 'Transcript Parser',
  sentiment: 'Sentiment Analysis',
  financials: 'Financial Extraction',
  lseg_fetch: 'LSEG Market Data',
  market_ctx: 'Market Context',
  guidance: 'Guidance & Catalysts',
  delta: 'Quarter Comparison',
  expectation: 'Expectation Reality',
  alpha: 'Signal Generation',
  orchestrator: 'Final Synthesis',
}

const AGENT_ORDER = [
  'parse', 'sentiment', 'financials', 'lseg_fetch',
  'market_ctx', 'guidance', 'delta', 'expectation', 'alpha', 'orchestrator',
]

const COMPLETED_STATUSES = new Set(['complete', 'skipped'])
const BLOCKING_STATUSES = new Set(['error', 'queued'])

function isComplete(status: string | undefined) {
  return status === 'complete' || status === 'skipped'
}

function canStartAfter(statuses: Array<string | undefined>) {
  return statuses.every((status) => status && !BLOCKING_STATUSES.has(status))
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'complete':
      return <CheckCircle className="h-5 w-5 text-bull-700" />
    case 'running':
      return <Loader2 className="h-5 w-5 animate-spin text-accent-700" />
    case 'error':
      return <AlertCircle className="h-5 w-5 text-bear-700" />
    case 'skipped':
      return <SkipForward className="h-5 w-5 text-text-muted" />
    default:
      return <Clock className="h-5 w-5 text-ink-300" />
  }
}

export function Progress({ events, done }: Props) {
  const latestByAgent = new Map<string, SSEEvent>()
  events.forEach((e) => {
    if (e.agent) latestByAgent.set(e.agent, e)
  })

  const getEvent = (agentKey: string) => latestByAgent.get(agentKey)

  const displayByAgent = new Map(latestByAgent)
  const sentimentStatus = getEvent('sentiment')?.status
  const financialsStatus = getEvent('financials')?.status
  const lsegEvent = getEvent('lseg_fetch')
  const marketEvent = getEvent('market_ctx')

  if (!lsegEvent && canStartAfter([sentimentStatus, financialsStatus])) {
    displayByAgent.set('lseg_fetch', {
      stage: 'lseg',
      agent: 'lseg_fetch',
      status: marketEvent ? 'complete' : 'running',
      progress_pct: marketEvent ? 40 : 35,
      message: marketEvent ? 'LSEG data fetched.' : 'Fetching LSEG market data...',
    })
  }

  if (!marketEvent && isComplete(displayByAgent.get('lseg_fetch')?.status)) {
    displayByAgent.set('market_ctx', {
      stage: 'agents',
      agent: 'market_ctx',
      status: 'running',
      progress_pct: 45,
      message: 'Analyzing market context...',
    })
  }

  const latestEvent = events[events.length - 1]
  const statuses = AGENT_ORDER.map((agentKey) => displayByAgent.get(agentKey)?.status ?? 'queued')

  let contiguousCompleted = 0
  while (
    contiguousCompleted < statuses.length &&
    COMPLETED_STATUSES.has(statuses[contiguousCompleted])
  ) {
    contiguousCompleted += 1
  }

  const activeStatus = statuses[contiguousCompleted]
  const activeStepCredit = activeStatus === 'running' || activeStatus === 'error' ? 0.5 : 0
  const progressPct = latestEvent?.stage === 'complete'
    ? 100
    : Math.round(((contiguousCompleted + activeStepCredit) / AGENT_ORDER.length) * 100)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <p className="maecas-eyebrow">Pipeline</p>
        <h2 className="mt-2 text-3xl font-bold text-ink-900">Analyzing Transcript</h2>
        <p className="mt-1 text-text-secondary">Multi-agent pipeline in progress</p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-surface-card p-4">
        <div className="mb-1 flex justify-between text-sm text-text-secondary">
          <span>Progress</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-accent-700 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {AGENT_ORDER.map((agentKey) => {
          const event = displayByAgent.get(agentKey)
          const status = event?.status ?? 'queued'
          const message = event?.message ?? ''

          return (
            <div
              key={agentKey}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                status === 'running'
                  ? 'border-accent-100 bg-accent-50'
                  : status === 'complete'
                    ? 'border-bull-100 bg-bull-50'
                    : status === 'error'
                      ? 'border-bear-100 bg-bear-50'
                      : 'border-border bg-surface-card'
              }`}
            >
              <StatusIcon status={status} />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {AGENT_LABELS[agentKey] ?? agentKey}
                </p>
                {message && (
                  <p className="mt-0.5 text-xs text-text-secondary">{message}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {done && (
        <p className="mt-6 text-center text-sm text-text-secondary">
          {latestEvent?.stage === 'error' ? 'Pipeline encountered an error' : 'Loading results...'}
        </p>
      )}
    </div>
  )
}
