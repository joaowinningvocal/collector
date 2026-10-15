# Winning Vocal — Billing dashboard (Jenna)

Express + JSON files on a Railway volume + node-cron. No database.

## Railway → Variables

| Variable | What |
|---|---|
| `TELNYX_API_KEY` | Telnyx API v2 key (Bearer). Calls, SMS, charges summary. |
| `CARTVIP_API_KEY` | CartVIP affiliate key (`X-API-KEY`). Dispatch sales. |
| `TELNYX_CALL_RECORD_TYPES` | Optional. Default `sip-trunking` (LiveKit). Use `sip-trunking,call-control` if any line uses Call Control/TeXML. |
| `ALOWARE_WEBHOOK_TOKEN` | Any long random string. Aloware sends it as a Bearer token with every call. |
| `ALOWARE_UTC_OFFSET_MINUTES` | Optional. Leave unset if Aloware timestamps are UTC (default). |
| `DATA_DIR` | Optional. Defaults to `/app/data` when that volume exists. |

The service must stay awake (no "App Sleeping") for the scheduled jobs to run.

## What runs on its own (Pacific time)

- **11:59 PM daily** — pulls the day's Telnyx calls/texts per number + CartVIP sales for the last 3 days. On the last day of the month it also books the month's Telnyx cost as an expense.
- **12:20 AM daily** — re-pulls yesterday (calls after 11:59 PM, late records).
- **1st of the month, 6:30 AM** — final Telnyx cost for last month + receptionist invoices for every client.

Every run is logged under Settings → Automation log.

## Aloware (call-center minutes for the rebill)

Aloware has no API to pull calls or reports, so it pushes them instead:

1. Aloware → Integrations → Webhook Integration → **+ Add Webhook**
2. URL: `https://<your-railway-domain>/hooks/aloware`
3. Authentication: **Bearer**, token = `ALOWARE_WEBHOOK_TOKEN`
4. Event: **Communication disposed** (no filters) → **Save without testing**

Each call/SMS is stored once (re-sends update it). Lines appear under Settings → Aloware lines; link each to its venue. Minutes = call duration, activities = every communication, same as the GoBest VIP sheet. Past periods: type the numbers from the Aloware report into the rebill table.

## First deploy checklist

1. Set the two keys and redeploy.
2. Settings → Telnyx → **Show sample call records**: confirm the fields include `cli`, `cld`, `call_sec`, `cost`, `started_at`.
3. Settings → CartVIP → **Test connection**: if the fields include an agent/affiliate name, sales are matched to agents automatically (names + "Also appears as"). Otherwise Jenna picks the agent per sale.
4. Settings → Invoice details: add ACH account/routing to the payment instructions; check the next invoice number.
5. Calls → pick a past day → **Pull this day** to backfill (Expenses → **Pull Telnyx now** backfills a whole month).

## Notes

- Existing data migrates automatically on boot (old expense types, new Telnyx DIDs + CartVIP names on existing clients).
- API is now under `/api/*` and requires login (Bearer token). Old root routes are gone.
- Call-center invoice math follows the GoBest VIP sheets: hours × pay, agent bonus 1% of own sales, managers 1% of an equal share of total sales, WSS $0.50/hr override, 8% sales override. All rates are editable in Settings.
- Venue invoices: each venue gets an AI receptionist invoice (Telnyx minutes × rate) and a call-center invoice (its Aloware lines' share of the month's call-center invoices; lines linked to two venues split evenly). Names of both are editable in Settings.
- Agents whose sales are below N × what their hours are billed at (pay + WSS override) are flagged; N is in Settings (default 1).
- Feedback toolbar (draw / arrows / boxes / text / comments) can be turned off in Settings.
