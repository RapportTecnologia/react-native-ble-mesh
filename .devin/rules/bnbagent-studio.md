---
trigger: model_decision
description: Aplicado em qualquer interação com bnbagent-studio (CLI `bag`). Define os 5 core commitments e invariantes do runtime que devem ser sempre respeitados, complementando security.md e solidity-security.md.
---

# bnbagent-studio Core Commitments

> Regras de desenvolvimento e padrões de smart contracts: ver `smartcontracts.md`
> Regras de segurança e auditoria: ver `smartcontracts-solidity-security.md`
> Regras de deploy: ver `smartcontracts-deploy.md`

## Os 5 Core Commitments (sempre honrar)

1. **Agent project code is user-owned** — arquivos emitidos por recipe são do usuário para editar; studio não os reescreve automaticamente.

2. **Private keys vivem em ambiente controlado pelo usuário, nunca transmitidas para studio ou terceiros** — o keystore criptografado vive na raiz do workspace (`.studio/wallets/`), fora do `codeLocation` de deploy (nenhum path de empacotamento pode incluí-lo), e é injetado apenas no próprio agente via AWS Secrets Manager no deploy. Exceção consentida e escopada: o trial de testnet de 48h no destino `platform` — testnet-forced, usar wallet descartável.

3. **Signing é código fixo, nunca uma ferramenta LLM-callable** — A2A e MCP expõem apenas as operações bornadas `negotiate` / `notify_funded`; assinatura crua/arbitrária nunca é exposta. Consultas de chain read-only permanecem como tools apenas de leitura.

4. **SDK protocol layer permanece puro** — opiniões do studio não poluem `bnbagent-sdk`.

5. **O usuário pode sair a qualquer momento** — código emitido é dele para editar/forkar/migrar; studio não depende de SaaS fechado. Código emitido importa `from bnbagent_studio_core import …` e depende da lib de runtime `bnbagent-studio-core` (não da CLI), então desinstalar a CLI `bnbagent-studio` nunca quebra um agente deployado.

## Invariantes do Runtime

- **Um runtime, um signer:** um único Agent valioso serve o protocolo selecionado diretamente (A2A `serve_a2a` em `:9000`, ou MCP FastMCP em `:8000/mcp`), detém a chave e assina in-process.
- **Superfície externa limitada a duas operações:** `negotiate` (clamp de preço baseado em regras + assinatura EIP-191; **nenhum LLM toca no dinheiro**) e `notify_funded` (verificar job fundado → produzir deliverable → submeter on-chain).
- **Todas as assinaturas são código fixo em `app/agent/signing.py`**, nunca uma tool LLM.
- **Keystore na raiz do workspace** `.studio/wallets/`, fora do `codeLocation`, injetado via Secrets Manager no deploy.
- **`settle` é manual** (`bag erc8183 settle`).
- **Sem segundo serviço, sem host EC2 keyless, sem relay `InvokeAgentRuntime`, sem poller em background.** O agente é sua própria superfície pública.

## Segurança de Chaves

- Nunca passar senha da wallet pelo chat ou linha de comando.
- O usuário define a senha em seu próprio terminal editando `.studio/.env.local`.
- `bag` auto-carrega `.studio/.env.local`; não é necessário `source` ou `cd`.
- Variáveis: `WALLET_PASSWORD` (evm-local) ou `TWAK_WALLET_PASSWORD` (twak).

## Compatibilidade com Regras Existentes

- `security.md` — regras de segurança da aplicação e autenticação
- `smartcontracts-solidity-security.md` — checklist de segurança de smart contracts
- `smartcontracts-deploy.md` — papéis, ambientes, gestão de chaves, scripts de deploy
- `private_key.md` — manipulação de chaves privadas e secrets
