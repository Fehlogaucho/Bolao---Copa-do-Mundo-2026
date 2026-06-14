// Gera seed.sql com os 104 jogos da Copa 2026 (72 grupos + 32 mata-mata).
// Grupos: horário de Brasília (UTC-3). Mata-mata: horário ET/EDT (UTC-4). Tudo convertido p/ UTC.
// Mata-mata entra com slots simbólicos (1A, 2B, 3:ABCDF, W74, L101) resolvidos durante o torneio.
const fs = require('fs');

// FASE DE GRUPOS: [rodada,'DD/MM','HH:MM'(BRT),home,away,cidade,grupo]
const G = [
  [1,'11/06','16:00','México','África do Sul','Cidade do México','A'],
  [1,'11/06','23:00','Coreia do Sul','República Tcheca','Guadalajara','A'],
  [1,'12/06','16:00','Canadá','Bósnia e Herzegovina','Toronto','B'],
  [1,'12/06','22:00','Estados Unidos','Paraguai','Los Angeles','D'],
  [1,'13/06','01:00','Austrália','Turquia','Vancouver','D'],
  [1,'13/06','16:00','Catar','Suíça','San Francisco','B'],
  [1,'13/06','19:00','Brasil','Marrocos','Nova York/Nova Jersey','C'],
  [1,'13/06','22:00','Haiti','Escócia','Boston','C'],
  [1,'14/06','14:00','Alemanha','Curaçao','Houston','E'],
  [1,'14/06','17:00','Holanda','Japão','Dallas','F'],
  [1,'14/06','20:00','Costa do Marfim','Equador','Filadélfia','E'],
  [1,'14/06','23:00','Suécia','Tunísia','Monterrey','F'],
  [1,'15/06','13:00','Espanha','Cabo Verde','Atlanta','H'],
  [1,'15/06','16:00','Bélgica','Egito','Seattle','G'],
  [1,'15/06','19:00','Arábia Saudita','Uruguai','Miami','H'],
  [1,'15/06','22:00','Irã','Nova Zelândia','Los Angeles','G'],
  [1,'16/06','14:00','Argentina','Argélia','Kansas City','J'],
  [1,'16/06','16:00','França','Senegal','Nova York/Nova Jersey','I'],
  [1,'16/06','19:00','Iraque','Noruega','Boston','I'],
  [1,'17/06','01:00','Áustria','Jordânia','San Francisco','J'],
  [1,'17/06','14:00','Portugal','RD Congo','Houston','K'],
  [1,'17/06','17:00','Inglaterra','Croácia','Dallas','L'],
  [1,'17/06','20:00','Gana','Panamá','Toronto','L'],
  [1,'17/06','23:00','Uzbequistão','Colômbia','Cidade do México','K'],
  [2,'18/06','13:00','República Tcheca','África do Sul','Atlanta','A'],
  [2,'18/06','16:00','Suíça','Bósnia e Herzegovina','Los Angeles','B'],
  [2,'18/06','19:00','Canadá','Catar','Vancouver','B'],
  [2,'18/06','22:00','México','Coreia do Sul','Guadalajara','A'],
  [2,'19/06','01:00','Turquia','Paraguai','San Francisco','D'],
  [2,'19/06','16:00','Estados Unidos','Austrália','Seattle','D'],
  [2,'19/06','19:00','Escócia','Marrocos','Boston','C'],
  [2,'19/06','22:00','Brasil','Haiti','Filadélfia','C'],
  [2,'20/06','14:00','Holanda','Suécia','Houston','F'],
  [2,'20/06','17:00','Alemanha','Costa do Marfim','Toronto','E'],
  [2,'20/06','21:00','Equador','Curaçao','Kansas City','E'],
  [2,'21/06','01:00','Tunísia','Japão','Monterrey','F'],
  [2,'21/06','13:00','Espanha','Arábia Saudita','Atlanta','H'],
  [2,'21/06','16:00','Bélgica','Irã','Los Angeles','G'],
  [2,'21/06','19:00','Uruguai','Cabo Verde','Miami','H'],
  [2,'21/06','22:00','Nova Zelândia','Egito','Vancouver','G'],
  [2,'22/06','14:00','Argentina','Áustria','Dallas','J'],
  [2,'22/06','18:00','França','Iraque','Filadélfia','I'],
  [2,'22/06','21:00','Noruega','Senegal','Nova York/Nova Jersey','I'],
  [2,'23/06','00:00','Jordânia','Argélia','San Francisco','J'],
  [2,'23/06','14:00','Portugal','Uzbequistão','Houston','K'],
  [2,'23/06','17:00','Inglaterra','Gana','Boston','L'],
  [2,'23/06','20:00','Panamá','Croácia','Toronto','L'],
  [2,'23/06','23:00','Colômbia','RD Congo','Guadalajara','K'],
  [3,'24/06','16:00','Suíça','Canadá','Vancouver','B'],
  [3,'24/06','16:00','Bósnia e Herzegovina','Catar','Seattle','B'],
  [3,'24/06','19:00','Escócia','Brasil','Miami','C'],
  [3,'24/06','19:00','Marrocos','Haiti','Atlanta','C'],
  [3,'24/06','22:00','República Tcheca','México','Cidade do México','A'],
  [3,'24/06','22:00','África do Sul','Coreia do Sul','Monterrey','A'],
  [3,'25/06','17:00','Equador','Alemanha','Nova York/Nova Jersey','E'],
  [3,'25/06','17:00','Curaçao','Costa do Marfim','Filadélfia','E'],
  [3,'25/06','20:00','Japão','Suécia','Dallas','F'],
  [3,'25/06','20:00','Tunísia','Holanda','Kansas City','F'],
  [3,'25/06','23:00','Turquia','Estados Unidos','Los Angeles','D'],
  [3,'25/06','23:00','Paraguai','Austrália','San Francisco','D'],
  [3,'26/06','16:00','Noruega','França','Boston','I'],
  [3,'26/06','16:00','Senegal','Iraque','Toronto','I'],
  [3,'26/06','21:00','Cabo Verde','Arábia Saudita','Houston','H'],
  [3,'26/06','21:00','Uruguai','Espanha','Guadalajara','H'],
  [3,'27/06','00:00','Egito','Irã','Seattle','G'],
  [3,'27/06','00:00','Nova Zelândia','Bélgica','Vancouver','G'],
  [3,'27/06','18:00','Panamá','Inglaterra','Nova York/Nova Jersey','L'],
  [3,'27/06','18:00','Croácia','Gana','Filadélfia','L'],
  [3,'27/06','20:30','Colômbia','Portugal','Miami','K'],
  [3,'27/06','20:30','RD Congo','Uzbequistão','Atlanta','K'],
  [3,'27/06','23:00','Argélia','Áustria','Kansas City','J'],
  [3,'27/06','23:00','Jordânia','Argentina','Dallas','J'],
];

// MATA-MATA: [match_num, fase, 'DD/MM','HH:MM'(ET), home_src, away_src, cidade]
const K = [
  [73,'r32','28/06','15:00','2A','2B','Los Angeles'],
  [74,'r32','29/06','16:30','1E','3:ABCDF','Boston'],
  [75,'r32','29/06','21:00','1F','2C','Monterrey'],
  [76,'r32','29/06','13:00','1C','2F','Houston'],
  [77,'r32','30/06','17:00','1I','3:CDFGH','Nova York/Nova Jersey'],
  [78,'r32','30/06','13:00','2E','2I','Dallas'],
  [79,'r32','30/06','21:00','1A','3:CEFHI','Cidade do México'],
  [80,'r32','01/07','12:00','1L','3:EHIJK','Atlanta'],
  [81,'r32','01/07','20:00','1D','3:BEFIJ','San Francisco'],
  [82,'r32','01/07','16:00','1G','3:AEHIJ','Seattle'],
  [83,'r32','02/07','19:00','2K','2L','Toronto'],
  [84,'r32','02/07','15:00','1H','2J','Los Angeles'],
  [85,'r32','02/07','20:00','1B','3:EFGIJ','Vancouver'],
  [86,'r32','03/07','17:00','1J','2H','Miami'],
  [87,'r32','03/07','21:30','1K','3:DEIJL','Kansas City'],
  [88,'r32','03/07','20:00','2D','2G','Dallas'],
  [89,'r16','04/07','17:00','W74','W77','Filadélfia'],
  [90,'r16','04/07','13:00','W73','W75','Houston'],
  [91,'r16','05/07','16:00','W76','W78','Nova York/Nova Jersey'],
  [92,'r16','05/07','20:00','W79','W80','Cidade do México'],
  [93,'r16','06/07','15:00','W83','W84','Dallas'],
  [94,'r16','06/07','20:00','W81','W82','Seattle'],
  [95,'r16','07/07','12:00','W86','W88','Atlanta'],
  [96,'r16','07/07','16:00','W85','W87','Vancouver'],
  [97,'qf','09/07','16:00','W89','W90','Boston'],
  [98,'qf','10/07','15:00','W93','W94','Los Angeles'],
  [99,'qf','11/07','17:00','W91','W92','Miami'],
  [100,'qf','11/07','21:00','W95','W96','Kansas City'],
  [101,'sf','14/07','15:00','W97','W98','Dallas'],
  [102,'sf','15/07','15:00','W99','W100','Atlanta'],
  [103,'tp','18/07','17:00','L101','L102','Miami'],
  [104,'final','19/07','15:00','W101','W102','Nova York/Nova Jersey'],
];

const esc = (s) => String(s).replace(/'/g, "''");
const iso = (m, d, hora, off) => new Date(`2026-${m}-${d}T${hora}:00${off}`).toISOString();

const rows = [];
let n = 0;
for (const [rod, data, hora, home, away, city, grupo] of G) {
  n++; const [d, m] = data.split('/');
  rows.push(`(${n},'grupo','${grupo}',${rod},'${esc(home)}','${esc(away)}',NULL,NULL,'${esc(city)}','${iso(m,d,hora,'-03:00')}')`);
}
for (const [num, fase, data, hora, hs, as, city] of K) {
  const [d, m] = data.split('/');
  rows.push(`(${num},'${fase}',NULL,NULL,NULL,NULL,'${hs}','${as}','${esc(city)}','${iso(m,d,hora,'-04:00')}')`);
}

const sql = `-- Seed: 104 jogos da Copa 2026 (kickoff em UTC). Gerado por gerar-seed.js.
DELETE FROM predictions;
DELETE FROM matches;
INSERT INTO matches (match_num,fase,grupo,rodada,home,away,home_src,away_src,city,kickoff) VALUES
${rows.join(',\n')};
`;
fs.writeFileSync(__dirname + '/seed.sql', sql);
console.log(`seed.sql gerado: ${rows.length} jogos (${G.length} grupos + ${K.length} mata-mata).`);
