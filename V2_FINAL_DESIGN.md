# Budgat V2 Final Design

This document defines the product model we should build toward before touching implementation.

The goal is to turn Budgat from "a set of useful finance screens" into one coherent system that is:
- understandable
- extensible
- safe to evolve
- usable by a couple
- later reusable by other households too

## Status

Status as of `2026-04-04`.

### Completed in the app

- Multi-household foundation exists with household selection and household membership roles in the database.
- Household creation and first-run household setup exist in the app.
- Household accounts exist with account type, owner member, opening balance, archive flag, and include-in-budget behavior.
- User-defined household categories now sit on top of stable `category_kinds`.
- The primary transaction flow is account-based and supports `expense`, `income`, and `transfer`.
- The primary history screen is a V2 household ledger with month, type, account, category, and search filters.
- The primary budget screen is month-based and uses `budget_months` and `budget_lines` instead of `monthly_budget` on categories.
- Reconciliation is now account-based using `account_reconciliations`.
- The analytics screen has been reintroduced on top of the V2 household transaction model.
- Legacy V1 frontend code paths have been removed from the app.
- The app can be set up from inside the UI for household, accounts, categories, budget, transactions, and reconciliation.
- The primary app navigation is now fully V2.
- A V1 schema removal script has been prepared: `supabase/sql/009_remove_v1_schema.sql`.
- Account visibility + simplified category flow have been implemented in code, with migration prepared in `supabase/sql/010_account_visibility_and_category_simplification.sql`.
- Build household invitations or join flows so another user can join an existing household from inside the app.

### Still to do (ranked: low -> high importance)

1. Add first-run defaults for suggested accounts and starter categories to reduce setup friction.
3. Do the explicit code cleanup pass so the codebase is easier to extend before bigger product iterations.
4. Add automated tests around the new SQL RPCs and the highest-risk V2 frontend flows.


## 1. Product Definition

Budgat is a `multi-household budgeting app` where each household:
- has members
- has accounts
- plans monthly category budgets
- records real transactions against real accounts
- tracks transfers separately from spending
- reconciles balances per account

This is the core product sentence:

`Budgat is a shared household budgeting app where monthly category budgets are tracked against real transactions from real accounts, with transfers separated from spending and reconciliation done per account.`

That sentence should guide the database, the UI, and the code cleanup.

## 2. The Coherent Budgeting Model

### 2.1 What counts as what

There are only three transaction kinds:

1. `expense`
- money leaves one account
- it belongs to one expense category
- it counts against the monthly budget

2. `income`
- money enters one account
- it belongs to one income category
- it does not count as spending

3. `transfer`
- money moves between two accounts in the same household
- it does not count as spending
- it does not count as income
- this is how savings and investing should be represented

### 2.2 Budget style

The recommended budget style for V2 is:

`Monthly category budgeting for expense categories, backed by real household accounts.`

That means:
- budgets are created per month
- only expense categories get budget amounts
- income is tracked separately
- transfers to savings/investing are tracked as account movements, not as expenses
- budget performance is measured by comparing actual expense transactions to that month's planned amount per category

This is not full double-entry accounting, and it is not full YNAB-style "assign every euro" from day one.
It is a simpler but coherent household budgeting model that fits your current stage better.

It stays extensible because we can later add:
- scheduled transactions
- savings goals
- more advanced forecasting
- split transactions
- account import/sync

## 3. Household Model

### 3.1 Multi-household by design

A user can belong to multiple households.

Examples:
- your household with your fiance
- a friend's own household if they use the app later
- a test household for trying things out

This means:
- data should belong primarily to a `household`
- users should be attached through membership records
- screens should always operate in the context of a selected household

### 3.2 Membership roles

Each household member should have a role.

Recommended roles:
- `owner`
- `admin`
- `member`

Phase 1 behavior:
- `owner` and `admin` can manage setup
- `member` can add transactions and use the app

This gives enough structure without overcomplicating permissions.

## 4. Account Model

Accounts are essential in V2.

### 4.1 Why accounts matter

Accounts answer the question:

`Where is the money right now?`

Without accounts:
- transfers stay fuzzy
- reconciliation stays unreliable
- savings/investing have no solid place in the model

### 4.2 Account rules

Each account belongs to one household.

Each account should have:
- a name
- an account type
- an optional owner member
- an include/exclude flag for budgeting views
- an opening balance
- an archived flag

### 4.3 Personal and shared accounts

We need both.

Examples in one household:
- Gilles checking account
- Fiance checking account
- Shared daily account
- Cash
- Savings
- Investment account

Recommended rule:
- if `owner_member_id` is set, the account is personal to that member
- if `owner_member_id` is null, the account is shared

### 4.4 Recommended account types

Seed these as a controlled enum:
- `checking`
- `savings`
- `cash`
- `credit_card`
- `investment`
- `loan`

### 4.5 Budget inclusion

Accounts should have:
- `include_in_budget = true/false`

Why:
- daily and checking accounts usually count toward household budgeting
- investment accounts might be excluded from day-to-day budget views
- savings may or may not be included depending on design, but transfers to them should never count as spending

Phase 1 recommendation:
- checking, cash, credit card: included by default
- savings and investment: excluded by default from budget totals, but still visible as accounts

## 5. Category Model

This needs a full redesign.

### 5.1 Problem with the current version

Right now category meaning depends too much on the user-facing name.
That is fragile and impossible to scale cleanly.

### 5.2 New category principle

Each user-created category should have:
- a custom display name
- a stable underlying category kind
- a fixed flow behavior behind the scenes

So the user chooses the visible label, but the system still knows what the category really is.

### 5.3 Category layers

We should separate:

1. `category_kinds`
- system-defined taxonomy
- stable internal meaning

2. `categories`
- household-specific categories
- user-facing label
- linked to one category kind

Example:
- display name: `Groceries`
- kind: `groceries`
- flow type: `expense`
- budgetable: `true`

Example:
- display name: `Salary Gilles`
- kind: `salary`
- flow type: `income`
- budgetable: `false`

### 5.4 Why this is better

This gives:
- user freedom in naming
- consistent reporting
- safe logic for graphs and budgets
- no more guessing by category name

### 5.5 Suggested seeded category kinds

Expense kinds:
- groceries
- dining_out
- rent
- mortgage
- utilities
- internet
- phone
- insurance
- healthcare
- transport
- fuel
- public_transport
- childcare
- pets
- subscriptions
- entertainment
- shopping
- gifts
- travel
- taxes_fees
- household_misc
- personal_misc

Income kinds:
- salary
- freelance
- bonus
- reimbursement
- gift_received
- interest
- dividend
- other_income

Transfer kinds are not needed as categories in phase 1, because transfers should not use spending categories.

### 5.6 Category creation flow in the app

For new users setting up inside the app:

When creating a category, the UI should ask for:
- category name
- category kind
- optional color/icon later

The app should derive automatically:
- whether it is expense or income
- whether it is budgetable
- how it should appear in reporting

This keeps setup simple but structurally correct.

## 6. Budget Model

### 6.1 Budgets should not live on the category table

This is a key design decision.

`monthly_budget` should not be stored permanently on the category itself.

Why:
- budgets change month to month
- categories are definitions, not monthly plans
- keeping one fixed amount on a category makes history inaccurate

### 6.2 New budget structure

We should create budgets per month.

Recommended structure:
- one `budget_month` record per household per month
- one `budget_line` per expense category in that month

### 6.3 What a budget month does

A budget month should represent:
- the planning period
- the planned amounts per category
- optional notes/status later

### 6.4 What a budget line does

A budget line should store:
- household_id
- budget_month_id
- category_id
- planned_amount

Derived in the app:
- actual_spent
- remaining
- over_budget

### 6.5 Budget reporting rule

Only `expense` transactions should reduce a category's monthly budget.

Income:
- tracked separately

Transfers:
- never counted as spending

## 7. Transaction Model

Transactions should be explicit and easy to understand.

### 7.1 Recommended phase 1 transaction structure

Each transaction should have:
- household_id
- entered_by_user_id
- transaction_date
- kind
- description
- notes
- amount
- account_id
- to_account_id nullable
- category_id nullable
- is_cleared
- created_at
- updated_at

### 7.2 Transaction rules by kind

#### Expense
- `account_id` required
- `category_id` required
- `to_account_id` null
- `amount > 0`

Meaning:
- money leaves `account_id`
- counts against the monthly budget of `category_id`

#### Income
- `account_id` required
- `category_id` required
- `to_account_id` null
- `amount > 0`

Meaning:
- money enters `account_id`

#### Transfer
- `account_id` required
- `to_account_id` required
- `category_id` null
- `amount > 0`

Meaning:
- money leaves `account_id`
- money enters `to_account_id`
- no budget impact

### 7.3 Important rule

`Amounts should always be stored as positive numbers.`

Meaning should come from `kind` and account direction, not sign guessing.

That will eliminate one of the biggest sources of confusion in the current version.

## 8. Reconciliation Model

Reconciliation must move from "global checkpoint" to `per-account reconciliation`.

### 8.1 Why

If accounts exist, reconciliation should answer:

`Does this one account's real balance match the balance implied by the recorded transactions?`

That is much clearer and more trustworthy.

### 8.2 Recommended structure

Each reconciliation record should store:
- household_id
- account_id
- reconciliation_date
- actual_balance
- notes optional

### 8.3 Derived reconciliation logic

For an account:
- start from opening balance
- apply all income, expense, and transfer effects up to that date
- compare expected balance with actual balance

This will be far more accurate and easier to explain than the current single-balance checkpoint logic.

## 9. Setup Flow For New Users

The app must be self-setup from inside the UI.

That means no hidden database assumptions and no backend-only setup steps.

### 9.1 First-run setup flow

Recommended onboarding:

1. Create or join a household
2. Add household members later or invite them
3. Add accounts
4. Add categories
5. Create current month's budget
6. Start adding transactions
7. Reconcile each account

### 9.2 Household setup requirements

The app should support:
- creating a new household
- switching between households
- inviting another user later

Phase 1 can keep invitations simple if needed, but the data model should support them.

### 9.3 Good defaults

We should seed helpful defaults for first-time setup:
- common category kinds
- a starter list of categories the user can accept/edit
- suggested accounts

This reduces friction for new users.

## 10. Screen-Level Product Rules

These rules keep the UI aligned with the model.

### 10.1 Add transaction screen

The form should ask:
- date
- kind
- account
- destination account if transfer
- category if expense/income
- amount
- description/payee
- note

It should dynamically hide irrelevant fields.

### 10.2 History screen

History should be a unified ledger filtered by:
- household
- account
- member
- category
- month
- kind

Transfers should clearly show source and destination accounts.

### 10.3 Budget screen

Budget screen should show, for the selected month:
- planned per category
- actual spent
- remaining
- status

Income and transfers should not be mixed into expense budget consumption.

### 10.4 Accounts screen

This should likely become a first-class screen in V2.

It should show:
- all accounts in the selected household
- current computed balance
- ownership
- included in budget yes/no
- reconciliation status

### 10.5 Analytics screen

Analytics should reflect the model exactly:
- spending by expense category
- income by income category
- transfers separately
- trends by month

No more ambiguous mixing.

## 11. Database Proposal

This is the recommended table set for V2.

### Core tables
- `households`
- `household_members`
- `accounts`
- `category_kinds`
- `categories`
- `budget_months`
- `budget_lines`
- `transactions`
- `account_reconciliations`

### Optional later tables
- `household_invites`
- `scheduled_transactions`
- `savings_goals`
- `transaction_attachments`
- `transaction_splits`

## 12. Recommended Columns

This is intentionally high-level so we can still refine before writing SQL.

### `households`
- id
- name
- base_currency
- created_by_user_id
- created_at

### `household_members`
- id
- household_id
- user_id
- role
- display_name
- joined_at

### `accounts`
- id
- household_id
- owner_member_id nullable
- name
- account_type
- opening_balance
- include_in_budget
- archived
- created_at

### `category_kinds`
- id
- key
- display_name
- flow_type
- budgetable
- system_order

### `categories`
- id
- household_id
- created_by_user_id
- name
- category_kind_id
- archived
- created_at

### `budget_months`
- id
- household_id
- month_key
- created_by_user_id
- created_at

### `budget_lines`
- id
- budget_month_id
- household_id
- category_id
- planned_amount
- created_at
- updated_at

### `transactions`
- id
- household_id
- entered_by_user_id
- transaction_date
- kind
- description
- notes
- amount
- account_id
- to_account_id nullable
- category_id nullable
- is_cleared
- created_at
- updated_at

### `account_reconciliations`
- id
- household_id
- account_id
- reconciliation_date
- actual_balance
- notes
- created_by_user_id
- created_at

## 13. Hard Rules We Should Enforce In SQL

These should be backed by constraints or checks where possible.

### Transactions
- `amount > 0`
- `kind in ('expense', 'income', 'transfer')`
- transfer requires `to_account_id`
- transfer forbids `category_id`
- expense/income require `category_id`
- expense/income forbid `to_account_id`

### Categories
- category must point to one category kind
- category kind controls flow type and budgetability

### Budgets
- one `budget_month` per household per month
- one `budget_line` per category per budget month

### Membership
- one user can be in many households
- one household can have many users

## 14. Migration Direction From Current App

Current weak points we are explicitly leaving behind:
- categories referenced by name
- fixed `monthly_budget` living on categories
- global reconciliation checkpoints
- transaction meaning derived from sign

Target direction:
- categories referenced by ID
- budgets stored per month
- reconciliations tied to accounts
- transaction kind is explicit

Because your current data is still limited, this is the right moment to change the shape instead of patching around the old model.

## 15. Recommended Build Order

We should not implement this all at once.

Recommended order:

1. Clean up the frontend codebase structure
2. Introduce the new database model
3. Add household selection and setup flow
4. Add accounts
5. Replace categories with kind-backed categories
6. Replace transactions with the explicit account-aware model
7. Replace budgets with monthly budget lines
8. Replace reconciliation with per-account reconciliation
9. Rebuild analytics on top of the new rules

## 16. Final Recommendation

This is the final recommended direction for V2:

- multi-household
- household members with roles
- real accounts
- explicit transaction kinds
- transfers not counted as spending
- savings and investing represented as transfers into dedicated accounts
- user-created categories linked to stable system kinds
- monthly budgets stored per month, not on category definitions
- per-account reconciliation
- self-setup onboarding inside the app

This gives us a product that is:
- coherent
- explainable
- extensible
- implementable in phases

And most importantly, it is a model that both you and your fiance can actually trust in daily use.
