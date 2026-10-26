---
trigger: always_on
---

Use sempre padrões de projeto (Design Patterns - Gang of Four), por exemplo todo serviço deve ser instanciado via um Factory, conforme o cntexto um Singleton, use Templates/Interface/Abstract para classes que abstraem acesso a outros serviços e que podem ser intercambiáveis por classes especializadas, por exemplo banco de dados. Quando for o caso use Patterns of Enterprise Application Architecture como definido por Maring Fowler.

Evite longas listas de exportações de classes e funções, em capsule aplicando as práticas de Domain Driven Design (DDD - Evans) and Context, observando assim as métricas adequadas para um projeto organizado e limpo, aplique práticas de Clean Code.

Evite arquivos com mais de 4000 linhas, procure manter sempre que possível uma média de 2000 linhas. Organize os serviços, modelos, controladores e endpoints agrupados por pastas.

Evite código de erro C901 ou similar relativo a McCabe cyclomatic complexity threshold.

Evite callback hell.