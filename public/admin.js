/* Bolão da Copa 26 — painel do organizador (v3: sincronizar todos) */
'use strict';
const $ = (s)=>document.querySelector(s);
let AUTH = { user:'', pass:'' };
let JOGOS = [], FILTRO = '';

const FASES = [
  {k:'r1',lbl:'1ª rod.'},{k:'r2',lbl:'2ª rod.'},{k:'r3',lbl:'3ª rod.'},
  {k:'r32',lbl:'16-avos'},{k:'r16',lbl:'Oitavas'},{k:'qf',lbl:'Quartas'},{k:'sf',lbl:'Semis'},{k:'final',lbl:'Final/3º'},
];
const fmt = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const toast=(m,ok=false)=>{const t=$('#toast');t.textContent=m;t.className='toast show'+(ok?' ok':'');clearTimeout(t._t);t._t=setTimeout(()=>t.className='toast',2600);};
const api=async(p,o)=>{const r=await fetch('/api/'+p,o);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.erro||'Falha');return d;};
const post=(p,b)=>api(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
const qs=(o)=>Object.entries(o).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');

function naFase(j,f){
  if(f==='r1')return j.fase==='grupo'&&j.rodada===1;
  if(f==='r2')return j.fase==='grupo'&&j.rodada===2;
  if(f==='r3')return j.fase==='grupo'&&j.rodada===3;
  if(f==='final')return j.fase==='final'||j.fase==='tp';
  return j.fase===f;
}

$('#go').onclick = ()=>abrir();
$('#rsBtn').onclick = resetSenha;
$('#syncAllBtn').onclick = sincronizarTudo;
$('#pw').addEventListener('keydown',e=>{ if(e.key==='Enter') abrir(); });

async function resetSenha(){
  const nome=$('#rsName').value.trim(), nova=$('#rsPass').value;
  if(nome.length<2) return toast('Informe o nome do usuário.');
  if(nova.length<4) return toast('A nova senha precisa ter ao menos 4 caracteres.');
  try{
    const r=await post('admin/reset-senha',{user:AUTH.user,password:AUTH.pass,player_name:nome,nova_senha:nova});
    toast(`Senha de ${r.name} redefinida!`,true);
    $('#rsName').value=''; $('#rsPass').value='';
  }catch(e){ toast(e.message); }
}

async function sincronizarTudo(){
  const btn=$('#syncAllBtn'); const resumo=$('#syncResumo');
  btn.disabled=true; const txt=btn.textContent; btn.textContent='🔄 sincronizando…';
  resumo.textContent='Buscando placares na internet…';
  try{
    const r=await post('admin/sincronizar-tudo',{user:AUTH.user,password:AUTH.pass});
    const empates=(r.detalhes||[]).filter(d=>d.status==='empate_mata');
    let linhas=[`${r.aplicados} placar(es) lançado(s) de ${r.total} jogo(s) já iniciado(s) e sem resultado.`];
    if(r.achados>r.aplicados) linhas.push(`${r.achados-r.aplicados} achado(s) mas não aplicado(s) (precisam de você).`);
    if(empates.length) linhas.push('Empate(s) de mata-mata: lance à mão indicando quem passou — '+empates.map(e=>'#'+e.match_num).join(', ')+'.');
    if(!r.aplicados && !r.achados) linhas.push('Nenhum placar encontrado automaticamente. Lance manualmente abaixo.');
    resumo.textContent=linhas.join('\n');
    toast(`Sincronizado: ${r.aplicados} de ${r.total}.`, r.aplicados>0);
    await carregar();
  }catch(e){ resumo.textContent=''; toast(e.message); }
  finally{ btn.disabled=false; btn.textContent=txt; }
}

(function(){ const s=sessionStorage.getItem('sh_admin_auth'); if(s){ try{AUTH=JSON.parse(s); abrir(true);}catch{} } })();

async function abrir(silent){
  if(!silent){ AUTH = { user:$('#user').value.trim()||'admin', pass:$('#pw').value }; }
  if(!AUTH.pass){ return toast('Digite a senha.'); }
  try{
    await post('admin/login', { user:AUTH.user, password:AUTH.pass });
    sessionStorage.setItem('sh_admin_auth', JSON.stringify(AUTH));
    $('#auth').classList.add('hide'); $('#panel').classList.remove('hide');
    await carregar();
  }catch(e){ toast(e.message); sessionStorage.removeItem('sh_admin_auth'); }
}

async function carregar(){
  const { jogos } = await api('admin/matches?'+qs({user:AUTH.user,password:AUTH.pass}));
  JOGOS = jogos;
  renderFiltros(); render(); renderMataBox();
}
function renderFiltros(){
  if(!FILTRO){ const prox=JOGOS.find(j=>!j.finished&&j.definido); FILTRO = prox?(prox.fase==='grupo'?'r'+prox.rodada:(prox.fase==='tp'?'final':prox.fase)):'r1'; }
  $('#filtros').innerHTML = FASES.map(f=>`<button data-f="${f.k}" aria-selected="${f.k===FILTRO}">${f.lbl}</button>`).join('');
  $('#filtros').querySelectorAll('button').forEach(b=>b.onclick=()=>{FILTRO=b.dataset.f;renderFiltros();render();});
}

function render(){
  const lista = JOGOS.filter(j=>naFase(j,FILTRO));
  $('#list').innerHTML = lista.map(j=>{
    const done=j.finished, mata=j.fase!=='grupo', empate=done && j.home_score===j.away_score;
    const defin = j.definido;
    const advSel = (lado)=>j.advance===lado?'true':'false';
    return `<div class="acard ${done?'done':''}" data-id="${j.id}">
      <div class="top">
        <div><div class="t">${j.home_label} <span class="x">×</span> ${j.away_label}</div>
          <div class="meta">${j.fase==='grupo'?'Grupo '+j.grupo:j.fase_nome} · #${j.match_num} · ${fmt.format(new Date(j.kickoff))} ${done?'· ✅':''}</div></div>
      </div>
      ${defin ? `<div class="ctl">
        <input class="sc" data-side="h" inputmode="numeric" maxlength="2" value="${j.home_score??''}" placeholder="–">
        <span class="x">×</span>
        <input class="sc" data-side="a" inputmode="numeric" maxlength="2" value="${j.away_score??''}" placeholder="–">
        <button class="src-find" data-id="${j.id}" title="buscar na internet">🔎 buscar</button>
        <button class="btn save" data-id="${j.id}" style="margin-left:auto">${done?'Atualizar':'Lançar'}</button>
        ${done?`<button class="btn ghost reopen" data-id="${j.id}">reabrir</button>`:''}
      </div>
      ${mata?`<div class="who-adv" data-adv="${j.id}" style="display:none">
        <span style="font-size:12px;color:var(--muted);align-self:center">Empate → quem avançou:</span>
        <button data-side="home" aria-selected="${advSel('home')}">${j.home||'mandante'}</button>
        <button data-side="away" aria-selected="${advSel('away')}">${j.away||'visitante'}</button>
      </div>`:''}`
      : `<div class="meta" style="color:var(--accent)">⏳ aguardando a definição dos times (fase anterior)</div>`}
    </div>`;
  }).join('');

  $('#list').querySelectorAll('.sc').forEach(i=>i.addEventListener('input',()=>{i.value=i.value.replace(/[^0-9]/g,'').slice(0,2);}));
  // mostra seletor de "quem avançou" quando empate em mata-mata
  $('#list').querySelectorAll('.acard').forEach(card=>{
    const id=Number(card.dataset.id), adv=card.querySelector(`[data-adv="${id}"]`);
    if(!adv) return;
    const upd=()=>{ const h=card.querySelector('.sc[data-side="h"]').value, a=card.querySelector('.sc[data-side="a"]').value;
      adv.style.display = (h!==''&&a!==''&&h===a)?'flex':'none'; };
    card.querySelectorAll('.sc').forEach(i=>i.addEventListener('input',upd)); upd();
    adv.querySelectorAll('button').forEach(b=>b.onclick=()=>{ adv.querySelectorAll('button').forEach(x=>x.setAttribute('aria-selected','false')); b.setAttribute('aria-selected','true'); });
  });
  $('#list').querySelectorAll('.save').forEach(b=>b.onclick=()=>lancar(Number(b.dataset.id),b));
  $('#list').querySelectorAll('.reopen').forEach(b=>b.onclick=()=>reabrir(Number(b.dataset.id)));
  $('#list').querySelectorAll('.src-find').forEach(b=>b.onclick=()=>buscar(Number(b.dataset.id),b));
}

async function lancar(id,btn){
  const card=$(`.acard[data-id="${id}"]`);
  const h=card.querySelector('.sc[data-side="h"]').value, a=card.querySelector('.sc[data-side="a"]').value;
  if(h===''||a==='') return toast('Preencha o placar.');
  const j=JOGOS.find(x=>x.id===id);
  let advance=null;
  if(j.fase!=='grupo' && h===a){
    const sel=card.querySelector(`[data-adv="${id}"] button[aria-selected="true"]`);
    if(!sel) return toast('Empate: marque quem avançou (pênaltis).');
    advance=sel.dataset.side;
  }
  btn.disabled=true;
  try{
    await post('admin/result',{user:AUTH.user,password:AUTH.pass,match_id:id,home:Number(h),away:Number(a),advance});
    toast('Resultado lançado!',true); await carregar();
  }catch(e){ toast(e.message); btn.disabled=false; }
}
async function reabrir(id){
  if(!confirm('Reabrir esse jogo? O resultado será apagado e o chaveamento/pontos recalculados.')) return;
  try{ await post('admin/reopen',{user:AUTH.user,password:AUTH.pass,match_id:id}); toast('Reaberto.',true); await carregar(); }
  catch(e){ toast(e.message); }
}
async function buscar(id,btn){
  btn.textContent='buscando…'; btn.disabled=true;
  try{
    const r=await post('admin/buscar-placar',{user:AUTH.user,password:AUTH.pass,match_id:id});
    if(r.encontrado){
      const card=$(`.acard[data-id="${id}"]`);
      card.querySelector('.sc[data-side="h"]').value=r.home;
      card.querySelector('.sc[data-side="a"]').value=r.away;
      card.querySelector('.sc[data-side="h"]').dispatchEvent(new Event('input'));
      toast(`Achei: ${r.detalhe}. Confira e clique em Lançar.`,true);
    } else { toast(r.msg||'Não encontrado. Lance manualmente.'); }
  }catch(e){ toast(e.message); }
  finally{ btn.textContent='🔎 buscar'; btn.disabled=false; }
}

// ---- montar mata-mata (definir os 8 melhores terceiros) ----
async function renderMataBox(){
  const wrap=$('#mataWrap'); wrap.innerHTML='';
  let prev;
  try{ prev = await api('admin/preview-mata?'+qs({user:AUTH.user,password:AUTH.pass})); }catch{ return; }
  if(!prev.todosGruposCompletos){
    const faltam = Object.entries(prev.grupos).filter(([g,v])=>!v.completo).map(([g])=>g);
    wrap.innerHTML = `<div class="mata-box"><h3>Mata-mata</h3>
      <div class="hint">Os 1º e 2º de cada grupo entram no chaveamento automaticamente. Para definir os <b>8 melhores 3º colocados</b>, finalize todos os grupos.${faltam.length?` Faltam: Grupo ${faltam.join(', ')}.`:''}</div></div>`;
    return;
  }
  const tercSlots = prev.slotsTerceiro;
  const tercDoGrupo={}; prev.terceiros.forEach(t=>tercDoGrupo[t.grupo]=t.time);
  const melhores = prev.melhoresGrupos;
  const opcoesValidas = (slot)=> slot.opcoes.filter(g=>melhores.includes(g)).map(g=>({grupo:g,time:tercDoGrupo[g]}));

  let html=`<div class="mata-box"><h3>Definir 8 melhores 3º</h3>
    <div class="hint">Os 8 melhores terceiros: ${melhores.map(g=>`${tercDoGrupo[g]} (3º ${g})`).join(', ')}.<br>
    Atribua cada um ao seu jogo conforme a tabela oficial da FIFA. Cada terceiro entra em <b>um</b> jogo.</div>`;
  tercSlots.forEach(s=>{
    const ops = opcoesValidas(s);
    html+=`<div class="terc-slot"><label>Jogo #${s.match_num} (3º de ${s.opcoes.join('/')})</label>
      <select data-num="${s.match_num}"><option value="">— escolher —</option>
      ${ops.map(o=>`<option value="${o.time}" ${s.atual===o.time?'selected':''}>${o.time} (3º ${o.grupo})</option>`).join('')}
      </select></div>`;
  });
  html+=`<button class="btn" id="saveTerc" style="margin-top:10px">Montar mata-mata</button></div>`;
  wrap.innerHTML=html;
  $('#saveTerc').onclick=salvarTerceiros;
}
async function salvarTerceiros(){
  const mapa={};
  document.querySelectorAll('.terc-slot select').forEach(s=>{ if(s.value) mapa[s.dataset.num]=s.value; });
  const vals=Object.values(mapa);
  if(new Set(vals).size!==vals.length) return toast('Tem terceiro repetido em mais de um jogo.');
  try{
    await post('admin/definir-terceiros',{user:AUTH.user,password:AUTH.pass,terceiros:mapa});
    toast('Mata-mata montado!',true); await carregar();
  }catch(e){ toast(e.message); }
}
