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

The app includes a responsive emergency-supplies storefront, Solo / Family retail shopping, Organization bulk shopping, product search and filters, custom Go-Bag builders, checkout, order history, invoice previews, status tracking, and an admin workspace. Without Supabase environment values, the app runs in demo mode and saves orders, stock adjustments, added products, and demo reviews in this browser's local storage. This is local to one browser and is not a secure shared database. When `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are configured, it uses Supabase Auth, the shared product catalog, buyer saved addresses, verified product reviews, database-backed product creation and stock adjustments, and transactional checkout with server-side prices, stock validation, and simulated PLM-based delivery fees. Admin access comes from the database profile role; the client-side demo admin password is used only in demo mode. The admin workspace also lists registered buyer profiles. The updated catalog includes 50 active demo products and local product images. GCash/Maya outcomes can be simulated; no real payment is processed. Delivery tracking remains an illustrative status visualization without courier GPS. Checkout can use Google Maps driving directions when `VITE_GOOGLE_MAPS_API_KEY` is configured; distance-band fees are estimates, not live courier quotes. See `DATABASE_SETUP.md` for setup.
