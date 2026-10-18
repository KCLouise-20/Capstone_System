# USTP Supply & Property Management System

A supply and property management system I built for USTP Villanueva Campus
as my capstone project. Handles inventory, deliveries, and consumable
releases (RIS) end to end, with different screens depending on who's
logged in.

## What it does

- **Dashboard** — stock levels, recent deliveries, pending requests at a glance
- **Inventory** — items, stock levels, categories, low-stock flags
- **Deliveries** — record incoming stock, updates inventory automatically
- **Releases (RIS)** — process and approve requests, stock adjusts on approval
- **Reports** — per-item stock card ledger, plus a few other report types
- **Request Supplies** — faculty/staff side, submit a request and track its status
- **Manage Users / Roles / System Settings / System Logs** — admin tools

Three roles — Admin, Supply Officer, and Faculty/Staff — each see a
different slice of the app, and that's enforced on the database side, not
just hidden in the UI.

## Stack

Next.js (App Router) + Supabase, deployed on Vercel.

## Running it locally

```bash
npm install
npm run dev
```

Needs a Supabase project wired up via `.env.local` to actually do anything
— ask me if you need the setup steps.
