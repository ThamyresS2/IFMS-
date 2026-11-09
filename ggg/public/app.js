const el = (id) => document.getElementById(id);

const telaConexao = el('tela-conexao');
const telaEnvio = el('tela-envio');
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
  telaEnvio.hidden = !conectado;

  el('bloco-qr').hidden = dados.status !== 'qr';
  el('carregando').hidden = dados.status === 'qr';
  if (dados.qr) el('qr').src = dados.qr;
  el('texto-carregando').textContent =
    dados.status === 'offline'
      ? 'O bot não está rodando. Abra o terminal na pasta ggg e rode: npm start'
      : dados.status === 'autenticando'
        ? 'Conectando ao WhatsApp…'
        : 'Abrindo o WhatsApp Web…';

  if (conectado && statusAtual !== 'conectado') carregarGrupos();
  statusAtual = dados.status;
}

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
  el('secao-historico').hidden = false;
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
