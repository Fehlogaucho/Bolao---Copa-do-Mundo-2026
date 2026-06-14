/* Bolão da Copa 26 — app do jogador (v4: contas com senha + regras por bolão) */
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
const FASES = [
  { k:'r1', lbl:'1ª rod.' }, { k:'r2', lbl:'2ª rod.' }, { k:'r3', lbl:'3ª rod.' },
  { k:'r32', lbl:'16-avos' }, { k:'r16', lbl:'Oitavas' }, { k:'qf', lbl:'Quartas' },
  { k:'sf', lbl:'Semis' }, { k:'final', lbl:'Final/3º' },
];
const MATA_ORDEM = ['r32','r16','qf','sf','tp','final'];

const KEY = 'sh_bolao_user', PKEY = 'sh_bolao_pool';
let ME = null, POOL = null, JOGOS = [], FILTRO = '', aba = 'jogos', RANKING = [], VISITANTE = false;

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
  $('#pdfBtn').onclick = exportarPDF;
  $('#tabJogos').onclick = ()=>trocarAba('jogos');
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
  FILTRO = ''; trocarAba('jogos'); carregarJogos();
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
  FILTRO = ''; trocarAba('jogos'); carregarJogos(); carregarRanking();
}
function trocarAba(a){
  aba = a;
  $('#tabJogos').setAttribute('aria-selected', a==='jogos');
  $('#tabChave').setAttribute('aria-selected', a==='chave');
  $('#tabRank').setAttribute('aria-selected', a==='rank');
  $('#viewJogos').classList.toggle('hide', a!=='jogos');
  $('#viewChave').classList.toggle('hide', a!=='chave');
  $('#viewRank').classList.toggle('hide', a!=='rank');
  $('#viewMembros').classList.toggle('hide', a!=='membros');
  document.querySelector('nav.tabs').style.display = a==='membros' ? 'none' : '';
  if (a==='rank') carregarRanking();
  if (a==='chave') renderChave();
  if (a==='membros') carregarMembros();
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

// ================= jogos =================
async function carregarJogos(){
  try{
    const url = VISITANTE ? 'matches' : `matches?player=${ME.id}&pool=${POOL.id}`;
    const { jogos } = await api(url);
    JOGOS = jogos; renderFiltros(); renderJogos(); if(aba==='chave') renderChave();
  }catch(e){ $('#jogosList').innerHTML = `<div class="empty">${e.message}</div>`; }
}
function renderFiltros(){
  if (!FILTRO){
    const prox = JOGOS.find(j=>j.aberto);
    FILTRO = prox ? (prox.fase==='grupo' ? 'r'+prox.rodada : (prox.fase==='tp'?'final':prox.fase)) : 'r1';
  }
  $('#rounds').innerHTML = FASES.map(f=>`<button data-f="${f.k}" aria-selected="${f.k===FILTRO}">${f.lbl}</button>`).join('');
  $('#rounds').querySelectorAll('button').forEach(b=> b.onclick = ()=>{ FILTRO=b.dataset.f; renderFiltros(); renderJogos(); });
}
function statusBadge(j){
  if (j.finished) return '<span class="badge final">Final</span>';
  if (!j.definido) return '<span class="badge wait">Aguardando</span>';
  if (!j.aberto)  return '<span class="badge closed">Fechado</span>';
  if (j.palpite)  return '<span class="badge done">Palpitado ✓</span>';
  return '<span class="badge open">Aberto</span>';
}
function renderJogos(){
  const pend = VISITANTE ? 0 : JOGOS.filter(j=>j.aberto && !j.palpite).length;
  const aviso = pend ? `<div class="pendalert">⚠️ Você tem <b>${pend}</b> jogo(s) aberto(s) sem palpite</div>` : '';
  const lista = JOGOS.filter(j=>naFase(j, FILTRO));
  if (!lista.length){ $('#jogosList').innerHTML = aviso + '<div class="empty">Nenhum jogo nesta fase.</div>'; return; }
  let html=aviso, dia='';
  for (const j of lista){
    const d = new Date(j.kickoff), dk = chaveDia.format(d);
    if (dk!==dia){ dia=dk; html += `<div class="daygroup"><div class="dayhead">${fmtDia.format(d).replace('.','')}</div></div>`; }
    html += cardJogo(j);
  }
  $('#jogosList').innerHTML = html; bindCards();
}
function cardJogo(j){
  const hora = fmtHora.format(new Date(j.kickoff));
  const g = j.palpite;
  const editavel = !VISITANTE && j.aberto && !g;
  const ctx = j.fase==='grupo' ? `Grupo ${j.grupo}` : j.fase_nome;
  const caixa = (lado, val) => {
    if (editavel) return `<div class="score">
      <input class="guess-in" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-side="${lado}" value="" placeholder="–" aria-label="gols">
      <div class="stepper"><button data-step="up" data-side="${lado}">▲</button><button data-step="down" data-side="${lado}">▼</button></div></div>`;
    const cls = j.finished ? 'box real' : 'box';
    return `<div class="score"><div class="${cls}">${val ?? '–'}</div></div>`;
  };
  const vHome = j.finished ? j.home_score : (g ? g.home : null);
  const vAway = j.finished ? j.away_score : (g ? g.away : null);
  const venc = j.finished ? (j.advance==='home'?'home':j.advance==='away'?'away'
      : j.home_score>j.away_score?'home':j.away_score>j.home_score?'away':null) : null;
  const linha = (lado, nome, val) => `<div class="team ${venc===lado?'win':''}">
      <span class="flag">${j[lado]?flag(nome):'·'}</span><span class="name">${nome}</span>${caixa(lado, val)}</div>`;

  let foot = '';
  if (VISITANTE){
    foot = j.finished
      ? `<span class="hint">✅ encerrado</span>`
      : (!j.definido ? `<span class="hint">⏳ aguardando a definição dos times</span>`
         : (j.aberto ? `<span class="hint">🕒 ainda não começou</span>` : `<span class="hint warn">⏱ em andamento / aguardando placar</span>`));
  } else if (j.finished){
    const p = j.pontos;
    const pp = p===null ? '<span class="hint">você não palpitou</span>'
      : `<span class="pts ${p?'':'zero'}">${p>0?'+':''}${p} pts</span>`;
    const seu = g ? `<span class="hint">seu palpite: ${g.home}×${g.away}</span>` : '';
    foot = `${pp}${seu}<button class="btn ghost peek-btn" data-id="${j.id}">ver palpites</button>`;
  } else if (!j.definido){
    foot = `<span class="hint">⏳ aguardando a definição dos times</span>`;
  } else if (g){
    foot = `<span class="hint lock">🔒 Palpitado ${g.home}×${g.away} — não pode mudar</span>`;
  } else if (j.aberto){
    foot = `<span class="hint">⚠️ depois de salvar não dá pra mudar</span><button class="btn save-btn" data-id="${j.id}">Salvar</button>`;
  } else {
    foot = `<span class="hint warn">⏱ fechado · sem palpite</span>`;
  }
  return `<div class="match" data-id="${j.id}">
    <div class="head"><span class="grp">${ctx} · ${hora} · <span class="city">${j.city||''}</span></span>${statusBadge(j)}</div>
    ${linha('home', j.home_label, vHome)}${linha('away', j.away_label, vAway)}
    <div class="foot">${foot}</div><div class="peek" data-peek="${j.id}"></div></div>`;
}
function bindCards(){
  document.querySelectorAll('.stepper button').forEach(b=>{
    b.onclick = ()=>{ const inp = b.closest('.match').querySelector(`.guess-in[data-side="${b.dataset.side}"]`);
      let v = parseInt(inp.value,10); if(isNaN(v)) v=0; v += b.dataset.step==='up'?1:-1; inp.value = Math.max(0, Math.min(30, v)); };
  });
  document.querySelectorAll('.guess-in').forEach(inp=> inp.addEventListener('input', ()=>{ inp.value = inp.value.replace(/[^0-9]/g,'').slice(0,2); }));
  document.querySelectorAll('.save-btn').forEach(b=> b.onclick = ()=>salvar(Number(b.dataset.id), b));
  document.querySelectorAll('.peek-btn').forEach(b=> b.onclick = ()=>verPalpites(Number(b.dataset.id), b));
}
async function salvar(id, btn){
  const card = document.querySelector(`.match[data-id="${id}"]`);
  const h = card.querySelector('.guess-in[data-side="home"]').value;
  const a = card.querySelector('.guess-in[data-side="away"]').value;
  if (h==='' || a===''){ toast('Preencha os dois placares.'); return; }
  if (!confirm(`Confirmar palpite ${h} × ${a}?\n\nAtenção: depois de salvar, o palpite NÃO pode ser alterado.`)) return;
  btn.disabled = true;
  try{
    await post('predictions', { player_id:ME.id, match_id:id, home:Number(h), away:Number(a) });
    const j = JOGOS.find(x=>x.id===id); if(j) j.palpite = { home:Number(h), away:Number(a) };
    toast('Palpite salvo! Não pode mais ser alterado.', true); renderJogos();
  }catch(e){ toast(e.message); btn.disabled = false; }
}
async function verPalpites(id, btn){
  const peek = document.querySelector(`[data-peek="${id}"]`);
  if (peek.classList.contains('show')){ peek.classList.remove('show'); btn.textContent='ver palpites'; return; }
  peek.innerHTML = '<div class="row">carregando…</div>'; peek.classList.add('show'); btn.textContent='ocultar';
  try{
    const { liberado, palpites } = await api(`predictions?match=${id}&pool=${POOL.id}`);
    if (!liberado){ peek.innerHTML = '<div class="row">os palpites aparecem quando a bola rolar.</div>'; return; }
    if (!palpites.length){ peek.innerHTML = '<div class="row">ninguém palpitou neste jogo.</div>'; return; }
    peek.innerHTML = palpites.map(p=>`<div class="row"><b>${p.name}</b>
      <span>${p.home}×${p.away} ${p.pontos!=null?`<span class="pp">+${p.pontos}</span>`:''}</span></div>`).join('');
  }catch(e){ peek.innerHTML = `<div class="row">${e.message}</div>`; }
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
