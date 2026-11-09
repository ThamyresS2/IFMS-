// Envio de um arquivo para cada cliente, a partir da planilha envios/clientes.csv.
//
// Colunas da planilha (a 1ª linha é o cabeçalho; separador ; ou ,):
//   nome;telefone;arquivo;mensagem
// - arquivo: nome do arquivo dentro de envios/arquivos/
// - mensagem (opcional): texto que vai junto do arquivo. Use {nome} para o nome
//   do cliente. Se ficar vazia, usa a mensagem padrão digitada na página.

const fs = require('fs');
const path = require('path');

const PASTA_ENVIOS = path.join(__dirname, 'envios');
const PASTA_ARQUIVOS = path.join(PASTA_ENVIOS, 'arquivos');
const PLANILHA = path.join(PASTA_ENVIOS, 'clientes.csv');

// Pausa entre um cliente e outro, para o WhatsApp não tratar como spam.
const PAUSA_MIN_MS = 5000;
const PAUSA_MAX_MS = 12000;

// ---------------------------------------------------------------------------
// Leitura da planilha
// ---------------------------------------------------------------------------

function separarLinha(linha, sep) {
  const campos = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        aspas = !aspas;
      }
    } else if (c === sep && !aspas) {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

function normalizarCabecalho(txt) {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

function lerPlanilha() {
  if (!fs.existsSync(PLANILHA)) {
    return {
      erro:
        'Planilha não encontrada. Crie o arquivo envios/clientes.csv ' +
        '(veja o exemplo em envios/clientes.example.csv).',
      clientes: [],
    };
  }

  const conteudo = fs.readFileSync(PLANILHA, 'utf8').replace(/^﻿/, '');
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) {
    return { erro: 'A planilha está vazia (precisa do cabeçalho e pelo menos um cliente).', clientes: [] };
  }

  const sep = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = separarLinha(linhas[0], sep).map(normalizarCabecalho);
  const col = (...nomes) => cabecalho.findIndex((c) => nomes.includes(c));
  const iNome = col('nome', 'cliente');
  const iTel = col('telefone', 'celular', 'whatsapp', 'numero', 'fone');
  const iArq = col('arquivo', 'documento', 'anexo');
  const iMsg = col('mensagem', 'texto', 'legenda');

  if (iTel < 0 || iArq < 0) {
    return { erro: 'A planilha precisa ter as colunas "telefone" e "arquivo".', clientes: [] };
  }

  const clientes = linhas.slice(1).map((linha, i) => {
    const campos = separarLinha(linha, sep);
    const cliente = {
      linha: i + 2,
      nome: iNome >= 0 ? campos[iNome] || '' : '',
      telefone: (campos[iTel] || '').replace(/\D/g, ''),
      arquivo: campos[iArq] || '',
      mensagem: iMsg >= 0 ? campos[iMsg] || '' : '',
      problema: null,
    };

    // Números brasileiros sem o 55 na frente: completa sozinho.
    if (cliente.telefone.length === 10 || cliente.telefone.length === 11) {
      cliente.telefone = '55' + cliente.telefone;
    }

    if (cliente.telefone.length < 12 || cliente.telefone.length > 15) {
      cliente.problema = 'Telefone inválido';
    } else if (!cliente.arquivo) {
      cliente.problema = 'Sem arquivo';
    } else if (!caminhoDoArquivo(cliente.arquivo)) {
      cliente.problema = 'Arquivo não encontrado';
    }
    return cliente;
  });

  return { erro: null, clientes };
}

// Só aceita arquivos que estejam dentro de envios/arquivos/.
function caminhoDoArquivo(nome) {
  const caminho = path.resolve(PASTA_ARQUIVOS, nome);
  if (!caminho.startsWith(PASTA_ARQUIVOS + path.sep)) return null;
  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) return null;
  return caminho;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

function montarMensagem(cliente, padrao) {
  const modelo = cliente.mensagem || padrao || '';
  const primeiroNome = (cliente.nome || '').split(' ')[0];
  return modelo.replace(/\{nome\}/gi, primeiroNome).trim();
}

function registrarRotasArquivos(app, client, estado, log) {
  const { MessageMedia } = require('whatsapp-web.js');

  // Andamento do envio atual (a página consulta para mostrar o progresso).
  const tarefa = { rodando: false, cancelar: false, itens: [] };

  app.get('/api/arquivos/clientes', (req, res) => {
    res.json(lerPlanilha());
  });

  app.get('/api/arquivos/progresso', (req, res) => {
    res.json({ rodando: tarefa.rodando, itens: tarefa.itens });
  });

  app.post('/api/arquivos/cancelar', (req, res) => {
    if (tarefa.rodando) tarefa.cancelar = true;
    res.json({ ok: true });
  });

  app.post('/api/arquivos/enviar', (req, res) => {
    if (estado.status !== 'conectado') {
      return res.status(503).json({ erro: 'O WhatsApp ainda não está conectado.' });
    }
    if (tarefa.rodando) {
      return res.status(409).json({ erro: 'Já existe um envio em andamento.' });
    }

    const { linhas, mensagemPadrao } = req.body || {};
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos um cliente.' });
    }

    // Relê a planilha para enviar exatamente o que está no arquivo agora.
    const { erro, clientes } = lerPlanilha();
    if (erro) return res.status(400).json({ erro });

    const escolhidos = clientes.filter((c) => linhas.includes(c.linha) && !c.problema);
    if (escolhidos.length === 0) {
      return res.status(400).json({ erro: 'Nenhum dos clientes selecionados pode receber arquivo.' });
    }

    tarefa.rodando = true;
    tarefa.cancelar = false;
    tarefa.itens = escolhidos.map((c) => ({
      linha: c.linha,
      nome: c.nome,
      telefone: c.telefone,
      arquivo: c.arquivo,
      status: 'aguardando',
      detalhe: '',
    }));
    res.json({ ok: true, total: escolhidos.length });

    executarEnvio(escolhidos, typeof mensagemPadrao === 'string' ? mensagemPadrao : '');
  });

  async function executarEnvio(escolhidos, mensagemPadrao) {
    log(`Envio de arquivos iniciado: ${escolhidos.length} cliente(s).`);
    for (let i = 0; i < escolhidos.length; i++) {
      const cliente = escolhidos[i];
      const item = tarefa.itens[i];

      if (tarefa.cancelar) {
        item.status = 'cancelado';
        continue;
      }

      item.status = 'enviando';
      try {
        const contato = await client.getNumberId(cliente.telefone);
        if (!contato) throw new Error('Número sem WhatsApp');

        const caminho = caminhoDoArquivo(cliente.arquivo);
        if (!caminho) throw new Error('Arquivo não encontrado');

        const media = MessageMedia.fromFilePath(caminho);
        const legenda = montarMensagem(cliente, mensagemPadrao);
        await client.sendMessage(contato._serialized, media, {
          caption: legenda || undefined,
          sendMediaAsDocument: true,
        });

        item.status = 'enviado';
        log(`  ✓ ${cliente.arquivo} -> ${cliente.nome || cliente.telefone}`);
      } catch (err) {
        item.status = 'erro';
        item.detalhe = err.message;
        log(`  ✗ ${cliente.nome || cliente.telefone}: ${err.message}`);
      }

      const ultimo = i === escolhidos.length - 1;
      if (!ultimo && !tarefa.cancelar) {
        await esperarCancelavel(PAUSA_MIN_MS + Math.random() * (PAUSA_MAX_MS - PAUSA_MIN_MS));
      }
    }
    tarefa.rodando = false;
    log('Envio de arquivos concluído.');
  }

  // Espera em pedaços curtos para o botão "Parar" responder rápido.
  async function esperarCancelavel(ms) {
    const fim = Date.now() + ms;
    while (Date.now() < fim && !tarefa.cancelar) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

module.exports = { registrarRotasArquivos, lerPlanilha };
