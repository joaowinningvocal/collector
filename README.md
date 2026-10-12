# Winning Vocal — Billing dashboard (Jenna)

Express + JSON files on a Railway volume + node-cron. No database.

## Railway → Variables

| Variable | What |
|---|---|
| `TELNYX_API_KEY` | Telnyx API v2 key (Bearer). Calls, SMS, charges summary. |
| `CARTVIP_API_KEY` | CartVIP affiliate key (`X-API-KEY`). Dispatch sales. |
| `TELNYX_CALL_RECORD_TYPES` | Optional. Default `sip-trunking` (LiveKit). Use `sip-trunking,call-control` if any line uses Call Control/TeXML. |
| `DATA_DIR` | Optional. Defaults to `/app/data` when that volume exists. |

The service must stay awake (no "App Sleeping") for the scheduled jobs to run.

## What runs on its own (Pacific time)

- **11:59 PM daily** — pulls the day's Telnyx calls/texts per number + CartVIP sales for the last 3 days. On the last day of the month it also books the month's Telnyx cost as an expense.
- **12:20 AM daily** — re-pulls yesterday (calls after 11:59 PM, late records).
- **1st of the month, 6:30 AM** — final Telnyx cost for last month + receptionist invoices for every client.

Every run is logged under Settings → Automation log.

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
- Feedback toolbar (draw / arrows / boxes / text / comments) can be turned off in Settings.
