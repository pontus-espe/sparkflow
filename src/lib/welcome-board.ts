import type { Node } from '@xyflow/react'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'

// ── Example microapp source: Revenue Chart ──
const revenueChartSource = `
const data = [
  { month: 'Jan', revenue: 12400, target: 10000 },
  { month: 'Feb', revenue: 15800, target: 12000 },
  { month: 'Mar', revenue: 14200, target: 13000 },
  { month: 'Apr', revenue: 18600, target: 14000 },
  { month: 'May', revenue: 22100, target: 16000 },
  { month: 'Jun', revenue: 19800, target: 18000 },
]

const total = data.reduce((s, d) => s + d.revenue, 0)
const avg = Math.round(total / data.length)
const growth = Math.round(((data[data.length - 1].revenue - data[0].revenue) / data[0].revenue) * 100)

return (
  <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <div>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>Monthly Revenue</div>
      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>H1 2026 Performance vs Target</div>
    </div>
    <div style={{ display: 'flex', gap: '16px' }}>
      <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5 }}>Total</div>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>{utils.formatCurrency(total)}</div>
      </div>
      <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5 }}>Avg/mo</div>
        <div style={{ fontSize: '16px', fontWeight: 700 }}>{utils.formatCurrency(avg)}</div>
      </div>
      <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5 }}>Growth</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'oklch(0.65 0.18 155)' }}>+{growth}%</div>
      </div>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <UI.BarChart data={data} dataKey={['revenue', 'target']} nameKey="month" height={160} colors={['oklch(0.65 0.18 250)', 'oklch(0.5 0.05 250)']} />
    </div>
  </div>
)
`.trim()

// ── Example microapp source: Lead Kanban ──
const leadKanbanSource = `
const [leads, setLeads] = useAppState('leads', [
  { id: '1', name: 'Acme Corp', value: 45000, stage: 'New', contact: 'Sarah Chen' },
  { id: '2', name: 'TechFlow Inc', value: 28000, stage: 'Contacted', contact: 'Mike Ross' },
  { id: '3', name: 'DataVault', value: 62000, stage: 'Proposal', contact: 'Lisa Park' },
  { id: '4', name: 'CloudNine', value: 15000, stage: 'New', contact: 'Tom Wells' },
  { id: '5', name: 'Nexus AI', value: 89000, stage: 'Proposal', contact: 'Amy Liu' },
  { id: '6', name: 'BrightEdge', value: 33000, stage: 'Contacted', contact: 'Dan Cole' },
  { id: '7', name: 'Pinnacle', value: 51000, stage: 'Won', contact: 'Raj Patel' },
  { id: '8', name: 'Orbit Labs', value: 22000, stage: 'New', contact: 'Jess Kim' },
])

const stages = ['New', 'Contacted', 'Proposal', 'Won']
const stageColors = { New: 'oklch(0.65 0.18 250)', Contacted: 'oklch(0.7 0.18 55)', Proposal: 'oklch(0.65 0.18 300)', Won: 'oklch(0.65 0.18 155)' }

const moveCard = useCallback((id, direction) => {
  setLeads(leads.map(l => {
    if (l.id !== id) return l
    const idx = stages.indexOf(l.stage)
    const next = idx + direction
    if (next < 0 || next >= stages.length) return l
    return { ...l, stage: stages[next] }
  }))
}, [leads, setLeads])

return (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px', gap: '8px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Lead Pipeline</div>
        <div style={{ fontSize: '11px', opacity: 0.5 }}>{leads.length} leads &middot; {utils.formatCurrency(leads.reduce((s, l) => s + l.value, 0))} total</div>
      </div>
    </div>
    <div style={{ flex: 1, display: 'flex', gap: '6px', minHeight: 0, overflow: 'hidden' }}>
      {stages.map(stage => {
        const items = leads.filter(l => l.stage === stage)
        const total = items.reduce((s, l) => s + l.value, 0)
        return (
          <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRadius: '8px', background: 'var(--color-muted)', padding: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageColors[stage] }} />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>{stage}</span>
              </div>
              <span style={{ fontSize: '10px', opacity: 0.5 }}>{items.length}</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {items.map(lead => (
                <div key={lead.id} style={{ background: 'var(--color-card)', borderRadius: '6px', padding: '8px', border: '1px solid var(--color-border)', cursor: 'default' }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '2px' }}>{lead.name}</div>
                  <div style={{ fontSize: '10px', opacity: 0.5 }}>{lead.contact}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{utils.formatCurrency(lead.value)}</span>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {stages.indexOf(lead.stage) > 0 && (
                        <button onClick={() => moveCard(lead.id, -1)} style={{ width: 18, height: 18, borderRadius: '4px', border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-foreground)' }}>&larr;</button>
                      )}
                      {stages.indexOf(lead.stage) < stages.length - 1 && (
                        <button onClick={() => moveCard(lead.id, 1)} style={{ width: 18, height: 18, borderRadius: '4px', border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-foreground)' }}>&rarr;</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.4, textAlign: 'center', padding: '4px 0' }}>{utils.formatCurrency(total)}</div>
          </div>
        )
      })}
    </div>
  </div>
)
`.trim()

export function seedWelcomeBoard() {
  const now = Date.now()

  // ── Sticky notes: instructional cards ──
  const nodes: Node[] = [
    // Hero welcome
    {
      id: 'welcome-hero',
      type: 'stickyNote',
      position: { x: 80, y: -20 },
      style: { width: 340, height: 160 },
      data: {
        label: '',
        content: `Welcome to SparkFlow\n\nYour AI-powered canvas for building interactive microapps, dashboards, and tools.\n\nExplore the examples below, then create your own!`,
        color: 'var(--color-sticky-blue)'
      }
    },

    // Quick start card
    {
      id: 'welcome-quickstart',
      type: 'stickyNote',
      position: { x: 460, y: -20 },
      style: { width: 280, height: 160 },
      data: {
        label: '',
        content: `Quick Start\n\n1. Press  /  or click "New Microapp"\n2. Describe what you want\n3. AI builds it instantly\n\nTry: "A task tracker with priorities"`,
        color: 'var(--color-sticky-green)'
      }
    },

    // Data tip
    {
      id: 'welcome-data',
      type: 'stickyNote',
      position: { x: 80, y: 170 },
      style: { width: 220, height: 120 },
      data: {
        label: '',
        content: `Drop Data Files\n\nDrag a CSV or Excel file here.\nAI will visualize it for you.`,
        color: 'var(--color-sticky-yellow)'
      }
    },

    // Board tips
    {
      id: 'welcome-boards',
      type: 'stickyNote',
      position: { x: 340, y: 170 },
      style: { width: 220, height: 120 },
      data: {
        label: '',
        content: `Multiple Boards\n\nClick + in the tab bar above\nto create or switch boards.\nDouble-click a tab to rename.`,
        color: 'var(--color-sticky-pink)'
      }
    },

    // Context menu tip
    {
      id: 'welcome-context',
      type: 'stickyNote',
      position: { x: 600, y: 170 },
      style: { width: 220, height: 120 },
      data: {
        label: '',
        content: `Right-Click Menu\n\nRight-click anywhere for\nsticky notes, AI microapps,\nand data import options.`,
        color: 'var(--color-sticky-purple)'
      }
    },

    // ── Example microapp nodes ──
    {
      id: 'example-revenue',
      type: 'microapp',
      position: { x: 80, y: 340 },
      data: { microappId: 'example-revenue', name: 'Monthly Revenue' },
      style: { width: 500, height: 380 }
    },
    {
      id: 'example-kanban',
      type: 'microapp',
      position: { x: 620, y: 340 },
      data: { microappId: 'example-kanban', name: 'Lead Pipeline' },
      style: { width: 580, height: 420 }
    }
  ]

  // ── Register microapp instances ──
  const microappStore = useMicroappStore.getState()

  microappStore.addInstance({
    id: 'example-revenue',
    boardId: 'default',
    name: 'Monthly Revenue',
    prompt: 'A revenue chart showing monthly performance vs targets with summary stats',
    source: revenueChartSource,
    compiled: null,
    error: null,
    status: 'ready',
    streamingText: '',
    icon: 'chart',
    color: 'blue',
    state: {},
    position: { x: 80, y: 340 },
    size: { width: 500, height: 380 },
    createdAt: now,
    updatedAt: now
  })

  microappStore.addInstance({
    id: 'example-kanban',
    boardId: 'default',
    name: 'Lead Pipeline',
    prompt: 'A kanban board for tracking sales leads through pipeline stages',
    source: leadKanbanSource,
    compiled: null,
    error: null,
    status: 'ready',
    streamingText: '',
    icon: 'briefcase',
    color: 'purple',
    state: {},
    position: { x: 620, y: 340 },
    size: { width: 580, height: 420 },
    createdAt: now,
    updatedAt: now
  })

  // ── Set board state ──
  useBoardStore.setState({
    currentBoardId: 'default',
    currentBoardName: 'Welcome Board',
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  })
}
