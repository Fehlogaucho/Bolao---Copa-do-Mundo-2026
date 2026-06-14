// API do Bolão da Copa 2026 — Cloudflare Pages Functions + D1
// Rota base: /api/*   (binding do banco: env.DB)
//
// Pontuação: cravar placar = 5 · acertar vencedor/empate = 3 · errar = 0
// Palpite é IMUTÁVEL: uma vez salvo, não muda.
// Mata-mata: chaveamento completo (R32→final) montado automaticamente conforme os resultados saem.

const FASES_MATA = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];
const REGRAS_PADRAO = { exato: 5, resultado: 3, gols: 0 };

// ---------- helpers ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const erro = (msg, status = 400) => json({ erro: msg }, status);
const chaveNome = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const intPlacar = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 30 ? n : null;
};
const intRegra = (v, def) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : def;
};

// ----- senha (Web Crypto / PBKDF2) -----
const bytesToHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const hexToBytes = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
async function derivar(senha, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}
async function hashSenha(senha) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToHex(salt), hash: await derivar(senha, salt) };
}
async function conferirSenha(senha, saltHex, hashHex) {
  try { return (await derivar(senha, hexToBytes(saltHex))) === hashHex; } catch { return false; }
}

// expressão SQL de pontos parametrizada pelas regras do bolão
function exprPontos(r) {
  const E = r.exato | 0, R = r.resultado | 0, G = r.gols | 0;
  return `
  CASE
    WHEN m.finished = 1 AND pr.home = m.home_score AND pr.away = m.away_score THEN ${E}
    WHEN m.finished = 1 THEN
      (CASE WHEN (pr.home > pr.away AND m.home_score > m.away_score)
              OR (pr.home < pr.away AND m.home_score < m.away_score)
              OR (pr.home = pr.away AND m.home_score = m.away_score) THEN ${R} ELSE 0 END)
      + ${G} * ((CASE WHEN pr.home = m.home_score THEN 1 ELSE 0 END) + (CASE WHEN pr.away = m.away_score THEN 1 ELSE 0 END))
    ELSE 0
  END`;
}

// ---------- entrada ----------
export async function onRequest(context) {
  const { request, env, params } = context;
  const seg = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const rota = seg.join('/');
  const m = request.method;
  if (!env.DB) return erro('Banco D1 não configurado (binding "DB" ausente).', 500);
  try {
    if (rota === 'register' && m === 'POST') return await register(request, env);
    if (rota === 'login' && m === 'POST') return await login(request, env);
    if (rota === 'matches' && m === 'GET') return await listarJogos(request, env);
    if (rota === 'predictions' && m === 'POST') return await salvarPalpite(request, env);
    if (rota === 'predictions' && m === 'GET') return await palpitesDoJogo(request, env);
    if (rota === 'ranking' && m === 'GET') return await ranking(request, env);
    // bolões (salas)
    if (rota === 'pools' && m === 'GET') return await meusPools(request, env);
    if (rota === 'pools' && m === 'POST') return await criarPool(request, env);
    if (rota === 'pools/join' && m === 'POST') return await entrarPool(request, env);
    if (rota === 'pools/members' && m === 'GET') return await membrosPool(request, env);
    if (rota === 'pools/approve' && m === 'POST') return await decidirMembro(request, env);
    // admin
    if (rota === 'admin/login' && m === 'POST') return await adminLogin(request, env);
    if (rota === 'admin/matches' && m === 'GET') return await adminJogos(request, env);
    if (rota === 'admin/result' && m === 'POST') return await adminResultado(request, env);
    if (rota === 'admin/reopen' && m === 'POST') return await adminReabrir(request, env);
    if (rota === 'admin/preview-mata' && m === 'GET') return await adminPreviewMata(request, env);
    if (rota === 'admin/definir-terceiros' && m === 'POST') return await adminDefinirTerceiros(request, env);
    if (rota === 'admin/buscar-placar' && m === 'POST') return await adminBuscarPlacar(request, env);
    if (rota === 'admin/reset-senha' && m === 'POST') return await adminResetSenha(request, env);
    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro('Erro interno: ' + (e?.message || e), 500);
  }
}

// =================================================================
// JOGADORES
// =================================================================
async function register(request, env) {
  const { name, password } = await request.json().catch(() => ({}));
  const nome = (name || '').trim();
  const senha = (password || '');
  if (nome.length < 2) return erro('Informe um nome com pelo menos 2 letras.');
  if (nome.length > 40) return erro('Nome muito longo (máx. 40).');
  if (senha.length < 4) return erro('A senha precisa ter pelo menos 4 caracteres.');
  const key = chaveNome(nome);
  const existe = await env.DB.prepare('SELECT 1 FROM players WHERE name_key = ?').bind(key).first();
  if (existe) return erro('Esse nome já está em uso. Faça login ou escolha outro.', 409);
  const { salt, hash } = await hashSenha(senha);
  const row = await env.DB
    .prepare('INSERT INTO players (name, name_key, pass_salt, pass_hash) VALUES (?, ?, ?, ?) RETURNING id, name')
    .bind(nome, key, salt, hash).first();
  return json({ id: row.id, name: row.name });
}

async function login(request, env) {
  const { name, password } = await request.json().catch(() => ({}));
  const nome = (name || '').trim();
  const senha = (password || '');
  if (nome.length < 2 || !senha) return erro('Informe nome e senha.');
  const key = chaveNome(nome);
  const row = await env.DB.prepare('SELECT id, name, pass_salt, pass_hash FROM players WHERE name_key = ?').bind(key).first();
  if (!row || !(await conferirSenha(senha, row.pass_salt, row.pass_hash)))
    return erro('Nome ou senha incorretos.', 401);
  return json({ id: row.id, name: row.name });
}

// rótulo legível para slots simbólicos do mata-mata
function slotLabel(src) {
  if (!src) return 'A definir';
  if (src[0] === '1') return `1º Grupo ${src.slice(1)}`;
  if (src[0] === '2') return `2º Grupo ${src.slice(1)}`;
  if (src.startsWith('3:')) return `3º (${src.slice(2).split('').join('/')})`;
  if (src[0] === 'W') return `Vencedor Jogo ${src.slice(1)}`;
  if (src[0] === 'L') return `Perdedor Jogo ${src.slice(1)}`;
  return src;
}
const nomeFase = (f) => ({ grupo:'Fase de Grupos', r32:'16-avos (Rodada de 32)', r16:'Oitavas', qf:'Quartas', sf:'Semifinais', tp:'Disputa de 3º lugar', final:'Final' }[f] || f);

async function regrasDoPool(env, poolId) {
  if (!poolId) return REGRAS_PADRAO;
  const p = await env.DB.prepare('SELECT pts_exato, pts_resultado, pts_gols FROM pools WHERE id = ?').bind(poolId).first();
  if (!p) return REGRAS_PADRAO;
  return { exato: p.pts_exato, resultado: p.pts_resultado, gols: p.pts_gols };
}

async function listarJogos(request, env) {
  const url = new URL(request.url);
  const playerId = Number(url.searchParams.get('player')) || 0;
  const poolId = Number(url.searchParams.get('pool')) || 0;
  const regras = await regrasDoPool(env, poolId);
  const jogos = (await env.DB.prepare(
    `SELECT id, match_num, fase, grupo, rodada, home, away, home_src, away_src, city, kickoff,
            home_score, away_score, advance, finished
     FROM matches ORDER BY kickoff ASC, match_num ASC`
  ).all()).results;

  let palpites = {};
  if (playerId) {
    const ps = (await env.DB.prepare('SELECT match_id, home, away FROM predictions WHERE player_id = ?')
      .bind(playerId).all()).results;
    for (const p of ps) palpites[p.match_id] = { home: p.home, away: p.away };
  }

  const agora = Date.now();
  const out = jogos.map((j) => {
    const definido = !!(j.home && j.away);
    const aberto = definido && !j.finished && new Date(j.kickoff).getTime() > agora;
    const palpite = palpites[j.id] || null;
    let pontos = null;
    if (j.finished && palpite) pontos = calcularPontos(palpite, j, regras);
    return {
      id: j.id, match_num: j.match_num, fase: j.fase, fase_nome: nomeFase(j.fase),
      grupo: j.grupo, rodada: j.rodada, city: j.city, kickoff: j.kickoff,
      home: j.home, away: j.away,
      home_label: j.home || slotLabel(j.home_src),
      away_label: j.away || slotLabel(j.away_src),
      home_score: j.home_score, away_score: j.away_score, advance: j.advance,
      finished: !!j.finished, definido, aberto, palpite, pontos,
    };
  });
  return json({ jogos: out, regras });
}

function calcularPontos(palpite, jogo, regras = REGRAS_PADRAO) {
  if (jogo.home_score == null || jogo.away_score == null) return null;
  if (palpite.home === jogo.home_score && palpite.away === jogo.away_score) return regras.exato;
  const rp = Math.sign(palpite.home - palpite.away);
  const rr = Math.sign(jogo.home_score - jogo.away_score);
  const base = rp === rr ? regras.resultado : 0;
  const golsCertos = (palpite.home === jogo.home_score ? 1 : 0) + (palpite.away === jogo.away_score ? 1 : 0);
  return base + regras.gols * golsCertos;
}

async function salvarPalpite(request, env) {
  const body = await request.json().catch(() => ({}));
  const playerId = Number(body.player_id) || 0;
  const matchId = Number(body.match_id) || 0;
  const home = intPlacar(body.home);
  const away = intPlacar(body.away);
  if (!playerId) return erro('Jogador inválido. Entre com seu nome de novo.');
  if (!matchId) return erro('Jogo inválido.');
  if (home === null || away === null) return erro('Placar inválido (use números de 0 a 30).');

  const jogo = await env.DB.prepare('SELECT kickoff, finished, home, away FROM matches WHERE id = ?')
    .bind(matchId).first();
  if (!jogo) return erro('Jogo não encontrado.', 404);
  if (!jogo.home || !jogo.away) return erro('Esse jogo ainda não tem os dois times definidos.', 409);
  if (jogo.finished || new Date(jogo.kickoff).getTime() <= Date.now())
    return erro('Palpites encerrados: a bola já rolou nesse jogo.', 409);

  // imutável: se já existe palpite, recusa
  const existe = await env.DB.prepare('SELECT id FROM predictions WHERE player_id = ? AND match_id = ?')
    .bind(playerId, matchId).first();
  if (existe) return erro('Você já palpitou nesse jogo e o palpite não pode ser alterado.', 409);

  await env.DB.prepare('INSERT INTO predictions (player_id, match_id, home, away) VALUES (?, ?, ?, ?)')
    .bind(playerId, matchId, home, away).run();
  return json({ ok: true, palpite: { home, away } });
}

async function palpitesDoJogo(request, env) {
  const url = new URL(request.url);
  const matchId = Number(url.searchParams.get('match')) || 0;
  const poolId = Number(url.searchParams.get('pool')) || 0;
  if (!matchId) return erro('Jogo inválido.');
  const regras = await regrasDoPool(env, poolId);
  const jogo = await env.DB.prepare('SELECT kickoff, home_score, away_score, finished FROM matches WHERE id = ?')
    .bind(matchId).first();
  if (!jogo) return erro('Jogo não encontrado.', 404);
  const liberado = jogo.finished || new Date(jogo.kickoff).getTime() <= Date.now();
  if (!liberado) return json({ liberado: false, palpites: [] });
  const rows = (await env.DB.prepare(
    `SELECT pl.name, pr.home, pr.away FROM predictions pr JOIN players pl ON pl.id = pr.player_id
     WHERE pr.match_id = ? ORDER BY pl.name COLLATE NOCASE`).bind(matchId).all()).results;
  const palpites = rows.map((r) => ({
    name: r.name, home: r.home, away: r.away,
    pontos: jogo.finished ? calcularPontos({ home: r.home, away: r.away }, jogo, regras) : null,
  }));
  return json({ liberado: true, palpites });
}

// =================================================================
// RANKING (automático por pontos) — escopo de um bolão
// =================================================================
async function ranking(request, env) {
  const url = new URL(request.url);
  const poolId = Number(url.searchParams.get('pool')) || 0;
  if (!poolId) return erro('Bolão não informado.');
  const regras = await regrasDoPool(env, poolId);
  const PT = exprPontos(regras);
  const rows = (await env.DB.prepare(
    `SELECT pl.id, pl.name,
            COALESCE(SUM(${PT}), 0) AS pontos,
            COALESCE(SUM(CASE WHEN m.finished=1 AND pr.home=m.home_score AND pr.away=m.away_score THEN 1 ELSE 0 END),0) AS cravadas,
            COALESCE(SUM(CASE WHEN m.finished=1 THEN 1 ELSE 0 END),0) AS palpitados
     FROM pool_members pm
     JOIN players pl ON pl.id = pm.player_id
     LEFT JOIN predictions pr ON pr.player_id = pl.id
     LEFT JOIN matches m ON m.id = pr.match_id
     WHERE pm.pool_id = ? AND pm.status IN ('owner','approved')
     GROUP BY pl.id, pl.name
     ORDER BY pontos DESC, cravadas DESC, pl.name COLLATE NOCASE ASC`).bind(poolId).all()).results;
  let pos = 0, ant = null, idx = 0;
  const tabela = rows.map((r) => {
    idx++; const chave = `${r.pontos}|${r.cravadas}`;
    if (chave !== ant) { pos = idx; ant = chave; }
    return { ...r, posicao: pos };
  });
  return json({ ranking: tabela, regras });
}

// =================================================================
// BOLÕES (salas)
// =================================================================
function gerarCodigo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
  let s = ''; for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

async function criarPool(request, env) {
  const b = await request.json().catch(() => ({}));
  const ownerId = Number(b.player_id) || 0;
  const nome = (b.name || '').trim();
  if (!ownerId) return erro('Faça login antes de criar um bolão.');
  if (nome.length < 2) return erro('Dê um nome ao bolão (mín. 2 letras).');
  if (nome.length > 40) return erro('Nome do bolão muito longo (máx. 40).');
  const regras = b.regras || {};
  const exato = intRegra(regras.exato, 5);
  const resultado = intRegra(regras.resultado, 3);
  const gols = intRegra(regras.gols, 0);

  let code = gerarCodigo();
  for (let i = 0; i < 5; i++) {
    const existe = await env.DB.prepare('SELECT 1 FROM pools WHERE code = ?').bind(code).first();
    if (!existe) break; code = gerarCodigo();
  }
  const pool = await env.DB.prepare(
    'INSERT INTO pools (code, name, owner_id, pts_exato, pts_resultado, pts_gols) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, code, name')
    .bind(code, nome, ownerId, exato, resultado, gols).first();
  await env.DB.prepare(
    "INSERT INTO pool_members (pool_id, player_id, status) VALUES (?, ?, 'owner')")
    .bind(pool.id, ownerId).run();
  return json({ pool: { id: pool.id, code: pool.code, name: pool.name, status: 'owner',
    regras: { exato, resultado, gols } } });
}

async function entrarPool(request, env) {
  const b = await request.json().catch(() => ({}));
  const playerId = Number(b.player_id) || 0;
  const code = (b.code || '').trim().toUpperCase();
  if (!playerId) return erro('Entre com seu nome antes.');
  if (!code) return erro('Informe o código do bolão.');

  const pool = await env.DB.prepare('SELECT id, name, owner_id, pts_exato, pts_resultado, pts_gols FROM pools WHERE code = ?').bind(code).first();
  if (!pool) return erro('Código não encontrado. Confira com o organizador.', 404);
  const regras = { exato: pool.pts_exato, resultado: pool.pts_resultado, gols: pool.pts_gols };

  const jaMembro = await env.DB.prepare('SELECT status FROM pool_members WHERE pool_id = ? AND player_id = ?')
    .bind(pool.id, playerId).first();
  if (jaMembro) {
    const map = { owner:'Você é o organizador deste bolão.', approved:'Você já participa deste bolão.', pending:'Seu pedido já foi enviado. Aguarde o organizador aprovar.' };
    return json({ pool: { id: pool.id, name: pool.name, status: jaMembro.status, regras }, msg: map[jaMembro.status] });
  }
  const status = pool.owner_id === playerId ? 'owner' : 'pending';
  await env.DB.prepare('INSERT INTO pool_members (pool_id, player_id, status) VALUES (?, ?, ?)')
    .bind(pool.id, playerId, status).run();
  return json({ pool: { id: pool.id, name: pool.name, status, regras }, msg: status === 'pending'
    ? 'Pedido enviado! O organizador precisa aprovar você para o bolão valer.' : 'Você entrou no bolão.' });
}

async function meusPools(request, env) {
  const url = new URL(request.url);
  const playerId = Number(url.searchParams.get('player')) || 0;
  if (!playerId) return erro('Jogador inválido.');
  const rows = (await env.DB.prepare(
    `SELECT p.id, p.code, p.name, p.owner_id, p.pts_exato, p.pts_resultado, p.pts_gols, pm.status,
            (SELECT COUNT(*) FROM pool_members x WHERE x.pool_id = p.id AND x.status IN ('owner','approved')) AS membros,
            (SELECT COUNT(*) FROM pool_members x WHERE x.pool_id = p.id AND x.status = 'pending') AS pendentes
     FROM pool_members pm JOIN pools p ON p.id = pm.pool_id
     WHERE pm.player_id = ?
     ORDER BY (pm.status='pending'), p.created_at DESC`).bind(playerId).all()).results;
  const pools = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name, status: r.status,
    isOwner: r.owner_id === playerId, membros: r.membros,
    pendentes: r.owner_id === playerId ? r.pendentes : 0,
    regras: { exato: r.pts_exato, resultado: r.pts_resultado, gols: r.pts_gols },
  }));
  return json({ pools });
}

async function membrosPool(request, env) {
  const url = new URL(request.url);
  const poolId = Number(url.searchParams.get('pool')) || 0;
  const ownerId = Number(url.searchParams.get('owner')) || 0;
  if (!poolId || !ownerId) return erro('Parâmetros inválidos.');
  const pool = await env.DB.prepare('SELECT owner_id, name, code FROM pools WHERE id = ?').bind(poolId).first();
  if (!pool) return erro('Bolão não encontrado.', 404);
  if (pool.owner_id !== ownerId) return erro('Só o organizador vê os membros.', 403);
  const rows = (await env.DB.prepare(
    `SELECT pl.id, pl.name, pm.status FROM pool_members pm JOIN players pl ON pl.id = pm.player_id
     WHERE pm.pool_id = ? ORDER BY (pm.status='pending') DESC, pl.name COLLATE NOCASE`).bind(poolId).all()).results;
  return json({ pool: { id: poolId, name: pool.name, code: pool.code }, membros: rows });
}

async function decidirMembro(request, env) {
  const b = await request.json().catch(() => ({}));
  const poolId = Number(b.pool_id) || 0;
  const ownerId = Number(b.owner_id) || 0;
  const targetId = Number(b.player_id) || 0;
  const decisao = b.decision; // 'approve' | 'reject'
  if (!poolId || !ownerId || !targetId) return erro('Parâmetros inválidos.');
  const pool = await env.DB.prepare('SELECT owner_id FROM pools WHERE id = ?').bind(poolId).first();
  if (!pool) return erro('Bolão não encontrado.', 404);
  if (pool.owner_id !== ownerId) return erro('Só o organizador pode aprovar membros.', 403);
  if (targetId === ownerId) return erro('Você é o organizador.', 400);

  if (decisao === 'approve') {
    await env.DB.prepare("UPDATE pool_members SET status='approved' WHERE pool_id=? AND player_id=? AND status='pending'")
      .bind(poolId, targetId).run();
  } else {
    await env.DB.prepare("DELETE FROM pool_members WHERE pool_id=? AND player_id=? AND status='pending'")
      .bind(poolId, targetId).run();
  }
  return json({ ok: true });
}

// =================================================================
// ADMIN
// =================================================================
function checarAdmin(user, pass, env) {
  const u = env.ADMIN_USER || 'admin';
  const p = env.ADMIN_PASSWORD || 'luana';
  return user === u && pass === p;
}
async function lerAuth(request) {
  const b = await request.json().catch(() => ({}));
  return { user: b.user || '', pass: b.password || '', body: b };
}

async function adminLogin(request, env) {
  const { user, pass } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  return json({ ok: true });
}

async function adminJogos(request, env) {
  const url = new URL(request.url);
  if (!checarAdmin(url.searchParams.get('user') || '', url.searchParams.get('password') || '', env))
    return erro('Usuário ou senha incorretos.', 401);
  const jogos = (await env.DB.prepare(
    `SELECT id, match_num, fase, grupo, rodada, home, away, home_src, away_src, city, kickoff,
            home_score, away_score, advance, finished
     FROM matches ORDER BY kickoff ASC, match_num ASC`).all()).results;
  return json({ jogos: jogos.map((j) => ({
    ...j, finished: !!j.finished, fase_nome: nomeFase(j.fase),
    home_label: j.home || slotLabel(j.home_src),
    away_label: j.away || slotLabel(j.away_src),
    definido: !!(j.home && j.away),
  })) });
}

async function adminResultado(request, env) {
  const { user, pass, body } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  const matchId = Number(body.match_id) || 0;
  const home = intPlacar(body.home);
  const away = intPlacar(body.away);
  if (!matchId) return erro('Jogo inválido.');
  if (home === null || away === null) return erro('Placar inválido (0 a 30).');

  const jogo = await env.DB.prepare('SELECT fase, home, away FROM matches WHERE id = ?').bind(matchId).first();
  if (!jogo) return erro('Jogo não encontrado.', 404);

  // mata-mata empatado precisa indicar quem avançou (pênaltis)
  let advance = null;
  if (FASES_MATA.includes(jogo.fase) && home === away) {
    advance = body.advance === 'home' || body.advance === 'away' ? body.advance : null;
    if (!advance) return erro('Empate no mata-mata: informe quem avançou (nos pênaltis).', 422);
  }
  await env.DB.prepare('UPDATE matches SET home_score=?, away_score=?, advance=?, finished=1 WHERE id=?')
    .bind(home, away, advance, matchId).run();
  await resolverSlots(env);
  return json({ ok: true });
}

async function adminReabrir(request, env) {
  const { user, pass, body } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  const matchId = Number(body.match_id) || 0;
  if (!matchId) return erro('Jogo inválido.');
  await env.DB.prepare('UPDATE matches SET home_score=NULL, away_score=NULL, advance=NULL, finished=0 WHERE id=?')
    .bind(matchId).run();
  await resolverSlots(env);
  return json({ ok: true });
}

// ---- lógica de torneio ----
function vencedorTime(j) {
  if (!j.finished) return null;
  if (j.home_score > j.away_score) return j.home;
  if (j.away_score > j.home_score) return j.away;
  if (j.advance === 'home') return j.home;
  if (j.advance === 'away') return j.away;
  return null;
}
function perdedorTime(j) {
  if (!j.finished) return null;
  if (j.home_score > j.away_score) return j.away;
  if (j.away_score > j.home_score) return j.home;
  if (j.advance === 'home') return j.away;
  if (j.advance === 'away') return j.home;
  return null;
}

// classificação de um grupo a partir dos jogos finalizados
function standingsGrupo(jogos) {
  const t = {};
  const add = (time) => (t[time] = t[time] || { time, j:0, v:0, e:0, d:0, gp:0, gc:0, pts:0 });
  for (const j of jogos) { add(j.home); add(j.away); }
  for (const j of jogos) {
    if (!j.finished || j.home_score == null) continue;
    const h = t[j.home], a = t[j.away];
    h.j++; a.j++; h.gp += j.home_score; h.gc += j.away_score; a.gp += j.away_score; a.gc += j.home_score;
    if (j.home_score > j.away_score) { h.v++; h.pts += 3; a.d++; }
    else if (j.home_score < j.away_score) { a.v++; a.pts += 3; h.d++; }
    else { h.e++; a.e++; h.pts++; a.pts++; }
  }
  return Object.values(t).map((x) => ({ ...x, sg: x.gp - x.gc }))
    .sort((x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp || x.time.localeCompare(y.time));
}

// resolve slots 1X/2X (grupo completo), W##/L## (jogo finalizado). Repete até estabilizar.
async function resolverSlots(env) {
  const all = (await env.DB.prepare(
    `SELECT id, match_num, fase, grupo, home, away, home_src, away_src,
            home_score, away_score, advance, finished FROM matches`).all()).results
    .map((j) => ({ ...j, finished: !!j.finished }));

  // standings por grupo (apenas grupos com 6 jogos finalizados)
  const porGrupo = {};
  for (const j of all) if (j.fase === 'grupo') (porGrupo[j.grupo] = porGrupo[j.grupo] || []).push(j);
  const standings = {};
  for (const g of Object.keys(porGrupo)) {
    const jg = porGrupo[g];
    if (jg.length === 6 && jg.every((x) => x.finished)) standings[g] = standingsGrupo(jg);
  }
  const byNum = {};
  for (const j of all) if (j.match_num) byNum[j.match_num] = j;

  const resolveSrc = (src, jogoAtual) => {
    if (!src) return null;
    if (src[0] === '1' && /^[A-L]$/.test(src[1] || '')) { const s = standings[src.slice(1)]; return s ? s[0].time : null; }
    if (src[0] === '2' && /^[A-L]$/.test(src[1] || '')) { const s = standings[src.slice(1)]; return s ? s[1].time : null; }
    if (src[0] === 'W') { const f = byNum[Number(src.slice(1))]; return f ? vencedorTime(f) : null; }
    if (src[0] === 'L') { const f = byNum[Number(src.slice(1))]; return f ? perdedorTime(f) : null; }
    return null; // '3:...' resolvido manualmente
  };

  // várias passadas para propagar cascata (R32→R16→...→final)
  for (let pass = 0; pass < 8; pass++) {
    let mudou = false;
    const updates = [];
    for (const j of all) {
      if (j.fase === 'grupo') continue;
      if (!j.home && j.home_src) { const r = resolveSrc(j.home_src, j); if (r && r !== j.home) { j.home = r; updates.push([r, 'home', j.id]); mudou = true; } }
      if (!j.away && j.away_src) { const r = resolveSrc(j.away_src, j); if (r && r !== j.away) { j.away = r; updates.push([r, 'away', j.id]); mudou = true; } }
    }
    for (const [time, lado, id] of updates) {
      await env.DB.prepare(`UPDATE matches SET ${lado === 'home' ? 'home' : 'away'} = ? WHERE id = ?`).bind(time, id).run();
    }
    if (!mudou) break;
  }
}

// preview do mata-mata: classificações, melhores terceiros e slots de 3º a definir
async function adminPreviewMata(request, env) {
  const url = new URL(request.url);
  if (!checarAdmin(url.searchParams.get('user') || '', url.searchParams.get('password') || '', env))
    return erro('Usuário ou senha incorretos.', 401);

  const all = (await env.DB.prepare(
    `SELECT match_num, fase, grupo, home, away, home_src, away_src, home_score, away_score, advance, finished
     FROM matches`).all()).results.map((j) => ({ ...j, finished: !!j.finished }));

  const porGrupo = {};
  for (const j of all) if (j.fase === 'grupo') (porGrupo[j.grupo] = porGrupo[j.grupo] || []).push(j);

  const grupos = {}; const terceiros = [];
  for (const g of Object.keys(porGrupo).sort()) {
    const jg = porGrupo[g];
    const completo = jg.length === 6 && jg.every((x) => x.finished);
    const tab = standingsGrupo(jg);
    grupos[g] = { completo, tabela: tab };
    if (completo && tab[2]) terceiros.push({ grupo: g, ...tab[2] });
  }
  terceiros.sort((a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp || a.time.localeCompare(b.time));
  const melhores = terceiros.slice(0, 8).map((t) => t.grupo);

  // slots de terceiro (away_src = '3:...') e suas opções de grupo
  const slotsTerceiro = all.filter((j) => j.away_src && j.away_src.startsWith('3:'))
    .sort((a, b) => a.match_num - b.match_num)
    .map((j) => ({
      match_num: j.match_num,
      opcoes: j.away_src.slice(2).split(''),
      atual: j.away,
    }));

  return json({
    grupos, terceiros, melhoresGrupos: melhores, slotsTerceiro,
    todosGruposCompletos: Object.values(grupos).every((g) => g.completo),
  });
}

// admin atribui cada 3º classificado ao seu slot do R32
async function adminDefinirTerceiros(request, env) {
  const { user, pass, body } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  const mapa = body.terceiros || {}; // { matchNum: 'NomeTime' }

  // recalcula terceiros válidos
  const all = (await env.DB.prepare(
    `SELECT match_num, fase, grupo, home, away, away_src, home_score, away_score, finished FROM matches`)
    .all()).results.map((j) => ({ ...j, finished: !!j.finished }));
  const porGrupo = {};
  for (const j of all) if (j.fase === 'grupo') (porGrupo[j.grupo] = porGrupo[j.grupo] || []).push(j);
  const terceiroDoGrupo = {};
  for (const g of Object.keys(porGrupo)) {
    const jg = porGrupo[g];
    if (jg.length === 6 && jg.every((x) => x.finished)) terceiroDoGrupo[g] = standingsGrupo(jg)[2].time;
  }
  const slots = {};
  for (const j of all) if (j.away_src && j.away_src.startsWith('3:')) slots[j.match_num] = j.away_src.slice(2).split('');

  const usados = new Set();
  for (const [numStr, time] of Object.entries(mapa)) {
    const num = Number(numStr);
    if (!slots[num]) return erro(`Jogo ${num} não é um slot de 3º colocado.`);
    if (!time) continue;
    // o time precisa ser o 3º de um grupo permitido pelo slot
    const grupoDoTime = Object.keys(terceiroDoGrupo).find((g) => terceiroDoGrupo[g] === time);
    if (!grupoDoTime) return erro(`"${time}" não é um 3º colocado classificado.`);
    if (!slots[num].includes(grupoDoTime)) return erro(`"${time}" (3º do Grupo ${grupoDoTime}) não pode entrar no Jogo ${num}.`);
    if (usados.has(time)) return erro(`"${time}" foi atribuído a mais de um jogo.`);
    usados.add(time);
    await env.DB.prepare('UPDATE matches SET away = ? WHERE match_num = ?').bind(time, num).run();
  }
  await resolverSlots(env);
  return json({ ok: true });
}

// =================================================================
// BUSCAR PLACAR NA INTERNET (best-effort via TheSportsDB)
// =================================================================
const PT_EN = {
  'México':'Mexico','África do Sul':'South Africa','Coreia do Sul':'South Korea','República Tcheca':'Czechia',
  'Canadá':'Canada','Bósnia e Herzegovina':'Bosnia and Herzegovina','Estados Unidos':'USA','Paraguai':'Paraguay',
  'Austrália':'Australia','Turquia':'Turkey','Catar':'Qatar','Suíça':'Switzerland','Brasil':'Brazil','Marrocos':'Morocco',
  'Haiti':'Haiti','Escócia':'Scotland','Alemanha':'Germany','Curaçao':'Curacao','Holanda':'Netherlands','Japão':'Japan',
  'Costa do Marfim':'Ivory Coast','Equador':'Ecuador','Suécia':'Sweden','Tunísia':'Tunisia','Espanha':'Spain',
  'Cabo Verde':'Cape Verde','Bélgica':'Belgium','Egito':'Egypt','Arábia Saudita':'Saudi Arabia','Uruguai':'Uruguay',
  'Irã':'Iran','Nova Zelândia':'New Zealand','Argentina':'Argentina','Argélia':'Algeria','França':'France','Senegal':'Senegal',
  'Iraque':'Iraq','Noruega':'Norway','Áustria':'Austria','Jordânia':'Jordan','Portugal':'Portugal','RD Congo':'DR Congo',
  'Inglaterra':'England','Croácia':'Croatia','Gana':'Ghana','Panamá':'Panama','Uzbequistão':'Uzbekistan','Colômbia':'Colombia',
};
const normTeam = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '');

async function adminBuscarPlacar(request, env) {
  const { user, pass, body } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  const matchId = Number(body.match_id) || 0;
  const jogo = await env.DB.prepare('SELECT home, away, kickoff FROM matches WHERE id = ?').bind(matchId).first();
  if (!jogo) return erro('Jogo não encontrado.', 404);
  if (!jogo.home || !jogo.away) return erro('Esse jogo ainda não tem os dois times definidos.', 409);

  const homeEn = PT_EN[jogo.home] || jogo.home;
  const awayEn = PT_EN[jogo.away] || jogo.away;
  const alvoH = normTeam(homeEn), alvoA = normTeam(awayEn);

  // tenta a data do kickoff (UTC) e o dia anterior (fusos das Américas)
  const base = new Date(jogo.kickoff);
  const datas = [base, new Date(base.getTime() - 86400000)]
    .map((d) => d.toISOString().slice(0, 10));

  const KEY = env.SPORTSDB_KEY || '3'; // chave pública gratuita
  for (const d of datas) {
    try {
      const r = await fetch(`https://www.thesportsdb.com/api/v1/json/${KEY}/eventsday.php?d=${d}&s=Soccer`,
        { cf: { cacheTtl: 60 } });
      if (!r.ok) continue;
      const data = await r.json();
      const eventos = data.events || [];
      for (const ev of eventos) {
        const liga = (ev.strLeague || '').toLowerCase();
        if (!liga.includes('world cup') && !liga.includes('fifa')) continue;
        const h = normTeam(ev.strHomeTeam), a = normTeam(ev.strAwayTeam);
        const casa = (h.includes(alvoH) || alvoH.includes(h)) && (a.includes(alvoA) || alvoA.includes(a));
        const invertido = (h.includes(alvoA) || alvoA.includes(h)) && (a.includes(alvoH) || alvoH.includes(a));
        if ((casa || invertido) && ev.intHomeScore != null && ev.intAwayScore != null) {
          const hs = Number(ev.intHomeScore), as = Number(ev.intAwayScore);
          return json({ encontrado: true, invertido,
            home: casa ? hs : as, away: casa ? as : hs,
            fonte: 'TheSportsDB', detalhe: `${ev.strHomeTeam} ${hs}-${as} ${ev.strAwayTeam}` });
        }
      }
    } catch (_) { /* tenta próxima data */ }
  }
  return json({ encontrado: false, msg: 'Não achei o placar automaticamente. Lance manualmente.' });
}

// admin reseta a senha de um usuário (caso esqueça)
async function adminResetSenha(request, env) {
  const { user, pass, body } = await lerAuth(request);
  if (!checarAdmin(user, pass, env)) return erro('Usuário ou senha incorretos.', 401);
  const nome = (body.player_name || '').trim();
  const nova = (body.nova_senha || '');
  if (nome.length < 2) return erro('Informe o nome do usuário.');
  if (nova.length < 4) return erro('A nova senha precisa ter ao menos 4 caracteres.');
  const pl = await env.DB.prepare('SELECT id, name FROM players WHERE name_key = ?').bind(chaveNome(nome)).first();
  if (!pl) return erro('Usuário não encontrado.', 404);
  const { salt, hash } = await hashSenha(nova);
  await env.DB.prepare('UPDATE players SET pass_salt = ?, pass_hash = ? WHERE id = ?').bind(salt, hash, pl.id).run();
  return json({ ok: true, name: pl.name });
}
