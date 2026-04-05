# Budgat Next Phase Plan

## 1) Current State
- Household-first V2 model is live: households, invites, accounts, categories, transactions, budget, history, graphs, reconciliation.
- Account balances are editable from the Settings account list (`Edit balance` inline flow).
- Members can create accounts (not admin-only anymore).
- Transfer flows can select across all household accounts (source/destination list no longer restricted to own+shared only).
- Debug reset/seed exists and recreates base checking accounts.
- Account naming logic for generated checking accounts now prefers `household_members.display_name`.

## 2) Must Finish Before Scaling
- Auto-provision personal checking accounts on:
  - household creation
  - invite join
- Finalize and document permission model consistently:
  - account visibility for normal views
  - transfer account selection behavior
  - category management scope (own/shared/all)
- Add regression tests for critical SQL rules:
  - account/category permission boundaries
  - transfer invariants (no transfer-as-spending)
  - account-scoped category enforcement
  - onboarding/join provisioning behavior
- Align docs and migrations list so fresh setup and existing DB upgrade path are both explicit.

## 3) Optimization
- Reduce duplicate refresh/hydration calls after mutations (accounts/categories/transactions).
- Consolidate frontend state invalidation patterns into shared helpers.
- Tighten SQL function ownership boundaries and naming (setup vs runtime vs debug).
- Add lightweight observability hooks for failed RPC calls and slow view loads.
- Improve query performance for history/graphs on larger datasets (indexes + selective payloads).

## 4) New Features
- Budget rollover as explicit user choice (not automatic).
- Forecasting/planned transactions (including spread across future months).
- Richer analytics:
  - all-time trends
  - month-over-month comparisons
  - savings/investment-specific charts
- Better import/export workflow:
  - round-trip CSV/Excel-compatible templates
  - safer mapping/validation UI
- Savings goals and goal tracking views.
