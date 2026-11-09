// Bot que envia mensagens agendadas automaticamente no WhatsApp.
//
// Uso:
//   npm start            -> conecta no WhatsApp e agenda as mensagens
//   npm start -- --agora -> conecta e envia TODAS as mensagens uma vez (teste)
//   npm run check        -> só valida o arquivo mensagens.json (não conecta)

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const ARQUIVO_CONFIG = path.join(__dirname, 'mensagens.json');
const args = process.argv.slice(2);
const MODO_CHECK = args.includes('--check');
const MODO_AGORA = args.includes('--agora');

// Pausa aleatória entre um envio e outro, para não parecer spam
// (envios em rajada aumentam o risco de o número ser bloqueado).
const PAUSA_MIN_MS = 3000;
const PAUSA_MAX_MS = 8000;

function log(...msg) {
  const hora = new Date().toLocaleString('pt-BR');
  console.log(`[${hora}]`, ...msg);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pausaAleatoria() {
  return esperar(PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

function carregarConfig() {
  if (!fs.existsSync(ARQUIVO_CONFIG)) {
    throw new Error(
      'Arquivo mensagens.json não encontrado.\n' +
        'Copie o exemplo com:  cp mensagens.example.json mensagens.json\n' +
        'e edite os números, textos e horários.'
    );
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
  } catch (err) {
    throw new Error(`mensagens.json não é um JSON válido: ${err.message}`);
  }

  const erros = [];
  if (!Array.isArray(config.mensagens) || config.mensagens.length === 0) {
    erros.push('"mensagens" precisa ser uma lista com pelo menos uma mensagem.');
  } else {
    config.mensagens.forEach((m, i) => {
      const nome = m.nome || `mensagem #${i + 1}`;
      if (!m.texto || typeof m.texto !== 'string') {
        erros.push(`${nome}: falta o campo "texto".`);
      }
      if (!m.quando || !cron.validate(m.quando)) {
        erros.push(`${nome}: "quando" inválido (${m.quando}). Use o formato cron, ex: "0 7 * * *".`);
      }
      const temPara = Array.isArray(m.para) && m.para.length > 0;
      if (!temPara && !m.grupo) {
        erros.push(`${nome}: informe "para" (lista de números) ou "grupo" (nome do grupo).`);
      }
      if (temPara) {
        m.para.forEach((n) => {
          const digitos = String(n).replace(/\D/g, '');
          if (digitos.length < 10 || digitos.length > 15) {
            erros.push(`${nome}: número "${n}" inválido. Use DDI+DDD+número, ex: 5567999999999.`);
          }
        });
      }
    });
  }

  if (erros.length > 0) {
    throw new Error('Problemas no mensagens.json:\n  - ' + erros.join('\n  - '));
  }

  config.fusoHorario = config.fusoHorario || 'America/Campo_Grande';
  return config;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

async function enviarParaNumero(client, numero, texto) {
  const digitos = String(numero).replace(/\D/g, '');
  const contato = await client.getNumberId(digitos);
  if (!contato) {
    log(`  ✗ ${digitos} não tem WhatsApp (ou número incorreto).`);
    return false;
  }
  await client.sendMessage(contato._serialized, texto);
  log(`  ✓ enviada para ${digitos}`);
  return true;
}

async function enviarParaGrupo(client, nomeGrupo, texto) {
  const chats = await client.getChats();
  const grupo = chats.find(
    (c) => c.isGroup && c.name.trim().toLowerCase() === nomeGrupo.trim().toLowerCase()
  );
  if (!grupo) {
    log(`  ✗ grupo "${nomeGrupo}" não encontrado. Confira o nome exato.`);
    return false;
  }
  await grupo.sendMessage(texto);
  log(`  ✓ enviada no grupo "${grupo.name}"`);
  return true;
}

async function enviarMensagem(client, m) {
  log(`Enviando "${m.nome || m.texto.slice(0, 30)}"...`);
  const destinos = [
    ...(m.para || []).map((n) => () => enviarParaNumero(client, n, m.texto)),
    ...(m.grupo ? [() => enviarParaGrupo(client, m.grupo, m.texto)] : []),
  ];

  for (let i = 0; i < destinos.length; i++) {
    try {
      await destinos[i]();
    } catch (err) {
      log(`  ✗ erro ao enviar: ${err.message}`);
    }
    if (i < destinos.length - 1) await pausaAleatoria();
  }
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main() {
  const config = carregarConfig();

  if (MODO_CHECK) {
    console.log(`mensagens.json OK — ${config.mensagens.length} mensagem(ns), fuso ${config.fusoHorario}:`);
    config.mensagens.forEach((m, i) => {
      const destino = [...(m.para || []), ...(m.grupo ? [`grupo "${m.grupo}"`] : [])].join(', ');
      console.log(`  ${i + 1}. ${m.nome || '(sem nome)'} | "${m.quando}" | ${destino}`);
    });
    return;
  }

  // Carregados só aqui para o modo --check funcionar sem abrir o navegador.
  const { Client, LocalAuth } = require('whatsapp-web.js');
  const qrcode = require('qrcode-terminal');

  const client = new Client({
    // Salva a sessão em .wwebjs_auth/ — só precisa ler o QR Code na 1ª vez.
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: {
      headless: true,
      executablePath: process.env.CHROME_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    log('Escaneie o QR Code abaixo no WhatsApp do celular:');
    log('(WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho)');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => log('Autenticado.'));
  client.on('auth_failure', (msg) => log('Falha na autenticação:', msg));
  client.on('disconnected', (motivo) => {
    log('Desconectado do WhatsApp:', motivo);
    process.exit(1);
  });

  client.on('ready', async () => {
    log('WhatsApp conectado! ✅');

    if (MODO_AGORA) {
      for (const m of config.mensagens) {
        await enviarMensagem(client, m);
        await pausaAleatoria();
      }
      log('Envio de teste concluído. Encerrando.');
      await client.destroy();
      process.exit(0);
    }

    config.mensagens.forEach((m) => {
      cron.schedule(m.quando, () => enviarMensagem(client, m), {
        timezone: config.fusoHorario,
        noOverlap: true,
      });
      log(`Agendada: "${m.nome || m.texto.slice(0, 30)}" -> ${m.quando}`);
    });
    log('Bot rodando. Deixe este terminal aberto. (Ctrl+C para sair)');
  });

  process.on('SIGINT', async () => {
    log('Encerrando...');
    await client.destroy().catch(() => {});
    process.exit(0);
  });

  log('Iniciando o WhatsApp Web...');
  await client.initialize();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
