import type { Node } from '@xyflow/react'
import { useBoardStore } from '@/stores/board-store'
import { useMicroappStore } from '@/stores/microapp-store'
import { ipc } from '@/services/ipc-client'

// ── Example microapp source: Revenue Chart (interactive with filters) ──
const revenueChartSource = `
const allData = [
  { month: 'Jan', region: 'North', revenue: 8200, target: 6500 },
  { month: 'Jan', region: 'South', revenue: 4200, target: 3500 },
  { month: 'Feb', region: 'North', revenue: 10100, target: 7800 },
  { month: 'Feb', region: 'South', revenue: 5700, target: 4200 },
  { month: 'Mar', region: 'North', revenue: 9000, target: 8500 },
  { month: 'Mar', region: 'South', revenue: 5200, target: 4500 },
  { month: 'Apr', region: 'North', revenue: 12100, target: 9000 },
  { month: 'Apr', region: 'South', revenue: 6500, target: 5000 },
  { month: 'May', region: 'North', revenue: 14200, target: 10500 },
  { month: 'May', region: 'South', revenue: 7900, target: 5500 },
  { month: 'Jun', region: 'North', revenue: 12800, target: 12000 },
  { month: 'Jun', region: 'South', revenue: 7000, target: 6000 },
]

const regions = ['All', 'North', 'South']
const [activeRegion, setActiveRegion] = useAppState('region', 'All')
const [showTarget, setShowTarget] = useAppState('showTarget', true)

const filtered = activeRegion === 'All' ? allData : allData.filter(d => d.region === activeRegion)
const byMonth = filtered.reduce((acc, d) => {
  const existing = acc.find(a => a.month === d.month)
  if (existing) { existing.revenue += d.revenue; existing.target += d.target }
  else acc.push({ month: d.month, revenue: d.revenue, target: d.target })
  return acc
}, [])

const total = byMonth.reduce((s, d) => s + d.revenue, 0)
const totalTarget = byMonth.reduce((s, d) => s + d.target, 0)
const attainment = Math.round((total / totalTarget) * 100)
const best = byMonth.reduce((b, d) => d.revenue > b.revenue ? d : b, byMonth[0])

return (
  <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: '11px', opacity: 0.5 }}>H1 2026 &middot; {activeRegion === 'All' ? 'All Regions' : activeRegion + ' Region'}</div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {regions.map(r => (
          <button key={r} onClick={() => setActiveRegion(r)} style={{
            padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
            border: '1px solid ' + (r === activeRegion ? 'var(--color-primary)' : 'var(--color-border)'),
            background: r === activeRegion ? 'var(--color-primary)' : 'transparent',
            color: r === activeRegion ? 'var(--color-primary-foreground)' : 'var(--color-foreground)',
          }}>{r}</button>
        ))}
      </div>
    </div>
    <div style={{ display: 'flex', gap: '8px' }}>
      <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Total Revenue</div>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{utils.formatCurrency(total)}</div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Target Attainment</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: attainment >= 100 ? 'oklch(0.65 0.18 155)' : 'oklch(0.7 0.18 55)' }}>{attainment}%</div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'var(--color-muted)', flex: 1 }}>
        <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Best Month</div>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>{best.month}</div>
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', opacity: 0.7, cursor: 'pointer' }}>
        <input type="checkbox" checked={showTarget} onChange={e => setShowTarget(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
        Show target
      </label>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}>
      <UI.BarChart data={byMonth} dataKey={showTarget ? ['revenue', 'target'] : ['revenue']} nameKey="month" height={220} colors={['oklch(0.65 0.18 250)', 'oklch(0.5 0.05 250)']} />
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
    <div style={{ fontSize: '11px', opacity: 0.5 }}>{leads.length} leads &middot; {utils.formatCurrency(leads.reduce((s, l) => s + l.value, 0))} total</div>
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

function buildNodes(): Node[] {
  return [
    // ── Row 1: Hero + Quick Start ──
    {
      id: 'welcome-hero',
      type: 'stickyNote',
      position: { x: 80, y: -20 },
      style: { width: 360, height: 220 },
      data: {
        label: '',
        content: `Welcome to SparkFlow!\n\nYour AI-powered canvas for building\ninteractive microapps, dashboards,\nand tools — all in one place.\n\nScroll down to see live examples,\nor start creating your own.`,
        color: 'var(--color-sticky-blue)'
      }
    },
    {
      id: 'welcome-quickstart',
      type: 'stickyNote',
      position: { x: 480, y: -20 },
      style: { width: 320, height: 220 },
      data: {
        label: '',
        content: `Getting Started\n\n1.  Press  /  anywhere on the canvas\n2.  Describe what you want to build\n3.  AI generates it instantly\n\nTry asking for:\n"A task tracker with priorities"\n"A weather dashboard"\n"A unit converter"`,
        color: 'var(--color-sticky-green)'
      }
    },

    // ── Row 2: Feature tips ──
    {
      id: 'welcome-data',
      type: 'stickyNote',
      position: { x: 80, y: 240 },
      style: { width: 240, height: 200 },
      data: {
        label: '',
        content: `Data Files\n\nDrag a CSV or Excel file onto\nthe canvas and AI will build\na visualization for it.\n\nYour data stays local — nothing\nis uploaded to any server.`,
        color: 'var(--color-sticky-yellow)'
      }
    },
    {
      id: 'welcome-boards',
      type: 'stickyNote',
      position: { x: 360, y: 240 },
      style: { width: 240, height: 200 },
      data: {
        label: '',
        content: `Boards & Tabs\n\nClick  +  in the tab bar to create\na new board or open an existing one.\n\nDouble-click any tab to rename it.\n\nEach board is its own workspace\nwith separate microapps and data.`,
        color: 'var(--color-sticky-pink)'
      }
    },
    {
      id: 'welcome-context',
      type: 'stickyNote',
      position: { x: 640, y: 240 },
      style: { width: 240, height: 200 },
      data: {
        label: '',
        content: `Right-Click Menu\n\nRight-click anywhere on the\ncanvas to access:\n\n- New sticky note\n- AI microapp builder\n- Data import options\n- And more...`,
        color: 'var(--color-sticky-purple)'
      }
    },

    // ── Row 3: Example microapps ──
    {
      id: 'example-revenue',
      type: 'microapp',
      position: { x: 80, y: 490 },
      data: { microappId: 'example-revenue', name: 'Revenue Overview' },
      style: { width: 540, height: 440 }
    },
    {
      id: 'example-kanban',
      type: 'microapp',
      position: { x: 660, y: 490 },
      data: { microappId: 'example-kanban', name: 'Lead Pipeline' },
      style: { width: 580, height: 440 }
    }
  ]
}

function buildMicroapps(boardId: string) {
  const now = Date.now()
  return [
    {
      id: 'example-revenue',
      boardId,
      name: 'Revenue Overview',
      prompt: 'An interactive revenue dashboard with region filters, target toggle, and KPI cards',
      source: revenueChartSource,
      compiled: null,
      error: null,
      status: 'ready' as const,
      streamingText: '',
      icon: 'chart' as const,
      color: 'blue' as const,
      state: {},
      position: { x: 80, y: 490 },
      size: { width: 540, height: 440 },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'example-kanban',
      boardId,
      name: 'Lead Pipeline',
      prompt: 'A kanban board for tracking sales leads through pipeline stages',
      source: leadKanbanSource,
      compiled: null,
      error: null,
      status: 'ready' as const,
      streamingText: '',
      icon: 'briefcase' as const,
      color: 'purple' as const,
      state: {},
      position: { x: 660, y: 490 },
      size: { width: 580, height: 440 },
      createdAt: now,
      updatedAt: now
    }
  ]
}

// Shared promise so concurrent calls (React strict mode) don't create duplicate boards
let seedPromise: Promise<string | null> | null = null

export async function seedWelcomeBoard(): Promise<void> {
  if (!seedPromise) {
    seedPromise = createAndPersistBoard()
  }
  const boardId = await seedPromise
  if (!boardId) return

  // Hydrate stores (each mount in strict mode needs this)
  const nodes = buildNodes()
  const microapps = buildMicroapps(boardId)
  const microappStore = useMicroappStore.getState()
  for (const m of microapps) {
    if (!microappStore.instances[m.id]) {
      microappStore.addInstance(m)
    }
  }

  useBoardStore.setState({
    currentBoardId: boardId,
    currentBoardName: 'Welcome Board',
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  })

  localStorage.setItem('board-active-id', boardId)
}

async function createAndPersistBoard(): Promise<string | null> {
  const result = await ipc.board.create('Welcome Board')
  if (!result?.id) return null
  const boardId = result.id

  const nodes = buildNodes()
  const microapps = buildMicroapps(boardId)

  await ipc.board.save({
    id: boardId,
    name: 'Welcome Board',
    canvasState: JSON.stringify({ nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    microapps: microapps.map((m) => ({
      id: m.id,
      name: m.name,
      prompt: m.prompt,
      source: m.source,
      state: JSON.stringify(m.state),
      positionX: m.position.x,
      positionY: m.position.y,
      width: m.size.width,
      height: m.size.height,
      icon: m.icon,
      color: m.color
    }))
  })

  return boardId
}
