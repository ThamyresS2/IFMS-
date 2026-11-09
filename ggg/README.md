# Bot de mensagens automáticas no WhatsApp

Envia mensagens no WhatsApp nos dias e horários que você definir, para contatos ou grupos.
Usa o [whatsapp-web.js](https://wwebjs.dev/), que conecta no WhatsApp Web com o seu número.

## Como usar

Precisa do [Node.js](https://nodejs.org/) 18 ou mais novo.

```bash
cd ggg
npm install
cp mensagens.example.json mensagens.json   # depois edite este arquivo
npm run check                              # confere se o arquivo está certo
npm start
```

Na primeira vez aparece um **QR Code** no terminal. No celular, abra
**WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho** e escaneie.
A sessão fica salva em `.wwebjs_auth/`, então nas próximas vezes não precisa escanear de novo.

Deixe o terminal aberto: as mensagens só são enviadas enquanto o bot estiver rodando.

Para testar, `npm start -- --agora` envia todas as mensagens uma vez e encerra.

## Configurando as mensagens (`mensagens.json`)

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
