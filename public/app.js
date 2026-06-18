/* Bolão da Copa 26 — app do jogador (v6: cards estilo Sports + classificação por grupo) */
'use strict';

const FLAGS = {
  'México':'🇲🇽','África do Sul':'🇿🇦','Coreia do Sul':'🇰🇷','República Tcheca':'🇨🇿',
  'Canadá':'🇨🇦','Bósnia e Herzegovina':'🇧🇦','Estados Unidos':'🇺🇸','Paraguai':'🇵🇾',
  'Austrália':'🇦🇺','Turquia':'🇹🇷','Catar':'🇶🇦','Suíça':'🇨🇭','Brasil':'🇧🇷','Marrocos':'🇲🇦',
  'Haiti':'🇭🇹','Escócia':'🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  'Alemanha':'🇩🇪','Curaçao':'🇨🇼','Holanda':'🇳🇱','Japão':'🇯🇵','Costa do Marfim':'🇨🇮',
  'Equador':'🇪🇨','Suécia':'🇸🇪','Tunísia':'🇹🇳','Espanha':'🇪🇸','Cabo Verde':'🇨🇻',
  'Bélgica':'🇧🇪','Egito':'🇪🇬','Arábia Saudita':'🇸🇦','Uruguai':'🇺🇾','Irã':'🇮🇷',
  'Nova Zelândia':'🇳🇿','Argentina':'🇦🇷','Argélia':'🇩🇿','França':'🇫🇷','Senegal':'🇸🇳',
  'Iraque':'🇮🇶','Noruega':'🇳🇴','Áustria':'🇦🇹','Jordânia':'🇯🇴','Portugal':'🇵🇹',
  'RD Congo':'🇨🇩','Inglaterra':'🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  'Croácia':'🇭🇷','Gana':'🇬🇭','Panamá':'🇵🇦','Uzbequistão':'🇺🇿','Colômbia':'🇨🇴',
};
const flag = (t) => FLAGS[t] || '⚽';

// código ISO p/ bandeiras redondas (circle-flags). Fallback p/ emoji se a imagem falhar.
const ISO = {
  'México':'mx','África do Sul':'za','Coreia do Sul':'kr','República Tcheca':'cz',
  'Canadá':'ca','Bósnia e Herzegovina':'ba','Estados Unidos':'us','Paraguai':'py',
  'Austrália':'au','Turquia':'tr','Catar':'qa','Suíça':'ch','Brasil':'br','Marrocos':'ma',
  'Haiti':'ht','Escócia':'gb-sct','Alemanha':'de','Curaçao':'cw','Holanda':'nl','Japão':'jp',
  'Costa do Marfim':'ci','Equador':'ec','Suécia':'se','Tunísia':'tn','Espanha':'es','Cabo Verde':'cv',
  'Bélgica':'be','Egito':'eg','Arábia Saudita':'sa','Uruguai':'uy','Irã':'ir','Nova Zelândia':'nz',
  'Argentina':'ar','Argélia':'dz','França':'fr','Senegal':'sn','Iraque':'iq','Noruega':'no',
  'Áustria':'at','Jordânia':'jo','Portugal':'pt','RD Congo':'cd','Inglaterra':'gb-eng',
  'Croácia':'hr','Gana':'gh','Panamá':'pa','Uzbequistão':'uz','Colômbia':'co',
};
const FLAG_CDN = 'https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags/';
function flagImg(team, extra = ''){
  if (!team) return `<div class="sflag empty ${extra}">·</div>`;
  const emo = flag(team), code = ISO[team];
  if (!code) return `<div class="sflag ${extra}"><span class="femoji">${emo}</span></div>`;
  return `<div class="sflag ${extra}"><img class="fimg" src="${FLAG_CDN}${code}.svg" alt="" loading="lazy" data-emo="${emo}" onerror="flagFail(this)"></div>`;
}
window.flagFail = function(img){
  const s = document.createElement('span'); s.className = 'femoji'; s.textContent = img.dataset.emo || '⚽';
  img.replaceWith(s);
};
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const FASES = [
  { k:'r1', lbl:'1ª rod.' }, { k:'r2', lbl:'2ª rod.' }, { k:'r3', lbl:'3ª rod.' },
  { k:'r32', lbl:'16-avos' }, { k:'r16', lbl:'Oitavas' }, { k:'qf', lbl:'Quartas' },
  { k:'sf', lbl:'Semis' }, { k:'final', lbl:'Final/3º' },
];
const MATA_ORDEM = ['r32','r16','qf','sf','tp','final'];

const KEY = 'sh_bolao_user', PKEY = 'sh_bolao_pool';
let ME = null, POOL = null, JOGOS = [], FILTRO = '', VISTA = null, aba = 'jogos', RANKING = [], VISITANTE = false;
let CMP_A = null, CMP_B = null;

const $ = (s) => document.querySelector(s);
const api = async (path, opts) => {
  const r = await fetch('/api/' + path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro || 'Falha na requisição');
  return data;
};
const post = (path, body) => api(path, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
const toast = (msg, ok = false) => {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (ok ? ' ok' : '');
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), 2800);
};
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday:'short', day:'2-digit', month:'short', timeZone:'America/Sao_Paulo' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' });
const fmtData = new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo' });
const chaveDia = new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'America/Sao_Paulo' });

function naFase(j, f) {
  if (f === 'r1') return j.fase==='grupo' && j.rodada===1;
  if (f === 'r2') return j.fase==='grupo' && j.rodada===2;
  if (f === 'r3') return j.fase==='grupo' && j.rodada===3;
  if (f === 'final') return j.fase==='final' || j.fase==='tp';
  return j.fase === f;
}
const regrasTxt = (r) => r ? `Cravar <b>${r.exato}</b> · vencedor/empate <b>${r.resultado}</b>` + (r.gols>0?` · gol certo <b>+${r.gols}</b>`:'') : '';

// ================= boot =================
(function init(){
  try { ME = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (ME && ME.id) irLobby(); else mostrarGate();
  $('#enterBtn').onclick = ()=>autenticar('login');
  $('#registerBtn').onclick = ()=>autenticar('register');
  $('#guestBtn').onclick = abrirVisitante;
  $('#passInput').addEventListener('keydown', e=>{ if(e.key==='Enter') autenticar('login'); });
  $('#logoutBtn').onclick = ()=>{ localStorage.removeItem(KEY); localStorage.removeItem(PKEY); ME=null; POOL=null; mostrarGate(); };
  $('#createBtn').onclick = criarBolao;
  $('#joinBtn').onclick = entrarBolao;
  $('#joinCode').addEventListener('input', e=>{ e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); });
  $('#backBtn').onclick = ()=>{ if (VISITANTE){ VISITANTE=false; mostrarGate(); } else irLobby(); };
  $('#membersBtn').onclick = ()=>trocarAba('membros');
  $('#compareBtn').onclick = ()=>trocarAba('compare');
  $('#pdfBtn').onclick = exportarPDF;
  $('#tabJogos').onclick = ()=>trocarAba('jogos');
  $('#tabGrupos').onclick = ()=>trocarAba('grupos');
  $('#tabChave').onclick = ()=>trocarAba('chave');
  $('#tabRank').onclick = ()=>trocarAba('rank');
})();

function show(id){ ['gate','lobby','app'].forEach(s=>$('#'+s).classList.toggle('hide', s!==id)); }
function mostrarGate(){ show('gate'); $('#nameInput').focus(); }

async function autenticar(modo){
  const name = $('#nameInput').value.trim();
  const password = $('#passInput').value;
  if (name.length < 2) return toast('Digite seu nome de usuário.');
  if (!password || password.length < 4) return toast('A senha precisa ter ao menos 4 caracteres.');
  try{
    ME = await post(modo, { name, password });
    localStorage.setItem(KEY, JSON.stringify(ME));
    $('#passInput').value = '';
    irLobby();
  }catch(e){ toast(e.message); }
}

// ================= lobby =================
async function irLobby(){
  show('lobby'); $('#lobbyName').textContent = ME.name;
  $('#poolList').innerHTML = '<div class="spin">carregando…</div>';
  try{ const { pools } = await api('pools?player=' + ME.id); renderLobby(pools); }
  catch(e){ $('#poolList').innerHTML = `<div class="empty">${e.message}</div>`; }
}
function renderLobby(pools){
  if (!pools.length){ $('#poolList').innerHTML = '<div class="empty">Você ainda não está em nenhum bolão.<br>Crie um ou entre com um código.</div>'; return; }
  $('#poolList').innerHTML = pools.map(p=>{
    const tag = p.status==='owner' ? '<span class="ptag own">organizador</span>'
      : p.status==='approved' ? '<span class="ptag ok">participando</span>'
      : '<span class="ptag pend">aguardando aprovação</span>';
    const precisaAcao = p.status==='pending' || (p.isOwner && p.pendentes>0);
    const sub = p.status==='pending' ? 'o organizador precisa aprovar você'
      : `${p.membros} participante(s)` + (p.isOwner && p.pendentes>0 ? ` · <b style="color:var(--accent)">${p.pendentes} pedido(s)!</b>` : '');
    const clickable = p.status!=='pending';
    return `<div class="pool-card ${clickable?'go':''} ${precisaAcao?'alerta':''}" data-id="${p.id}" data-name="${encodeURIComponent(p.name)}"
              data-code="${p.code}" data-owner="${p.isOwner?1:0}" data-status="${p.status}" data-regras="${encodeURIComponent(JSON.stringify(p.regras))}">
      <div class="pc-main"><div class="pc-name">${p.name}</div><div class="pc-sub">${sub}</div></div>
      <div class="pc-side">${tag}${clickable?'<span class="pc-arrow">›</span>':''}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.pool-card.go').forEach(c=>{
    c.onclick = ()=>abrirBolao({
      id:Number(c.dataset.id), name:decodeURIComponent(c.dataset.name), code:c.dataset.code,
      isOwner:c.dataset.owner==='1', status:c.dataset.status,
      regras: JSON.parse(decodeURIComponent(c.dataset.regras)),
    });
  });
}
async function criarBolao(){
  const name = $('#newPoolName').value.trim();
  if (name.length < 2) return toast('Dê um nome ao bolão.');
  const regras = { exato:Number($('#rExato').value)||0, resultado:Number($('#rResultado').value)||0, gols:Number($('#rGols').value)||0 };
  try{
    const { pool } = await post('pools', { name, player_id: ME.id, regras });
    $('#newPoolName').value = '';
    toast(`Bolão criado! Código: ${pool.code}`, true);
    abrirBolao({ id:pool.id, name:pool.name, code:pool.code, isOwner:true, status:'owner', regras:pool.regras });
  }catch(e){ toast(e.message); }
}
async function entrarBolao(){
  const code = $('#joinCode').value.trim().toUpperCase();
  if (code.length < 4) return toast('Digite o código do bolão.');
  try{
    const { pool, msg } = await post('pools/join', { code, player_id: ME.id });
    toast(msg || 'Pedido enviado!', pool.status!=='pending');
    $('#joinCode').value='';
    if (pool.status==='pending') irLobby();
    else abrirBolao({ id:pool.id, name:pool.name, code, isOwner:pool.status==='owner', status:pool.status, regras:pool.regras });
  }catch(e){ toast(e.message); }
}

// ================= modo visitante (só ver jogos/resultados) =================
function abrirVisitante(){
  VISITANTE = true; POOL = null;
  show('app');
  $('#poolName').textContent = 'Jogos & Resultados';
  $('#poolName').classList.add('guest-title');
  $('#poolCode').textContent = '';
  // esconde tudo que depende de bolão
  $('#app .me').style.display = 'none';
  $('#regrasBar').style.display = 'none';
  document.querySelector('#app .pooltools').style.display = 'none';
  $('#tabRank').style.display = 'none';
  $('#tabChave').style.display = '';
  $('#tabGrupos').style.display = '';
  FILTRO=''; VISTA=null; trocarAba('jogos'); carregarJogos();
}

// ================= contexto do bolão =================
function abrirBolao(pool){
  VISITANTE = false; POOL = pool; localStorage.setItem(PKEY, JSON.stringify(pool));
  show('app');
  $('#poolName').classList.remove('guest-title');
  $('#app .me').style.display = '';
  $('#regrasBar').style.display = '';
  document.querySelector('#app .pooltools').style.display = '';
  $('#tabRank').style.display = '';
  $('#meName').textContent = ME.name;
  $('#poolName').textContent = pool.name;
  $('#poolCode').textContent = pool.isOwner ? ('código ' + pool.code) : '';
  $('#membersBtn').style.display = pool.isOwner ? '' : 'none';
  $('#regrasBar').innerHTML = regrasTxt(pool.regras);
  FILTRO=''; VISTA=null; trocarAba('jogos'); carregarJogos(); carregarRanking();
}
function trocarAba(a){
  aba = a;
  $('#tabJogos').setAttribute('aria-selected', a==='jogos');
  $('#tabGrupos').setAttribute('aria-selected', a==='grupos');
  $('#tabChave').setAttribute('aria-selected', a==='chave');
  $('#tabRank').setAttribute('aria-selected', a==='rank');
  $('#viewJogos').classList.toggle('hide', a!=='jogos');
  $('#viewGrupos').classList.toggle('hide', a!=='grupos');
  $('#viewChave').classList.toggle('hide', a!=='chave');
  $('#viewRank').classList.toggle('hide', a!=='rank');
  $('#viewMembros').classList.toggle('hide', a!=='membros');
  $('#viewCompare').classList.toggle('hide', a!=='compare');
  document.querySelector('nav.tabs').style.display = (a==='membros'||a==='compare') ? 'none' : '';
  if (a==='rank') carregarRanking();
  if (a==='chave') renderChave();
  if (a==='grupos') renderGrupos();
  if (a==='membros') carregarMembros();
  if (a==='compare') renderCompare();
}

// ================= membros (dono) =================
async function carregarMembros(){
  $('#membersBody').innerHTML = '<div class="spin">carregando…</div>';
  try{
    const { membros } = await api(`pools/members?pool=${POOL.id}&owner=${ME.id}`);
    const pend = membros.filter(m=>m.status==='pending');
    const ativos = membros.filter(m=>m.status!=='pending');
    let html = `<div class="back-row"><button class="btn ghost" id="backToApp">← voltar ao bolão</button>
             <span class="hint">código: <b>${POOL.code}</b></span></div>`;
    html += '<div class="mem-sec">Pedidos para entrar</div>';
    html += pend.length ? pend.map(m=>`<div class="mem-row pend">
        <span class="mem-name">${m.name}</span>
        <span class="mem-act">
          <button class="btn ok-btn" data-id="${m.id}" data-dec="approve">aprovar</button>
          <button class="btn ghost no-btn" data-id="${m.id}" data-dec="reject">recusar</button>
        </span></div>`).join('') : '<div class="hint" style="padding:8px 2px">nenhum pedido no momento.</div>';
    html += `<div class="mem-sec">Participando (${ativos.length})</div>`;
    html += ativos.map(m=>`<div class="mem-row"><span class="mem-name">${m.name}</span>
      <span class="ptag ${m.status==='owner'?'own':'ok'}">${m.status==='owner'?'organizador':'membro'}</span></div>`).join('');
    $('#membersBody').innerHTML = html;
    $('#backToApp').onclick = ()=>trocarAba('jogos');
    document.querySelectorAll('.ok-btn,.no-btn').forEach(b=> b.onclick = ()=>decidir(Number(b.dataset.id), b.dataset.dec));
  }catch(e){ $('#membersBody').innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function decidir(targetId, decision){
  try{
    await post('pools/approve', { pool_id:POOL.id, owner_id:ME.id, player_id:targetId, decision });
    toast(decision==='approve'?'Aprovado!':'Recusado.', decision==='approve');
    carregarMembros(); carregarRanking();
  }catch(e){ toast(e.message); }
}

// ================= comparativo (2 jogadores) =================
function renderCompare(){
  // precisa da lista de membros (vem do ranking)
  if (!RANKING || !RANKING.length){
    $('#viewCompare').innerHTML = '<div class="spin">carregando…</div>';
    carregarRanking().then(()=>{ if (aba==='compare') renderCompare(); });
    return;
  }
  const membros = RANKING.map(r=>({ id:r.id, name:r.name }));
  const back = `<div class="back-row"><button class="btn ghost" id="backFromCompare">← voltar ao bolão</button><span class="hint">🆚 Comparativo</span></div>`;
  if (membros.length < 2){
    $('#viewCompare').innerHTML = back + '<div class="empty">Precisa de pelo menos 2 participantes aprovados pra comparar.</div>';
    $('#backFromCompare').onclick = ()=>trocarAba('jogos');
    return;
  }
  if (!CMP_A || !membros.some(m=>m.id===CMP_A)) CMP_A = (ME && membros.some(m=>m.id===ME.id)) ? ME.id : membros[0].id;
  if (!CMP_B || CMP_B===CMP_A || !membros.some(m=>m.id===CMP_B)) CMP_B = (membros.find(m=>m.id!==CMP_A) || membros[0]).id;
  const opts = (sel)=> membros.map(m=>`<option value="${m.id}" ${m.id===sel?'selected':''}>${m.name}</option>`).join('');
  $('#viewCompare').innerHTML = back +
    `<div class="cmp-pick">
       <select id="cmpA" class="cmp-sel">${opts(CMP_A)}</select>
       <span class="cmp-vs">×</span>
       <select id="cmpB" class="cmp-sel">${opts(CMP_B)}</select>
     </div>
     <div id="compareBody"><div class="spin">carregando…</div></div>`;
  $('#backFromCompare').onclick = ()=>trocarAba('jogos');
  $('#cmpA').onchange = (e)=>{ CMP_A=Number(e.target.value); if(CMP_A===CMP_B){ const alt=membros.find(m=>m.id!==CMP_A); if(alt) CMP_B=alt.id; } renderCompare(); };
  $('#cmpB').onchange = (e)=>{ CMP_B=Number(e.target.value); if(CMP_B===CMP_A){ const alt=membros.find(m=>m.id!==CMP_B); if(alt) CMP_A=alt.id; } renderCompare(); };
  carregarCompare();
}
async function carregarCompare(){
  try{
    const d = await api(`compare?pool=${POOL.id}&a=${CMP_A}&b=${CMP_B}`);
    renderCompareTable(d);
  }catch(e){ const el=$('#compareBody'); if(el) el.innerHTML = `<div class="empty">${e.message}</div>`; }
}
function renderCompareTable(d){
  const el = $('#compareBody'); if(!el) return;
  const head = `<div class="cmp-totals">
      <div class="cmp-side"><span class="cmp-nm">${d.a.name}</span><span class="cmp-pts">${d.totalA}</span><span class="cmp-sub">${d.cravA} cravada(s)</span></div>
      <div class="cmp-mid">pontos</div>
      <div class="cmp-side"><span class="cmp-nm">${d.b.name}</span><span class="cmp-pts">${d.totalB}</span><span class="cmp-sub">${d.cravB} cravada(s)</span></div>
    </div>`;
  if (!d.jogos.length){ el.innerHTML = head + '<div class="empty">Nenhum palpite revelado ainda. Os palpites aparecem aqui quando fecham (1h antes do jogo).</div>'; return; }
  const cell = (p, fin, win)=> p
    ? `<div class="cmp-guess ${win?'win':''}">${p.home}×${p.away}${fin?`<small>${p.pontos>0?'+':''}${p.pontos} pts</small>`:''}</div>`
    : '<div class="cmp-guess empty">sem palpite</div>';
  const linhas = d.jogos.map(j=>{
    const res = j.finished ? `resultado ${j.home_score}×${j.away_score}` : 'aguardando placar';
    const winA = j.finished && j.a && j.b && j.a.pontos > j.b.pontos;
    const winB = j.finished && j.a && j.b && j.b.pontos > j.a.pontos;
    const ctx = j.fase==='grupo' ? 'Grupo '+j.grupo : j.fase_nome;
    return `<div class="cmp-row">
       <div class="cmp-match"><span class="cmp-teams">${j.home_label} × ${j.away_label}</span>
         <span class="cmp-meta">${ctx} · ${res}</span></div>
       <div class="cmp-guesses">${cell(j.a, j.finished, winA)}<span class="cmp-x">×</span>${cell(j.b, j.finished, winB)}</div>
     </div>`;
  }).join('');
  el.innerHTML = head + linhas;
}

// ================= jogos =================
async function carregarJogos(){
  try{
    const url = VISITANTE ? 'matches' : `matches?player=${ME.id}&pool=${POOL.id}`;
    const { jogos } = await api(url);
    JOGOS = jogos; renderFiltros(); renderJogos();
    if(aba==='chave') renderChave();
    if(aba==='grupos') renderGrupos();
  }catch(e){ $('#jogosList').innerHTML = `<div class="empty">${e.message}</div>`; }
}
const ONTEM_KEY = () => chaveDia.format(new Date(Date.now() - 86400000));
function escolherVista(){
  const hoje = chaveDia.format(new Date());
  if (JOGOS.some(j => chaveDia.format(new Date(j.kickoff)) === hoje)) return 'hoje';
  if (JOGOS.some(j => chaveDia.format(new Date(j.kickoff)) > hoje)) return 'proximos';
  return 'ontem';
}
function renderFiltros(){
  if (!VISTA) VISTA = escolherVista();
  const segs = [{k:'ontem',l:'Ontem'},{k:'hoje',l:'Hoje'},{k:'proximos',l:'Próximos'}];
  const r = $('#rounds'); r.className = 'daynav';
  r.innerHTML = segs.map(s => `<button data-v="${s.k}" aria-selected="${s.k===VISTA}">${s.l}</button>`).join('');
  r.querySelectorAll('button').forEach(b => b.onclick = () => { VISTA = b.dataset.v; renderFiltros(); renderJogos(); });
}
function renderJogos(){
  const pend = VISITANTE ? 0 : JOGOS.filter(j=>j.aberto && !j.palpite).length;
  const aviso = pend ? `<div class="pendalert">⚠️ Você tem <b>${pend}</b> jogo(s) aberto(s) sem palpite</div>` : '';
  const hoje = chaveDia.format(new Date());
  const dk = (j) => chaveDia.format(new Date(j.kickoff));
  let lista;
  if (VISTA === 'ontem') { const y = ONTEM_KEY(); lista = JOGOS.filter(j => dk(j) === y); }
  else if (VISTA === 'proximos') { lista = JOGOS.filter(j => dk(j) > hoje); }
  else { lista = JOGOS.filter(j => dk(j) === hoje); }
  if (!lista.length){ $('#jogosList').innerHTML = aviso + `<div class="empty">${VISTA==='ontem'?'Nenhum jogo ontem.':VISTA==='hoje'?'Nenhum jogo hoje.':'Nenhum jogo pela frente.'}</div>`; return; }
  let html=aviso, dia='';
  for (const j of lista){
    const d = new Date(j.kickoff), dk = chaveDia.format(d);
    if (dk!==dia){ dia=dk; html += `<div class="daygroup"><div class="dayhead">${cap(fmtDia.format(d))}</div></div>`; }
    html += cardJogo(j);
  }
  $('#jogosList').innerHTML = html; bindCards();
}
function cardJogo(j){
  const hora = fmtHora.format(new Date(j.kickoff));
  const g = j.palpite;
  const editavel = !VISITANTE && j.aberto;
  const ctx = j.fase==='grupo' ? `Fase de grupos · ${j.rodada}ª rodada` : j.fase_nome;
  const venc = j.finished ? (j.advance==='home'?'home':j.advance==='away'?'away'
      : j.home_score>j.away_score?'home':j.away_score>j.home_score?'away':null) : null;

  // células centrais: inputs (palpite) ou placar
  let homeCell, awayCell, midTxt, midCls = 'smatch-mid';
  if (editavel){
    homeCell = `<input class="gbox" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-side="home" value="${g?g.home:''}" placeholder="–" aria-label="gols mandante">`;
    awayCell = `<input class="gbox" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-side="away" value="${g?g.away:''}" placeholder="–" aria-label="gols visitante">`;
    midTxt = '<span class="x">×</span>';
  } else if (j.finished){
    homeCell = `<div class="score-big real">${j.home_score}</div>`;
    awayCell = `<div class="score-big real">${j.away_score}</div>`;
    midTxt = 'Final'; midCls = 'smatch-mid final';
  } else if (!j.definido){
    homeCell = '<div class="score-big dim">–</div>';
    awayCell = '<div class="score-big dim">–</div>';
    midTxt = '<span class="x">×</span>';
  } else if (g){
    homeCell = `<div class="score-big">${g.home}</div>`;
    awayCell = `<div class="score-big">${g.away}</div>`;
    midTxt = hora;
  } else {
    homeCell = '<div class="score-big dim">–</div>';
    awayCell = '<div class="score-big dim">–</div>';
    midTxt = hora;
  }

  // rodapé (pontos / palpite / ações)
  let foot = '';
  if (VISITANTE){
    foot = j.finished ? '<span class="hint">✅ encerrado</span>'
      : (!j.definido ? '<span class="hint">⏳ aguardando a definição dos times</span>'
         : (j.aberto ? '<span class="hint">🕒 ainda não começou</span>' : '<span class="hint warn">⏱ em andamento / aguardando placar</span>'));
  } else if (j.finished){
    const p = j.pontos;
    const pp = p===null ? '<span class="hint">você não palpitou</span>'
      : `<span class="pts ${p?'':'zero'}">${p>0?'+':''}${p} pts</span>`;
    const seu = g ? `<span class="hint">seu palpite: ${g.home}×${g.away}</span>` : '';
    foot = `${pp}${seu}<button class="btn ghost peek-btn" data-id="${j.id}">ver palpites</button>`;
  } else if (!j.definido){
    foot = '<span class="hint">⏳ aguardando a definição dos times</span>';
  } else if (editavel){
    foot = g
      ? `<span class="hint">✏️ pode mudar até 1h antes do jogo</span><button class="btn save-btn" data-id="${j.id}">Atualizar</button>`
      : '<span class="hint">⏰ palpite aberto · dá pra mudar até 1h antes</span><button class="btn save-btn" data-id="'+j.id+'">Salvar</button>';
  } else if (g){
    foot = `<span class="hint lock">🔒 Palpitado ${g.home}×${g.away} — palpites fechados</span>`;
  } else {
    foot = '<span class="hint warn">⏱ fechado · sem palpite</span>';
  }

  return `<div class="smatch" data-id="${j.id}">
    <div class="smatch-label">${ctx} · ${hora}${j.city?` · <span class="city">${j.city}</span>`:''}</div>
    <div class="smatch-row">
      <div class="steam ${venc==='home'?'win':''}">${flagImg(j.home)}<div class="snm">${j.home_label}</div></div>
      ${homeCell}
      <div class="${midCls}">${midTxt}</div>
      ${awayCell}
      <div class="steam ${venc==='away'?'win':''}">${flagImg(j.away)}<div class="snm">${j.away_label}</div></div>
    </div>
    <div class="foot">${foot}</div>
    <div class="peek" data-peek="${j.id}"></div>
  </div>`;
}
function bindCards(){
  document.querySelectorAll('.gbox').forEach(inp=> inp.addEventListener('input', ()=>{ inp.value = inp.value.replace(/[^0-9]/g,'').slice(0,2); }));
  document.querySelectorAll('.save-btn').forEach(b=> b.onclick = ()=>salvar(Number(b.dataset.id), b));
  document.querySelectorAll('.peek-btn').forEach(b=> b.onclick = ()=>verPalpites(Number(b.dataset.id), b));
}
async function salvar(id, btn){
  const card = document.querySelector(`.smatch[data-id="${id}"]`);
  const h = card.querySelector('.gbox[data-side="home"]').value;
  const a = card.querySelector('.gbox[data-side="away"]').value;
  if (h==='' || a===''){ toast('Preencha os dois placares.'); return; }
  if (!confirm(`Confirmar palpite ${h} × ${a}?\n\nDá pra mudar até 1h antes do jogo.`)) return;
  btn.disabled = true;
  try{
    await post('predictions', { player_id:ME.id, match_id:id, home:Number(h), away:Number(a) });
    const j = JOGOS.find(x=>x.id===id); if(j) j.palpite = { home:Number(h), away:Number(a) };
    toast('Palpite salvo!', true); renderJogos();
  }catch(e){ toast(e.message); btn.disabled = false; }
}
async function verPalpites(id, btn){
  const peek = document.querySelector(`[data-peek="${id}"]`);
  if (peek.classList.contains('show')){ peek.classList.remove('show'); btn.textContent='ver palpites'; return; }
  peek.innerHTML = '<div class="row">carregando…</div>'; peek.classList.add('show'); btn.textContent='ocultar';
  try{
    const { liberado, palpites } = await api(`predictions?match=${id}&pool=${POOL.id}`);
    if (!liberado){ peek.innerHTML = '<div class="row">os palpites aparecem quando o palpite fecha (1h antes do jogo).</div>'; return; }
    if (!palpites.length){ peek.innerHTML = '<div class="row">ninguém palpitou neste jogo.</div>'; return; }
    peek.innerHTML = palpites.map(p=>`<div class="row"><b>${p.name}</b>
      <span>${p.home}×${p.away} ${p.pontos!=null?`<span class="pp">+${p.pontos}</span>`:''}</span></div>`).join('');
  }catch(e){ peek.innerHTML = `<div class="row">${e.message}</div>`; }
}

// ================= grupos (classificação calculada no navegador) =================
function standingsGrupo(jogos){
  const t = {};
  const add = (time)=> (t[time] = t[time] || { time, j:0, v:0, e:0, d:0, gp:0, gc:0, pts:0 });
  for (const j of jogos){ if (j.home) add(j.home); if (j.away) add(j.away); }
  for (const j of jogos){
    if (!j.finished || j.home_score == null) continue;
    const h = t[j.home], a = t[j.away]; if (!h || !a) continue;
    h.j++; a.j++; h.gp += j.home_score; h.gc += j.away_score; a.gp += j.away_score; a.gc += j.home_score;
    if (j.home_score > j.away_score){ h.v++; h.pts += 3; a.d++; }
    else if (j.home_score < j.away_score){ a.v++; a.pts += 3; h.d++; }
    else { h.e++; a.e++; h.pts++; a.pts++; }
  }
  return Object.values(t).map(x=>({ ...x, sg:x.gp-x.gc }))
    .sort((x,y)=> y.pts-x.pts || y.sg-x.sg || y.gp-x.gp || x.time.localeCompare(y.time));
}
function renderGrupos(){
  if (!JOGOS.length){ $('#gruposBody').innerHTML = '<div class="spin">carregando…</div>'; return; }
  const grupos = {};
  for (const j of JOGOS) if (j.fase==='grupo') (grupos[j.grupo] = grupos[j.grupo] || []).push(j);
  const letras = Object.keys(grupos).sort();
  if (!letras.length){ $('#gruposBody').innerHTML = '<div class="empty">Sem jogos de grupo.</div>'; return; }
  let html = '<p class="chave-intro">Classificação ao vivo. Os <b>2 primeiros</b> de cada grupo (em verde) vão direto ao mata-mata; os melhores 3º entram depois. Desempate: pontos → saldo → gols.</p>';
  for (const g of letras){
    const tab = standingsGrupo(grupos[g]);
    html += `<div class="gtbl"><div class="gtbl-h">Grupo ${g}</div>
      <div class="gt-row gt-head"><span class="gt-pos"></span><span class="gt-team">Time</span><span>J</span><span>V</span><span>E</span><span>D</span><span>SG</span><span class="gt-pts">PTS</span></div>`;
    tab.forEach((r,i)=>{
      const sgTxt = (r.sg>0?'+':'') + r.sg;
      const sgCls = r.sg>0?'pos':r.sg<0?'neg':'';
      html += `<div class="gt-row ${i<2?'q':''}">
        <span class="gt-pos">${i+1}</span>
        <span class="gt-team">${flagImg(r.time)}<span class="gt-nm">${r.time}</span></span>
        <span>${r.j}</span><span>${r.v}</span><span>${r.e}</span><span>${r.d}</span>
        <span class="${sgCls}">${sgTxt}</span><span class="gt-pts">${r.pts}</span>
      </div>`;
    });
    html += '</div>';
  }
  $('#gruposBody').innerHTML = html;
}

// ================= chave =================
function renderChave(){
  if (!JOGOS.length){ $('#chaveBody').innerHTML = '<div class="spin">carregando…</div>'; return; }
  const mata = JOGOS.filter(j=>j.fase!=='grupo');
  let html = '<p class="chave-intro">O chaveamento se monta sozinho conforme os resultados saem. Times “a definir” aparecem assim que a fase anterior termina.</p>';
  for (const fase of MATA_ORDEM){
    const jogos = mata.filter(j=>j.fase===fase).sort((a,b)=>a.match_num-b.match_num);
    if (!jogos.length) continue;
    html += `<div class="chave-fase"><div class="chave-fase-h">${jogos[0].fase_nome}</div>`;
    for (const j of jogos){
      const venc = j.finished ? (j.advance==='home'?'home':j.advance==='away'?'away'
        : j.home_score>j.away_score?'home':j.away_score>j.home_score?'away':null) : null;
      const placar = j.finished ? `${j.home_score}×${j.away_score}` : '';
      html += `<div class="chave-jogo"><span class="cj-num">#${j.match_num}</span>
        <div class="cj-times">
          <div class="cj-t ${venc==='home'?'win':''}">${j.home?flag(j.home)+' ':''}${j.home_label}</div>
          <div class="cj-t ${venc==='away'?'win':''}">${j.away?flag(j.away)+' ':''}${j.away_label}</div>
        </div><span class="cj-score">${placar||'–'}</span></div>`;
    }
    html += '</div>';
  }
  $('#chaveBody').innerHTML = html;
}

// ================= ranking =================
async function carregarRanking(){
  if (!POOL) return;
  if (aba==='rank') $('#rankBody').innerHTML = '<div class="spin">carregando ranking…</div>';
  try{
    const { ranking } = await api('ranking?pool=' + POOL.id);
    RANKING = ranking; if(aba==='rank') renderRanking(ranking); atualizarMeuResumo(ranking);
    if (POOL.isOwner) atualizarPendentes();
  }catch(e){ if(aba==='rank') $('#rankBody').innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function atualizarPendentes(){
  try{ const { pools } = await api('pools?player=' + ME.id);
    const p = pools.find(x=>x.id===POOL.id);
    $('#pendDot').style.display = (p && p.pendentes>0) ? 'block' : 'none';
  }catch{}
}
function atualizarMeuResumo(ranking){
  const eu = ranking.find(r=>r.id===ME.id);
  $('#mePts').textContent = eu ? eu.pontos : 0;
  $('#mePos').textContent = eu && eu.palpitados>0 ? (eu.posicao+'º') : '—';
}
function renderRanking(rk){
  if (!rk.length){ $('#rankBody').innerHTML = '<div class="empty">Ninguém aprovado no bolão ainda.</div>'; return; }
  const top = rk.slice(0,3); const medal = { 0:'🥇',1:'🥈',2:'🥉' };
  let podium = '<div class="podium">';
  [1,0,2].forEach((i)=>{ const r = top[i];
    if (!r){ podium += '<div class="pod" style="visibility:hidden"></div>'; return; }
    podium += `<div class="pod p${i+1}"><div class="medal">${medal[i]}</div><div class="nm">${r.name}</div><div class="pt">${r.pontos}</div></div>`;
  });
  podium += '</div>';
  const linhas = rk.map(r=>`<div class="rank-row ${r.id===ME.id?'you':''} ${r.posicao===1?'lead':''}">
      <span class="pos">${r.posicao}</span>
      <div class="info"><div class="nm">${r.name}${r.id===ME.id?' · você':''}</div>
        <div class="sub">${r.cravadas} cravada(s) · ${r.palpitados} jogo(s) pontuado(s)</div></div>
      <div class="total">${r.pontos}<small>pts</small></div></div>`).join('');
  $('#rankBody').innerHTML = podium + '<div style="margin-top:12px">' + linhas + '</div>';
}

// ================= exportar PDF =================
async function exportarPDF(){
  toast('Gerando PDF…');
  let ranking = RANKING;
  try{ const r = await api('ranking?pool=' + POOL.id); ranking = r.ranking; }catch{}
  const dataGer = fmtData.format(new Date());
  const r = POOL.regras || {exato:5,resultado:3,gols:0};

  const rankHtml = ranking.length ? ranking.map(x=>`<tr${x.id===ME.id?' class="me"':''}>
    <td>${x.posicao}º</td><td>${x.name}${x.id===ME.id?' (você)':''}</td><td>${x.cravadas}</td><td class="b">${x.pontos}</td></tr>`).join('')
    : '<tr><td colspan="4">Sem participantes pontuados ainda.</td></tr>';
  const jogosHtml = JOGOS.map(j=>{
    const meu = j.palpite ? `${j.palpite.home}×${j.palpite.away}` : '—';
    const real = j.finished ? `${j.home_score}×${j.away_score}` : '';
    const pts = j.finished && j.palpite ? `${j.pontos>0?'+':''}${j.pontos}` : '';
    const ctx = j.fase==='grupo' ? 'G'+j.grupo : j.fase.toUpperCase();
    return `<tr><td>${fmtData.format(new Date(j.kickoff))}</td><td>${ctx}</td>
      <td>${j.home_label} × ${j.away_label}</td><td class="c">${meu}</td><td class="c">${real||'-'}</td><td class="c b">${pts}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${POOL.name} — ${ME.name}</title>
  <style>*{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}body{margin:24px;color:#142019}
    h1{margin:0;font-size:22px}h2{font-size:15px;margin:22px 0 6px;border-bottom:2px solid #0E7A4B;padding-bottom:3px;color:#0E7A4B}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #142019;padding-bottom:8px}
    .sub{color:#555;font-size:12px;margin-top:3px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
    th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#142019;color:#fff;font-size:10px;text-transform:uppercase}
    td.c{text-align:center}td.b{font-weight:bold}tr.me{background:#e9f9f1}
    .foot{margin-top:18px;color:#888;font-size:10px;text-align:center}@media print{body{margin:10mm}}</style></head><body>
    <div class="head"><div><h1>🏆 ${POOL.name}</h1><div class="sub">Bolão da Copa 2026 · jogador: <b>${ME.name}</b></div></div>
      <div class="sub">gerado em ${dataGer}</div></div>
    <div class="sub" style="margin-top:8px"><b>Regras:</b> cravar o placar = ${r.exato} pts · acertar vencedor/empate = ${r.resultado} pts${r.gols>0?` · acertar os gols de um time = +${r.gols} pts`:''}</div>
    <h2>Classificação do bolão</h2>
    <table><thead><tr><th>#</th><th>Participante</th><th>Cravadas</th><th>Pontos</th></tr></thead><tbody>${rankHtml}</tbody></table>
    <h2>Todos os jogos &amp; meus palpites</h2>
    <table><thead><tr><th>Data</th><th>Fase</th><th>Jogo</th><th>Meu palpite</th><th>Placar</th><th>Pts</th></tr></thead><tbody>${jogosHtml}</tbody></table>
    <div class="foot">O chaveamento se completa automaticamente até a final.</div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),350)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w){ toast('Libere pop-ups para exportar o PDF.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
