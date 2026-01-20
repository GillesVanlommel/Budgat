# Feature Design: Shared Finances & Household Integration

## 1. Problem Statement

**The "Black Hole" Effect**
Currently, the user transfers a lump sum (e.g., €1,000) from their personal account to a shared "Household" account (for a partner/roommate). In the personal budget, this appears as a single large expense category called **"Shared"**.

**The Issue:**
This hides the reality of the user's lifestyle.

* **Loss of Granularity:** The user might spend very little on "Personal Food," but the household spends €400 on groceries. The personal dashboard effectively says "You spent €0 on food," which is false.
* **Double Income Illusion:** If we simply view both accounts together, the money is counted twice: once as income in the personal account, and again as "income" (contribution) in the shared account.
* **Double Counting Expenses:** We cannot simply add the two lists together, or we would count the €1,000 "Transfer" *and* the €1,000 worth of actual rent/groceries it paid for.

---

## 2. Options Considered

### Option A: The "Household Mode" (Virtual Merge)

A simple view that dumps all transactions from both accounts into one list.

* *Pros:* Easy to implement.
* *Cons:* Requires complex manual work to deduplicate transfers. It often overstates expenses because it counts the full household rent instead of just the user's portion.

### Option B: Proportional Attribution (The 50/50 Split)

Injecting "Ghost Transactions" into the personal view representing a percentage of the shared spending (e.g., showing 50% of the rent bill).

* *Pros:* Extremely accurate for personal budgeting.
* *Cons:* High effort to maintain if the split ratio changes (e.g., one partner starts earning more). Doesn't show the "Total Bill" if you want to see if the household is overspending.

### Option C: The Drill-Down (The Peep Hole)

Keeping the "Shared" category as a button that opens a separate report for the shared account.

* *Pros:* Non-intrusive.
* *Cons:* Mental math is still required. You have to manually add "Personal Food" + "Shared Food" to know your total.

---

## 3. The Chosen Solution: "Ghost User with Smart Merge"

We have selected a **Hybrid Approach** that combines the data integrity of a separate account with the convenience of a merged view.

### Core Concepts:

1. **The "Ghost User":** The Shared Account exists as its own independent user in the database. It is not a "sub-account" of the user.
2. **One-Way Linking:** The Personal User has special "Read Access" to the Ghost User's data.
3. **The "My Share" Factor:** Every transaction in the shared account has a `my_share` snapshot (e.g., {"gilles": 55, "nele": 45}), allowing us to calculate exactly what portion belongs to the user at the time of purchase.
4. **The Toggle:** The dashboard will have a **"Personal / Include Shared"** switch.

### The "Smart Merge" Logic (When Toggle is ON):

When the user turns on "Include Shared," the system performs a real-time filter:

1. **Hide Outgoing:** The personal transaction categorized as **"Transfer to Shared"** is hidden. (We can link the transfers by copiable uuid that assign to the shared account  incoming transfer maybe?)
2. **Hide Incoming:** The shared transaction categorized as **"Contribution from User"** is hidden.
3. **Inject & Scale:** The actual shared expenses (Rent, Groceries) are pulled in. Their amounts are multiplied by the `my_share` factor (e.g., €100 groceries * 0.50 = €50).

**Result:** The "Transfer" disappears, replaced by the specific items it paid for, scaled to the user's responsibility.

---

## 4. Implementation Steps

### Phase 1: Database Architecture

1. **Create `household_access` Table:** A new table to store the link between the "Owner" (User) and the "Target" (Ghost Account). It also stores the configuration names for the categories to ignore (e.g., "Transfer", "Contribution").
2. **Update `transactions` Table:** Add a `my_share` column (Decimal) to store the split ratio (default 1.0 for personal, 0.5 for shared).

### Phase 2: User Interface (Settings)

1. **Link Account UI:** A section in Settings to input the email of the Shared Account to establish the link.
2. **Default Split Setting:** A preference input to set the default split percentage (e.g., 50%) for new shared transactions.
3. **Category Mapping:** Inputs to tell the system which category names represent the "Transfers" (so the system knows what to hide).

### Phase 3: Transaction Logic (The Backend)

1. **Modify "Add Transaction":** When adding to the Shared Account, the system must capture the current "Default Split" setting and save it into the `my_share` column.
2. **Build "Smart Fetch":** Create a function that fetches both datasets, applies the hiding logic (filtering out the transfer categories), applies the math logic (multiplying by `my_share`), and returns a single combined list.

### Phase 4: Dashboard Integration

1. **Add Toggle Switch:** A visual switch on the History and Graphs pages ("Personal Only" vs. "Combined").
2. **Update Graphs:** Ensure the charts re-render using the "Smart Fetch" data when the toggle is flipped, showing the true breakdown of "Food," "Rent," etc.