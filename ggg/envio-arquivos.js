// Envio de um arquivo diferente para cada cliente.
//
// Os clientes ficam na planilha envios/clientes.csv, que pode ser editada pela
// página web (aba "Arquivos para clientes") ou no Excel.
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

// Tamanho máximo de arquivo enviado pela página.
const LIMITE_UPLOAD = '64mb';

// ---------------------------------------------------------------------------
// Leitura e gravação da planilha
// ---------------------------------------------------------------------------

// Lê um CSV inteiro, aceitando campos entre aspas com ; , ou quebras de linha.
function lerCsv(conteudo, sep) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (aspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  linha.push(campo);
  linhas.push(linha);

  return linhas
    .map((l) => l.map((c) => c.trim()))
    .filter((l) => l.some((c) => c !== ''));
}

function campoCsv(valor) {
  const txt = String(valor ?? '');
  return /[;"\r\n]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
}

function normalizarCabecalho(txt) {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

function normalizarTelefone(tel) {
  let digitos = String(tel || '').replace(/\D/g, '');
  // Números brasileiros sem o 55 na frente: completa sozinho.
  if (digitos.length === 10 || digitos.length === 11) digitos = '55' + digitos;
  return digitos;
}

function verificarCliente(cliente) {
  if (cliente.telefone.length < 12 || cliente.telefone.length > 15) return 'Telefone inválido';
  if (!cliente.arquivo) return 'Sem arquivo';
  if (!caminhoDoArquivo(cliente.arquivo)) return 'Arquivo não encontrado';
  return null;
}

function lerPlanilha() {
  if (!fs.existsSync(PLANILHA)) return { erro: null, clientes: [] };

  const conteudo = fs.readFileSync(PLANILHA, 'utf8').replace(/^﻿/, '');
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0];
  const sep = primeiraLinha.includes(';') ? ';' : ',';
  const linhas = lerCsv(conteudo, sep);
  if (linhas.length === 0) return { erro: null, clientes: [] };

  const cabecalho = linhas[0].map(normalizarCabecalho);
  const col = (...nomes) => cabecalho.findIndex((c) => nomes.includes(c));
  const iNome = col('nome', 'cliente');
  const iTel = col('telefone', 'celular', 'whatsapp', 'numero', 'fone');
  const iArq = col('arquivo', 'documento', 'anexo');
  const iMsg = col('mensagem', 'texto', 'legenda');

  if (iTel < 0 || iArq < 0) {
    return { erro: 'A planilha precisa ter as colunas "telefone" e "arquivo".', clientes: [] };
  }

  const clientes = linhas.slice(1).map((campos, i) => {
    const cliente = {
      linha: i + 1, // posição do cliente na planilha (1 = primeiro cliente)
      nome: iNome >= 0 ? campos[iNome] || '' : '',
      telefone: normalizarTelefone(campos[iTel]),
      arquivo: campos[iArq] || '',
      mensagem: iMsg >= 0 ? campos[iMsg] || '' : '',
    };
    cliente.problema = verificarCliente(cliente);
    return cliente;
  });

  return { erro: null, clientes };
}

function salvarPlanilha(clientes) {
  const linhas = [['nome', 'telefone', 'arquivo', 'mensagem']].concat(
    clientes.map((c) => [c.nome, c.telefone, c.arquivo, c.mensagem])
  );
  const csv = linhas.map((l) => l.map(campoCsv).join(';')).join('\r\n') + '\r\n';
  fs.mkdirSync(PASTA_ENVIOS, { recursive: true });
  // O ﻿ no começo faz o Excel abrir os acentos certinho.
  const temporario = PLANILHA + '.tmp';
  fs.writeFileSync(temporario, '﻿' + csv, 'utf8');
  fs.renameSync(temporario, PLANILHA);
}

// Só aceita arquivos que estejam dentro de envios/arquivos/.
function caminhoDoArquivo(nome) {
  const caminho = path.resolve(PASTA_ARQUIVOS, nome);
  if (!caminho.startsWith(PASTA_ARQUIVOS + path.sep)) return null;
  if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) return null;
  return caminho;
}

function listarArquivos() {
  if (!fs.existsSync(PASTA_ARQUIVOS)) return [];
  return fs
    .readdirSync(PASTA_ARQUIVOS, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Deixa o nome do arquivo seguro e, se já existir, acrescenta -2, -3…
function nomeLivre(nomeOriginal) {
  const base = path.basename(String(nomeOriginal || 'arquivo'));
  const limpo = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'arquivo';
  const ext = path.extname(limpo);
  const semExt = limpo.slice(0, limpo.length - ext.length);
  let nome = limpo;
  for (let n = 2; fs.existsSync(path.join(PASTA_ARQUIVOS, nome)); n++) {
    nome = `${semExt}-${n}${ext}`;
  }
  return nome;
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
  const express = require('express');
  const { MessageMedia } = require('whatsapp-web.js');

  // Andamento do envio atual (a página consulta para mostrar o progresso).
  const tarefa = { rodando: false, cancelar: false, itens: [] };

  function bloquearDuranteEnvio(req, res, next) {
    if (tarefa.rodando) {
      return res.status(409).json({ erro: 'Espere o envio terminar (ou pare o envio) para mudar o cadastro.' });
    }
    next();
  }

  // --- Cadastro de clientes -------------------------------------------------

  app.get('/api/arquivos/clientes', (req, res) => {
    res.json(lerPlanilha());
  });

  app.get('/api/arquivos/lista', (req, res) => {
    res.json(listarArquivos());
  });

  // Recebe o arquivo "cru" no corpo da requisição; o nome vem em ?nome=
  app.post(
    '/api/arquivos/upload',
    bloquearDuranteEnvio,
    express.raw({ type: () => true, limit: LIMITE_UPLOAD }),
    (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ erro: 'Arquivo vazio.' });
      }
      fs.mkdirSync(PASTA_ARQUIVOS, { recursive: true });
      const nome = nomeLivre(req.query.nome);
      fs.writeFileSync(path.join(PASTA_ARQUIVOS, nome), req.body);
      log(`Arquivo recebido pela página: ${nome}`);
      res.json({ arquivo: nome });
    }
  );

  function dadosDoFormulario(body) {
    const cliente = {
      nome: String(body?.nome || '').trim(),
      telefone: normalizarTelefone(body?.telefone),
      arquivo: String(body?.arquivo || '').trim(),
      mensagem: String(body?.mensagem || '').trim(),
    };
    if (!cliente.nome) return { erro: 'Informe o nome do cliente.' };
    if (cliente.telefone.length < 12 || cliente.telefone.length > 15) {
      return { erro: 'Telefone inválido. Use DDD + número, ex: (67) 99999-9999.' };
    }
    if (!cliente.arquivo) return { erro: 'Escolha o arquivo do cliente.' };
    if (!caminhoDoArquivo(cliente.arquivo)) return { erro: 'Arquivo não encontrado na pasta.' };
    return { cliente };
  }

  // Confere se a linha ainda é o mesmo cliente (a planilha pode ter sido
  // alterada no Excel enquanto a página estava aberta).
  function acharCliente(req, res, clientes) {
    const linha = Number(req.params.linha);
    const atual = clientes.find((c) => c.linha === linha);
    if (!atual || atual.telefone !== normalizarTelefone(req.query.telefone || req.body?.telefoneOriginal)) {
      res.status(409).json({ erro: 'A planilha mudou. Clique em "Recarregar" e tente de novo.' });
      return null;
    }
    return atual;
  }

  app.post('/api/arquivos/clientes', bloquearDuranteEnvio, express.json(), (req, res) => {
    const { erro: erroForm, cliente } = dadosDoFormulario(req.body);
    if (erroForm) return res.status(400).json({ erro: erroForm });
    const { erro, clientes } = lerPlanilha();
    if (erro) return res.status(400).json({ erro });

    clientes.push(cliente);
    salvarPlanilha(clientes);
    log(`Cliente cadastrado: ${cliente.nome}`);
    res.json({ ok: true });
  });

  app.put('/api/arquivos/clientes/:linha', bloquearDuranteEnvio, express.json(), (req, res) => {
    const { erro: erroForm, cliente } = dadosDoFormulario(req.body);
    if (erroForm) return res.status(400).json({ erro: erroForm });
    const { erro, clientes } = lerPlanilha();
    if (erro) return res.status(400).json({ erro });

    const atual = acharCliente(req, res, clientes);
    if (!atual) return;
    Object.assign(atual, cliente);
    salvarPlanilha(clientes);
    log(`Cliente alterado: ${cliente.nome}`);
    res.json({ ok: true });
  });

  app.delete('/api/arquivos/clientes/:linha', bloquearDuranteEnvio, (req, res) => {
    const { erro, clientes } = lerPlanilha();
    if (erro) return res.status(400).json({ erro });

    const atual = acharCliente(req, res, clientes);
    if (!atual) return;
    salvarPlanilha(clientes.filter((c) => c !== atual));
    log(`Cliente excluído: ${atual.nome || atual.telefone}`);
    res.json({ ok: true });
  });

  // --- Envio ------------------------------------------------------------------

  app.get('/api/arquivos/progresso', (req, res) => {
    res.json({ rodando: tarefa.rodando, itens: tarefa.itens });
  });

  app.post('/api/arquivos/cancelar', (req, res) => {
    if (tarefa.rodando) tarefa.cancelar = true;
    res.json({ ok: true });
  });

  app.post('/api/arquivos/enviar', express.json(), (req, res) => {
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
