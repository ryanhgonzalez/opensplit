import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore, selectCurrentUser } from '../store';
import { formatCurrency } from '../utils';
import { getShareForUser } from '../utils/expense';
import GlassCard from '../components/GlassCard';
import {
  type Period,
  type ViewMode,
  type CategoryBreakdown,
  type MonthlyPoint,
  type GroupContribution,
  filterByPeriod,
  getCategoryBreakdown,
  getMonthlyTrend,
  getGroupContributions,
} from '../lib/analytics';
import './Insights.css';

// ── Animation variants ────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: Period }[] = [
  { label: '1M', value: 1 },
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: 'All', value: 0 },
];

function fmtShort(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

// ── DonutChart ────────────────────────────────────────────────────────────────

const DonutChart: React.FC<{ data: CategoryBreakdown[]; total: number }> = ({ data, total }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const CX = 100, CY = 100, OR = 80, IR = 56;

  const p2c = (angle: number, r: number) => ({
    x: CX + r * Math.sin(angle),
    y: CY - r * Math.cos(angle),
  });

  const makeArc = (sa: number, ea: number, isHov: boolean): string | null => {
    const gap = data.length > 1 ? 0.04 : 0;
    const s = sa + gap, e = ea - gap;
    if (e - s < 0.001) return null;
    const r = isHov ? OR + 6 : OR;
    const os = p2c(s, r), oe = p2c(e, r);
    const is_ = p2c(s, IR), ie = p2c(e, IR);
    const lg = (e - s) > Math.PI ? 1 : 0;
    return [
      `M ${os.x.toFixed(2)} ${os.y.toFixed(2)}`,
      `A ${r} ${r} 0 ${lg} 1 ${oe.x.toFixed(2)} ${oe.y.toFixed(2)}`,
      `L ${ie.x.toFixed(2)} ${ie.y.toFixed(2)}`,
      `A ${IR} ${IR} 0 ${lg} 0 ${is_.x.toFixed(2)} ${is_.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  };

  if (data.length === 0) {
    return (
      <svg viewBox="0 0 200 200" className="donut-svg">
        <circle cx={CX} cy={CY} r={(OR + IR) / 2} fill="none" strokeWidth={OR - IR} stroke="rgba(255,255,255,0.06)" strokeDasharray="8 4" />
        <text x={CX} y={CY + 5} textAnchor="middle" fill="rgba(255,255,255,0.28)" fontSize="11" fontFamily="inherit">
          No data
        </text>
      </svg>
    );
  }

  // Single category — full ring
  if (data.length === 1) {
    const item = data[0];
    return (
      <svg viewBox="0 0 200 200" className="donut-svg">
        <circle cx={CX} cy={CY} r={(OR + IR) / 2} fill="none" strokeWidth={OR - IR} stroke="rgba(255,255,255,0.06)" />
        <circle
          cx={CX} cy={CY} r={(OR + IR) / 2} fill="none" strokeWidth={OR - IR} stroke={item.color}
          style={{ filter: `drop-shadow(0 0 12px ${item.color}55)` }}
        />
        <text x={CX} y={CY - 12} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="14" fontWeight="700" fontFamily="inherit">
          {fmtShort(total)}
        </text>
        <text x={CX} y={CY + 5} textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="9" letterSpacing="0.5" fontFamily="inherit">
          TOTAL
        </text>
      </svg>
    );
  }

  let cum = 0;
  const arcs = data.map(item => {
    const sa = cum;
    cum += (item.percentage / 100) * 2 * Math.PI;
    return { ...item, sa, ea: cum };
  });

  const hov = arcs.find(a => a.category === hovered);

  return (
    <svg viewBox="0 0 200 200" className="donut-svg">
      <circle cx={CX} cy={CY} r={(OR + IR) / 2} fill="none" strokeWidth={OR - IR} stroke="rgba(255,255,255,0.04)" />

      {arcs.map(arc => {
        const isHov = arc.category === hovered;
        const d = makeArc(arc.sa, arc.ea, isHov);
        if (!d) return null;
        return (
          <path
            key={arc.category}
            d={d}
            fill={arc.color}
            opacity={hovered === null || isHov ? 1 : 0.28}
            style={{
              transition: 'opacity 0.2s',
              cursor: 'pointer',
              filter: isHov ? `drop-shadow(0 0 10px ${arc.color}99)` : 'none',
            }}
            onMouseEnter={() => setHovered(arc.category)}
            onMouseLeave={() => setHovered(null)}
            onTouchStart={() => setHovered(prev => prev === arc.category ? null : arc.category)}
          />
        );
      })}

      {/* Center display */}
      <text x={CX} y={CY - 12} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="15" fontWeight="700" fontFamily="inherit">
        {fmtShort(hov?.amount ?? total)}
      </text>
      <text x={CX} y={CY + 5} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9" letterSpacing="0.5" fontFamily="inherit">
        {hov ? hov.label.toUpperCase() : 'TOTAL'}
      </text>
      {hov && (
        <text x={CX} y={CY + 20} textAnchor="middle" fill={hov.color} fontSize="12" fontWeight="700" fontFamily="inherit">
          {hov.percentage.toFixed(1)}%
        </text>
      )}
    </svg>
  );
};

// ── MonthlyChart ──────────────────────────────────────────────────────────────

const MonthlyChart: React.FC<{ data: MonthlyPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(...data.map(d => d.total), 1);
  const hasData = data.some(d => d.total > 0);

  const hov = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="mc-wrap">
      {/* Chart area */}
      <div className="mc-chart-area">
        {/* Grid lines */}
        {[75, 50, 25].map(pct => (
          <div key={pct} className="mc-grid-row" style={{ bottom: `${pct}%` }}>
            <span className="mc-y-label">{fmtShort((pct / 100) * maxVal)}</span>
            <div className="mc-grid-line" />
          </div>
        ))}

        {/* Tooltip — rendered inside chart area so .glass overflow:hidden doesn't clip it */}
        {hov && hov.total > 0 && (
          <div
            className="mc-tooltip"
            style={
              hoveredIdx! >= data.length / 2
                ? { top: 8, left: 48 }   // right-half bar → anchor tooltip to left
                : { top: 8, right: 8 }   // left-half bar  → anchor tooltip to right
            }
          >
            <p className="mc-tooltip-month">{hov.month}</p>
            <div className="mc-tooltip-row">
              <span className="mc-dot" style={{ background: 'rgba(148,163,184,0.5)' }} />
              <span>Total</span>
              <strong>{formatCurrency(hov.total)}</strong>
            </div>
            <div className="mc-tooltip-row">
              <span className="mc-dot" style={{ background: 'var(--accent-teal)' }} />
              <span>Yours</span>
              <strong>{formatCurrency(hov.yourShare)}</strong>
            </div>
          </div>
        )}

        {/* Bars */}
        <div className="mc-bars">
          {data.map((point, i) => {
            const totalH = (point.total / maxVal) * 100;
            const shareH = (point.yourShare / maxVal) * 100;
            const isHov = hoveredIdx === i;

            return (
              <div
                key={point.key}
                className={`mc-bar-col${isHov ? ' hovered' : ''}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div className="mc-bar-pair">
                  <div className="mc-bar mc-bar-total" style={{ height: `${totalH}%` }} />
                  <div className="mc-bar mc-bar-share" style={{ height: `${shareH}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {!hasData && (
          <div className="mc-empty">No spending data for this period</div>
        )}
      </div>

      {/* Month labels */}
      <div className="mc-labels">
        {data.map(point => (
          <span key={point.key} className="mc-label">{point.month.split(' ')[0]}</span>
        ))}
      </div>

      {/* Legend */}
      <div className="mc-legend">
        <div className="mc-legend-item">
          <div className="mc-legend-dot" style={{ background: 'rgba(148,163,184,0.4)' }} />
          <span>Group Total</span>
        </div>
        <div className="mc-legend-item">
          <div className="mc-legend-dot" style={{ background: 'var(--accent-teal)' }} />
          <span>Your Share</span>
        </div>
      </div>
    </div>
  );
};

// ── GroupContributionCard ─────────────────────────────────────────────────────

const GroupContributionCard: React.FC<{ group: GroupContribution }> = ({ group }) => {
  return (
    <GlassCard padding="18px 20px">
      <div className="gc-header">
        <span className="gc-emoji">{group.emoji}</span>
        <div>
          <p className="gc-name">{group.name}</p>
          <p className="gc-total text-xs text-secondary">{formatCurrency(group.totalSpent)} total</p>
        </div>
      </div>

      <div className="gc-members">
        {group.members.map(member => {
          const paidPct = group.totalSpent > 0 ? (member.paid / group.totalSpent) * 100 : 0;
          const sharePct = group.totalSpent > 0 ? (member.share / group.totalSpent) * 100 : 0;
          const net = member.paid - member.share;
          const isOver = net > 0.005;
          const isUnder = net < -0.005;

          return (
            <div key={member.userId} className="gc-row">
              <div className="gc-identity">
                <div className="gc-avatar" style={{ background: member.avatarColor }}>
                  {member.initials}
                </div>
                <span className="gc-member-name">{member.name}</span>
              </div>

              <div className="gc-bar-track">
                {/* Dashed marker at their share position */}
                {sharePct > 0 && sharePct < 100 && (
                  <div className="gc-share-mark" style={{ left: `${sharePct}%` }} />
                )}
                {/* Paid bar */}
                <div
                  className="gc-bar-fill"
                  style={{ width: `${paidPct}%`, background: member.avatarColor }}
                />
              </div>

              <div className="gc-amounts">
                <span className="gc-paid-amt">{formatCurrency(member.paid)}</span>
                <span className={`gc-net-amt ${isOver ? 'text-green' : isUnder ? 'text-red' : 'text-tertiary'}`}>
                  {isOver ? `+${formatCurrency(net)}` : isUnder ? `-${formatCurrency(-net)}` : '✓'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const allExpenses = useStore(s => s.expenses);
  const groups      = useStore(s => s.groups);
  const users       = useStore(s => s.users);
  const currentUser = useStore(selectCurrentUser)!;

  const [period,   setPeriod]   = useState<Period>(3);
  const [viewMode, setViewMode] = useState<ViewMode>('personal');

  const filtered = useMemo(
    () => filterByPeriod(allExpenses, period),
    [allExpenses, period],
  );

  const categoryData = useMemo(
    () => getCategoryBreakdown(filtered, currentUser.id, viewMode),
    [filtered, currentUser.id, viewMode],
  );

  const monthlyData = useMemo(
    () => getMonthlyTrend(filtered, currentUser.id, period),
    [filtered, currentUser.id, period],
  );

  const groupContributions = useMemo(
    () => getGroupContributions(filtered, groups, users, currentUser.id),
    [filtered, groups, users, currentUser.id],
  );

  // Summary stats
  const totalSpent = useMemo(() => {
    if (viewMode === 'personal') {
      return filtered.reduce((s, e) => s + getShareForUser(e, currentUser.id), 0);
    }
    return filtered.reduce((s, e) => s + e.amount, 0);
  }, [filtered, viewMode, currentUser.id]);

  const activeMonths = monthlyData.filter(m => m.total > 0).length;
  const avgMonthly   = activeMonths > 0 ? totalSpent / activeMonths : 0;
  const expenseCount = filtered.length;

  const topCategory = categoryData[0];

  return (
    <div className="page-content">
      <motion.div
        className="insights-page"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Page hero header */}
        <motion.div className="page-hero-header" variants={itemVariants}>
          <div>
            <h1 className="page-hero-title">Insights</h1>
            <p className="page-hero-subtitle text-secondary text-sm">Your spending overview</p>
          </div>
        </motion.div>

        {/* Controls */}
        <motion.div className="px-5 mb-5" variants={itemVariants}>
            <div className="insights-controls">
              {/* Period selector */}
              <div className="ins-period-tabs glass-pill">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    className={`ins-period-tab${period === p.value ? ' active' : ''}`}
                    onClick={() => setPeriod(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* View mode toggle */}
              <div className="ins-mode-toggle glass-pill">
                <button
                  className={`ins-mode-btn${viewMode === 'personal' ? ' active' : ''}`}
                  onClick={() => setViewMode('personal')}
                >
                  My Share
                </button>
                <button
                  className={`ins-mode-btn${viewMode === 'total' ? ' active' : ''}`}
                  onClick={() => setViewMode('total')}
                >
                  Group Total
                </button>
              </div>
            </div>
          </motion.div>

          {/* Summary stats */}
          <motion.div className="px-5 mb-5" variants={itemVariants}>
            <div className="ins-stats">
              <div className="ins-stat glass-sm">
                <span className="ins-stat-label">Total Spent</span>
                <span className="ins-stat-value">{formatCurrency(totalSpent)}</span>
              </div>
              <div className="ins-stat glass-sm">
                <span className="ins-stat-label">Avg / Month</span>
                <span className="ins-stat-value">{formatCurrency(avgMonthly)}</span>
              </div>
              <div className="ins-stat glass-sm">
                <span className="ins-stat-label">Expenses</span>
                <span className="ins-stat-value" style={{ fontSize: 22 }}>{expenseCount}</span>
                {topCategory && (
                  <span className="ins-stat-sub">
                    {topCategory.icon} Top: {topCategory.label}
                  </span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Charts row (side-by-side on desktop) */}
          <div className="ins-charts-row">
            {/* Category breakdown */}
            <motion.div className="mb-5 ins-chart-category" variants={itemVariants}>
              <div className="section-header"><h3>Spending by Category</h3></div>
              <div className="px-5">
                <GlassCard padding="20px">
                  <div className="ins-donut-layout">
                    <DonutChart data={categoryData} total={totalSpent} />
                    <div className="ins-cat-legend">
                      {categoryData.length === 0 ? (
                        <p className="text-secondary text-sm" style={{ textAlign: 'center', marginTop: 8 }}>
                          No expenses in this period
                        </p>
                      ) : (
                        categoryData.map(item => (
                          <div key={item.category} className="ins-legend-row">
                            <span className="ins-legend-dot" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}88` }} />
                            <span className="ins-legend-icon">{item.icon}</span>
                            <span className="ins-legend-label">{item.label}</span>
                            <span className="ins-legend-pct" style={{ color: item.color }}>
                              {item.percentage.toFixed(0)}%
                            </span>
                            <span className="ins-legend-amt">{formatCurrency(item.amount)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </GlassCard>
              </div>
            </motion.div>

            {/* Monthly trend */}
            <motion.div className="mb-5 ins-chart-monthly" variants={itemVariants}>
              <div className="section-header"><h3>Spending Trend</h3></div>
              <div className="px-5">
                <GlassCard padding="20px">
                  <MonthlyChart data={monthlyData} />
                </GlassCard>
              </div>
            </motion.div>
          </div>

          {/* Group contributions */}
          {groupContributions.length > 0 && (
            <motion.div className="mb-6" variants={itemVariants}>
              <div className="section-header"><h3>Group Contributions</h3></div>
              <div className="px-5 ins-groups-grid">
                {groupContributions.map(group => (
                  <GroupContributionCard key={group.groupId} group={group} />
                ))}
              </div>
            </motion.div>
          )}
      </motion.div>
    </div>
  );
}
