# AquaShield Relief Co.

A responsive ecommerce storefront starter built with React, TypeScript, and Vite.

## Getting started

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

## Available scripts

- `npm run dev` — start the Vite development server.
- `npm run build` — type-check the app and create a production build in `dist/`.
- `npm run preview` — preview the production build locally.
- `npm run lint` — check the source with Oxlint.

## Frontend scope

The app includes a responsive emergency-supplies storefront, Solo / Family retail shopping, Organization bulk shopping, product search and filters, custom Go-Bag builders, checkout, order history, invoices, status tracking, and an admin workspace. Without Supabase environment values, orders, stock adjustments, added products, and reviews are stored only in this browser and are not shared or secured for production use. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to use Supabase Auth, a shared product catalog, saved addresses, verified product reviews, database-backed product and inventory management, and server-validated checkout. Administrator access requires a Supabase profile with the administrator role. GCash and Maya outcomes are simulated; no real payment is processed. Delivery tracking is illustrative and does not receive courier GPS updates. Checkout can use Google Maps driving directions when `VITE_GOOGLE_MAPS_API_KEY` is configured; distance-band fees are estimates, not live courier quotes. See `DATABASE_SETUP.md` for setup.
