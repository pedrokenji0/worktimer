# Controle de Expediente + Google Sheets

Este projeto transforma uma planilha Google em uma database simples para um site publicado no GitHub Pages.

## Arquivos

- `index.html`: página para publicar no GitHub Pages.
- `Codigo.gs`: backend para colar no Google Apps Script.

## Passo a passo

### 1. Criar a planilha

Crie uma nova planilha no Google Sheets com qualquer nome, por exemplo:

`Controle de Expediente`

### 2. Colar o Apps Script

Na planilha, vá em:

`Extensões > Apps Script`

Apague o conteúdo padrão e cole o conteúdo de `Codigo.gs`.

Salve.

### 3. Rodar setup

No editor do Apps Script, selecione a função `setup` e clique em `Executar`.

O Google vai pedir permissões. Autorize.

A planilha vai ganhar abas:

- `DIAS`
- `TAREFAS`
- `SESSOES`
- `CONFIG`

Na aba `CONFIG`, copie a chave `API_SECRET`.

### 4. Publicar o Apps Script como Web App

No Apps Script:

`Implantar > Nova implantação`

Tipo:

`Aplicativo da Web`

Configuração recomendada para uso pessoal simples:

- Executar como: `Eu`
- Quem tem acesso: `Qualquer pessoa`

Clique em implantar e copie a URL terminada em `/exec`.

### 5. Publicar o site no GitHub Pages

Crie um repositório no GitHub e coloque o arquivo `index.html` na raiz.

Depois vá em:

`Settings > Pages`

E publique a branch `main`, pasta `/root`.

### 6. Configurar o site

Abra o site publicado.

Na área `Configuração da database`, cole:

- URL do Web App do Apps Script
- API_SECRET da aba `CONFIG`

Clique em:

`Salvar configurações`

Depois:

`Testar conexão`

## Observações de segurança

Essa solução é boa para uso pessoal, mas não é uma API segura de nível profissional.

A planilha pode continuar privada, mas o endpoint do Apps Script fica acessível para quem souber a URL. A proteção básica é a `API_SECRET`.

Não coloque sua `API_SECRET` dentro do código publicado no GitHub. Digite a chave pela tela do site; ela fica salva só no navegador.
