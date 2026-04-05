# Budgat V2 - Product + Dev Handoff User Story (Updated)

## 1) Purpose
This document is the handoff baseline for the next developer.
It describes what is already implemented, what rules are currently in force, and what still needs to be done to move from stable V2 to optimized VNext.

Use SQL migrations as source of truth for backend behavior.

## 2) Product Model (Current)
- Household-first architecture.
- Multiple households per user.
- Membership roles: owner, admin, member.
- Core financial entities:
  - accounts (account-bound ownership model)
  - categories (account-based)
  - transactions (`expense`, `income`, `transfer`)
  - budgets (month + account scope)
  - reconciliation checkpoints per account

### Transaction semantics
- `expense`: spending on source account with expense category.
- `income`: inflow on source account with income category.
- `transfer`: movement between source and destination accounts, not spending.

## 3) What Is Implemented

### App flows
- Auth + household switching.
- Household creation and join by invite.
- Account management (create + edit opening balance).
- Category management from UI (flow-based create: expense/income).
- Add transaction form with transfer support.
- History filters.
- Budget view (account-scoped).
- Graphs view.
- Reconciliation view.
- CSV export/import.
- Debug reset + seed tools.

### Recent decisions and implemented changes
- Members can create accounts (admin-only restriction removed).
- Transfer account pickers can show all household accounts.
- Generated checking account naming now prefers member display name.
- Existing generated checking names can be backfilled toward display-name naming.

## 4) Backend / Migration Notes
Key SQL progression now includes:
- `001` to `015`: foundation + V2 flows + account-based categories + debug + budget scope.
- `016`: debug reset naming preference update.
- `017`: backfill existing generated checking account names.
- `018`: allow all household members to create accounts.
- `019`: expose all household accounts in `list_household_accounts`.
- `020`: member category creation for own account scope.

Always add forward-only migrations for behavior changes.

## 5) Current Permission Rules (Target Runtime)
- Any household member can create accounts.
- Members can create categories for accounts they are allowed to manage (currently implemented as own-account scope for category creation).
- Debug reset/seed remains owner/admin only.

Note: account visibility policy and category visibility policy must stay explicitly documented whenever changed.

## 6) Main Remaining Work

### A) Onboarding auto-provisioning
Still to implement:
- On household create: auto-create one personal checking account for creator.
- On invite join: auto-create one personal checking account for joining member.
- Do not auto-create categories.

### B) Test coverage (high priority)
Add automated tests for:
- account/category permission boundaries
- transfer rules
- account/category coupling constraints
- onboarding/join auto-provisioning
- budget account scoping

### C) Cleanup and consistency
- Keep docs aligned with runtime behavior and migration reality.
- Remove stale references to pre-account-scoped budget/category UX.
- Keep module boundaries clear (setup/account/category/transaction/budget/debug).

## 7) Working Agreement for Next Developer
- Work branch-first, not directly on `main`.
- Prefer additive SQL migrations for every RPC/policy change.
- Keep transfer semantics strict.
- Keep account/category scope rules explicit and tested.
- Keep setup manageable from the app (no DB-only manual setup for normal usage).

## 8) Non-Goals (for now)
- Scheduled transactions UI/workflow.
- Savings goals full subsystem.
- Full forecasting/planning engine.
- Split transactions.
- Bank sync integrations.
- Advanced custom RBAC matrix beyond current role model.
