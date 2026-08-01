# OpenSplit

A mobile-first expense splitting PWA inspired by Splitwise, built with React and TypeScript. Features an Apple iOS-inspired design system with light/dark/system theming, fluid animations, and full offline support via local state persistence.

## Features

- **Dashboard** — Net balance overview, recent expenses, and quick group access
- **Groups** — Create and manage expense groups with emoji, color coding, and member management
- **People** — Track individual balances across all shared groups
- **Activity** — Chronological feed of all expenses and payments
- **Settle Up** — Record payments via Venmo, Cash App, Zelle, or cash
- **Insights** — Spending breakdowns by category, monthly trends, and group contribution charts
- **Group PDF Reports** — Export a full expense report for any group as a PDF
- **Data Import / Export** — Back up and restore all app data as JSON
- **Theme Toggle** — Light, Dark, and System default modes with no flash on load

## Tech Stack

- **React 18** + **TypeScript**
- **Vite 5** for bundling
- **Zustand 5** with `persist` middleware for local state
- **Framer Motion** for animations
- **React Router v7** for navigation
- **jsPDF** + **jspdf-autotable** for PDF generation

## Getting Started

```bash
npm install
npm run dev
```

App runs at `http://localhost:5174`

## Build

```bash
npx vite build
```

Output goes to `dist/`.

## Deployment

Deployed via Cloudflare Pages connected to this repository.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Node version:** `20`
