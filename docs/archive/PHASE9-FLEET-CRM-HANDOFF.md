# Phase 9 — Fleet CRM (data model)

Collections: `crmAccounts`, `crmLeads`, `crmJobs`, `crmVehicles`, `crmInventory`.

## `crmAccounts/{id}`

| Field | Type | Notes |
|-------|------|--------|
| `companyName` | string | |
| `pipelineStage` | number | 1–6 active, 7 = Lost |
| `fleetSize` | number | |
| `painScore` | number | 1–10 |
| `decisionMaker` | string | |
| `segment` | string | e.g. commercial, municipal |
| `location` | string | |
| `lastContactedAt` | Timestamp | |
| `followUpAt` | Timestamp \| null | |
| `score` | number | 0–100, recalculated server-side |
| `tags` | string[] | e.g. `hot` |
| `notes` | array of `{ text, at, by }` | append-only in portal |
| `followUpOverdueNotified` | boolean | internal slack debounce |
| `createdAt` | Timestamp | |
| `updatedAt` | Timestamp | |

## Score formula (100 points)

Used in Cloud Function `crmAccountTrigger` and mirrored client-side for live preview:

```
fleetPts   = min(25, (fleetSize || 0) * 2.5)
painPts    = min(30, (painScore || 0) * 3)
stagePts   = min(24, (pipelineStage || 1) * 4)
daysSince  = days since lastContactedAt (0 if missing)
recencyPts = max(0, min(21, 21 - min(21, daysSince)))
score      = round(min(100, fleetPts + painPts + stagePts + recencyPts))
```

## `crmLeads/{id}`

`businessName`, `source`, `segment`, `fleetSize`, `urgency` (`hot`|`warm`|`cold`), `followUpAt`, `convertedToAccountId`, `createdAt`.

## `crmJobs/{id}`

`accountId`, `assignedToUid` (optional; `null` = visible to all DJs on dispatch), `jobType`, `location`, `vehicleCount`, `tireSizes` (string), `scheduledAt`, `completionStatus` (`Pending`|`In Progress`|`Done`), `actualTime`, `notes`, `priceQuote`, `finalPrice`, `createdAt`, `updatedAt`, `completedAt`.

DJ/mechanic may only update `completionStatus`, `actualTime`, `notes` (plus `updatedAt`).

## `crmVehicles/{id}`

`accountId`, `label`, `tireSize`, `notes`, `createdAt`.

## `crmInventory/{id}`

`sku`, `label`, `quantity`, `accountId` (optional), `updatedAt` — reserved for future UI.
