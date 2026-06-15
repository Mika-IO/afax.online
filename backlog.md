# TODO

- [x] O chat só mostra a resposta quando tá 100% pronta, isso deixa a experiencia de usuário ruim. O legal é ir mostrando de acordo com o que a IA cria e ter alguma especie de loading pra deixar mais dinamico.
  → Streaming SSE adicionado nos 3 providers (anthropic/openai/ollama). O campo `say` é renderizado token a token em tempo real + spinner "thinking…" enquanto espera o 1º token. (`src/llm/stream.js`, `src/chat.js`)

- [x] Autoupdate, para testar em dev é legal ter algum comando pra reinstalar a CLI tool automaticamente
  → `afax self-update` reinstala a CLI global a partir do source local (`npm install -g .`); `afax self-update --link` usa `npm link`. (`src/selfupdate.js`)

- [x] UX tá bem ruim — "Empty model response" sumia com a resposta do usuário.
  → `turn()` agora degrada com elegância: se o modelo volta vazio/JSON inválido, usa o `say` já transmitido, ou refaz a chamada em modo texto puro; usuário sempre recebe uma resposta em vez do erro. (`src/chat.js`)
