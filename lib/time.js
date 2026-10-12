// Date helpers. Everything the business cares about is on Pacific time (Las Vegas).
const TZ = 'America/Los_Angeles';

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// "YYYY-MM-DD" for the Pacific calendar day of a given instant.
function pacificDateStr(d) { return ymdFmt.format(d || new Date()); }
function monthKey(dateStr) { return String(dateStr).slice(0, 7); }

function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmtYmd(dt) { return dt.toISOString().slice(0, 10); }
function addDays(dateStr, n) { const d = parseYmd(dateStr); d.setUTCDate(d.getUTCDate() + n); return fmtYmd(d); }

function daysInMonth(month) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function firstDay(month) { return month + '-01'; }
function lastDay(month) { return month + '-' + String(daysInMonth(month)).padStart(2, '0'); }
function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
function monthsBetween(a, b) { // whole months from a to b (YYYY-MM)
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function datesInRange(from, to) {
  const out = []; let d = from; let guard = 0;
  while (d <= to && guard++ < 400) { out.push(d); d = addDays(d, 1); }
  return out;
}
function isLastDayOfMonth(dateStr) { return dateStr === lastDay(monthKey(dateStr)); }

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 2)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function shortDate(dateStr) { const [, m, d] = dateStr.split('-').map(Number); return m + '/' + d; }

module.exports = {
  TZ, pacificDateStr, monthKey, addDays, daysInMonth, firstDay, lastDay, addMonths,
  monthsBetween, daysBetween, datesInRange, isLastDayOfMonth, monthLabel, shortDate,
};
