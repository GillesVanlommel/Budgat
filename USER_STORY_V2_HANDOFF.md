# Budgat V2 - Product + Dev Handoff User Story

## 1) Context and Origin

Budgat started as a finance app with multiple useful screens, but without one coherent budgeting model.
The V2 effort changed this into a household-first model with:
- households and memberships
- real accounts as source of truth
- category-based budgeting on expense transactions
- transfer separation (not spending)
- account reconciliation

This handoff is for continuing V2 as a usable shared household product for the owner and fiance, while keeping the architecture extensible for additional households later.

Assumption for the next developer:
- work from a fresh environment
- schema migration scripts are the source of truth
- product + engineering decisions in this document are binding for the next phase

## 2) Current V2 State (What Already Exists)

### Core data model and flows already implemented
- Multi-household model with membership roles.
- Household create + join via invite from inside the app.
- Household accounts with owner member, type, opening balance, include-in-budget, archive.
- Account visibility model: users see their own accounts + shared accounts.
- Transaction model:
1. `expense` with category
2. `income` with category
3. `transfer` between accounts (not spending)
- History view with filters.
- Month-based budget model (`budget_months`, `budget_lines`).
- Budget view is account-scoped via selector (one account at a time).
- Reconciliation checkpoints per account.
- Analytics view on V2 transactions.

### Category model status
- Categories are account-based (not household-global).
- Category creation in UI is simplified to name + flow type (`expense|income`).
- Backend uses stable kinds (`category_kinds`) behind the scenes.
- Category creation is resilient: if required default kinds were deleted, they are auto-recreated.

### Debug tooling now implemented in settings
- Reset household to base:
  deletes transactions, categories, budgets, reconciliations, accounts
  then recreates personal checking accounts for all members
- Seed mock data:
  resets first, then creates categories and sample transactions/transfers
- Debug tools are restricted to owner/admin.
- Base account naming now prefers actual user profile names (not household name text).

### SQL migration baseline for fresh environments
- `012_account_based_categories.sql`
- `013_category_kind_resilience.sql`
- `014_debug_household_seed_tools.sql`
- `015_budget_account_scope.sql`

## 3) Problem Statement (What Is Still Wrong or Incomplete)

The current build is functionally strong but still has onboarding and maintainability gaps:
- onboarding friction is still too high for brand-new households
- permission behavior does not yet match product decision for members editing setup entities
- cleanup pass is still needed to reduce future feature cost
- automated tests for high-risk logic are not in place

There is also a product consistency issue:
- some docs still describe older category UX (explicit kind selection), while runtime UX is now simplified flow-type selection
- budget is now intentionally account-by-account, so product copy/docs must stop describing one combined household category budget list.

## 4) Product Decisions Confirmed by Owner (Do Not Re-debate)

- Audience for this handoff: product + developer.
- Execution priority: strict order (do item 1 fully before item 2, etc.).
- Starter onboarding accounts:
  personal checking accounts only, one per member.
- Shared accounts:
  users create shared account manually later.
- When a new member joins:
  auto-create personal checking account for that new member.
- Starter categories:
  none by default.
- Account visibility:
  user can access only own accounts + shared accounts.
- Category visibility/edit rights:
  user can manage only categories for accounts they can access.
- Member permissions:
  members must be able to create and edit categories and accounts.
- Testing stack choice:
  not part of current planning decision.
- Non-goals section is required in this handoff.

## 5) Single User Story for Next Phase

As a household member, I want to complete setup and day-to-day money tracking directly in the app with a coherent account-based budgeting model, so that personal and shared finances stay accurate, understandable, and maintainable as more households adopt the product.

## 6) Strict Ordered Backlog (Includes Remaining Final-Design TODOs)

### 1. Onboarding Defaults and Join Auto-Provisioning (First priority)
Deliver:
- On household creation:
  create one personal checking account for the creator.
- On household join:
  create one personal checking account for the joining member.
- Do not auto-create categories.
- Do not auto-create shared accounts.

Definition of completion:
- Fresh household with one member has exactly one personal checking account.
- New joiner gets exactly one personal checking account.
- No starter categories are created.

### 2. Permission Alignment for Members (Second priority)
Deliver:
- Update RPC authorization so `member` can create/edit:
  accounts and categories (within visibility rules).
- Keep access scoping:
  members can only manage accounts/categories they can see (own + shared).

Definition of completion:
- Member can create/edit own accounts and shared accounts.
- Member cannot edit hidden accounts.
- Member can create/edit categories only on visible accounts.

### 3. Documentation + UX Consistency Cleanup (Third priority)
Deliver:
- Align all product text with actual runtime behavior:
  account-scoped budget view,
  account-scoped categories,
  no transfer categories.
- Remove dead/duplicate code paths and outdated assumptions.

Definition of completion:
- No stale imports/exports from removed flows.
- No runtime references to outdated category UX.
- No runtime references to outdated budget UX.
- Handoff docs and design docs match implemented V2 behavior.

### 4. Code Cleanup Pass (Fourth priority; existing final-design TODO)
Deliver:
- Standardize module boundaries for setup/account/category/transaction/budget/debug flows.
- Keep SQL/RPC definitions easy to discover and version.
- Remove remaining V1-era naming ambiguities.

Definition of completion:
- Clear feature ownership per module.
- No duplicate business logic in multiple frontend files.
- Migrations and runtime assumptions are aligned.

### 5. Automated Tests for High-Risk V2 Flows (Fifth priority; existing final-design TODO)
Deliver:
- Add tests around:
  account visibility boundaries,
  account-based category enforcement,
  transfer semantics,
  invite/join + auto-checking behavior,
  account-scoped budget listing.

Definition of completion:
- Regression suite covers critical SQL and key frontend workflows.

## 7) Execution Notes for Developer

- Work branch-first; do not commit directly to `main` (live redeploy trigger).
- Use additive migrations (`supabase/sql/NNN_*.sql`) for every schema/RPC change.
- Keep transactional semantics strict:
  transfers never counted as spending.
- Keep category scope strict:
  category must match source account.
- Preserve app-level setup capability:
  no manual DB-only setup requirement for normal users.

## 8) Non-Goals (Out of Scope Now)

- Scheduled transactions.
- Savings goals system.
- Forecasting/planning engine beyond current monthly budget.
- Split transactions.
- Bank sync/import integrations.
- Advanced role matrices beyond current member/admin/owner model.

These can be addressed later after the ordered backlog above is complete.
