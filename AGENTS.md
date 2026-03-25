# Strata CRM UI Overhaul Rules

You are working on Strata CRM, a production-minded CRM for automotive service businesses.

## Core goals
- Make the UI feel premium, modern, smooth, and extremely efficient
- Preserve all existing business logic and working functionality
- Improve usability without creating regressions
- Prioritize real-world speed for shop owners using the app daily

## Hard constraints
- Do not break routes, database behavior, API contracts, permissions, auth flows, or integrations
- Do not remove features unless they are clearly redundant and replaced with a better equivalent
- Do not rewrite large systems unless necessary
- Make safe, incremental changes
- Keep diffs scoped and easy to review

## UX standards
- Reduce click depth
- Improve spacing, hierarchy, density, and readability
- Standardize components across the app
- Make forms faster to complete
- Make tables easier to scan
- Improve filters, search, and bulk actions
- Improve empty states, loading states, and error states
- Make all major workflows feel smooth and intentional
- Optimize for desktop first, but ensure mobile responsiveness

## Calendar goals
- Calendar should feel similar to Acuity in clarity and ease of use
- Fast day/week navigation
- Clean staff availability visualization
- Frictionless booking and rescheduling
- Strong appointment cards and details panel
- Easy drag/drop or quick reschedule if architecture allows safely
- Reduce visual clutter while preserving scheduling power

## Workflow priorities
1. Calendar and scheduling
2. Dashboard clarity
3. Customer and vehicle records
4. Job workflow / statuses
5. Estimates, invoices, and service authorizations
6. Service management and onboarding
7. Global navigation and responsiveness

## Development process
- Audit before changing
- Identify top UX bottlenecks
- Improve the highest-impact workflows first
- After each major milestone, run build, lint, and tests
- Fix issues immediately before moving on
- Summarize what changed after each milestone

## Output expectations
Always provide:
- What was improved
- What was preserved
- What risks were avoided
- Any remaining UX debt
