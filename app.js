const $ = s => document.querySelector(s),
  esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
const dt = d => new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};
const CATS = ['Intimo', 'Calze', 'Abbigliamento da lavoro', 'Accessori', 'Altro'];
const PAY = ['Contanti', 'Carta', 'Satispay', 'Altro'];
const NAV = [['dash', 'Panoramica'], ['cassa', 'Cassa'], ['mag', 'Magazzino'], ['cli', 'Clienti'], ['ven', 'Vendite']];

let db, S = { view: 'dash', p: [], c: [], v: [], cart: [], q: '', cat: '', per: 6 };

const cc = c => {
  const i = CATS.indexOf(c);
  return i >= 0 && i < 4 ? 'c' + (i + 1) : '';
};
const vl = v => [v.taglia, v.colore].filter(Boolean).join(' · ');
const vars = () => S.p.flatMap(p => p.varianti.map(v => ({ ...v, p })));
const lowList = () => vars().filter(v => v.p.attivo && v.giacenza <= v.scorta_minima).sort((a, b) => a.giacenza - b.giacenza);
const head = (t, s, a = '') => `<header class="top"><div><h1>${t}</h1><p class="mut">${s}</p></div>${a}</header>`;
const kpi = (l, v, s, c = '') => `<div class="card kpi ${c}"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`;
const sum = a => a.reduce((s, x) => s + +x.totale, 0);

function toast(m, bad) {
  const t = $('#tst');
  t.textContent = m;
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.className = '', 3200);
}
function modal(h) {
  const m = $('#mdl');
  m.innerHTML = `<div class="box">${h}</div>`;
  m.hidden = false;
}
function closeM() { $('#mdl').hidden = true; }
$('#mdl').onclick = e => { if (e.target.id === 'mdl') closeM(); };
document.onkeydown = e => { if (e.key === 'Escape') closeM(); };

function card(t, s, b) {
  $('#app').innerHTML = `<div class="auth"><h1>${t}</h1><p class="mut">${s}</p>${b}</div>`;
}
function setup() {
  card('Collega il database', 'Incolla i dati del tuo progetto Supabase (Project Settings → API).', `<form onsubmit="saveCfg(event)"><label>Project URL<input id="u" placeholder="https://xxxx.supabase.co" required></label><label>Chiave anon / publishable<input id="k" required></label><button class="btn big">Collega</button></form>`);
}
function saveCfg(e) {
  e.preventDefault();
  ls.set('sb_url', $('#u').value.trim());
  ls.set('sb_key', $('#k').value.trim());
  boot();
}
function login(m) {
  card('Accedi', 'Usa l’utente creato in Supabase → Authentication.', `<form onsubmit="doLogin(event)"><label>Email<input id="em" type="email" required></label><label>Password<input id="pw" type="password" required></label><p class="err">${esc(m || '')}</p><button class="btn big">Entra</button><a class="lnk" onclick="resetCfg()">Cambia database</a></form>`);
}
async function doLogin(e) {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value });
  error ? login('Email o password non corretta.') : start();
}
function resetCfg() {
  ls.set('sb_url', '');
  ls.set('sb_key', '');
  boot();
}
function boot() {
  const u = ls.get('sb_url'), k = ls.get('sb_key');
  if (!u || !k) return setup();
  db = supabase.createClient(u, k);
  db.auth.getSession().then(({ data }) => data.session ? start() : login());
}
async function start() {
  $('#app').innerHTML = '<div class="shell"><nav id="nav"></nav><main id="main"></main></div>';
  await load();
}
async function load() {
  const [p, c, v] = await Promise.all([
    db.from('prodotti').select('*,varianti(*)').order('nome'),
    db.from('clienti').select('*').order('nome'),
    db.from('vendite').select('*,clienti(nome),righe_vendita(*)').order('created_at', { ascending: false }).limit(500)
  ]);
  const er = p.error || c.error || v.error;
  if (er) return toast(er.message + ' — hai eseguito schema.sql?', 1);
  S.p = p.data;
  S.c = c.data;
  S.v = v.data;
  render();
}
function render() {
  $('#nav').innerHTML = `<div class="logo">Il mio negozio</div>` + NAV.map(([k, l], i) => `<a class="c${i % 4 + 1} ${S.view === k ? 'on' : ''}" onclick="go('${k}')">${l}</a>`).join('') + `<a class="out" onclick="db.auth.signOut().then(boot)">Esci</a>`;
  ({ dash, cassa, mag, cli, ven })[S.view]();
}
function go(v) { S.view = v; S.q = ''; render(); }

function dash() {
  const now = new Date(),
    same = (d, e) => new Date(d).toDateString() === e.toDateString();
  const oggi = S.v.filter(x => same(x.created_at, now)),
    mese = S.v.filter(x => { const d = new Date(x.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const low = lowList(),
    val = S.p.reduce((s, p) => s + p.varianti.reduce((t, v) => t + Math.max(v.giacenza, 0), 0) * p.costo, 0);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return { d, t: sum(S.v.filter(x => same(x.created_at, d))) };
  });
  const mx = Math.max(...days.map(x => x.t), 1);
  $('#main').innerHTML = `${head('Panoramica', 'Come sta andando il negozio')}
 <div class="kpis">${kpi('Incasso di oggi', eur(sum(oggi)), oggi.length + ' vendite', 'c1')}${kpi('Incasso del mese', eur(sum(mese)), mese.length + ' vendite', 'c2')}${kpi('Da riordinare', low.length, 'articoli sotto scorta', 'c3' + (low.length ? ' warn' : ''))}${kpi('Valore magazzino', eur(val), 'al prezzo di acquisto', 'c4')}</div>
 <div class="grid2"><section class="card"><h3>Ultimi 7 giorni</h3><div class="bars">${days.map((x, i) => `<div class="${i === 6 ? 't' : ''}"><b>${Math.round(x.t)} €</b><i style="height:${x.t / mx * 75}%"></i><span>${x.d.toLocaleDateString('it-IT', { weekday: 'short' })}</span></div>`).join('')}</div></section>
 <section class="card"><h3>Da riordinare</h3>${low.slice(0, 8).map(v => `<div class="row"><span>${esc(v.p.nome)}<small>${esc(vl(v))}</small></span><span class="pill bad">${v.giacenza} pz</span></div>`).join('') || '<p class="mut">Tutto a posto: nessun articolo sotto scorta.</p>'}</section></div>`;
}

function cassa() {
  $('#main').innerHTML = `${head('Cassa', 'Cerca un articolo o scansiona il codice a barre')}
 <div class="pos"><section class="card"><input id="q" class="search" placeholder="Nome, marca, taglia, colore, codice…" oninput="S.q=this.value;renderRes()" onkeydown="if(event.key==='Enter')scan()" value="${esc(S.q)}" autofocus><div id="res"></div></section>
 <section class="card cart"><h3>Scontrino</h3><div id="lines"></div>
 <label>Cliente (facoltativo)<select id="sel-cli"><option value="">Cliente di passaggio</option>${S.c.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
 <div class="f2"><label>Pagamento<select id="sel-pay">${PAY.map(p => `<option>${p}</option>`).join('')}</select></label><label>Sconto €<input id="sel-sc" type="number" min="0" step="0.5" value="0" oninput="cartUI()"></label></div>
 <div class="total"><span>Totale</span><strong id="tot"></strong></div><button class="btn big" onclick="incassa()">Incassa</button></section></div>`;
  renderRes();
  cartUI();
}
function renderRes() {
  const q = S.q.toLowerCase().trim();
  const r = vars().filter(v => v.p.attivo && (!q || [v.p.nome, v.p.marca, v.taglia, v.colore, v.barcode, v.p.categoria].join(' ').toLowerCase().includes(q))).slice(0, 40);
  $('#res').innerHTML = r.map(v => `<button class="item" onclick="add('${v.id}')"><span><b>${esc(v.p.nome)}</b><small>${esc(vl(v) || v.p.categoria)}</small></span><span class="r"><b>${eur(v.p.prezzo)}</b><small class="${v.giacenza <= v.scorta_minima ? 'lowt' : ''}">${v.giacenza} in magazzino</small></span></button>`).join('') || '<p class="mut pad">Nessun articolo trovato. Aggiungilo da Magazzino.</p>';
}
function scan() {
  const q = S.q.trim(), v = vars().find(x => x.barcode && x.barcode === q);
  if (v) {
    add(v.id);
    S.q = '';
    $('#q').value = '';
    renderRes();
  }
}
function add(id) {
  const v = vars().find(x => x.id === id),
    i = S.cart.find(x => x.v.id === id);
  i ? i.qty++ : S.cart.push({ v, qty: 1 });
  cartUI();
}
function qty(id, d) {
  const i = S.cart.find(x => x.v.id === id);
  i.qty += d;
  if (i.qty < 1) S.cart = S.cart.filter(x => x !== i);
  cartUI();
}
function cartUI() {
  const sub = S.cart.reduce((s, i) => s + i.qty * i.v.p.prezzo, 0);
  $('#lines').innerHTML = S.cart.map(i => `<div class="line"><span><b>${esc(i.v.p.nome)}</b><small class="${i.qty > i.v.giacenza ? 'lowt' : ''}">${esc(vl(i.v))}${i.qty > i.v.giacenza ? ' · più dei pezzi in magazzino' : ''}</small></span><span class="qty"><button onclick="qty('${i.v.id}',-1)" aria-label="Meno">−</button>${i.qty}<button onclick="qty('${i.v.id}',1)" aria-label="Più">+</button></span><b>${eur(i.qty * i.v.p.prezzo)}</b></div>`).join('') || '<p class="mut pad">Lo scontrino è vuoto. Scegli un articolo a sinistra.</p>';
  $('#tot').textContent = eur(Math.max(sub - (+$('#sel-sc').value || 0), 0));
}
async function incassa() {
  if (!S.cart.length) return toast('Aggiungi almeno un articolo', 1);
  const righe = S.cart.map(i => ({ prodotto_id: i.v.prodotto_id, variante_id: i.v.id, quantita: i.qty, prezzo_unit: i.v.p.prezzo, descrizione: `${i.v.p.nome} ${vl(i.v)}`.trim() }));
  const { error } = await db.rpc('registra_vendita', { p_cliente: $('#sel-cli').value || null, p_pagamento: $('#sel-pay').value, p_sconto: +$('#sel-sc').value || 0, p_righe: righe });
  if (error) return toast(error.message, 1);
  S.cart = [];
  toast('Vendita registrata');
  load();
}

function mag() {
  $('#main').innerHTML = `${head('Magazzino', 'Prodotti, taglie e giacenze', '<button class="btn" onclick="prodForm()">+ Nuovo prodotto</button>')}
 <div class="bar"><input class="search" placeholder="Cerca prodotto o marca…" oninput="S.q=this.value;magT()"><select onchange="S.cat=this.value;magT()"><option value="">Tutte le categorie</option>${CATS.map(c => `<option ${S.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><section class="card tbl" id="mt"></section>`;
  magT();
}
function magT() {
  const q = S.q.toLowerCase();
  const r = S.p.filter(p => (!S.cat || p.categoria === S.cat) && (!q || (p.nome + ' ' + (p.marca || '')).toLowerCase().includes(q)));
  $('#mt').innerHTML = `<table><thead><tr><th>Prodotto</th><th>Categoria</th><th>Taglie e pezzi</th><th class="r">Prezzo</th><th class="r">Totale pezzi</th></tr></thead><tbody>${r.map(p => `<tr onclick="prodForm('${p.id}')" class="${p.attivo ? '' : 'off'}"><td><b>${esc(p.nome)}</b><small>${esc(p.marca || '')}${p.attivo ? '' : ' · non in vendita'}</small></td><td><span class="tag ${cc(p.categoria)}">${esc(p.categoria)}</span></td><td>${p.varianti.map(v => `<span class="pill ${v.giacenza <= v.scorta_minima ? 'bad' : ''}">${esc(vl(v) || 'unica')}: ${v.giacenza}</span>`).join('')}</td><td class="r">${eur(p.prezzo)}</td><td class="r"><b>${p.varianti.reduce((s, v) => s + v.giacenza, 0)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="mut pad">Nessun prodotto. Aggiungi il primo con “Nuovo prodotto”.</td></tr>'}</tbody></table>`;
}
const vrow = v => `<div class="vr" data-id="${v.id || ''}"><input name="taglia" placeholder="Taglia" value="${esc(v.taglia)}"><input name="colore" placeholder="Colore" value="${esc(v.colore)}"><input name="barcode" placeholder="Codice a barre" value="${esc(v.barcode)}"><input name="giacenza" type="number" title="Pezzi" value="${v.giacenza}"><input name="scorta_minima" type="number" title="Scorta minima" value="${v.scorta_minima}"><button type="button" onclick="this.parentNode.remove()" aria-label="Rimuovi">×</button></div>`;
function addVr() { $('#vrs').insertAdjacentHTML('beforeend', vrow({ giacenza: 0, scorta_minima: 2 })); }
function prodForm(id) {
  const p = S.p.find(x => x.id === id) || { nome: '', marca: '', categoria: CATS[0], prezzo: '', costo: '', attivo: true, varianti: [{ giacenza: 0, scorta_minima: 2 }] };
  modal(`<h2>${id ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2><form onsubmit="saveProd(event,'${id || ''}')">
 <div class="f2"><label>Nome<input name="nome" value="${esc(p.nome)}" required></label><label>Marca<input name="marca" value="${esc(p.marca)}"></label></div>
 <div class="f3"><label>Categoria<select name="categoria">${CATS.map(c => `<option ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Prezzo di vendita €<input name="prezzo" type="number" step="0.01" min="0" value="${p.prezzo}" required></label><label>Costo di acquisto €<input name="costo" type="number" step="0.01" min="0" value="${p.costo}"></label></div>
 <h4>Taglie e colori <small>taglia, colore, codice a barre, pezzi, scorta minima</small></h4><div id="vrs">${p.varianti.map(vrow).join('')}</div>
 <button type="button" class="ghost" onclick="addVr()">+ Aggiungi taglia o colore</button>
 <label class="chk"><input type="checkbox" name="attivo" ${p.attivo ? 'checked' : ''}> In vendita</label>
 <div class="acts">${id ? `<button type="button" class="ghost bad" onclick="delProd('${id}')">Elimina</button>` : ''}<span></span><button type="button" class="ghost" onclick="closeM()">Annulla</button><button class="btn">Salva prodotto</button></div></form>`);
}
async function saveProd(e, id) {
  e.preventDefault();
  const f = new FormData(e.target);
  const base = { nome: f.get('nome').trim(), marca: f.get('marca').trim() || null, categoria: f.get('categoria'), prezzo: +f.get('prezzo'), costo: +f.get('costo') || 0, attivo: f.get('attivo') === 'on' };
  let pid = id, r;
  if (id) r = await db.from('prodotti').update(base).eq('id', id); else { r = await db.from('prodotti').insert(base).select().single(); pid = r.data?.id; }
  if (r.error) return toast(r.error.message, 1);
  const rows = [...document.querySelectorAll('.vr')].map(el => {
    const g = n => el.querySelector(`[name=${n}]`).value.trim();
    return { id: el.dataset.id, prodotto_id: pid, taglia: g('taglia'), colore: g('colore'), barcode: g('barcode') || null, giacenza: parseInt(g('giacenza')) || 0, scorta_minima: parseInt(g('scorta_minima')) || 0 };
  });
  const old = (S.p.find(x => x.id === id)?.varianti || []).map(v => v.id),
    del = old.filter(i => !rows.some(x => x.id === i));
  if (del.length) await db.from('varianti').delete().in('id', del);
  const upd = rows.filter(x => x.id),
    ins = rows.filter(x => !x.id).map(({ id, ...x }) => x);
  const rs = await Promise.all([upd.length && db.from('varianti').upsert(upd), ins.length && db.from('varianti').insert(ins)]);
  const er = rs.find(x => x && x.error);
  if (er) return toast(er.error.message, 1);
  closeM();
  toast('Prodotto salvato');
  load();
}
async function delProd(id) {
  if (!confirm('Eliminare il prodotto e tutte le sue taglie?')) return;
  const { error } = await db.from('prodotti').delete().eq('id', id);
  error ? toast(error.message, 1) : (closeM(), toast('Prodotto eliminato'), load());
}

function cli() {
  $('#main').innerHTML = `${head('Clienti', 'La tua rubrica clienti', '<button class="btn" onclick="cliForm()">+ Nuovo cliente</button>')}<input class="search" placeholder="Cerca per nome o telefono…" oninput="S.q=this.value;cliT()"><section class="card tbl" id="ct"></section>`;
  cliT();
}
function cliT() {
  const q = S.q.toLowerCase(),
    tot = id => sum(S.v.filter(x => x.cliente_id === id));
  $('#ct').innerHTML = `<table><thead><tr><th>Nome</th><th>Telefono</th><th>Email</th><th class="r">Totale speso</th></tr></thead><tbody>${S.c.filter(c => !q || (c.nome + (c.telefono || '')).toLowerCase().includes(q)).map(c => `<tr onclick="cliForm('${c.id}')"><td><b>${esc(c.nome)}</b><small>${esc(c.note || '')}</small></td><td>${esc(c.telefono || '—')}</td><td>${esc(c.email || '—')}</td><td class="r">${eur(tot(c.id))}</td></tr>`).join('') || '<tr><td colspan="4" class="mut pad">Nessun cliente. Aggiungi il primo con “Nuovo cliente”.</td></tr>'}</tbody></table>`;
}
function cliForm(id) {
  const c = S.c.find(x => x.id === id) || {};
  modal(`<h2>${id ? 'Modifica cliente' : 'Nuovo cliente'}</h2><form onsubmit="saveCli(event,'${id || ''}')"><label>Nome e cognome<input name="nome" value="${esc(c.nome)}" required></label><div class="f2"><label>Telefono<input name="telefono" value="${esc(c.telefono)}"></label><label>Email<input name="email" type="email" value="${esc(c.email)}"></label></div><label>Note (taglie, preferenze…)<textarea name="note" rows="3">${esc(c.note)}</textarea></label><div class="acts">${id ? `<button type="button" class="ghost bad" onclick="delCli('${id}')">Elimina</button>` : ''}<span></span><button type="button" class="ghost" onclick="closeM()">Annulla</button><button class="btn">Salva cliente</button></div></form>`);
}
async function saveCli(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)), { error } = await (id ? db.from('clienti').update(f).eq('id', id) : db.from('clienti').insert(f));
  error ? toast(error.message, 1) : (closeM(), toast('Cliente salvato'), load());
}
async function delCli(id) {
  if (!confirm('Eliminare il cliente? Le sue vendite restano nello storico.')) return;
  const { error } = await db.from('clienti').delete().eq('id', id);
  error ? toast(error.message, 1) : (closeM(), toast('Cliente eliminato'), load());
}

function ven() {
  const lim = new Date();
  lim.setHours(0, 0, 0, 0);
  lim.setDate(lim.getDate() - S.per);
  const r = S.v.filter(x => new Date(x.created_at) >= lim), t = sum(r);
  $('#main').innerHTML = `${head('Vendite', 'Storico degli incassi', `<select onchange="S.per=+this.value;ven()">${[[0, 'Oggi'], [6, 'Ultimi 7 giorni'], [29, 'Ultimi 30 giorni'], [9999, 'Tutte']].map(([k, l]) => `<option value="${k}" ${S.per === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`) }
 <div class="kpis k2">${kpi('Incasso', eur(t), r.length + ' vendite', 'c1')}${kpi('Scontrino medio', eur(r.length ? t / r.length : 0), 'per vendita', 'c2')}</div>
 <section class="card tbl"><table><thead><tr><th>Data</th><th>Cliente</th><th>Pezzi</th><th>Pagamento</th><th class="r">Totale</th></tr></thead><tbody>${r.map(x => `<tr onclick="venDet('${x.id}')"><td>${dt(x.created_at)}</td><td>${esc(x.clienti?.nome || '—')}</td><td>${x.righe_vendita.reduce((s, i) => s + i.quantita, 0)}</td><td>${esc(x.pagamento)}</td><td class="r"><b>${eur(x.totale)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="mut pad">Nessuna vendita in questo periodo.</td></tr>'}</tbody></table></section>`;
}
function venDet(id) {
  const x = S.v.find(v => v.id === id);
  modal(`<h2>Vendita del ${dt(x.created_at)}</h2>${x.righe_vendita.map(i => `<div class="row"><span>${i.quantita} × ${esc(i.descrizione)}</span><b>${eur(i.quantita * i.prezzo_unit)}</b></div>`).join('')}${+x.sconto ? `<div class="row"><span>Sconto</span><b>−${eur(x.sconto)}</b></div>` : ''}<div class="total"><span>Totale (${esc(x.pagamento)})</span><strong>${eur(x.totale)}</strong></div><div class="acts"><span></span><button class="btn" onclick="closeM()">Chiudi</button></div>`);
}

boot();
