# RepartiX — Reliquat System Specification

## Goal

Add reliquat management to the reclamation system.

A reliquat represents a portion of a calculated missing rebate that has not been claimed yet.

Reliquats allow operators to postpone or partially reclaim calculated rebate gaps.

---

# Business Rules

## Calculation source of truth

Monthly rebate calculations remain the source of truth.

Example:

Expected rebate: 1200  
Actual rebate: 700  

Missing rebate = 500

This missing amount can be split into:

missing = reclaimed + reliquat + abandoned

Example:

reclaimed = 300  
reliquat = 200  
abandoned = 0

Important rule:

Reliquats must NOT create new debt.

They only represent a portion of an already calculated missing rebate.

---

# Reclamation Creation Logic

When creating a reclamation:

System automatically calculates an expected amount.

User can modify the amount.

### Case 1

Entered amount = calculated amount

→ normal creation

### Case 2

Entered amount > calculated amount

→ confirmation popup

### Case 3

Entered amount < calculated amount

System asks:

- abandon difference
- create reliquat

If "create reliquat":

Create a reliquat with:

origin reclamation id  
period  
reliquat amount  
remaining amount

---

# Reliquat Concept

A reliquat is derived from a reclamation.

Properties:

- id
- originReclamationId
- periodStart
- periodEnd
- initialAmount
- remainingAmount
- status

Statuses:

active  
closed  
abandoned

---

# Reliquat Workflow

Operator can open a reliquat.

From it they can create a new reclamation.

Rules:

- period is fixed
- amount cannot exceed remaining reliquat
- amount can be partial

### If amount = remaining reliquat

Reliquat is closed.

### If amount < remaining reliquat

New reclamation is created.

A new reliquat is created for the remaining amount.

---

# UI Requirements

Reliquats appear in the same list as reclamations.

Example:

#2025-001  
#2025-002  
#2025-003 Reliquat  

Reliquats use the same card layout as reclamations.

Visual differences:

- pale yellow background
- label "Reliquat"

Suggested color:

background: #FFF7D6

---

# Filters

Add a filter:

[Toutes] [Ouvertes] [Prêtes à clore] [Clôturées] [Reliquats]

The "Reliquats" filter shows only reliquats.

---

# Reliquat Detail Panel

Opening a reliquat shows:

Reliquat of Reclamation #XXXX

Fields:

period  
initial amount  
remaining amount  

Main action:

"Create reclamation from reliquat"

---

# Statistics Safety Rule

Reliquats must never alter the monthly calculation engine.

Monthly missing rebate remains the base data.

Reliquats only track recovery strategy.

Therefore:

statistics = based on monthly calculations
not on reclamation objects