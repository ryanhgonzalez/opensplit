# OpenSplit

A mobile-first expense splitting PWA inspired by Splitwise, built with React and TypeScript. Features an Apple iOS-inspired design system with light/dark/system theming, fluid animations, and full offline support via a precaching service worker and local state persistence.

## Features

- **Dashboard** — Net balance overview, recent expenses, quick group access, and backup reminders
- **Groups** — Create and manage expense groups with emoji, color coding, and member management
- **People** — Track individual balances across all shared groups
- **Activity** — Chronological feed of all expenses and payments, searchable across every group
- **Settle Up** — Mark payments complete in either direction (money you paid or money you received), in full or partially, via Venmo, Cash App, Zelle, or cash. Balances, group totals, and the activity feed update immediately. Payments marked complete from Settle Up clear the overall balance with that person; to clear a specific group's balance, mark it complete from inside that group, where completed payments are also listed and can be undone.
- **Insights** — Spending breakdowns by category, monthly trends, and group contribution charts
- **Receipt Scanning** — Photograph a receipt, crop it, and let on-device OCR fill in the amount, merchant, date, and line items
- **Share & Invite** — Send a group as a file or QR code; whoever opens it joins the group, adds expenses, and shares it back to merge, with no server involved
- **Group PDF Reports** — Export a full expense report for any group as a PDF
- **Data Import / Export** — Back up and restore all app data as JSON
- **Offline** — Works with no network connection once opened, including receipt scanning
- **Theme Toggle** — Light, Dark, and System default modes with no flash on load

## Tech Stack

- **React 18** + **TypeScript**
- **Vite 6** + **vite-plugin-pwa** for bundling and the service worker
- **Zustand 5** with `persist` middleware for local state
- **Framer Motion** for animations
- **React Router v7** for navigation
- **jsPDF** + **jspdf-autotable** for PDF generation
- **Tesseract.js** for on-device receipt OCR (bundled under `public/tesseract`)
- **qrcode** + **fflate** for QR code sharing

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
