# Sobos — Restaurant Admin UI

Next.js frontend for the **Sobos** restaurant admin dashboard (Owner + Manager), built per `dashboard_ui_flow/04_restaurant_admin/`.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **SQLite** (`db.sqlite` at project root)
- **Prisma ORM** for all data access
- **Tailwind CSS** + design tokens from `_common/02_visual_system.md`
- **Recharts** for analytics charts
- **cmdk** for command palette (⌘K)

## Features

- Dense, keyboard-first enterprise CRUD shell
- 12 admin modules: Dashboard, Menu, Tables, Inventory, Orders, Payments, Staff, Analytics, Customers, Integrations, Settings, Audit
- Location switcher (All Locations + per-branch)
- Density toggle (comfortable / standard / compact)
- Command palette + global search (`/`)
- Mobile bottom nav with floor-facing quick actions
- Master-detail drawers, DenseGrid tables, KPI cards, live alerts

## Quick Start

```bash
cd restaurant_admin_ui
npm install
npm run db:setup    # create db.sqlite + seed demo data
npm run dev         # http://localhost:3000
```

## Database

- File: `db.sqlite` (project root)
- Schema: `prisma/schema.prisma`
- Seed: `prisma/seed.ts` (Spice Garden demo restaurant)

```bash
npm run db:push     # apply schema
npm run db:seed     # re-seed data
npm run db:generate # regenerate Prisma client
```

## Project Structure

```
restaurant_admin_ui/
├── prisma/
│   ├── schema.prisma    # full data model
│   ├── seed.ts          # demo seed
│   └── db.sqlite        # SQLite database (project root)
├── src/
│   ├── app/
│   │   ├── (admin)/     # all module pages
│   │   └── api/         # Prisma-backed API routes
│   ├── components/
│   │   ├── shell/       # header, sidebar, command palette
│   │   └── ui/          # DenseGrid, KPI, shared primitives
│   ├── generated/prisma # Prisma client (generated)
│   └── lib/             # prisma client, context, utils
```

## Functionality (all modules wired)

Every section supports real database operations via Prisma. Toast notifications confirm success/errors.

| Module | Create | Edit | Delete | Other |
|--------|--------|------|--------|-------|
| **Dashboard** | — | — | — | Live KPIs, dismiss alerts |
| **Menu** | New item, categories | Edit drawer + save | Bulk/single soft-delete | Export CSV, availability toggle, bulk status |
| **Tables** | Add table/section | Status, capacity, section | Soft-delete table | Floor board, QR list |
| **Inventory** | Log wastage | Adjust stock qty | — | Tabs: stock, batches, wastage, suppliers, POs |
| **Orders** | — | Update status | Cancel via status | View line items, config tabs |
| **Payments** | Issue refund | Save methods/tips/commissions | — | Order picker for refunds |
| **Staff** | Invite staff | Edit name/phone | Deactivate | Attendance tab |
| **Analytics** | — | — | — | Margin, top sellers, payment mix, waste + export |
| **Customers** | Customer, campaign | Edit customer, loyalty | Delete customer | Segments, reservations |
| **Integrations** | — | Enable/disable | — | Force sync |
| **Settings** | — | Profile, hours, toggles | — | Locations, roles (read) |
| **Audit** | — | — | — | Search logs, FSSAI export |

All writes are recorded in the audit log.

## Spec Reference

- `dashboard_ui_flow/04_restaurant_admin/README.md`
- `dashboard_ui_flow/04_restaurant_admin/desktop.md`
- `dashboard_ui_flow/04_restaurant_admin/mobile.md`
- `dashboard_ui_flow/04_restaurant_admin/modules.md`

---

## Recent Additions (latest UX & admin upgrades)

These features were added on top of the base shell to make Sobos faster and more useful for daily restaurant operations.

### Search & navigation

- **Universal entity search** — `/` (global search) and **⌘K** (command palette) now search real records, not just pages:
  - Orders, menu items, customers, staff, inventory ingredients
- **New API:** `GET /api/search?q=…&locationId=…`
- **Working quick actions** in command palette:
  - New menu item, Invite staff, Log wastage, Export FSSAI report
- **Deep links** (open the right screen directly):

| URL | Opens |
|-----|--------|
| `/orders?open=<id>` | Order detail drawer |
| `/menu?action=create` | New menu item drawer |
| `/menu?open=<id>` | Edit menu item |
| `/staff?action=invite` | Invite staff drawer |
| `/staff?open=<id>` | Edit staff member |
| `/audit?tab=fssai` | FSSAI batch report tab |
| `/inventory?filter=low` | Stock tab, low-stock filter on |
| `/inventory?tab=wastage` | Wastage tab |
| `/inventory?search=<name>` | Stock search pre-filled |

### Dashboard (operations hub)

- **Quick action tiles** — New menu item, Live orders, Floor plan, Invite staff
- **Ops stat cards** — Active orders, Tables occupied, Low stock items, Revenue today
- **Real “this hour vs last week”** KPI (computed from DB, not hardcoded)
- **Recent orders** panel with click-through to order drawer
- **Low stock watch** list with link to inventory
- **Auto-refresh** every 60 seconds + manual Refresh button

### Live orders

- **Live mode toggle** — auto-refresh every 15 seconds (on by default)
- **Status summary chips** — Pending, Preparing, Ready, filtered count
- Last-updated timestamp in page header

### Sidebar & shell

- **Live badges** on sidebar nav:
  - **Orders** — active order count
  - **Inventory** — low-stock count
- Badges refresh via `GET /api/ops-summary` every 30 seconds
- **Collapsed sidebar** — click chevron, any nav icon, or rail to expand
- **Text size control** (header: Large / Medium / Small):
  - Scales UI via CSS density variables
  - Persisted in `localStorage` (`density` key)
- **Keyboard shortcuts panel** — press **`?`** to open

### UI & reliability fixes

- **ChartContainer** component — fixes Recharts `width(-1)/height(-1)` warnings on Dashboard and Analytics
- **Header text-size dropdown** — uses shared `DENSITY_OPTIONS` from `src/lib/density.ts` (no duplicate import errors)

### New / updated files

```
src/app/api/search/route.ts       # entity search API
src/app/api/ops-summary/route.ts  # live ops counts for badges
src/components/ui/chart-container.tsx
src/components/shell/keyboard-shortcuts.tsx
src/lib/density.ts                # text size / density helpers
src/lib/use-entity-search.ts      # debounced search hook
src/lib/use-interval.ts           # polling helper
```

### Keyboard shortcuts (summary)

| Key | Action |
|-----|--------|
| **⌘K** | Command palette (search + actions) |
| **/** | Global search |
| **?** | Keyboard shortcuts help |
| **Esc** | Close dialogs / palettes |
