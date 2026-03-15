import React from 'react'

const COLORS = [
  'oklch(0.65 0.18 250)', // blue
  'oklch(0.65 0.18 155)', // green
  'oklch(0.7 0.18 55)',   // orange
  'oklch(0.65 0.18 300)', // purple
  'oklch(0.6 0.2 25)',    // red
  'oklch(0.65 0.18 340)', // pink
  'oklch(0.75 0.15 85)',  // yellow
  'oklch(0.65 0.15 190)', // teal
]

function getColor(i: number, custom?: string) {
  return custom || COLORS[i % COLORS.length]
}

// ── Shared axis helpers ──

function XAxis({ labels, width, height, padding }: {
  labels: string[], width: number, height: number, padding: { left: number, right: number, bottom: number }
}) {
  const usable = width - padding.left - padding.right
  const step = labels.length > 1 ? usable / (labels.length - 1) : usable / 2
  return (
    <>
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="currentColor" opacity={0.15} />
      {labels.map((l, i) => (
        <text
          key={i}
          x={padding.left + (labels.length > 1 ? i * step : usable / 2)}
          y={height - padding.bottom + 14}
          textAnchor="middle"
          fill="currentColor"
          opacity={0.5}
          fontSize={10}
        >
          {l.length > 10 ? l.slice(0, 9) + '…' : l}
        </text>
      ))}
    </>
  )
}

function YAxis({ min, max, height, padding, width }: {
  min: number, max: number, height: number, padding: { top: number, bottom: number, left: number }, width: number
}) {
  const ticks = 4
  const usable = height - padding.top - padding.bottom
  return (
    <>
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="currentColor" opacity={0.15} />
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const val = min + (max - min) * (i / ticks)
        const y = height - padding.bottom - (usable * i) / ticks
        return (
          <React.Fragment key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.left} y2={y} stroke="currentColor" opacity={0.06} />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="currentColor" opacity={0.5} fontSize={10}>
              {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Number.isInteger(val) ? val : val.toFixed(1)}
            </text>
          </React.Fragment>
        )
      })}
    </>
  )
}

// ── BarChart ──

interface BarChartProps {
  data: Record<string, unknown>[]
  dataKey: string | string[]
  nameKey?: string
  colors?: string[]
  height?: number
  className?: string
}

export function BarChart({ data, dataKey, nameKey, colors, height = 200, className }: BarChartProps) {
  const keys = Array.isArray(dataKey) ? dataKey : [dataKey]
  const nk = nameKey || Object.keys(data[0] || {}).find((k) => !keys.includes(k)) || ''
  const labels = data.map((d) => String(d[nk] ?? ''))
  const allVals = data.flatMap((d) => keys.map((k) => Number(d[k]) || 0))
  const max = Math.max(...allVals, 0) * 1.1 || 1
  const min = 0

  const pad = { top: 12, bottom: 28, left: 44, right: 12 }
  const width = 400
  const usableW = width - pad.left - pad.right
  const usableH = height - pad.top - pad.bottom
  const barGroupWidth = usableW / data.length
  const barWidth = Math.min(barGroupWidth * 0.7 / keys.length, 40)
  const gap = (barGroupWidth - barWidth * keys.length) / 2

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={{ width: '100%', height }}>
      <YAxis min={min} max={max} height={height} padding={pad} width={width} />
      <XAxis labels={labels} width={width} height={height} padding={pad} />
      {data.map((d, i) =>
        keys.map((k, ki) => {
          const val = Number(d[k]) || 0
          const barH = (val / max) * usableH
          const x = pad.left + i * barGroupWidth + gap + ki * barWidth
          const y = height - pad.bottom - barH
          return (
            <rect key={`${i}-${ki}`} x={x} y={y} width={barWidth} height={barH} rx={2} fill={getColor(ki, colors?.[ki])} opacity={0.85}>
              <title>{`${k}: ${val}`}</title>
            </rect>
          )
        })
      )}
      {keys.length > 1 && (
        <g transform={`translate(${pad.left}, ${height - 8})`}>
          {keys.map((k, i) => (
            <g key={k} transform={`translate(${i * 70}, 0)`}>
              <rect width={8} height={8} rx={2} fill={getColor(i, colors?.[i])} />
              <text x={12} y={7} fontSize={9} fill="currentColor" opacity={0.6}>{k}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

// ── LineChart ──

interface LineChartProps {
  data: Record<string, unknown>[]
  lines: { dataKey: string; color?: string; label?: string }[]
  nameKey?: string
  height?: number
  className?: string
}

export function LineChart({ data, lines, nameKey, height = 200, className }: LineChartProps) {
  const nk = nameKey || Object.keys(data[0] || {}).find((k) => !lines.some((l) => l.dataKey === k)) || ''
  const labels = data.map((d) => String(d[nk] ?? ''))
  const allVals = data.flatMap((d) => lines.map((l) => Number(d[l.dataKey]) || 0))
  const max = Math.max(...allVals, 0) * 1.1 || 1
  const min = Math.min(...allVals, 0)
  const range = max - min || 1

  const pad = { top: 12, bottom: 28, left: 44, right: 12 }
  const width = 400
  const usableW = width - pad.left - pad.right
  const usableH = height - pad.top - pad.bottom

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={{ width: '100%', height }}>
      <YAxis min={min} max={max} height={height} padding={pad} width={width} />
      <XAxis labels={labels} width={width} height={height} padding={pad} />
      {lines.map((line, li) => {
        const color = getColor(li, line.color)
        const points = data.map((d, i) => {
          const val = Number(d[line.dataKey]) || 0
          const x = pad.left + (data.length > 1 ? (i / (data.length - 1)) * usableW : usableW / 2)
          const y = height - pad.bottom - ((val - min) / range) * usableH
          return `${x},${y}`
        })
        return (
          <React.Fragment key={li}>
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => {
              const val = Number(d[line.dataKey]) || 0
              const x = pad.left + (data.length > 1 ? (i / (data.length - 1)) * usableW : usableW / 2)
              const y = height - pad.bottom - ((val - min) / range) * usableH
              return <circle key={i} cx={x} cy={y} r={3} fill={color}><title>{`${line.dataKey}: ${val}`}</title></circle>
            })}
          </React.Fragment>
        )
      })}
      {lines.length > 1 && (
        <g transform={`translate(${pad.left}, ${height - 8})`}>
          {lines.map((l, i) => (
            <g key={l.dataKey} transform={`translate(${i * 70}, 0)`}>
              <line x1={0} y1={4} x2={10} y2={4} stroke={getColor(i, l.color)} strokeWidth={2} />
              <text x={14} y={7} fontSize={9} fill="currentColor" opacity={0.6}>{l.label || l.dataKey}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

// ── AreaChart ──

interface AreaChartProps {
  data: Record<string, unknown>[]
  dataKey: string | string[]
  nameKey?: string
  colors?: string[]
  height?: number
  className?: string
}

export function AreaChart({ data, dataKey, nameKey, colors, height = 200, className }: AreaChartProps) {
  const keys = Array.isArray(dataKey) ? dataKey : [dataKey]
  const nk = nameKey || Object.keys(data[0] || {}).find((k) => !keys.includes(k)) || ''
  const labels = data.map((d) => String(d[nk] ?? ''))
  const allVals = data.flatMap((d) => keys.map((k) => Number(d[k]) || 0))
  const max = Math.max(...allVals, 0) * 1.1 || 1
  const min = Math.min(...allVals, 0)
  const range = max - min || 1

  const pad = { top: 12, bottom: 28, left: 44, right: 12 }
  const width = 400
  const usableW = width - pad.left - pad.right
  const usableH = height - pad.top - pad.bottom
  const baseline = height - pad.bottom

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} style={{ width: '100%', height }}>
      <YAxis min={min} max={max} height={height} padding={pad} width={width} />
      <XAxis labels={labels} width={width} height={height} padding={pad} />
      {keys.map((k, ki) => {
        const color = getColor(ki, colors?.[ki])
        const points = data.map((d, i) => {
          const val = Number(d[k]) || 0
          const x = pad.left + (data.length > 1 ? (i / (data.length - 1)) * usableW : usableW / 2)
          const y = baseline - ((val - min) / range) * usableH
          return { x, y }
        })
        const linePath = points.map((p) => `${p.x},${p.y}`).join(' ')
        const areaPath = `${pad.left},${baseline} ${linePath} ${points[points.length - 1]?.x ?? pad.left},${baseline}`
        return (
          <React.Fragment key={ki}>
            <polygon points={areaPath} fill={color} opacity={0.15} />
            <polyline points={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </React.Fragment>
        )
      })}
    </svg>
  )
}

// ── PieChart ──

interface PieChartProps {
  data: { name: string; value: number; color?: string }[]
  colors?: string[]
  height?: number
  className?: string
  showLabels?: boolean
}

export function PieChart({ data, colors, height = 200, className, showLabels = true }: PieChartProps) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0) || 1
  const size = height
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.35

  let cumAngle = -Math.PI / 2
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const midAngle = startAngle + angle / 2
    const color = d.color || getColor(i, colors?.[i])
    return { d: d, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`, color, midAngle, pct: ((d.value / total) * 100).toFixed(0) }
  })

  const legendX = size + 8
  const viewW = showLabels ? size + 120 : size

  return (
    <svg viewBox={`0 0 ${viewW} ${size}`} className={className} style={{ width: '100%', height }}>
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} opacity={0.85} stroke="var(--color-card)" strokeWidth={1.5}>
          <title>{`${s.d.name}: ${s.d.value} (${s.pct}%)`}</title>
        </path>
      ))}
      {showLabels && slices.map((s, i) => (
        <g key={`l${i}`} transform={`translate(${legendX}, ${16 + i * 16})`}>
          <rect width={8} height={8} rx={2} fill={s.color} />
          <text x={12} y={7} fontSize={10} fill="currentColor" opacity={0.7}>
            {s.d.name.length > 12 ? s.d.name.slice(0, 11) + '…' : s.d.name} ({s.pct}%)
          </text>
        </g>
      ))}
    </svg>
  )
}
