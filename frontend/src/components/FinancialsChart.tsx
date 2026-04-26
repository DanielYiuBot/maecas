import type { StatedFigure, StatedFinancials } from '../types/api'

interface Props {
  financials: StatedFinancials
}

export function FinancialsChart({ financials }: Props) {
  const summaryFigures: StatedFigure[] = financials.figures.slice(0, 8)

  return (
    <div className="maecas-card">
      <div className="maecas-card-head">
        <div>
          <p className="maecas-eyebrow">Financials</p>
          <h3 className="maecas-title">Key Financial Figures</h3>
          <p className="maecas-subtitle mt-0.5">Showing stated figures directly.</p>
        </div>
      </div>
      <div className="space-y-2">
        {summaryFigures.map((f, i) => (
          <div key={i} className="flex justify-between border-b border-border pb-2 text-sm">
            <span className="text-text-secondary">{f.label}</span>
            <span className="font-mono font-medium">
              {f.value !== null ? `${f.value} ${f.unit}` : 'N/A'}
              {f.yoy_change !== null && (
                <span className={`ml-2 text-xs ${f.yoy_change >= 0 ? 'text-bull-700' : 'text-bear-700'}`}>
                  {f.yoy_change >= 0 ? '+' : ''}{(f.yoy_change * 100).toFixed(1)}%
                </span>
              )}
            </span>
          </div>
        ))}
        {financials.figures.length === 0 && (
          <p className="text-sm text-text-muted">No financial figures extracted</p>
        )}
      </div>
    </div>
  )
}
