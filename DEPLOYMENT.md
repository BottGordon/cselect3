# Publish AquaShield with a free public link

Cloudflare Pages can host this Vite site at a free `*.pages.dev` address. This
is a public subdomain supplied by the host, not a custom domain such as
`aquashield.com`.

## Before publishing

1. Create the Supabase project and apply its migration. For a live project,
   follow the no-seed instructions in [DATABASE_SETUP.md](./DATABASE_SETUP.md).
2. In Supabase, copy the Project URL and the publishable key.
3. In the site folder, copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Build the site with `npm run build`. The finished website will be in `dist`.

The publishable key is intended to appear in the browser, but it is safe only
with the database's row-level security and policies enabled. Never use a
service-role or secret key in this site.

## Upload the website

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Choose **Create application**, then **Get started** and **Drag and drop**.
3. Enter an available project name, then upload the contents of the generated
   `dist` folder and deploy.
4. Cloudflare will provide a public URL in the form
   `https://<project-name>.pages.dev`.

For automatic deployments from GitHub, choose **Git integration** when creating
the Pages project instead. Set the build command to `npm run build`, the output
directory to `dist`, and add the two `VITE_SUPABASE_*` variables in the Pages
project's environment-variable settings. Cloudflare Pages Direct Upload and Git
integration are different project types; choose the one you want at creation.

## Limits to keep in mind

- A free host subdomain is available; a branded custom domain generally costs
  money to register.
- Supabase Free is useful for a class/demo project, but free projects can pause
  after inactivity and have limited database/storage quotas. Check current plan
  limits before relying on it for real orders.
- This site still has no payment-provider integration or real courier GPS feed.
  Its delivery map is a visualization, not live tracking.
