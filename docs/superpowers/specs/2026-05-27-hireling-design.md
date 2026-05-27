# Hireling — Design Spec

**Status:** Draft for review
**Date:** 2026-05-27
**Author:** Steven Smith
**Working name:** Hireling (placeholder; rename before launch)

---

## 1. One-line pitch

> An agentic SEO platform for e-commerce and local SMBs: like hiring a junior SEO who works your site every week, drafts the work for your approval, and answers your questions in chat.

## 2. Origin and inspiration

This spec is informed by **[inhouseseo/superseo-skills](https://github.com/inhouseseo/superseo-skills)** — an Apache-2.0 collection of 11 agentic SEO skills for Claude. Hireling forks and adapts 8 of those skills as its core skill layer, then adds 7 new skills, a multi-tenant connector layer, scheduled execution, an approval/rollback gateway, and a chat agent. We will credit InhouseSEO in product per Apache 2.0 obligations.

## 3. Buyer and positioning

### Target buyer
E-commerce and local service SMBs:
- **E-commerce:** Shopify or WordPress (WooCommerce) stores doing $500K–$10M/yr revenue.
- **Local:** lawyers, dentists, plumbers, restaurants, contractors with 1–10 locations.

Common profile: owner/operator or 1-person marketing lead. No dedicated SEO specialist. Doesn't know what to do next.

### Positioning vs market
The platform combines three modes most incumbents split across separate products:

| Incumbent | What they do | What Hireling adds |
|---|---|---|
| Ahrefs / Semrush | Data + dashboards | The agent does the work, not just the analysis |
| Surfer / Frase | AI content writing | Audits + GBP + outreach + execution glue |
| BrightLocal / Whitespark | Local SEO data | Content + agentic execution |
| Lemlist / Pitchbox | Email outreach | SEO context (uses customer's Gmail, low risk) |
| Generic AI writers | Article drafts | Voice-trained per customer + publishes to CMS |

The wedge is **integrated execution under approval** for the SMB who can't hire a $3K/mo agency.

### Pricing
Three tiers, self-serve checkout via Stripe:

| Tier | Price | Limits |
|---|---|---|
| Solo | $149/mo | 1 site, 1 GBP, 20 outreach/day, 100 chat msgs/mo, 1 user |
| Business ⭐ (target tier) | $349/mo | 1 site, 3 GBP, 50 outreach/day, 500 chat msgs/mo, 3 users |
| Scale | $749/mo | 3 sites, 10 GBP, 100 outreach/day, unlimited chat, 10 users |

14-day free trial of Solo tier. Card required up front. Trial unlocks after connecting GSC + at least one of (Shopify / WP / GBP).

## 4. Product surface (V1 scope)

### Three modes of one agent

1. **Autopilot mode** — runs every Monday at 6am customer-time. Crawls site, runs audits, scans GSC/GBP, drafts content + posts + fixes + outreach, queues for approval, sends a weekly report email.
2. **Copilot mode** — customer reviews the draft queue, edits any draft inline, one-click approves to execute, one-click rolls back within 24h.
3. **Answers mode** — chat. Customer asks a question, agent investigates against connected data, returns a plain-language answer with optional action drafts.

### Features in V1

- **Connections:** Google (single OAuth covering GSC + GBP + Gmail), Shopify, WordPress.
- **Weekly cycle jobs:**
  - Site crawl (Playwright, sitemap + GSC-driven page list).
  - Page audits on top 5 trafficked pages.
  - GBP health audit.
  - GSC opportunity scan (decay, cannibalization, CTR-gap keywords).
  - Link target scan (no paid backlink APIs — uses link-building skill methodology over Google search).
- **Drafting phase (per week):**
  - 1 new article OR 1 article refresh.
  - 1 GBP post.
  - Up to 3 technical fix tickets (title, meta, H1, alt, schema).
  - Up to 5 outreach emails to ranked prospects.
- **Execution under approval:**
  - Article → Shopify / WP REST API as draft, customer clicks Publish.
  - Title/meta/H1 fix → Shopify / WP update with 24h rollback snapshot.
  - GBP post → GBP API publish.
  - Outreach email → sent via customer's own Gmail (OAuth), one approval per email.
  - Outreach sequences: initial → follow-up 1 (day +5) → follow-up 2 (day +12) → stop. Each follow-up reviewed before send (V1 caution).
- **Reply handling:**
  - Gmail push notification → reply-classifier → drafted response → customer's draft queue.
- **Chat:**
  - Streaming agent with tool access (DB queries, fetch, Google search, skill invocations).
  - Persistent thread per workspace.
- **Voice training:**
  - Onboarding captures 3–5 of the customer's existing articles.
  - Voice patterns extracted and layered onto the anti-AI-slop ruleset.

### Explicitly NOT in V1

- Link building bulk-outreach infra (no domain warming, no shared sending IPs — we ride the customer's Gmail reputation).
- Backlink monitoring / analysis.
- Rank tracking.
- Multi-site/multi-location beyond tier limits.
- Schema editor (we recommend, customer applies — too risky for V1).
- Faceted nav handling for e-com.
- A/B testing.
- White-label / agency mode (planned for V2 Scale tier).
- Auto-execution without per-action approval (planned for V2 "trusted automations").

## 5. Architecture

### Components

```
┌──────────────────────────────┐
│  Customer browser            │
│  (Next.js app on Vercel)     │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Hireling web app            │
│  Next.js (App Router)        │
│  + Supabase Auth             │
└──────────────┬───────────────┘
               │
   ┌───────────┼───────────────────────┐
   │           │                       │
┌──▼──┐  ┌─────▼──────┐  ┌─────────────▼─────┐
│ DB  │  │ Agent      │  │ Scheduler         │
│Supa-│  │ runner     │  │ (Inngest cron     │
│base │  │ (Node +    │  │  + queues +       │
│PG   │  │ Anthropic) │  │  retries)         │
└──┬──┘  └─────┬──────┘  └─────┬─────────────┘
   │           │               │
   │     ┌─────┼─────────┐     │
   │     │     │         │     │
┌──▼─────▼┐ ┌──▼──────┐ ┌▼─────▼──────┐
│Connectors│ │ Crawler │ │ Execution    │
│ (OAuth + │ │(Playwr- │ │ gateway      │
│  APIs)   │ │ ight on │ │ (writes to   │
│          │ │ Fly.io) │ │  outside)    │
└────┬─────┘ └─────────┘ └──────┬───────┘
     │                          │
     ▼                          ▼
 GSC, GBP, Gmail, Shopify, WordPress
```

### Component responsibilities

1. **Web app (Next.js / Vercel)** — auth UI, dashboard, draft queue, diff view, chat, settings, billing portal embed.
2. **Database (Postgres on Supabase)** — workspaces, users, OAuth tokens (encrypted at rest), crawl artifacts, audits, opportunities, drafts, sent emails + threads, audit log, weekly reports. All rows scoped by `workspace_id` with row-level security policies.
3. **Connectors** — one module per external service. Handles OAuth, refresh, rate limiting, error normalization. Internal interface examples: `gsc.getTopPages(siteId)`, `gbp.createPost(locationId, body)`, `gmail.sendEmail(from, to, subject, body)`, `shopify.updatePageMetadata(pageId, fields)`, `wp.publishPost(postId, fields)`.
4. **Crawler (Playwright on Fly.io)** — weekly per-workspace job. Sitemap-driven plus GSC top pages. Renders each page, captures HTML, metadata, internal links, schema, page weight. Stored in Supabase Storage with a manifest in the DB.
5. **Agent runner (Node.js workers via Inngest)** — picks up jobs from the queue. Each job loads the relevant skill as system prompt, calls Claude with tool use enabled, persists structured + markdown output. Stateless between jobs. Tools provided: `queryDB`, `fetchURL`, `googleSearch`, `crawlPage`, `invokeSkill`.
6. **Scheduler (Inngest)** — Monday-morning trigger per workspace, sequence follow-ups (day +5, +12), retry queue (every 15 min), reply ingestion via webhooks.
7. **Execution gateway** — single chokepoint for all outside writes. Pre-write: checks hard-coded prohibitions. Post-write: stores rollback snapshot for reversible actions, appends to audit log. Per-action approval token required.
8. **Reply monitor** — Gmail Pub/Sub push subscription per workspace. Receives notifications, fetches the message, hands to agent runner with `reply-classifier` skill.
9. **Billing (Stripe)** — checkout, subscriptions, usage metering on outreach + chat caps, hard-stop when limits exceeded.

### Cross-cutting

- **Auth:** Supabase Auth, email + "Sign in with Google."
- **Multi-tenant isolation:** every query filtered by `workspace_id`. RLS policies enforce at DB layer.
- **Secrets:** OAuth tokens encrypted at rest with Supabase Vault (or KMS).
- **Observability:** Sentry for errors. Helicone or Langfuse for every Claude call (replay, evaluate, debug).
- **Cost controls:** per-workspace weekly token budget (e.g. 5M tokens), per-job iteration cap (30 turns), daily $-circuit-breaker per workspace.

## 6. End-to-end weekly cycle

Example: Bright Smile Dental, WordPress + 2 GBP locations.

```
06:00  Scheduler fires weekly cycle for workspace.
06:00  Crawler:    fetch sitemap + GSC top pages, render ~80 pages.   ~6m
06:06  Connectors: pull 7d GSC + GBP profile/posts/reviews/Q&A.       ~1m
06:07  Agent (4 jobs parallel):
         A. page-audit on top 5 pages
         B. gbp-health-audit
         C. gsc-opportunity-scanner (decay / cannibalization / CTR)
         D. linkbuilding (find 15 prospects + draft pitches)          ~8m
06:15  Agent (drafting phase):
         - 1 article refresh (improve-content)
         - 1 GBP post (gbp-post-draft)
         - 3 technical fix tickets (technical-fix-detector)
         - 5 outreach drafts (top 5 prospects)                         ~12m
06:27  Agent: weekly-report-writer synthesizes everything.             ~1m
06:28  Email sent. Dashboard shows 14 items in draft queue.
```

Through the week:
- Customer reviews queue, edits, approves; execution gateway writes to Shopify/WP/GBP, stores rollback snapshot.
- Approved outreach emails are sent via customer's Gmail OAuth; follow-ups scheduled.
- Replies arrive → reply monitor → reply-classifier → drafted response → queue.
- Customer asks questions in chat → investigator agent answers and optionally drafts actions.

## 7. Skill catalog

### Adopted from superseo-skills (Apache 2.0; forked + adapted)

| Skill | Role in Hireling |
|---|---|
| `page-audit` | Weekly Job A; chat on demand |
| `content-brief` | Pre-step for any article draft |
| `write-content` | New article drafts (with per-customer voice layer) |
| `improve-content` | Article refresh drafts |
| `linkbuilding` | Weekly Job D + outreach drafting |
| `semantic-gap-analysis` | Invoked inside `improve-content` and in chat |
| `eeat-audit` | Invoked inside `page-audit` deep-dives |
| `keyword-deep-dive` | Powers chat answer for "what should I publish next?" |

Adaptation pattern for each forked skill:
- Strip interactive "ask the user" steps; replace with onboarding-captured profile.
- Standardize output to structured JSON + human-readable markdown.
- Add cost guardrails (token cap, max tool turns).
- Header records `BASE_SKILL_VERSION` so upstream changes can be tracked.

### Built new

| Skill | Function |
|---|---|
| `gbp-health-audit` | GBP profile audit: categories, photos, post cadence, review response rate, Q&A, NAP-vs-citations |
| `gbp-post-draft` | Draft 1500-char GBP post for current intent/promo |
| `gsc-opportunity-scanner` | Code-driven: 28d GSC analysis → decay, cannibalization, CTR-gap. Thin Claude wrapper to prioritize/explain |
| `technical-fix-detector` | Detect + draft one-click fixes for titles, metas, H1s, alts, basic schema |
| `reply-classifier` | Classify outreach replies + draft appropriate response |
| `investigator` | Chat persona with read tools across DB + connectors |
| `weekly-report-writer` | Synthesize the week into the Monday-morning email + dashboard summary, in customer voice |

### Voice training (V1 differentiator)

Onboarding asks customer to paste links to 3–5 of their existing articles. We crawl, extract voice patterns (sentence length distribution, vocabulary specificity, hook patterns, paragraph structure, brand-specific terms), and store a voice profile. The profile is injected into the system prompt of `write-content`, `improve-content`, `gbp-post-draft`, and `weekly-report-writer`. Re-trainable per request.

## 8. Trust, safety, rollback

### Three principles

1. **Nothing touches the outside world without a per-action human approval in V1.**
2. **Every reversible write is reversible for 24h, one click.**
3. **Hard-coded prohibitions in the execution gateway, not in the prompt:**
   - Never delete a published page.
   - Never change the primary domain.
   - Never modify product pricing.
   - Never edit robots.txt or sitemap.xml.
   - Never disconnect a connector.
   - Never exceed daily Gmail send cap.
   - Never email a suppression-list address.

### Failure handling

| Failure | Behavior |
|---|---|
| Crawler can't reach site | 3 retries with backoff, fall back to last week's snapshot, flag in report |
| OAuth expired | Pause affected jobs, banner + email asking to reconnect |
| Claude API down/rate-limited | Inngest retries with exponential backoff; if >2h, customer notified report is delayed |
| Low-confidence agent output (scored per job) | Routed to "needs review" queue with badge |
| Forbidden action attempted | Gateway rejects, logs, alerts internal team; agent gets correction note next turn |
| Gmail send bounce | Logged, sequence paused for prospect; after 3 consecutive bounces customer notified |
| Customer unhappy with executed change | 24h rollback covers reversibles; audit log shown otherwise |

### Audit log

Every action logged with timestamp, skill + version, inputs, outputs, approval decision, executed change with before/after. Customer can view their own log. Used internally for skill evals.

### Trust ladder

| Stage | Behavior |
|---|---|
| V1 (launch) | Per-action approval on everything |
| V2 (~3 months in) | Per-action-type auto-approve toggles (e.g., auto-publish title fixes) |
| V3 | "Trusted automations" tier — agent acts within budget, customer reviews weekly |

## 9. Tech stack

| Layer | Choice |
|---|---|
| Frontend / API | Next.js (App Router) on Vercel |
| Database | Postgres on Supabase |
| Auth | Supabase Auth |
| Background jobs + scheduler | Inngest |
| Agent runner | Node.js workers + Anthropic SDK with tool use |
| Crawler | Playwright on Fly.io workers |
| Object storage | Supabase Storage |
| Transactional email (our → customer) | Resend |
| Outreach email | Customer's Gmail via OAuth |
| Billing | Stripe |
| Error monitoring | Sentry |
| Agent observability | Helicone or Langfuse |

### Estimated infra cost at 100 paying customers

- Vercel + Supabase + Fly + Inngest: ~$300–500/mo
- Anthropic API: ~$15–30/customer/mo → $1.5K–3K/mo
- Other (Resend, Sentry, Helicone, etc.): ~$200/mo
- **Total: ~$2K–4K/mo**

At blended $300+/customer ARPU, gross margin ~85%.

## 10. Timeline (10 months)

```
Month 1–3   Phase 1 — Foundation
            Auth, billing, workspaces, connectors (Google/Shopify/WP),
            crawler, DB schema with RLS, fork+adapt 8 skills,
            build gsc-opportunity-scanner + technical-fix-detector.

Month 3–6   Phase 2 — Autopilot
            Inngest scheduler + weekly cycle, build
            gbp-health-audit + gbp-post-draft + weekly-report-writer,
            voice training onboarding, draft queue UI,
            execution gateway with rollback, audit log.

Month 6–8   Phase 3 — Copilot + Answers
            Chat interface + investigator skill, per-draft diff view,
            reply monitor + reply-classifier, outreach engine
            (Gmail send, sequences, suppression list).

Month 8–10  Phase 4 — Polish + launch
            Cost controls + hard prohibitions + circuit breakers,
            onboarding polish, closed beta with 10–20 design partners,
            public launch.
```

### Resourcing

- 1 founding engineer full-time (agent + skills + backend) — required
- 1 product engineer half-time or full-time (frontend + UX) — recommended
- Contract designer one-time $8–12K
- SEO advisor part-time $2–5K/mo (or equity) — validates skill quality, runs evals, supplies methodology authority

### Pre-revenue cash burn (excluding founder salary)
~$25–60K over 10 months: design contractor, advisor, dev-tier infra, Anthropic API for testing, legal/incorporation/privacy.

## 11. Open questions to resolve before implementation planning

1. **Product name.** "Hireling" is a placeholder.
2. **Geography for V1 launch.** US-only is simplest (GBP rules and Gmail OAuth scopes are most predictable). EU adds GDPR overhead.
3. **Self-host Playwright vs Browserless.io for initial crawler.** Self-host is cheaper at scale; Browserless saves 1–2 weeks early.
4. **Helicone vs Langfuse for agent observability.** Both fine; pick one in week 1.
5. **Voice training source of truth.** Confirm: 3–5 articles is enough, or do we need to crawl their entire blog?
6. **Outreach follow-up auto-send vs per-message approval.** V1 plan is per-message approval on follow-ups too; consider relaxing only follow-ups (not initials) after design-partner feedback.
7. **Beta program structure.** 10–20 design partners free for 3 months in exchange for weekly feedback?

## 12. Out of scope for this spec

Anything not listed in Section 4 "V1 scope" is out of scope. Notably: link outreach beyond what the customer's Gmail can sustainably send, multi-site beyond tier limits, agency/white-label, rank tracking, backlink monitoring, schema editor, auto-execution without approval. These belong to V2+.

## 13. License and attribution

The 8 adopted skills derive from `inhouseseo/superseo-skills` (Apache 2.0). We will:
- Preserve `LICENSE` and `NOTICE` files in our skill source.
- Mark modifications per Apache 2.0 §4(b).
- Credit InhouseSEO in product (footer + dedicated `/credits` page).
- Notify them at `hello@inhouseseo.ai` once we launch.
