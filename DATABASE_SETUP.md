# AquaShield database starter

This folder contains AquaShield's Supabase/PostgreSQL schema. The buyer/admin
schema has been applied to the Supabase project configured for this copy, and
the 50-product demo catalog has been seeded once. The React storefront uses Supabase when
`.env.local` has the project URL and publishable key; without them it clearly
stays in browser-only demo mode. In that mode, orders, stock adjustments,
added products, and demo reviews are saved in this browser's local storage; this
is for a single-device demonstration, not secure/shared company data.

## What's included

- Buyer/admin profiles linked to Supabase Auth. New signups receive the buyer
  role; an administrator must be assigned by a trusted project owner.
- Five concept-level catalog groups, with child categories matching the current
  storefront's filters.
- The current 50 active illustrative products, with their existing IDs, prices,
  and demo stock values. These must be reviewed before public use.
- Product image storage paths for the 50 matching image assets in this ZIP.
- Orders with delivery and payment status, item price snapshots, and a status
  history for the tracking screen.
- Inventory movement records.
- A `place_order` database function that validates cart entries, recalculates
  prices and the current bulk discounts, locks stock rows, decrements stock,
  and creates the order as one transaction. It also records custom Go-Bag
  components together, applies the current bundle discount, and reserves the
  included dry bag from stock.
- Row-level security so shoppers only read their own orders while admins manage
  the catalog and fulfillment data.
- A configured frontend client for Supabase Auth, shared catalog reads, admin
  product creation and stock adjustments, and atomic order placement/status
  updates.

## Current Supabase setup

- The Supabase CLI is installed as a project development dependency. Use
  `npx supabase` from this folder.
- The hosted schema migration is applied, and the demo catalog and image paths
  have been seeded once. Do not run the seed again after changing real stock.
- Password recovery now uses Supabase Auth: the reset form emails a link and
  `/reset-password` accepts the new password after that link establishes a
  recovery session. Add the local and deployed site origins (including
  `/reset-password`) under Supabase Auth URL Configuration > Redirect URLs.
  Email delivery also requires Supabase Auth email sending; the default sender
  has strict limits and is intended for testing, so configure custom SMTP for
  dependable public use.
- Admin account management uses the `admin-users` Supabase Edge Function. It
  checks the caller's admin role before listing accounts, inviting a buyer or
  administrator, editing profile fields/roles, or requesting a password reset.
  Deploy it with `npx supabase functions deploy admin-users` and set the
  `SITE_URL` Edge Function secret to the deployed storefront origin. Do not put
  the service-role key in the frontend. Invitations and reset links require a
  deliverable email address and configured Auth email delivery.
- `.env.local` is configured for this copy and ignored by Git. It contains only
  the Project URL and browser publishable key. Do not add a secret/service-role
  key or database password to frontend environment variables.
- Checkout routing uses Google's Maps JavaScript API and Routes Library to draw
  the PLM-to-address driving route and calculate its road distance. To enable
  it, create a Google Maps Platform API key, enable **Maps JavaScript API** and
  **Routes API**, and configure billing and quota limits in Google Cloud. Add
  `VITE_GOOGLE_MAPS_API_KEY` to `.env.local`, then restrict the key by website
  referrer (local Vite origin and deployed website) and by those two APIs. The
  browser key is visible to site visitors, so never use an unrestricted key.
  Until configured, checkout links to Google Maps but does not invent a route
  or distance-based fee; delivery can continue with Barangay / Hub Pickup.
  The displayed driving route is for checking the address and distance. Its
  distance-band fee is an AquaShield estimate, not a live courier quotation.

## Set up another Supabase project

1. Create a Supabase project and keep its database password private.
2. Install dependencies with `npm install`. The CLI is included in this project;
   invoke it as `npx supabase`.
3. For local development, run `supabase start` and then `supabase db reset`;
   this applies the migration and loads the demo categories and products.
4. For a fresh development/demo Supabase project only, apply the migration and
   sample catalog with `npx supabase db push --remote=<project-ref> --include-seed`.
   Do not use `--include-seed` on a live/production database: the seed is sample
   data and can reset product stock values. For later schema changes, push only
   migrations with `npx supabase db push --remote=<project-ref>`.
5. In the Supabase SQL editor, promote a chosen user's profile to admin after
   that user has signed up: `update public.profiles set role = 'admin' where id = '<auth-user-uuid>';`.
6. Copy `.env.example` to `.env.local` and fill in the Project URL and
   publishable key. Add a restricted Google Maps key if checkout routing is
   needed. Never put a service-role or secret key in this Vite app.
7. The `product-images` bucket and its Storage policies still need to be created
   in Supabase, and the image files uploaded, before images can be served from
   Supabase Storage. The current website still serves its bundled images locally.

## Decisions still needed before wiring the storefront

- The updated concept paper defines Customer and Administrator as the two
  system actors. Organization is a business-to-organization buyer, not a seller
  role. Do not add seller access unless the team changes the requirements.
- The updated paper says Go-Bag selections should span Medical, Water, Shelter,
  Safety, and Power, but does not define minimums or whether one item per group
  is mandatory. The current site uses a 7–15 item count, so agree on category
  coverage before enforcing a final rule.
- Confirm whether the demo's 12% VAT and distance-band delivery fees should be
  treated as real business rules. Google Maps now supplies the driving route
  and distance when configured; the fee bands still are not courier quotes.
- Review product claims, prices, stock, and image rights before using the
  seeded catalog on a public site.

## First database milestone

The hosted migration and initial demo catalog are in place. The app's auth,
catalog, inventory, and checkout paths are connected when project environment
values are present. The product-image bucket and upload workflow, real payment
provider, and live courier GPS are separate integrations; this release only
simulates wallet outcomes and uses order-status tracking.

The second hosted migration is now applied. It adds buyer-saved delivery
addresses, shared verified product reviews, and a payment ledger for the demo
wallet simulator. GCash and Maya outcomes update order/payment status but never
contact a real wallet or move money. Reviews require a delivered order. Admins
can view registered buyer profiles; organization purchases remain buyer
accounts, with no seller role.

The third hosted migration is also applied. It calculates a simulated delivery
distance from Pamantasan ng Lungsod ng Maynila and applies a distance band to
new order totals in the database. The checkout map is illustrative; it does not
use exact street routing, a map provider, or live courier tracking.

## Free public website link

See [DEPLOYMENT.md](./DEPLOYMENT.md) for publishing this Vite site to Cloudflare
Pages at a free `*.pages.dev` address. A custom `.com` domain is not included.
