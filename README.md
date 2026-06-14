# 🏆 Bolão da Copa 2026

Bolão da Copa do Mundo 2026 com **vários bolões** (salas), aprovação de membros e exportação em PDF. Roda inteiro no **Cloudflare Pages** (site + API serverless + banco D1), sem servidor pra manter e **sem usar o terminal/wrangler** — tudo pelo GitHub e pelo painel da Cloudflare.

## Como funciona

- **Conta com nome e senha.** Cada pessoa cria a sua (só nome de usuário + senha).
- **Vários bolões.** Qualquer um cria um bolão e vira organizador; cada bolão tem um **código** de convite.
- **Cada bolão tem suas regras de pontos.** Quem cria define quantos pontos vale cravar o placar, acertar o vencedor/empate e (opcional) acertar os gols de um time.
- **Entrar é por código.** Quem entra fica *pendente* até o organizador **aprovar** — o bolão só vale com a pessoa aprovada.
- **Palpite único e imutável.** Palpita o placar uma vez por jogo (vale em todos os seus bolões); depois de salvar, **não muda** (avisa na hora).
- **Placar global.** O organizador-geral lança o resultado real **uma vez** e ele reflete em **todos os bolões** (cada um pontua pelas suas regras).
- **Chaveamento automático.** Os 72 jogos de grupos já vêm cadastrados; o mata-mata (16-avos → final) se monta sozinho conforme os resultados saem.
- **Ranking automático** por bolão, com pódio.
- **Exportar PDF**: relatório com o nome do bolão, seu nome, as regras, a classificação e todos os jogos com seus palpites.
- **Ver sem conta.** Na tela inicial há o botão **“Ver jogos e resultados”**: qualquer um acompanha os jogos, placares e o chaveamento sem login — só não dá pra palpitar (porque não entrou em bolão nenhum).
- **Esqueceu a senha?** O organizador-geral (painel `/admin`) pode redefinir a senha de qualquer jogador.

**Pontuação padrão de um bolão novo:** cravar = **5** · vencedor/empate = **3** · gols = **0** (o criador ajusta).

---

## Subir no Cloudflare (pelo GitHub + painel — sem terminal)

### 1. Mandar o projeto pro GitHub
Crie um repositório novo e suba esta pasta inteira (com `public/`, `functions/`, `schema.sql` e `seed.sql`).

### 2. Criar o banco D1
No painel da Cloudflare, menu lateral → **D1 SQL Database** (em *Storage & Databases*) → **Create Database** → nome `bolao-copa-2026` → **Create**.

### 3. Carregar as tabelas e os 104 jogos
Abra o banco recém-criado → aba **Console**:
1. Cole todo o conteúdo de **`schema.sql`** e clique em **Execute**.
2. Cole todo o conteúdo de **`seed.sql`** e clique em **Execute**.
> Se o console reclamar do tamanho do `seed.sql`, cole o comando `INSERT` em duas partes (corte na metade das linhas e repita o `INSERT INTO matches (...) VALUES` no começo da 2ª parte).

### 4. Criar o site (Pages) conectado ao GitHub
**Workers & Pages** → **Create application** → **Pages** → **Connect to Git** → escolha o repositório.
Nas configurações de build:
- **Framework preset:** None
- **Build command:** *(deixe vazio)*
- **Build output directory:** `public`

Clique em **Save and Deploy**. (A pasta `functions/` é detectada sozinha — é a API.)

### 5. Ligar o banco ao site
No projeto Pages → **Settings → Bindings → Add → D1 database**:
- **Variable name:** `DB`
- **D1 database:** selecione `bolao-copa-2026`

### 6. Definir o login do organizador-geral
No projeto Pages → **Settings → Variables and Secrets** (variáveis de ambiente) → **Add**:
- `ADMIN_PASSWORD` = `luana`  *(marque como Secret)*
- `ADMIN_USER` = `admin`  *(opcional; o padrão já é admin)*
- `SPORTSDB_KEY` = *(opcional; melhora a busca de placar)*

### 7. Re-publicar
**Deployments** → no último deploy, **⋯ → Retry deployment** (pra aplicar o banco e as variáveis).

Pronto. Abra a URL (ex: `https://bolao-copa-2026.pages.dev`):
- **Jogadores** entram com o nome e criam/entram em bolões pelo código.
- **Você (organizador-geral)** abre `SUA_URL/admin` e entra com **admin / luana** pra lançar os placares (refletem em todos os bolões).

> Sempre que você der `git push`, a Cloudflare republica sozinha.

---

## Estrutura

```
public/
  index.html app.js     # app do jogador (bolões, palpites, chave, ranking, PDF)
  admin.html admin.js    # painel do organizador-geral
  styles.css
functions/api/[[path]].js  # API (login, bolões, palpites, ranking, admin, mata-mata)
schema.sql              # tabelas
seed.sql                # 104 jogos (gerado por gerar-seed.js)
```

---

## Detalhes que valem saber

- **Contas com senha.** Cada um cria sua conta (nome + senha); a senha é guardada com hash (PBKDF2), não em texto puro. Cada organizador controla quem entra no seu bolão via aprovação.
- **Regras por bolão.** Cravar o placar, acertar o vencedor/empate e o bônus por acertar os gols de um time são definidos na criação. O mesmo palpite pode valer pontuações diferentes em bolões diferentes.
- **Mata-mata.** 1º/2º de cada grupo, avanço dos vencedores e os 8 melhores 3º são calculados pelo sistema. A FIFA aloca os 3º por uma **tabela de 495 combinações** (não é fórmula): por isso, ao fim dos grupos, o painel admin mostra os 8 melhores 3º já calculados e você **confirma** em qual jogo cada um entra (as opções já vêm filtradas). Depois disso, segue automático até a final.
- **Desempate de grupo:** pontos → saldo de gols → gols marcados. (Confronto direto/fair play, raros, não entram; dá pra reabrir e ajustar.)
- **Busca de placar:** melhor esforço via TheSportsDB (grátis). Pode não achar todos — aí é só lançar manualmente (é o padrão). Confira antes de salvar.
- **Pontuação:** definida por bolão na criação (não é mais fixa no código). O padrão de um bolão novo é 5/3/0.
- **Logo do painel admin:** coloque um `logo.png` em `public/img/` e ele aparece no topo de `/admin` (sem arquivo, fica o emblema padrão). Veja `public/img/LEIA-ME.txt`. Use apenas imagens que você tenha direito de usar — logos oficiais (FIFA etc.) são marcas registradas.
- **Editar jogos/nomes:** ajuste `gerar-seed.js` e rode `node gerar-seed.js` pra recriar o `seed.sql`, ou edite direto no Console do D1.
