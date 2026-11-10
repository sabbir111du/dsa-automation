# DSA Automation — Cloudflare Worker

Staging domain: https://dsa-a2i.19122918.xyz
Supabase project: https://supabase.com/dashboard/project/umwzdtwmholgnqzzqmab

This is a **test application** for authenticated users to create employees and trips, select travelers, enter approved DSA entitlements, and generate one DOCX per traveler. The Word generator updates the supplied a2i template at `assets/original_template.docx` in this public GitHub repository. Claim amounts must be independently approved.

## Architecture
- Cloudflare Worker: HTML app, authentication enforcement on `/api/generate`, allowance calculation, DOCX ZIP processing.
- Supabase Auth: email/password user registration and sign-in (email confirmation may be required).
- Supabase PostgreSQL: `employees`, `trips`, `trip_itinerary`, `travel_legs`, `trip_travelers`, `allowance_rates`, `dsa_claims`. Every public table has owner-only RLS.
- The client uses a publishable key, never a Supabase service-role or secret key.

## Rebuild locally (requires Node.js)
```bash
cd cloudflare-app
npm install
npm run build
```

To deploy independently via Wrangler, authenticate with your own Cloudflare account, supply the `SUPABASE_PUBLISHABLE_KEY` secret using `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY`, then run `npm run deploy`. The existing custom domain has already been attached to `dsa-a2i-staging`; don't create a duplicate domain.

The deployment performed from ChatGPT used the connected Cloudflare account API to upload the compiled worker and the publishable-key binding. Future GitHub commits **do not automatically update Cloudflare** until a secure CI/CD deployment connection is configured.

## Endpoints
- `GET /` — web form, public sign-in screen
- `GET /health` — non-sensitive service status
- `GET /config` — public Supabase URL and public publishable API key
- `POST /api/generate` — requires validated Supabase Bearer token; returns a ZIP with individual DOCX and CSV

## Limitations before handling genuine employee claims
- User sign-up, email verification and end-to-end claim submission must be acceptance tested manually.
- Current access model is private per user, **not** a team-shared administrator/coordinator workflow.
- DOCX template fidelity is validated for sample journeys, but review generated documents, especially long itineraries and signature placement.
- Formal DSA eligibility and approved mileage rules must be supplied by the organization.
- Avoid including actual employee data until the user access policy and test workflows have been formally approved.
