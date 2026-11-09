const el = (id) => document.getElementById(id);

const telaConexao = el('tela-conexao');
const statusEl = el('status');
const selectGrupo = el('grupo');
const busca = el('busca');
const texto = el('texto');
const botaoEnviar = el('enviar');
const aviso = el('aviso');

const NOMES_STATUS = {
  iniciando: 'Iniciando…',
  qr: 'Aguardando QR Code',
  autenticando: 'Conectando…',
  conectado: 'Conectado',
  offline: 'Bot desligado',
};

let grupos = [];
let statusAtual = null;
let estaConectado = false;
let temHistorico = false;
let abaAtual = 'grupo';
const GRUPO_SALVO = 'ggg:ultimoGrupo';

// ---------------------------------------------------------------------------
// Status da conexão (consulta o bot a cada 2 segundos)
// ---------------------------------------------------------------------------

function mostrarStatus(status) {
  statusEl.textContent = NOMES_STATUS[status] || status;
  statusEl.className = `status status--${status}`;
}

async function atualizarStatus() {
  let dados;
  try {
    const resp = await fetch('/api/status');
    dados = await resp.json();
  } catch {
    dados = { status: 'offline' };
  }

  mostrarStatus(dados.status);
  const conectado = dados.status === 'conectado';
  telaConexao.hidden = conectado;
  estaConectado = conectado;
  atualizarPaineis();

  el('bloco-qr').hidden = dados.status !== 'qr';
  el('carregando').hidden = dados.status === 'qr';
  if (dados.qr) el('qr').src = dados.qr;
  el('texto-carregando').textContent =
    dados.status === 'offline'
      ? 'O bot não está rodando. Abra o terminal na pasta ggg e rode: npm start'
      : dados.status === 'autenticando'
        ? 'Conectando ao WhatsApp…'
        : 'Abrindo o WhatsApp Web…';

  if (conectado && statusAtual !== 'conectado') {
    carregarGrupos();
    carregarClientes();
  }
  statusAtual = dados.status;
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

function atualizarPaineis() {
  el('abas').hidden = !estaConectado;
  document.querySelectorAll('[data-painel]').forEach((painel) => {
    const ehHistorico = painel.id === 'secao-historico';
    painel.hidden = !estaConectado || painel.dataset.painel !== abaAtual || (ehHistorico && !temHistorico);
  });
  document.querySelectorAll('.aba').forEach((aba) => {
    aba.setAttribute('aria-selected', String(aba.dataset.aba === abaAtual));
  });
}

document.querySelectorAll('.aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    abaAtual = aba.dataset.aba;
    atualizarPaineis();
  });
});

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

async function carregarGrupos() {
  el('info-grupos').textContent = 'Carregando grupos…';
  try {
    const resp = await fetch('/api/grupos');
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro);
    grupos = dados;
    desenharGrupos();
  } catch (err) {
    el('info-grupos').textContent = err.message || 'Não foi possível carregar os grupos.';
  }
}

function desenharGrupos() {
  const filtro = busca.value.trim().toLowerCase();
  const selecionado = selectGrupo.value || lerGrupoSalvo();
  const visiveis = grupos.filter((g) => g.nome.toLowerCase().includes(filtro));

  selectGrupo.replaceChildren(
    ...visiveis.map((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.participantes ? `${g.nome} (${g.participantes})` : g.nome;
      opt.selected = g.id === selecionado;
      return opt;
    })
  );

  el('info-grupos').textContent =
    grupos.length === 0
      ? 'Nenhum grupo encontrado neste WhatsApp.'
      : filtro
        ? `${visiveis.length} de ${grupos.length} grupos`
        : `${grupos.length} grupos`;
}

function lerGrupoSalvo() {
  try { return localStorage.getItem(GRUPO_SALVO); } catch { return null; }
}

function salvarGrupo(id) {
  try { localStorage.setItem(GRUPO_SALVO, id); } catch { /* sem problema */ }
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

function mostrarAviso(mensagem, tipo) {
  aviso.textContent = mensagem;
  aviso.className = `aviso aviso--${tipo}`;
  aviso.hidden = false;
}

function adicionarHistorico(grupo, mensagem) {
  const li = document.createElement('li');
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${new Date().toLocaleTimeString('pt-BR')} · ${grupo}`;
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = mensagem;
  li.append(meta, msg);
  el('historico').prepend(li);
  temHistorico = true;
  atualizarPaineis();
}

async function enviar(evento) {
  evento.preventDefault();
  const grupoId = selectGrupo.value;
  const mensagem = texto.value.trim();

  if (!grupoId) return mostrarAviso('Escolha um grupo na lista.', 'erro');
  if (!mensagem) return mostrarAviso('Escreva a mensagem.', 'erro');

  const nomeGrupo = grupos.find((g) => g.id === grupoId)?.nome || 'grupo';
  if (!confirm(`Enviar esta mensagem para "${nomeGrupo}"?`)) return;

  botaoEnviar.disabled = true;
  botaoEnviar.textContent = 'Enviando…';
  try {
    const resp = await fetch('/api/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupoId, texto: mensagem }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro);

    mostrarAviso(`Mensagem enviada para "${dados.grupo}" ✓`, 'ok');
    adicionarHistorico(dados.grupo, mensagem);
    salvarGrupo(grupoId);
    texto.value = '';
    el('contador').textContent = '0';
  } catch (err) {
    mostrarAviso(err.message || 'Não foi possível enviar. O bot está rodando?', 'erro');
  } finally {
    botaoEnviar.disabled = false;
    botaoEnviar.textContent = 'Enviar mensagem';
  }
}

// ---------------------------------------------------------------------------
// Arquivos para clientes
// ---------------------------------------------------------------------------

const listaClientes = el('lista-clientes');
const avisoArquivos = el('aviso-arquivos');
const NOMES_ENVIO = {
  aguardando: 'Na fila',
  enviando: 'Enviando…',
  enviado: 'Enviado ✓',
  erro: 'Erro',
  cancelado: 'Cancelado',
};
let clientes = [];
let acompanhando = null;

async function carregarClientes() {
  el('erro-planilha').hidden = true;
  try {
    const resp = await fetch('/api/arquivos/clientes');
    const dados = await resp.json();
    if (dados.erro) throw new Error(dados.erro);
    clientes = dados.clientes;
    desenharClientes();
    el('bloco-clientes').hidden = false;
  } catch (err) {
    el('erro-planilha').textContent = err.message || 'Não foi possível ler a planilha.';
    el('erro-planilha').hidden = false;
    el('bloco-clientes').hidden = true;
  }
  // Se já tiver um envio rodando (ex.: página recarregada), mostra o progresso.
  acompanharEnvio();
}

function desenharClientes() {
  listaClientes.replaceChildren(
    ...clientes.map((c) => {
      const li = document.createElement('li');
      li.dataset.linha = c.linha;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !c.problema;
      check.disabled = Boolean(c.problema);
      check.setAttribute('aria-label', `Enviar para ${c.nome || c.telefone}`);
      check.addEventListener('change', atualizarResumo);

      const info = document.createElement('div');
      info.className = 'cliente-info';
      const nome = document.createElement('strong');
      nome.textContent = c.nome || 'Sem nome';
      const detalhe = document.createElement('span');
      detalhe.className = 'dica';
      detalhe.textContent = `${formatarTelefone(c.telefone)} · ${c.arquivo || '—'}`;
      info.append(nome, detalhe);

      const etiqueta = document.createElement('span');
      etiqueta.className = c.problema ? 'etiqueta etiqueta--erro' : 'etiqueta';
      etiqueta.textContent = c.problema || 'Pronto';

      li.append(check, info, etiqueta);
      return li;
    })
  );
  atualizarResumo();
}

function formatarTelefone(tel) {
  const m = tel.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : tel || 'sem telefone';
}

function checksDisponiveis() {
  return [...listaClientes.querySelectorAll('input[type=checkbox]:not(:disabled)')];
}

function atualizarResumo() {
  const marcados = checksDisponiveis().filter((c) => c.checked).length;
  const comProblema = clientes.filter((c) => c.problema).length;
  el('resumo-clientes').textContent =
    `${marcados} de ${clientes.length} selecionados` +
    (comProblema ? ` · ${comProblema} com problema` : '');
  el('marcar-todos').checked = marcados > 0 && marcados === checksDisponiveis().length;
}

function mostrarAvisoArquivos(mensagem, tipo) {
  avisoArquivos.textContent = mensagem;
  avisoArquivos.className = `aviso aviso--${tipo}`;
  avisoArquivos.hidden = false;
}

async function enviarArquivos() {
  const linhas = [...listaClientes.querySelectorAll('li')]
    .filter((li) => li.querySelector('input').checked && !li.querySelector('input').disabled)
    .map((li) => Number(li.dataset.linha));

  if (linhas.length === 0) return mostrarAvisoArquivos('Selecione pelo menos um cliente.', 'erro');
  if (!confirm(`Enviar arquivos para ${linhas.length} cliente(s)?`)) return;

  try {
    const resp = await fetch('/api/arquivos/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linhas, mensagemPadrao: el('mensagem-padrao').value }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro);
    mostrarAvisoArquivos(`Enviando para ${dados.total} cliente(s)…`, 'ok');
    acompanharEnvio();
  } catch (err) {
    mostrarAvisoArquivos(err.message || 'Não foi possível iniciar o envio.', 'erro');
  }
}

async function acompanharEnvio() {
  if (acompanhando) return;
  acompanhando = true;
  let viuRodando = false;
  try {
    for (;;) {
      const resp = await fetch('/api/arquivos/progresso');
      const { rodando, itens } = await resp.json();
      viuRodando = viuRodando || rodando;
      // Só pinta o progresso de um envio que esta página acompanhou.
      if (viuRodando) mostrarProgresso(itens);
      definirEnviando(rodando);
      if (!rodando) {
        if (viuRodando && itens.length > 0) {
          const ok = itens.filter((i) => i.status === 'enviado').length;
          const erros = itens.filter((i) => i.status === 'erro').length;
          mostrarAvisoArquivos(
            `Concluído: ${ok} enviado(s)` + (erros ? `, ${erros} com erro` : '') + '.',
            erros ? 'erro' : 'ok'
          );
        }
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {
    /* bot desligado: o indicador de status já avisa */
  } finally {
    acompanhando = false;
  }
}

function mostrarProgresso(itens) {
  itens.forEach((item) => {
    const etiqueta = listaClientes.querySelector(`li[data-linha="${item.linha}"] .etiqueta`);
    if (!etiqueta) return;
    etiqueta.textContent = item.detalhe ? `Erro: ${item.detalhe}` : NOMES_ENVIO[item.status];
    etiqueta.className = `etiqueta etiqueta--${item.status}`;
  });
}

function definirEnviando(enviando) {
  el('enviar-arquivos').disabled = enviando;
  el('enviar-arquivos').textContent = enviando ? 'Enviando…' : 'Enviar arquivos';
  el('parar-arquivos').hidden = !enviando;
  if (!enviando) el('parar-arquivos').textContent = 'Parar envio';
  el('recarregar-clientes').disabled = enviando;
}

el('marcar-todos').addEventListener('change', (e) => {
  checksDisponiveis().forEach((c) => { c.checked = e.target.checked; });
  atualizarResumo();
});
el('recarregar-clientes').addEventListener('click', () => {
  avisoArquivos.hidden = true;
  carregarClientes();
});
el('enviar-arquivos').addEventListener('click', enviarArquivos);
el('parar-arquivos').addEventListener('click', () => {
  fetch('/api/arquivos/cancelar', { method: 'POST' });
  el('parar-arquivos').textContent = 'Parando…';
});

// ---------------------------------------------------------------------------

el('form-envio').addEventListener('submit', enviar);
el('recarregar').addEventListener('click', carregarGrupos);
busca.addEventListener('input', desenharGrupos);
texto.addEventListener('input', () => {
  el('contador').textContent = texto.value.length;
});
texto.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) el('form-envio').requestSubmit();
});

atualizarStatus();
setInterval(atualizarStatus, 2000);
