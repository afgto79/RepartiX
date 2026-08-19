# RepartiX — UX Refactor Spec for Windsurf + Claude Code
Version: 1.2
Goal: Refactor the frontend UX with minimal token usage, while preserving the existing backend logic and the working parts of the repo.

---

## 0. Mission

Refactor **only what is necessary** to make the application clearer, more professional, and more usable in daily work.

Primary target:
- improve UX
- keep existing business logic when possible
- reuse current code and API endpoints
- avoid unnecessary rewrites
- avoid adding heavy dependencies

This is a **local business tool** for one pharmacy first.

Do not turn it into a SaaS architecture.
Do not redesign the backend unless strictly required for claims/payments support.

---

## 1. Existing Context to Preserve

### Purpose
RepartiX is a local tool to verify that **Alliance Healthcare** correctly pays contractual rebates.

Current real-world contract used by the app:
- **global rebate rate = 3% of total monthly NET HT purchases**

### Existing stack
Frontend:
- React 18
- Vite
- TailwindCSS
- Tremor
- Recharts

Backend:
- Node.js
- Express
- TypeScript
- JSON storage

### Existing repo structure
- `backend/`
- `frontend/`
- `launcher/`
- `SPEC_TECHNIQUE.md`
- `PROMPT_WINDSURF.md`

### Existing working features to preserve
Do **not** rewrite these if avoidable:
- PDF import flow
- decade parsing
- duplicate detection by hash
- monthly rebate calculation
- JSON storage approach
- Windows launcher approach

### Existing backend calculation / statuses
The backend already uses a monthly analysis model with statuses such as:
- `OK`
- `EN_COURS`
- `RETARD`

Keep backend-compatible logic.
Frontend may map labels visually if needed, but do not break backend assumptions.

Suggested visual mapping:
- `OK` → OK
- `EN_COURS` → Incomplet
- `RETARD` → Irrégulier / Retard

---

## 2. Golden Rule for This Refactor

Before changing code:
1. inspect current frontend structure
2. identify reusable components
3. keep existing API wiring if possible
4. replace current multi-view UX with a simpler 3-page structure
5. avoid touching parsing/calculation code unless absolutely necessary

Do not over-engineer.
Do not create speculative features.

---

## 3. Business Model (Validated)

The application must clearly separate **4 layers**:
1. monthly calculation
2. detected irregularities
3. claims sent to the wholesaler
4. payments received

These layers must **not be visually confused**.

---

## 4. Core Business Rules (Validated)

### 4.1 Monthly irregularity
For a complete month:

`expected rebate = monthly NET HT × contract rate`

If received rebate is lower than expected rebate, the month is irregular.

A month with incomplete data remains incomplete and should not be treated like a confirmed irregularity.

### 4.2 Alert rule
- the **first irregular month** must already be visible in the UI
- the app must raise a stronger alert starting from the **second successive irregular month not already covered by a claim**

Important: the user clarified that the app should signal the first month, and alert more strongly once the situation becomes serious enough to justify action.

### 4.3 Claims
A claim covers:
- a period of months
- a claimed amount
- a creation date
- optional comment

Rules:
- the amount should be **auto-calculated from selected months**
- the user must be able to **edit that amount manually**
- claims must **not overlap**

### 4.4 Payments
A payment corresponds to a real bank transfer received from the wholesaler.

A claim may be paid in multiple transfers.

Example:
- claim = 10,000 €
- payments = 1,000 € + 1,000 € + 2,000 € + ...

Each payment belongs to one claim.

### 4.5 Claim closing logic
Use this logic:
- `OPEN` → received < claimed
- `READY_TO_CLOSE` → received >= claimed
- `CLOSED` → manually confirmed by user

Important:
- closure is **suggested automatically**
- final closure is **manual**

### 4.6 Overpayment
If the wholesaler pays more than the claimed amount:
- do **not** carry the excess to a future claim
- simply consider the claim fully paid
- optional: show a small overpayment indicator in the claim detail

---

## 5. Inputs (CRUD Scope)

### 5.1 Data page must be CRUD too
This was explicitly validated.
The data page is not just a read-only audit page.
It must allow CRUD actions.

### 5.2 Decade statements (PDF)
CRUD expectations:
- Create: import PDF decade statements
- Read: inspect imported decade data
- Update: correct parsed values if necessary
- Delete: remove erroneous imported decade lines

### 5.3 Claims
CRUD expectations:
- Create claim
- Read list/detail
- Update claim
- Delete claim

### 5.4 Payments
CRUD expectations:
- Create payment inside a claim
- Read payments list inside a claim
- Update payment
- Delete payment

Payment form fields:
- date (**default to today but editable**) ← validated correction
- amount
- optional comment

### 5.5 Contract parameter
For version A, keep it simple:
- one global contract rate parameter = 3%

Do not implement segmented contract controls for cold-chain / expensive items yet.
Reason: current source data does not support those detailed controls.

### 5.6 Notes / claim actions
Validated with caution: useful, but must not overload the UI.
So:
- keep notes/history optional
- collapsed by default
- no complex CRM-like workflow

---

## 6. Outputs (Validated)

The app must clearly expose:
- current remaining amount to recover
- total claimed
- total received
- open claims
- alert-worthy periods not yet claimed
- monthly irregularities
- claims progress
- missing/incomplete data in imported months

---

## 7. Final UX Architecture (Validated)

The application must contain exactly **3 main pages**:

1. `Accueil`
2. `Réclamations`
3. `Données`

This is the validated UX direction.
Do not keep multiple large analytical pages like separate Dashboard / Panorama / Chronos pages as primary navigation.
If useful pieces exist there, reuse them as **blocks**, not as full pages.

---

## 8. Global Layout

Use a simple professional business-app layout:
- fixed left sidebar
- top header
- main content area

### Sidebar
Items:
- Accueil
- Réclamations
- Données

Approximate width:
- ~220px

Style:
- sober
- professional
- subtle active state

### Header
Should remain light and functional.
Can include:
- page title
- active year selector
- last import indicator (if easy to expose)

---

## 9. Page 1 — Accueil

### Purpose
A pure overview page.
The user should understand the situation in less than 10 seconds.

### Important rule
No core business action here, except display filters if needed.
This was explicitly requested.

### Required blocks

#### 9.1 KPI row
4 cards:
1. **Reste à percevoir** (main / largest card)
2. **Réclamations ouvertes**
3. **Alertes non traitées**
4. **Taux de recouvrement**

This page is mainly a cockpit.
The financial headline must dominate.

#### 9.2 Main chart
Use a simple Recharts chart.
Recommended:
- monthly delta chart
- easy to read
- no chart overload

Do not create a complex multi-series analytics dashboard.

#### 9.3 Alerts panel
A compact side panel listing the most important current issues.
Examples:
- irregular months
- strong alert periods
- claims ready to close
- incomplete months

Keep this list short.

#### 9.4 Monthly summary table
Columns should stay minimal and useful:
- Month
- Expected
- Received
- Delta
- Status

Use clean badges.

---

## 10. Page 2 — Réclamations

### Purpose
This is the main operational page.

### Layout
Use a **master-detail** layout:
- left column = claims list
- right column = selected claim detail

This is more fluid than stacked long cards.

### Left column
Must include:
- `+ Nouvelle réclamation`
- filters:
  - Open
  - Ready to close
  - Closed
  - All

Each claim row should show at least:
- claim reference or id
- covered period
- claimed amount
- remaining amount
- status

### Right column — selected claim detail
Must include:

#### 10.1 Summary block
Show clearly:
- claimed amount
- received amount
- remaining amount
- period
- status

Actions:
- Edit
- Close
- Delete

#### 10.2 Payments block
A simple table with:
- date
- amount
- comment

Button:
- Add payment

#### 10.3 Payment form
Use a modal or a right drawer.
Fields:
- date (default today, editable)
- amount
- comment (optional)

Keep it minimal.

#### 10.4 History / notes block
Validated but must not overload the app.
So:
- collapsed by default
- optional
- simple chronological display
- no complex workflow engine

### Create claim UI
Use a drawer or panel, not a separate page.

Fields:
- period selector
- auto-calculated amount
- editable retained amount
- date
- optional comment

Important:
- the amount should be proposed automatically from selected months
- user must be able to modify it

---

## 11. Page 3 — Données

### Purpose
This page controls the raw imported data and monthly aggregation quality.

### Important rule
This page must include **CRUD**, including import.
This was explicitly validated.

### Internal structure
Use 2 tabs:
- `Décades`
- `Mois`

This avoids mixing raw decade entries and month-level control.

### 11.1 Décades tab
Must include a visible main button:
- `Importer des décades`

Table should show raw imported statement rows, with relevant columns such as:
- date / period
- decade number
- NET HT
- rebate value(s)
- parsing status
- source if useful

Actions:
- View
- Edit
- Delete

### 11.2 Mois tab
Monthly aggregated table showing at least:
- month
- number of decades present
- expected rebate
- received rebate
- delta
- status

Useful visual outcomes:
- detect missing decades
- detect incomplete months
- detect irregular months
- see which months are already covered by claims

---

## 12. Visual Design Guidelines

Target style:
- sober
- premium
- fluid
- business-oriented
- not flashy

### Colors
Keep palette small:
- light grey background
- white cards
- deep blue / blue-petrol primary accent
- soft green success
- amber warning
- muted red danger

### Typography
- strong hierarchy for financial numbers
- easy-to-read tables
- minimalist text density

### Animations
Only subtle interactions:
- hover states
- drawer opening
- accordion transitions

No decorative excess.

---

## 13. UX Principles to Respect

### 13.1 One page = one intention
- Accueil → observe
- Réclamations → manage
- Données → control data

### 13.2 Hide complexity
Secondary elements must stay collapsed or secondary:
- notes
- history
- technical details
- correction flows

### 13.3 Contextual actions
Actions should happen where they make sense.
Examples:
- add payment from inside the selected claim
- edit imported data from the data page only

### 13.4 Financial numbers dominate
This is not a marketing dashboard.
The main value is in amounts, status, progression, and alerts.

---

## 14. 3 Common UX Errors to Avoid

### Error 1 — dashboard overload
Do not keep or create too many analytical pages.
The validated target is 3 pages only.

### Error 2 — bloated forms
Do not create heavy forms with too many fields.
Especially for payments.
Keep forms short.

### Error 3 — mixing business layers
Do not visually mix:
- monthly irregularities
- claims
- payments

These are different layers and must remain distinct.

---

## 15. Implementation Strategy (Token-Efficient)

Follow this order:

1. inspect existing frontend and identify reusable components
2. keep current backend calculation untouched
3. simplify navigation into 3 pages
4. reuse existing charts/tables where possible
5. add claims/payments UI and data model with minimal surface area
6. add data-page CRUD around imported decades and monthly control
7. keep optional notes/history collapsed

### Strong instruction
Do not start by rewriting everything.
Prefer incremental replacement of the current UX.

---

## 16. Technical Guardrails

### Preserve when possible
- current API routes for upload / stats / releves
- current JSON storage philosophy
- current backend monthly calculation
- current PDF import/parsing flow

### Add only what is needed
Likely new domain additions:
- `claims[]`
- `payments[]`

Do not introduce a database for version A.
Do not introduce authentication.
Do not introduce multi-user concerns.

### Frontend component suggestions
Reuse stack already in place.
Typical components can be:
- `KpiCard`
- `StatusBadge`
- `ClaimsList`
- `ClaimDetailPanel`
- `PaymentTable`
- `ClaimDrawer`
- `PaymentModal`
- `DataTabs`
- `DecadesTable`
- `MonthsTable`

This is a suggestion, not a mandate.

---

## 17. Final Success Criteria

The refactor is successful if:
- the app becomes easier to understand instantly
- the app keeps existing working import/calculation logic
- the user can manage claims/payments without friction
- the data page cleanly controls imported decade data
- the UI feels polished but simple
- the scope remains disciplined

---

## 18. Final Instruction to Claude Code

Do not invent features beyond this spec.
Do not overbuild.
Do not refactor the backend engine unless required for claims/payments support.

Priority order:
1. clarity
2. reuse existing code
3. maintain business coherence
4. keep implementation lightweight
