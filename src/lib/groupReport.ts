import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Group, Expense, User } from '../types';
import { CATEGORY_LABELS } from '../types';
import { calculateBalances, calculateSettlements } from './calculations';

// ─── Colour palette ───────────────────────────────────────────────────────────

type RGB = [number, number, number];

const C: Record<string, RGB> = {
  purple:     [124,  58, 237],
  purpleLight:[243, 240, 255],
  purpleMid:  [109,  40, 217],
  dark:       [ 17,  24,  39],
  mid:        [ 55,  65,  81],
  gray:       [107, 114, 128],
  border:     [229, 231, 235],
  altRow:     [249, 250, 251],
  green:      [  5, 150, 105],
  greenLight: [209, 250, 229],
  red:        [220,  38,  38],
  redLight:   [254, 226, 226],
  white:      [255, 255, 255],
};

// ─── Local formatters (emoji-safe, no Math.abs) ───────────────────────────────

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function stripEmoji(str: string): string {
  // Remove emoji and other non-BMP chars that jsPDF's built-in fonts can't render.
  return str.replace(
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}]/gu,
    '',
  ).trim();
}

// ─── Shared drawing helpers ───────────────────────────────────────────────────

function sectionHeader(doc: jsPDF, text: string, x: number, y: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C.purple);
  doc.text(text, x, y);
}

function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fill: RGB, stroke?: RGB,
): void {
  doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  } else {
    doc.setDrawColor(...fill);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
  }
}

// Returns the finalY from the most recent autoTable call.
function lastY(doc: jsPDF): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable?.finalY ?? 0;
}

// ─── Table theme shared across all tables ─────────────────────────────────────

const tableDefaults = (margin: number) => ({
  margin: { left: margin, right: margin },
  styles: {
    fontSize: 8.5,
    cellPadding: 3.5,
    textColor: C.dark,
    font: 'helvetica',
    lineColor: C.border,
    lineWidth: 0.15,
  },
  headStyles: {
    fillColor: C.purple,
    textColor: C.white,
    fontStyle: 'bold' as const,
    fontSize: 8.5,
  },
  alternateRowStyles: { fillColor: C.altRow },
  tableLineColor: C.border,
  tableLineWidth: 0.2,
});

// ─── Page header drawn on every page ─────────────────────────────────────────

function drawPageHeader(doc: jsPDF, groupName: string, pageW: number, margin: number): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.purple);
  doc.text('SPLITIFY', margin, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.gray);
  const label = stripEmoji(groupName) + '  ·  Expense Report';
  doc.text(label, margin + 18, 10);

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(margin, 13, pageW - margin, 13);
}

// ─── Main export function ─────────────────────────────────────────────────────

export function generateGroupReport(
  group: Group,
  expenses: Expense[],
  users: User[],
): void {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const cw     = pageW - 2 * margin; // content width

  const getName = (id: string) => users.find((u) => u.id === id)?.name ?? 'Unknown';
  const memberIds = group.members.map((m) => m.userId);
  const sorted    = [...expenses].sort((a, b) => a.date.getTime() - b.date.getTime());
  const balances  = calculateBalances({ expenses, memberIds });
  const settlements = calculateSettlements({ expenses, memberIds });

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const dates = expenses.map((e) => e.date.getTime());
  const minDate = dates.length ? new Date(Math.min(...dates)) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
  const dateRange =
    !minDate ? '—'
    : minDate.getTime() === maxDate!.getTime()
      ? shortDate(minDate)
      : `${shortDate(minDate)} – ${shortDate(maxDate!)}`;

  // ── Cover / first section ────────────────────────────────────────────────────

  let y = 18;

  // App wordmark
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.purple);
  doc.text('Splitify', margin, y);

  // Export date (right-aligned)
  const exportLabel = `Generated ${shortDate(new Date())}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text(exportLabel, pageW - margin - doc.getTextWidth(exportLabel), y);

  y += 5;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 9;

  // Report title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.dark);
  doc.text(stripEmoji(group.name), margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.gray);
  doc.text('EXPENSE REPORT', margin, y);
  y += 9;

  // ── Overview stats box ──────────────────────────────────────────────────────

  filledRect(doc, margin, y, cw, 26, C.purpleLight, C.purple);

  const cols = 4;
  const colW = cw / cols;

  const stats = [
    { label: 'TOTAL SPENT',  value: usd(totalSpent) },
    { label: 'DATE RANGE',   value: dateRange },
    { label: 'EXPENSES',     value: String(expenses.length) },
    { label: 'MEMBERS',      value: String(group.members.length) },
  ];

  stats.forEach((stat, i) => {
    const x = margin + i * colW + 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(stat.label, x, y + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C.dark);
    doc.text(stat.value, x, y + 18);
  });

  y += 33;

  // ── Section 1 – Members ─────────────────────────────────────────────────────

  sectionHeader(doc, 'MEMBERS', margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    ...tableDefaults(margin),
    head: [['Name', 'Role']],
    body: group.members.map((m) => [
      getName(m.userId),
      m.role.charAt(0).toUpperCase() + m.role.slice(1),
    ]),
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { cellWidth: 'auto' },
    },
  });

  y = lastY(doc) + 10;

  // ── Section 2 – Expense Breakdown ──────────────────────────────────────────

  if (y > pageH - 50) { doc.addPage(); y = 20; }
  sectionHeader(doc, 'EXPENSE BREAKDOWN', margin, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    ...tableDefaults(margin),
    head: [['Date', 'Description', 'Category', 'Paid By', 'Amount', 'Split Among']],
    body: sorted.map((e) => [
      shortDate(e.date),
      stripEmoji(e.description),
      CATEGORY_LABELS[e.category],
      getName(e.paidBy),
      { content: usd(e.amount), styles: { halign: 'right' as const } },
      e.split.entries
        .map((en) => `${getName(en.userId)} (${usd(en.amount)})`)
        .join(', '),
    ]),
    foot: [
      [
        { content: '', colSpan: 3 },
        { content: 'TOTAL', styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
        { content: usd(totalSpent), styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
        '',
      ],
    ],
    footStyles: {
      fillColor: C.purpleLight,
      textColor: C.purple,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 42 },
      2: { cellWidth: 26 },
      3: { cellWidth: 24 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      // Stripe the foot row distinctly
      if (data.section === 'foot') {
        data.cell.styles.fillColor = C.purpleLight;
        data.cell.styles.textColor = C.purple;
      }
    },
  });

  y = lastY(doc) + 10;

  // ── Section 3 – Individual Expense Shares ──────────────────────────────────

  if (y > pageH - 70) { doc.addPage(); y = 20; }
  sectionHeader(doc, 'INDIVIDUAL SHARE DETAIL', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  doc.text('Each member\'s exact share per expense, as recorded at time of entry.', margin, y + 6);
  y += 12;

  // Build rows: one row per member-expense pair (skip if member not in split)
  const shareRows: (string | { content: string; styles: Record<string, unknown> })[][] = [];
  for (const e of sorted) {
    for (const en of e.split.entries) {
      const isPayer = e.paidBy === en.userId;
      shareRows.push([
        shortDate(e.date),
        stripEmoji(e.description),
        getName(en.userId),
        isPayer ? 'Payer' : 'Participant',
        { content: usd(en.amount), styles: { halign: 'right' as const } },
        {
          content: isPayer ? `+${usd(e.amount - en.amount)}` : `-${usd(en.amount)}`,
          styles: {
            halign: 'right' as const,
            textColor: isPayer ? C.green : C.red,
            fontStyle: 'bold' as const,
          },
        },
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    ...tableDefaults(margin),
    head: [['Date', 'Expense', 'Member', 'Role', 'Their Share', 'Net Effect']],
    body: shareRows,
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 42 },
      2: { cellWidth: 28 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 'auto', halign: 'right' },
    },
  });

  y = lastY(doc) + 10;

  // ── Section 4 – Cost Allocation Summary ────────────────────────────────────

  if (y > pageH - 60) { doc.addPage(); y = 20; }
  sectionHeader(doc, 'COST ALLOCATION SUMMARY', margin, y);
  y += 5;

  const memberStats = group.members.map((m) => {
    const paid  = expenses.filter((e) => e.paidBy === m.userId).reduce((s, e) => s + e.amount, 0);
    const share = expenses.reduce((s, e) => {
      return s + (e.split.entries.find((en) => en.userId === m.userId)?.amount ?? 0);
    }, 0);
    const net = balances[m.userId] ?? 0;
    return { name: getName(m.userId), paid, share, net };
  });

  autoTable(doc, {
    startY: y,
    ...tableDefaults(margin),
    head: [['Member', 'Total Paid', 'Total Owed (Share)', 'Net Balance', 'Status']],
    body: memberStats.map((ms) => {
      const isSettled = Math.abs(ms.net) < 0.005;
      const netLabel  = isSettled ? 'Settled' : `${ms.net > 0 ? '+' : ''}${usd(ms.net)}`;
      const netColor  = isSettled ? C.gray : ms.net > 0 ? C.green : C.red;
      const status    = isSettled ? 'Even' : ms.net > 0 ? 'Owed money' : 'Owes money';
      return [
        { content: ms.name, styles: { fontStyle: 'bold' as const } },
        { content: usd(ms.paid), styles: { halign: 'right' as const } },
        { content: usd(ms.share), styles: { halign: 'right' as const } },
        { content: netLabel, styles: { halign: 'right' as const, textColor: netColor, fontStyle: 'bold' as const } },
        { content: status,  styles: { textColor: netColor } },
      ];
    }),
    foot: [[
      { content: 'TOTAL', styles: { fontStyle: 'bold' as const } },
      { content: usd(totalSpent),         styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: usd(totalSpent),         styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
      { content: usd(0),                  styles: { halign: 'right' as const } },
      '',
    ]],
    footStyles: { fillColor: C.purpleLight, textColor: C.purple, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 'auto' },
    },
  });

  y = lastY(doc) + 10;

  // ── Section 5 – Balance Explanation ────────────────────────────────────────

  if (y > pageH - 60) { doc.addPage(); y = 20; }
  sectionHeader(doc, 'HOW BALANCES WERE CALCULATED', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray);
  const balanceNote =
    'A positive balance means other members owe this person money (they paid more than their share). ' +
    'A negative balance means this person owes money to others (they paid less than their share). ' +
    'The sum of all balances is always $0.00.';
  const splitNote = doc.splitTextToSize(balanceNote, cw);
  doc.text(splitNote, margin, y + 6);
  y += 6 + splitNote.length * 4.5;

  // Per-member balance breakdown
  autoTable(doc, {
    startY: y,
    ...tableDefaults(margin),
    head: [['Member', 'Paid (↑ credit)', 'Share (↓ debit)', 'Running Net', 'Verdict']],
    body: memberStats.map((ms) => {
      const verdict = Math.abs(ms.net) < 0.005
        ? 'Balanced'
        : ms.net > 0 ? `${getName(ms.name)} is owed ${usd(ms.net)}`
                     : `${getName(ms.name)} owes ${usd(Math.abs(ms.net))}`;
      return [
        { content: ms.name, styles: { fontStyle: 'bold' as const } },
        { content: `+${usd(ms.paid)}`,  styles: { halign: 'right' as const, textColor: C.green } },
        { content: `-${usd(ms.share)}`, styles: { halign: 'right' as const, textColor: C.red } },
        {
          content: `${ms.net >= 0 ? '+' : ''}${usd(ms.net)}`,
          styles: {
            halign: 'right' as const,
            fontStyle: 'bold' as const,
            textColor: Math.abs(ms.net) < 0.005 ? C.gray : ms.net > 0 ? C.green : C.red,
          },
        },
        verdict,
      ];
    }),
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 'auto' },
    },
  });

  y = lastY(doc) + 10;

  // ── Section 6 – Settlement Transactions ────────────────────────────────────

  if (y > pageH - 55) { doc.addPage(); y = 20; }
  sectionHeader(doc, 'SETTLEMENT PLAN', margin, y);
  y += 6;

  if (settlements.length === 0) {
    filledRect(doc, margin, y, cw, 14, C.greenLight, C.green as RGB);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.green);
    doc.text('All balances are already settled — no payments required.', margin + 5, y + 9);
    y += 20;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.mid);
    doc.text(
      `To fully settle all balances, ${settlements.length} payment${settlements.length !== 1 ? 's' : ''} should be made:`,
      margin, y,
    );
    y += 7;

    autoTable(doc, {
      startY: y,
      ...tableDefaults(margin),
      head: [['#', 'From (Owes)', 'To (Owed)', 'Payment Amount', 'Resolves']],
      body: settlements.map((s, i) => {
        const fromBal = balances[s.from] ?? 0;
        const toBal   = balances[s.to]   ?? 0;
        return [
          String(i + 1),
          { content: getName(s.from), styles: { fontStyle: 'bold' as const, textColor: C.red } },
          { content: getName(s.to),   styles: { fontStyle: 'bold' as const, textColor: C.green } },
          { content: usd(s.amount),   styles: { fontStyle: 'bold' as const, halign: 'right' as const } },
          `${getName(s.from)}'s ${usd(Math.abs(fromBal))} debt → ${getName(s.to)}'s ${usd(Math.abs(toBal))} credit`,
        ];
      }),
      foot: [[
        '',
        { content: 'TOTAL TRANSFERRED', colSpan: 2, styles: { fontStyle: 'bold' as const } },
        {
          content: usd(settlements.reduce((s, t) => s + t.amount, 0)),
          styles: { fontStyle: 'bold' as const, halign: 'right' as const },
        },
        '',
      ]],
      footStyles: { fillColor: C.purpleLight, textColor: C.purple, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 'auto' },
      },
    });

    y = lastY(doc) + 8;

    // Confirmation note
    filledRect(doc, margin, y, cw, 13, C.purpleLight, C.purple as RGB);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.purple);
    doc.text(
      'After completing all payments above, every member\'s balance will be exactly $0.00.',
      margin + 5, y + 8.5,
    );
    y += 19;
  }

  // ── Page headers + footers on every page ────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Top header (skip page 1 where we drew the full cover header)
    if (p > 1) drawPageHeader(doc, group.name, pageW, margin);

    // Bottom footer
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.4);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.gray);
    doc.text('Generated by Splitify', margin, pageH - 7);

    const pageLabel = `Page ${p} of ${totalPages}`;
    doc.text(pageLabel, pageW - margin - doc.getTextWidth(pageLabel), pageH - 7);
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  const filename = `${stripEmoji(group.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.pdf`;
  doc.save(filename);
}
