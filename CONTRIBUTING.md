# Como contribuir

Contribuições são bem-vindas.

## Relatar um problema
Use a aba [Issues](https://github.com/cruz-neto/capes-lattes-area39/issues). Para periódicos não reconhecidos ou estratos divergentes, use o modelo **"Periódico não reconhecido ou estrato divergente"** e informe o nome, o ISSN, o ano e uma captura de tela.

## Propor mudanças no código
1. Faça um *fork* e crie um *branch* (`git checkout -b minha-melhoria`).
2. Regras da área ficam em `extension/rules.js`, e a leitura do Lattes e a interface ficam em `extension/content.js`. Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
3. Se mudar a base, regenere `extension/data.js` com `tools/build_base.py` em vez de editá-lo à mão.
4. Rode o teste (`node tests/e2e.js`) e abra um *pull request* descrevendo a mudança.

## Princípios
- Toda regra deve ter fonte oficial citável (Ficha, Documento de Área ou relatório da CAPES).
- Nada de correções manuais por periódico no código: correções entram pela base de dados.
- A extensão não deve fazer requisições de rede nem coletar dados.
