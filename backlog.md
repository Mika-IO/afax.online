# Backlog

## Done

- [x] **Streaming no chat.** A resposta agora aparece token a token (não só quando 100% pronta), com spinner "thinking…" até o 1º token. SSE nos 3 providers. (`src/llm/stream.js`, `src/chat.js`)

- [x] **Autoupdate em dev.** `afax self-update` reinstala a CLI global a partir do source local; `afax self-update --link` usa `npm link`. (`src/selfupdate.js`)

- [x] **"Empty model response" sumindo com a mensagem.** `turn()` degrada com elegância: se o modelo volta vazio/JSON inválido, usa o `say` já transmitido ou refaz em texto puro — o usuário sempre recebe resposta. (`src/chat.js`)

- [x] **Pausar interação + controle de conversas.** O botão Stop agora aborta entre comandos (não continua "raciocinando" no background depois do abort). Conversas são persistidas por workspace e sobrevivem a restart: menu **History** (abrir/excluir) e botão **New chat** no painel. (`src/conversations.js`, `src/chat.js`, `src/web.js`, `src/web.page.html` · endpoints `GET /api/conversations`, `GET|DELETE /api/conversations/:id`)

- [x] **Histórico de interações e valores na aba Usage.** A view Usage lista as chamadas recentes (data · provider · modelo · tokens · custo), além dos gráficos por dia e por modelo. (`src/web.page.html`)

- [x] **Editar/apagar/criar arquivos com controle de permissão estilo Claude.** Chat ganhou `fs write|append|mkdir|mv|rm` (escrita confinada ao diretório de trabalho). Cada escrita e cada envio `--live` pede aprovação: prompt `[y]/[n]/[a]` no terminal (`a` = aprovar tudo na sessão) e toggle **Auto-approve** (off por padrão) no painel. `afax ask` exige `--yes`. (`src/chat.js`, `src/web.js`, `POST /api/chat/autoapprove`)

- [x] **Agente usando o e-mail errado + 422 no Resend.** Causa: não existia comando para enviar a UM endereço específico — o agente reaproveitava `outreach` (que envia para *leads*) e às vezes inventava o destinatário. Criado `afax email send --to <addr> --subject --body [--live]` (+ `email status`), que valida e usa o endereço **verbatim**; o system prompt instrui o agente a usá-lo com o endereço exato. O 422 do Resend agora vira mensagem clara (domínio do `from` não verificado, ou conta em modo de teste que só envia para o próprio e-mail verificado). Destinatário é validado antes de qualquer chamada. (`src/agents/mailer.js`, `src/integrations/email.js`)

- [x] **Garantir que as integrações funcionem.** Botão **Test all connected** no painel + `POST /api/integrations/testall` que faz um teste ao vivo de cada integração conectada de uma vez. (`src/web.js`, `src/web.page.html`)

- [x] **Instância em nuvem (impl + docs como uma coisa só).** `afax cloud` já roda tudo num processo/porta: painel + webhooks inbound + heartbeat de autonomia (é o que o `Dockerfile`/`railway.toml` usam). Adicionado `afax web --serve` (painel + inbound, sem o heartbeat) e mensagens de boot que explicam a diferença `web`/`serve`/`cloud`. Docs alinhadas. (`src/web.js`, `docs/cloud.md`)

- [x] **Login por usuário e senha no web via variáveis de ambiente ou parâmetros.** `AFAX_WEB_USER` / `AFAX_WEB_PASS` (ou `--user` / `--pass`) habilitam login com usuário+senha na tela de login, além do token. Host público exige pelo menos um dos dois. Comparação constant-time. (`src/web.js`)

- [x] **Atualizar docs + manter sincronizado.** Docs atualizadas para todas as mudanças acima (`chat.md`, `email.md`, `cloud.md`, `configuration.md`, `security.md`), `CHANGELOG.md` com a entrada `0.5.0` e bump de versão. Regra: sempre atualizar docs depois de mudanças.

- [x] **Idioma da empresa em todas as saídas do agente.** Novo campo `business.language` no perfil do workspace, injetado no system prompt de TODOS os fluxos via módulo central `src/style.js` (`agents/base.js` → outreach/conteúdo/inbound/sales, `chat.js`, `orchestrator.js`, `email send`). O agente sempre responde/produz nesse idioma, independentemente do idioma da mensagem recebida, salvo override explícito do CEO. Resolução: campo explícito → palpite pelo TLD do site (`.com.br`→PT, `.fr`→FR, …) → senão espelha o usuário (comportamento anterior). `context ingest` autodetecta o idioma do site e preenche o campo. Validado em ≥2 idiomas (explícito + fallback por TLD). (`src/style.js`, `src/config.js`, `src/agents/context.js`, `src/init.js`)

- [x] **Proibir filler words / preâmbulos.** Regras estritas em `src/style.js` (mesmo bloco, aplicado a todo agente) banem muletas de raciocínio simulado, preâmbulos, bajulação/desculpas e enchimento — em PT e EN. Objetivo: cortar tokens de saída, latência e custo. Raciocínio real é preservado: proíbe só o texto que *finge* pensar na saída, não a cadeia de raciocínio que melhora precisão. Ref.: Bsharat et al. 2023. Stop sequences foram avaliadas e **deliberadamente não ativadas**: a saída do chat é JSON (`{say,run}`) e as gerações criativas são texto livre — uma stop sequence cortaria JSON/conteúdo legítimo no meio. A regra de prompt é o mecanismo correto aqui. (`src/style.js`)

## Aberto

_(vazio)_
