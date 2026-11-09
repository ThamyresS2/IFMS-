# ggg — Bot de mensagens no WhatsApp

Envia mensagens no WhatsApp de dois jeitos:

- **Pela página web**: escolha um grupo, escreva a mensagem e clique em enviar.
- **Arquivos para clientes**: um arquivo diferente para cada cliente (boleto, contrato…), a partir de uma planilha.
- **Agendadas**: nos dias e horários que você definir em `mensagens.json`, para contatos ou grupos.

Usa o [whatsapp-web.js](https://wwebjs.dev/), que conecta no WhatsApp Web com o seu número.

## Como usar

Precisa do [Node.js](https://nodejs.org/) 18 ou mais novo.

```bash
cd ggg
npm install
npm start
```

Depois abra **http://localhost:3000** no navegador.

Na primeira vez aparece um **QR Code** na página (e no terminal). No celular, abra
**WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho** e escaneie.
A sessão fica salva em `.wwebjs_auth/`, então nas próximas vezes não precisa escanear de novo.

Deixe o terminal aberto: a página e as mensagens agendadas só funcionam enquanto o bot estiver rodando.

## Enviando para um grupo pela página

1. Rode `npm start` e abra http://localhost:3000.
2. Escolha o grupo na lista (dá para buscar pelo nome).
3. Escreva a mensagem e clique em **Enviar mensagem** (ou Ctrl+Enter).

A página só abre no próprio computador onde o bot está rodando, para ninguém da sua rede
conseguir mandar mensagens pelo seu WhatsApp. Para usar outra porta: `PORT=8080 npm start`.

## Enviando um arquivo para cada cliente

Na página, abra a aba **Arquivos para clientes**.

1. Clique em **+ Cadastrar cliente** e preencha:
   - **Nome** e **WhatsApp** com DDD (o 55 do Brasil é colocado sozinho).
   - **Arquivo**: escolha do computador (ele é copiado para `envios/arquivos/`) ou um
     arquivo que já esteja nessa pasta.
   - **Mensagem só para este cliente** (opcional). Se ficar vazia, vai a mensagem padrão.
     `{nome}` vira o primeiro nome do cliente.
2. Repita para cada cliente. Dá para **Editar** e **Excluir** depois.
3. A lista avisa se algum telefone está errado ou se falta o arquivo.
4. Desmarque quem não deve receber e clique em **Enviar arquivos**. Dá para acompanhar
   cliente por cliente e parar no meio com **Parar envio**.

Os clientes ficam salvos em `envios/clientes.csv`. Se preferir, dá para preencher essa
planilha direto no Excel (salve como CSV) e clicar em **Recarregar** na página.
O modelo está em `envios/clientes.example.csv`:

| nome        | telefone      | arquivo          | mensagem                                  |
|-------------|---------------|------------------|-------------------------------------------|
| Maria Souza | 67999999999   | boleto-maria.pdf | Olá {nome}, segue o seu boleto deste mês. |
| João Lima   | 5567988888888 | boleto-joao.pdf  |                                           |

O arquivo vai como documento (com o nome original). Entre um cliente e outro o bot espera
de 5 a 12 segundos, para o WhatsApp não bloquear o número. 100 clientes levam uns 15 minutos.

A planilha e os arquivos dos clientes **não vão para o GitHub** (estão no `.gitignore`).

## Mensagens agendadas (opcional)

```bash
cp mensagens.example.json mensagens.json   # depois edite este arquivo
npm run check                              # confere se o arquivo está certo
```

Sem o `mensagens.json`, o bot funciona só pela página. Para testar os agendamentos, `npm start -- --agora` envia todas as mensagens uma vez e encerra.

### Formato do `mensagens.json`

```json
{
  "fusoHorario": "America/Campo_Grande",
  "mensagens": [
    {
      "nome": "Bom dia",
      "para": ["5567999999999"],
      "texto": "Bom dia! ☀️",
      "quando": "0 7 * * *"
    },
    {
      "nome": "Aviso da turma",
      "grupo": "Turma IFMS",
      "texto": "Não esqueçam a atividade!",
      "quando": "0 12 * * 5"
    }
  ]
}
```

- **para**: números com DDI + DDD + número, só dígitos (ex.: `5567999999999`).
- **grupo**: nome exato do grupo (o número conectado precisa estar nele).
- **quando**: horário no formato *cron*: `minuto hora dia mês dia-da-semana`.

| `quando`         | Significa                     |
|------------------|-------------------------------|
| `0 7 * * *`      | todo dia às 07:00             |
| `30 18 * * 1-5`  | segunda a sexta às 18:30      |
| `0 12 * * 5`     | toda sexta ao meio-dia        |
| `0 9 1 * *`      | todo dia 1º do mês às 09:00   |
| `*/30 * * * *`   | a cada 30 minutos             |

## Cuidados

- Mande só para quem quer receber. Envio em massa para desconhecidos viola os termos do
  WhatsApp e pode **bloquear o seu número**. O bot já espera de 3 a 8 segundos entre um
  envio e outro, mas isso não protege contra spam.
- Este não é o método oficial do WhatsApp. Para uso comercial, use a
  [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api).
- Se o Chrome não for encontrado, informe o caminho: `CHROME_PATH=/caminho/do/chrome npm start`.
