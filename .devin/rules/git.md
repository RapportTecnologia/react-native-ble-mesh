---
description: Sempre que finalizar um fluxo de trabalho de desenvolvimento, melhorias e corrreções, normalmente executado com a solicitação do usuário.
---
# Git Rule

Fluxo de trabalho Git baseado em issues, com nomes de branch seguindo a
especificação [Conventional Branch 1.1.0](https://conventionalbranch.org/) e
mensagens de commit seguindo a especificação
[Conventional Commits 1.0.0-beta.4](https://www.conventionalcommits.org/pt-br/v1.0.0-beta.4/).

## Fluxo de trabalho

Use o GitHub CLI (`gh`) para gerenciar issues e pull requests. Nunca gere ou
adivinhe URLs do GitHub — obtenha-as via `gh` (`gh issue view`, `gh pr view`).

1. **Abra um issue** descrevendo o que será implementado e qual problema está
   relacionado:

   ```bash
   gh issue create --title "tipo: descrição curta" --body "Contexto, problema
   relacionado e critérios de aceitação."
   ```

   Anote o número retornado (ex.: `#123`). Quando aplicável, use os templates
   de `.github/ISSUE_TEMPLATE/` (`correcao_bug`, `sugestao`, `pergunta_suporte`).

2. **Crie uma branch** a partir da branch padrão usando a nomenclatura
   convencional abaixo, incluindo o número do issue:

   ```bash
   git checkout -b feat/issue-123-novo-login
   ```

3. **Implemente** as alterações necessárias.

4. **Comite** usando mensagens convencionais, referenciando o issue no corpo ou
   rodapé (`Refs #123` ou `Closes #123`).

5. **Comente no issue** explicando o que foi feito e o porquê das escolhas:

   ```bash
   gh issue comment 123 --body "Implementado X usando Y porque Z. Refs: <commit-sha>"
   ```

6. **Abra um Pull Request** vinculando o issue (o corpo com `Closes #123`
   fecha o issue automaticamente no merge):

   ```bash
   gh pr create --title "tipo(escopo): descrição" --body "## Summary
   ...
   Closes #123"
   ```

   Títulos de PR também seguem Conventional Commits.

7. **Acompanhe e finalize**: verifique status do PR e, após o merge/validação,
   confirme o fechamento do issue (ou feche manualmente se necessário):

   ```bash
   gh pr status
   gh issue status
   gh issue close 123 --comment "Resolvido em <pr-url>"
   ```

### Comandos `gh` úteis

| Ação | Comando |
|---|---|
| Listar issues abertos | `gh issue list` |
| Ver um issue | `gh issue view 123` |
| Comentar em issue | `gh issue comment 123 --body "..."` |
| Fechar issue | `gh issue close 123` |
| Reabrir issue | `gh issue reopen 123` |
| Listar PRs | `gh pr list` |
| Ver um PR | `gh pr view 123` |
| Checks do PR | `gh pr checks` |
| Merge do PR | `gh pr merge 123 --squash --delete-branch` |

## Nomes de branch (Conventional Branch)

Formato: `<tipo>/<descricao>`

Branches tronco (`main`, `master`, `develop`) não usam prefixo.

### Prefixos válidos

| Prefixo | Uso | Exemplo |
|---|---|---|
| `feature/` ou `feat/` | Novas funcionalidades | `feat/issue-45-agent-registry` |
| `bugfix/` ou `fix/` | Correção de bugs | `fix/issue-78-token-expiry` |
| `hotfix/` | Correções urgentes | `hotfix/security-patch` |
| `release/` | Preparação de release | `release/v1.2.0` |
| `chore/` | Tarefas não-código (deps, docs, config) | `chore/update-dependencies` |

Prefixos de agentes de IA (`ai/`, `claude/`, `codex/`, `copilot/`, `cursor/`)
são válidos conforme a spec 1.1.0, mas **não devem ser usados neste projeto** —
branches criadas por agentes seguem os prefixos de propósito acima.

### Regras

- Use somente letras minúsculas (`a-z`), dígitos (`0-9`), hífens (`-`) e
  pontos (`.`, tipicamente em números de versão).
- Sem hífens ou pontos consecutivos, iniciais ou finais
  (`feat/-login`, `feat/new--login`, `release/v1.2.0.` são inválidos).
- Sem espaços, underscores ou caracteres especiais.
- Descrição clara e concisa indicando o propósito do trabalho.
- Inclua o número do issue quando houver: `<tipo>/issue-<n>-<descricao>`.

### Exemplos

| Branch | Válido |
|---|---|
| `feat/issue-123-novo-login` | ✅ |
| `bugfix/fix-header-bug` | ✅ |
| `hotfix/security-patch` | ✅ |
| `release/v1.2.0` | ✅ |
| `chore/update-dependencies` | ✅ |
| `Feature/NovoLogin` | ❌ maiúsculas |
| `feat/novo_login` | ❌ underscore |
| `feat/-novo-login` | ❌ hífen inicial |

## Mensagens de commit (Conventional Commits)

Estrutura:

```text
<tipo>[escopo opcional][!]: <descrição>

[corpo opcional]

[rodapé opcional]
```

### Tipos

| Tipo | Uso | SemVer |
|---|---|---|
| `feat` | Novo recurso | MINOR |
| `fix` | Correção de bug | PATCH |
| `improvement` | Melhoria sem novo recurso ou bugfix | — |
| `refactor` | Refatoração sem mudança de comportamento | — |
| `perf` | Melhoria de performance | — |
| `docs` | Somente documentação | — |
| `style` | Formatação (espaços, ponto-e-vírgula etc.) | — |
| `test` | Adição/correção de testes | — |
| `build` | Sistema de build ou dependências | — |
| `ci` | Configuração/scripts de CI | — |
| `chore` | Outras tarefas de manutenção | — |
| `revert` | Reverte commit anterior | — |

### Regras

- O tipo é **obrigatório** e deve ser seguido de escopo opcional entre
  parênteses, terminando em `: ` (dois-pontos e espaço).
- A **descrição é obrigatória**: resumo curto no imperativo
  (ex.: `fix: corrige expiração do token de sessão`).
- Escopo é um substantivo descrevendo a seção do código
  (ex.: `feat(registry):`, `fix(auth):`).
- O **corpo** é opcional, começa uma linha em branco após a descrição e traz
  contexto adicional (o *porquê*, não o *o quê*).
- O **rodapé** é opcional, começa uma linha em branco após o corpo, com uma
  informação por linha: referências a issues/PRs, revisores, breaking changes.
  Use `Refs #<n>` ou `Closes #<n>` para vincular ao issue.
- Exceto `BREAKING CHANGE`, os elementos não são sensíveis a maiúsculas —
  prefira minúsculas por consistência.
- Um commit deve pertencer a um único tipo sempre que possível: divida
  alterações mistas em commits separados.

### Breaking changes

- Indique com `!` antes dos dois-pontos: `feat(api)!: remove endpoint legado`.
- E/ou inclua `BREAKING CHANGE: <descrição>` (sempre maiúsculas, seguido de
  dois-pontos e espaço) no início do corpo ou do rodapé.
- Breaking changes implicam bump **MAJOR** no versionamento, independentemente
  do tipo do commit. Com `!`, `BREAKING CHANGE:` deve constar no corpo/rodapé.

### Exemplos

```text
feat(registry): adiciona descoberta de contratos via ContractRegistry

Refs #123
```

```text
fix(auth): corrige expiração prematura do token de sessão

O TTL era calculado em segundos, mas comparado contra milissegundos.

Closes #78
```

```text
feat(api)!: remove suporte ao header X-Legacy-Auth

BREAKING CHANGE: clientes devem migrar para Authorization: Bearer

Refs #200
```

```text
docs: corrige ortografia no CHANGELOG
```
