// First-run seed data + one-time migrations of older data files.
const store = require('./store');
const { pacificDateStr } = require('./time');

const DEFAULT_RATE_MIN = 0.08;
const DEFAULT_RATE_SMS = 0.01;

// Venue lines. `numbers` keeps the old Twilio DID and the new Telnyx DID side by side.
// `aliases` are used to match CartVIP "destination" names to a client.
const CLIENT_SEED = [
  { name: 'Cats Meow Karaoke', business: 'Cats Meow', numbers: ['+15046819283', '+15047665479'], aliases: ["cats meow", "cat's meow"] },
  { name: 'Hustler Las Vegas - Heather', business: 'Larry Flynt', numbers: ['+17029970961', '+17028672822'], aliases: ['hustler club las vegas', 'hustler las vegas', 'hustler vegas'] },
  { name: 'Kings of Hustler', business: 'Larry Flynt', numbers: ['+17025471904', '+17028277987'], aliases: ['kings of hustler', 'kings of husler'] },
  { name: 'Deja Vu Showgirls Ypsilanti', business: 'Deja Vu', numbers: ['+17348965038', '+17343718726'], aliases: ['ypsilanti'] },
  { name: 'Kalamazoo', business: 'Deja Vu', numbers: ['+12697754582', '+12697755328'], aliases: ['kalamazoo'] },
  { name: 'Barely Legal New Orleans', business: 'Barely Legal', numbers: ['+15044746323', '+15047665516'], aliases: ['barely legal'] },
  { name: 'Hustler New Orleans', business: 'Larry Flynt', numbers: ['+15045141440', '+15047665586'], aliases: ['hustler new orleans', 'hustler club new orleans', 'hcnola'] },
  { name: 'Deja Vu Stockton', business: 'Deja Vu', numbers: ['+19163504781', '+19162602738'], aliases: ['stockton'] },
  { name: 'James - WinningVocal', business: 'Winning Vocal', numbers: ['+18773956676', '+18775944197'], aliases: [] },
  { name: 'GoBest', business: 'GoBest', numbers: ['+17027283109', '+17023740367'], aliases: ['gobest', 'go best'] },
  { name: 'Lily - Winning Realty', business: 'Winning Realty', numbers: ['+17029049574', '+17027604971'], aliases: [] },
];

const AGENT_SEED = [
  { name: 'Pauline', role: 'manager', aliases: [] },
  { name: 'Jolina', role: 'manager', aliases: [] },
  { name: 'May Ann', role: 'agent', aliases: ['ann'] },
  { name: 'Chariz', role: 'agent', aliases: [] },
  { name: 'Cindy', role: 'agent', aliases: [] },
  { name: 'Dannielica', role: 'agent', aliases: [] },
  { name: 'Gart (Edgardo Quimo)', role: 'agent', aliases: ['gart', 'edgardo', 'edgardo quimo'] },
  { name: 'Harvy', role: 'agent', aliases: [] },
  { name: 'Heather', role: 'agent', aliases: [] },
  { name: 'Jamella (via John)', role: 'agent', aliases: ['jamella'] },
  { name: 'Joshua', role: 'agent', aliases: ['josh'] },
  { name: 'Norlene', role: 'agent', aliases: [] },
  { name: 'Ruth', role: 'agent', aliases: [] },
];

// Hours already logged on the agent pay sheet for Oct 1–14, 2026.
const OCT_1_14_HOURS = {
  'Pauline': 80, 'Jolina': 80, 'May Ann': 32, 'Chariz': 32, 'Cindy': 40, 'Dannielica': 32,
  'Gart (Edgardo Quimo)': 32, 'Harvy': 32, 'Heather': 0, 'Jamella (via John)': 32, 'Joshua': 32,
  'Norlene': 32, 'Ruth': 40,
};

<<<<<<< HEAD
// The Aloware lines used for the rebill on the GoBest VIP sheets, linked to venue clients.
const ALOWARE_LINE_SEED = [
  { name: 'GO BEST', clients: [] },
  { name: 'CATS MEOW 701', clients: ['Cats Meow Karaoke'] },
  { name: 'DÉJÀ VU STOCKTON', clients: ['Deja Vu Stockton'] },
  { name: 'DÉJÀ VU KALAMAZOO', clients: ['Kalamazoo'] },
  { name: 'HUSTLER VEGAS / KOH', clients: ['Hustler Las Vegas - Heather', 'Kings of Hustler'] },
  { name: 'HCNOLA', clients: ['Hustler New Orleans'] },
  { name: 'BARELY', clients: ['Barely Legal New Orleans'] },
  { name: 'DVYPSI', clients: ['Deja Vu Showgirls Ypsilanti'] },
  { name: 'GUEST DEV OUTBOUND', clients: [] },
];

=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
const SETTINGS_SEED = {
  company: {
    name: 'WINNING VOCAL a dba of WORLD SERVICES AND SALES LLC',
    address: '5360 W. AGATE AVE, LAS VEGAS, NV 89139',
    email: 'RANDY@WINNINGREALTY.COM',
    phone: '702-354-0014',
  },
  billTo: { name: 'GOBEST VIP', contact: 'Summer@gobestbiz.com / Modernmegan@yahoo.com' },
  paymentTerms: 'ZELLE TAG: worldservicesandsales\nACH:\nACCT:\nROUTING:',
  rates: {
    managerHourly: 5.5,     // what WSS pays a manager per hour
    agentHourly: 5,         // what WSS pays an agent per hour
    agentBonusPct: 1,       // agent bonus, % of their own sales
    managerBonusPct: 1,     // manager bonus, % of their equal share of total sales
    overrideHourly: 0.5,    // WSS override billed per agent hour
    salesOverridePct: 8,    // WSS override billed on total sales
<<<<<<< HEAD
    minSalesMultiple: 1,    // warn when an agent's sales < this × what their hours are billed at
  },
  rebillBasis: 'time',      // split the call-center invoice by Aloware call 'time' or 'activities'
  brands: { ai: 'AI Receptionist', callCenter: 'ClubLifter' },
=======
  },
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
  cycle: 'semimonthly',     // 'semimonthly' (1–14 / 15–end) or 'monthly'
  nextInvoiceNumber: 37,
  annotationsEnabled: true,
  defaultRateMin: DEFAULT_RATE_MIN,
  defaultRateSms: DEFAULT_RATE_SMS,
};

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

function runSeedsAndMigrations() {
  const now = new Date().toISOString();

  if (!store.exists('users')) {
    store.write('users', [
      { username: 'jenna', password: 'winningvocal2026!', role: 'master', name: 'Jenna' },
      { username: 'adminjoao', password: 'vocal2026!', role: 'master', name: 'João' },
    ]);
  }

  if (!store.exists('clients')) {
    store.write('clients', CLIENT_SEED.map((c, i) => ({
      id: 'c_seed' + (i + 1), name: c.name, business: c.business, numbers: c.numbers, aliases: c.aliases,
      rateMin: DEFAULT_RATE_MIN, rateSms: DEFAULT_RATE_SMS, notes: '', createdAt: now,
    })));
  }

  if (!store.exists('settings')) store.write('settings', SETTINGS_SEED);
  else {
    // Fill in any settings keys added in newer versions without touching saved values.
    const s = store.read('settings', {});
    const merged = Object.assign({}, SETTINGS_SEED, s, {
      company: Object.assign({}, SETTINGS_SEED.company, s.company),
      billTo: Object.assign({}, SETTINGS_SEED.billTo, s.billTo),
      rates: Object.assign({}, SETTINGS_SEED.rates, s.rates),
<<<<<<< HEAD
      brands: Object.assign({}, SETTINGS_SEED.brands, s.brands),
=======
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    });
    store.write('settings', merged);
  }

  if (!store.exists('agents')) {
    store.write('agents', AGENT_SEED.map((a, i) => ({
      id: 'a_seed' + (i + 1), name: a.name, role: a.role, aliases: a.aliases,
      payRate: null, active: true, createdAt: now,
    })));
  }

  if (!store.exists('periods')) {
    const agents = store.read('agents', []);
    const hours = {};
    agents.forEach(a => { if (OCT_1_14_HOURS[a.name] != null) hours[a.id] = OCT_1_14_HOURS[a.name]; });
    store.write('periods', [{ id: '2026-10-1', hours, extraBonus: {}, rebillOverrides: {}, status: 'draft', updatedAt: now }]);
  }

<<<<<<< HEAD
  if (!store.exists('alowareLines')) {
    const clients = store.read('clients', []);
    store.write('alowareLines', ALOWARE_LINE_SEED.map((l, i) => ({
      id: 'al_seed' + (i + 1), name: l.name, alowareLineId: null, number: '',
      clientIds: l.clients.map(n => (clients.find(c => norm(c.name) === norm(n)) || {}).id).filter(Boolean),
      rebill: true, createdAt: now,
    })));
  }

  ['usage', 'daily', 'invoices', 'sales', 'annotations', 'jobs', 'sessions', 'alowareComms'].forEach(n => {
=======
  ['usage', 'daily', 'invoices', 'sales', 'annotations', 'jobs', 'sessions'].forEach(n => {
>>>>>>> 46126872ff885bc8fa575cdb28748d3d21276471
    if (!store.exists(n)) store.write(n, n === 'sessions' ? {} : []);
  });

  if (!store.exists('expenses')) {
    store.write('expenses', [
      { id: 'e_rail', label: 'Railway', amount: 5, category: 'Software', frequency: 'monthly', startDate: '2026-08-01', endDate: null, source: 'manual', notes: '', createdAt: now },
      { id: 'e_claude', label: 'Claude', amount: 100, category: 'Software', frequency: 'monthly', startDate: '2026-08-01', endDate: null, source: 'manual', notes: '', createdAt: now },
    ]);
  }

  const done = store.read('migrations', []);
  const mark = id => { done.push(id); store.write('migrations', done); };

  // v1 → v2 expenses: recurring/general/onetime → frequency + startDate
  if (!done.includes('expenses-v2')) {
    const exps = store.read('expenses', []).map(e => {
      if (e.frequency) return e;
      const createdMonth = (e.createdAt || now).slice(0, 7);
      if (e.type === 'onetime') return { id: e.id, label: e.label, amount: e.amount, category: '', frequency: 'once', startDate: (e.month || createdMonth) + '-01', endDate: null, source: 'manual', notes: '', createdAt: e.createdAt || now };
      return { id: e.id, label: e.label, amount: e.amount, category: '', frequency: 'monthly', startDate: createdMonth + '-01', endDate: null, source: 'manual', notes: '', createdAt: e.createdAt || now };
    });
    store.write('expenses', exps);
    mark('expenses-v2');
  }

  // Add the new Telnyx DIDs + CartVIP aliases to venue clients that already exist.
  if (!done.includes('telnyx-numbers-2026-10')) {
    const clients = store.read('clients', []);
    clients.forEach(c => {
      const seed = CLIENT_SEED.find(s => norm(s.name) === norm(c.name));
      if (!seed) return;
      c.numbers = Array.from(new Set([...(c.numbers || []), ...seed.numbers]));
      if (!c.aliases || !c.aliases.length) c.aliases = seed.aliases;
    });
    store.write('clients', clients);
    mark('telnyx-numbers-2026-10');
  }

  // Older usage rows were Twilio-only; tag them so the UI can show the source.
  if (!done.includes('usage-source-tag')) {
    const usage = store.read('usage', []).map(u => u.source ? u : Object.assign({}, u, { source: u.manual ? 'manual' : 'twilio' }));
    store.write('usage', usage);
    mark('usage-source-tag');
  }

  console.log('[seed] data dir ready, today (Pacific) is ' + pacificDateStr());
}

module.exports = { runSeedsAndMigrations, norm, DEFAULT_RATE_MIN, DEFAULT_RATE_SMS };
