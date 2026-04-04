# Current Version Shortcomings

This document captures the main shortcomings I found in the current version of the app by reviewing the code and UI structure in this repository.

It covers:
- programming and architecture issues
- data integrity and maintainability risks
- UI/UX shortcomings
- product gaps visible in the current implementation

Some points below are confirmed implementation problems. A few are marked as risks because they depend on Supabase policies or intended product rules that are not included in this repo.

## 1. Programming / Architecture Shortcomings

### 1.1 The app relies heavily on globals and inline handlers
- Many actions are attached through `window.*` exports and `onclick="..."` attributes instead of module-scoped event binding.
- This creates tight coupling between HTML and JS and makes the app harder to refactor, test, and reason about.
- It also increases the chance of silent breakage when IDs or function names change.

### 1.2 Views are fetched at runtime as HTML fragments
- Core screens are loaded with `fetch()` from separate HTML files.
- If one fetch fails, there is no visible fallback state for the user.
- This makes startup more fragile and can create timing issues because code assumes the view DOM exists after async loading.

### 1.3 Business logic is spread across DOM code, rendering, and database calls
- Feature files mix query logic, calculations, DOM mutation, and styling decisions in the same functions.
- This makes reuse difficult and turns simple changes into multi-file edits.
- There is no clear separation between state, business rules, and presentation.

### 1.4 No real state management
- State lives in module globals like `historyTypeFilter`, `categoryTypes`, `globalData`, and `isGridView`.
- This is easy to desynchronize after edits, imports, category changes, or view switches.
- There is no centralized refresh strategy, so the app depends on manually calling multiple reload functions after each action.

### 1.5 Repeated data fetching and inefficient client-side processing
- Screens often fetch full tables and then filter or regroup everything in the browser.
- `loadAllTransactions()`, `loadBudget()`, and `loadGraphs()` all pull broad datasets and recalculate from scratch.
- This will become noticeably slower as transaction history grows.

### 1.6 Several computations are duplicated or inconsistent
- Transaction type is derived in multiple places with slightly different logic.
- Budget, graphs, history, and reconciliation each reinterpret transaction meaning independently.
- That makes it easy for one screen to disagree with another.

### 1.7 Hidden dependence on category names as keys
- Categories are selected and matched by `name` instead of a stable category ID.
- Renaming a category can break historical grouping or disconnect old transactions from their intended category semantics.
- This is a structural data-model weakness.

### 1.8 Category type cache can go stale
- `loadCategoryTypes()` builds a cache once, but category edits do not clearly refresh that cache everywhere.
- That can lead to wrong type inference after category changes until the page is reloaded.

### 1.9 Editing category UI is brittle
- The category edit flow mutates button text and button handlers dynamically.
- It uses DOM queries like `button[onclick="addCategory()"]` and `button[onclick^="updateCategory"]`, which are fragile.
- This approach is easy to break with markup changes.

### 1.10 Initialization duplicates work
- `initApp()` calls navigation setup and transaction loading before `checkUser()`.
- `checkUser()` then calls more loading and navigation setup again when a user exists.
- This creates duplicate work and makes startup flow harder to follow.

### 1.11 Errors are handled with `alert()` or ignored
- Most failures either show a blocking alert or fail silently.
- There are almost no inline error states, retry states, or structured logging.
- Users get poor feedback, and developers get little diagnostic value.

### 1.12 No visible automated tests
- There are no test files or validation layers in the repo.
- Core money logic is unprotected by unit tests, integration tests, or regression tests.
- This is risky because the app does a lot of derived calculations.

### 1.13 No visible schema/version coordination in the frontend
- The app assumes certain columns exist and have certain meanings.
- There is no frontend guard for schema drift and no migration notes in the repo.
- Changes in Supabase structure could break screens without clear detection.

### 1.14 Configuration is hard-coded in the client
- Supabase URL and key are committed directly in the frontend code.
- The publishable key itself is not necessarily secret, but this setup is inflexible across environments.
- It makes local/dev/staging/prod separation harder than necessary.

### 1.15 External dependencies are loaded from CDNs in production HTML
- Tailwind, Supabase, Chart.js, and Google Charts are pulled directly from CDNs.
- This increases runtime fragility and gives little control over version locking, offline development, or long-term reproducibility.

## 2. Data Integrity / Logic Risks

### 2.1 Transaction type logic contains contradictions
- Some code still infers type from amount sign, while newer code stores explicit `type`.
- `saveTransaction()` always stores `Math.abs(amount)`, so sign-based fallback is no longer reliable.
- Any screen still using sign-based assumptions can produce wrong results.

### 2.2 Budget logic appears partially broken for typed transactions
- In `loadBudget()`, transactions are fetched with `select('category, amount, date')`, but later code checks `t.type`.
- Because `type` is not fetched there, type-aware calculations can degrade into incorrect expense defaults.
- Income and transfer totals in the budget view are therefore at risk of being wrong.

### 2.3 Reconciliation math depends on sign conventions that no longer match storage
- Reconciliation sums raw transaction amounts and then subtracts the delta from the previous checkpoint.
- Since saved amounts are stored as positive numbers, expected balances can easily be wrong unless every transaction type is handled explicitly.
- This is a likely correctness bug, not just a UX issue.

### 2.4 User scoping is not enforced in client queries
- Many queries fetch all rows from tables without filtering by `user_id`.
- Updates and deletes also target rows by `id` only.
- If Supabase row-level security is missing or incomplete, this becomes a serious multi-user data exposure risk.
- If RLS is present, the app still relies on backend policy rather than making scoping explicit in the client.

### 2.5 Imported CSV data lacks normalization and validation
- CSV parsing is hand-written and brittle.
- There is no duplicate detection, no schema validation, and no category/type reconciliation.
- Large or slightly malformed imports can create bad data very easily.

### 2.6 Category deletion can orphan transaction meaning
- Deleting a category does not appear to warn about linked transactions or offer reassignment.
- Historical transactions can remain with category names that no longer exist in the category list.
- This weakens consistency across history, graphs, and budgets.

### 2.7 No transactional safety for multi-step refresh flows
- After create/update/delete operations, multiple views are reloaded separately.
- If one refresh succeeds and another fails, the UI can temporarily show conflicting states.

### 2.8 Date and locale handling is inconsistent
- Some UI strings are English, some labels are Dutch, and date formatting is hard-coded to `en-US`.
- This is not only a UX issue; it also increases the chance of confusion in reporting and exports.

## 3. Maintainability / Code Quality Shortcomings

### 3.1 Large render functions generate long HTML strings
- Several screens build large template strings inline.
- This makes the code hard to read, hard to diff, and easy to break with quoting/escaping issues.

### 3.2 HTML is injected directly without systematic escaping
- Transaction descriptions, remarks, and category names are interpolated into HTML strings.
- If bad input reaches the database, this can become an XSS risk.
- Even if Supabase data is trusted today, this is still an unsafe pattern.

### 3.3 DOM lookups are repeated everywhere
- Most actions repeatedly query the DOM instead of owning local components or reusable helpers.
- This adds noise and makes simple logic harder to follow.

### 3.4 Styling is embedded in JavaScript
- Button states and visual variants are changed with large class strings inside JS.
- That mixes visual decisions into business code and makes design maintenance harder.

### 3.5 Naming and product identity are inconsistent
- The repo is called `budgat`, the HTML title says `QuickBudget`, and the header says `BudgetPlanner`.
- This suggests the product is not yet coherent at the branding and implementation level.

## 4. UI / UX Shortcomings

### 4.1 The app is visually clean but still feels prototype-like
- The screens are functional, but the overall experience lacks product polish, hierarchy, and confidence cues.
- It feels like a collection of useful panels rather than one cohesive budgeting workflow.

### 4.2 Forms rely too much on placeholders instead of labels
- The main add-transaction form has almost no persistent labels.
- This hurts accessibility, scanability, and form clarity, especially on mobile or after partial input.

### 4.3 Authentication flow is too bare
- Login/sign-up is a plain email/password box with no reassurance, no password guidance, no loading state, and no recovery path.
- There is no forgot-password flow or confirmation/explanation after sign-up.

### 4.4 Too many destructive actions depend on tiny icon buttons
- Edit and delete controls are small, low-visibility icons.
- On touch devices this creates discoverability and tap-target problems.
- Important actions should be easier to recognize and safer to use.

### 4.5 Feedback after actions is weak
- Saving, importing, deleting, and updating mostly produce no inline confirmation.
- Users do not get strong success states, undo opportunities, or contextual error messaging.

### 4.6 History view interaction model is not obvious
- The screen says "Swipe for past months", but the content is a horizontally scrolling set of month cards with filters above it.
- This interaction is not standard for transaction history and can hide information.
- Users may miss older months or not realize the area scrolls sideways.

### 4.7 Budget view changes layout drastically
- Toggling between list and grid changes the container from narrow mobile width to very wide layout.
- That is a large spatial jump and can feel disorienting.
- It also makes the app behave inconsistently across tabs.

### 4.8 Graphs are not self-explanatory enough
- The dashboard has attractive cards and charts, but the meaning is often ambiguous.
- The Sankey explanation is inaccurate relative to the implementation.
- The trend and status cards do not explain what "good" or "bad" means in practical budgeting terms.

### 4.9 Accessibility appears underdeveloped
- There is little evidence of semantic labeling, keyboard-focused interaction design, or screen-reader support.
- Color carries too much meaning in several places.
- Tiny text and low-contrast slate tones may be difficult for some users.

### 4.10 No empty-state guidance beyond minimal text
- Empty states mostly say "No data" without telling users what to do next.
- A budgeting app should guide first-run setup: create categories, add income, set budgets, record starting balance, etc.

### 4.11 Category management is functional but not friendly
- Categories are shown as a flat list without grouping, search, sorting options, or usage counts.
- There is no indication of which categories are active, unused, or safe to delete.

### 4.12 Import/export UX is risky
- CSV import gives little confidence about expected format, preview, conflict handling, or rollback.
- A user can import a file and only discover problems afterward.

### 4.13 The app does not guide users through a budgeting method
- The product exposes transactions, categories, budgets, and graphs, but not a clear mental model.
- It is unclear whether the app is envelope budgeting, spending tracking, cashflow planning, or reconciliation-first bookkeeping.
- That weakens onboarding and decision-making.

### 4.14 Mobile-first layout exists, but some screens are still awkward on small screens
- Horizontal history cards, dense graph cards, and grid tables can become cramped or require awkward scrolling.
- The interface often fits on mobile, but not always comfortably.

### 4.15 Microcopy is inconsistent
- English and Dutch appear together.
- Some labels are product terms, some are casual descriptions, and some are implementation-oriented.
- This makes the experience feel unfinished.

## 5. Product Gaps Visible In The Current Version

### 5.1 No recurring transactions or planned future transactions
- The current version is reactive, not planning-oriented.
- That limits usefulness for real monthly budgeting.

### 5.2 No rollover budgeting model
- Budgets appear monthly only, without explicit carryover behavior.
- This makes long-term category planning less realistic.

### 5.3 No savings-goal workflow
- Transfers exist as a type, but there is no dedicated goal tracking or progress model.

### 5.4 No account model
- Reconciliation exists, but there are no separate accounts, balances, or transfers between accounts.
- That makes reconciliation harder to trust and harder to explain.

### 5.5 No onboarding path
- New users are not guided through setup order or first-success milestones.

## 6. Highest-Priority Issues To Address First

If this version is going to be improved iteratively, the highest-value first fixes are:

1. Fix transaction-type consistency everywhere and stop relying on sign-based fallbacks.
2. Fix budget and reconciliation correctness, especially where `type` is not fetched or not used consistently.
3. Make user scoping explicit and verify row-level security assumptions.
4. Replace inline handlers and `window` globals with proper event binding.
5. Add safer rendering and input escaping.
6. Improve form labels, feedback states, and first-run empty states.
7. Clarify the product model: spending tracker, budget planner, savings planner, or account-based finance tool.

## 7. Final Assessment

The current version is a promising working prototype with a lot of useful surface area already present. The biggest weakness is not visual styling but product and logic coherence: the app currently does many things, but some of the money rules, data model choices, and user flows are not yet consistent enough to make the experience feel fully trustworthy.

In short:
- the main technical risk is correctness and maintainability
- the main UX risk is clarity, guidance, and confidence
- the main product risk is that the app has useful features without one fully coherent budgeting model behind them
