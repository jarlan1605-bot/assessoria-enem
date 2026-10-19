import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DIAS, MATERIAS, corDaMateria, indiceDeHoje } from './constants'
import { MESES, DIAS_CURTOS, hojeISO, somarDias } from './agenda'
import { horarioVigente, mapaCheckins, mesDe, resumoAdesao, sequenciaDeDias } from './adesao'
import ExportarHorario from './ExportarHorario'

const BLOCO_VAZIO = { dias: [0], inicio: '08:00', fim: '09:00', materia: 'Matemática', conteudo: '', conta_estudo: true }
const CORES_SUGERIDAS = ['#1864ab', '#2f9e44', '#e8590c', '#c2255c', '#7048e8', '#0c8599', '#e67700', '#495057']

const hhmm = (t) => (t || '').slice(0, 5)
const emMinutos = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  return h * 60 + m
}
const somarUmaHora = (t) => {
  const total = Math.min(emMinutos(t) + 60, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
export const formatarDuracao = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m}min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

// Meses guardados como '2026-10-01'
const somarMesISO = (mes, n) => {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
export const nomeDoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} de ${a}`
}
const ATALHOS_DIAS = [['Seg a Sex', [0, 1, 2, 3, 4]], ['Seg a Sáb', [0, 1, 2, 3, 4, 5]], ['Todos', [0, 1, 2, 3, 4, 5, 6]]]

// Escala da grade: quantos pixels vale cada minuto (1 hora = 66 px)
const PX_MIN = 1.1

function useLargo(consulta) {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const f = () => setOk(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [consulta])
  return ok
}

export default function Horario({ alunoId, editavel, aluno }) {
  const [todos, setTodos] = useState([]) // blocos de todos os meses
  const [mes, setMes] = useState(null) // mês que está na tela
  const [repetindo, setRepetindo] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(BLOCO_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [checkins, setCheckins] = useState([])
  const [personalizadas, setPersonalizadas] = useState([]) // matérias/tópicos criados pela equipe
  const [novaMateria, setNovaMateria] = useState(null) // { nome, cor, conta_estudo }
  const [gerenciando, setGerenciando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const largo = useLargo('(min-width: 1001px)')

  const carregarPersonalizadas = useCallback(async () => {
    const { data } = await supabase.from('materias_personalizadas').select('*').order('nome')
    setPersonalizadas(data ?? [])
  }, [])
  useEffect(() => {
    carregarPersonalizadas()
  }, [carregarPersonalizadas])

  const personalizadaDe = (nome) => personalizadas.find((m) => m.nome === nome)
  const corDe = (nome) => personalizadaDe(nome)?.cor || corDaMateria(nome)
  const contaPorPadrao = (nome) => nome !== 'Descanso' && personalizadaDe(nome)?.conta_estudo !== false
  const contaEstudo = (b) => b.materia !== 'Descanso' && b.conta_estudo !== false

  function escolherMateria(nome) {
    if (nome === '__nova') {
      setNovaMateria({ nome: '', cor: CORES_SUGERIDAS[0], conta_estudo: true })
      return
    }
    setForm((f) => ({ ...f, materia: nome, conta_estudo: contaPorPadrao(nome) }))
  }

  async function criarMateria() {
    const nome = novaMateria.nome.trim()
    if (!nome) return setErro('Dê um nome para a matéria ou tópico.')
    if (MATERIAS.some((m) => m.nome.toLowerCase() === nome.toLowerCase()) || personalizadas.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      setNovaMateria(null)
      return escolherMateria(MATERIAS.find((m) => m.nome.toLowerCase() === nome.toLowerCase())?.nome || personalizadas.find((m) => m.nome.toLowerCase() === nome.toLowerCase()).nome)
    }
    const { error } = await supabase.from('materias_personalizadas').insert({ nome, cor: novaMateria.cor, conta_estudo: novaMateria.conta_estudo })
    if (error) return setErro(/materias_personalizadas/.test(error.message) ? 'Rode o arquivo detalhes.sql no Supabase para criar matérias personalizadas.' : 'Não foi possível criar: ' + error.message)
    setErro('')
    await carregarPersonalizadas()
    setForm((f) => ({ ...f, materia: nome, conta_estudo: novaMateria.conta_estudo }))
    setNovaMateria(null)
  }

  async function apagarMateria(m) {
    if (!confirm(`Remover “${m.nome}” da lista? Os blocos que já usam esse nome continuam no horário.`)) return
    await supabase.from('materias_personalizadas').delete().eq('id', m.id)
    carregarPersonalizadas()
  }

  async function mudarCorMateria(m, cor) {
    await supabase.from('materias_personalizadas').update({ cor }).eq('id', m.id)
    carregarPersonalizadas()
  }
  const hoje = indiceDeHoje()
  const hojeData = hojeISO()
  const mesAtual = mesDe(hojeData)
  const segunda = somarDias(hojeData, -hoje)
  const datasDaSemana = DIAS.map((_, i) => somarDias(segunda, i))

  const carregarCheckins = useCallback(async () => {
    const { data } = await supabase
      .from('checkins')
      .select('horario_id, dia, status')
      .eq('aluno_id', alunoId)
      .gte('dia', somarDias(hojeISO(), -60))
    setCheckins(data ?? [])
  }, [alunoId])

  useEffect(() => {
    carregarCheckins()
  }, [carregarCheckins])

  // Aluno marca cada bloco: feito, parcial ou não fez (clicar de novo desmarca)
  async function marcar(bloco, dia, status) {
    const atual = checkins.find((c) => c.horario_id === bloco.id && c.dia === dia)
    const novoStatus = atual?.status === status ? null : status
    setCheckins((l) => {
      const resto = l.filter((c) => !(c.horario_id === bloco.id && c.dia === dia))
      return novoStatus ? [...resto, { horario_id: bloco.id, dia, status: novoStatus }] : resto
    })
    const { error } = novoStatus
      ? await supabase.from('checkins').upsert({ aluno_id: alunoId, horario_id: bloco.id, dia, status: novoStatus }, { onConflict: 'horario_id,dia' })
      : await supabase.from('checkins').delete().eq('horario_id', bloco.id).eq('dia', dia)
    if (error) {
      setErro('Não foi possível salvar o check-in: ' + error.message)
      carregarCheckins()
    }
  }

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('horarios')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('dia')
      .order('inicio')
    if (error) setErro('Não foi possível carregar o horário.')
    else {
      setErro('')
      const lista = data ?? []
      setTodos(lista)
      // Abre no mês atual; se ele ainda não tem horário, no último mês que tem (o que está valendo)
      setMes((m) => m ?? (lista.some((b) => b.mes === mesAtual) || editavel ? mesAtual : horarioVigente(lista, mesAtual).mes ?? mesAtual))
    }
    setCarregando(false)
  }, [alunoId, mesAtual, editavel])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mudar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  async function salvar(e) {
    e.preventDefault()
    if (emMinutos(form.fim) <= emMinutos(form.inicio)) {
      setErro('O horário de fim precisa ser depois do início.')
      return
    }
    if (!form.dias.length) {
      setErro('Escolha pelo menos um dia.')
      return
    }
    setSalvando(true)
    const registro = {
      aluno_id: alunoId,
      mes,
      inicio: form.inicio,
      fim: form.fim,
      materia: form.materia,
      conteudo: form.conteudo.trim(),
      conta_estudo: !!form.conta_estudo,
    }
    // Um bloco para cada dia escolhido (assim dá para repetir o mesmo bloco em vários dias de uma vez)
    const { error } = editandoId
      ? await supabase.from('horarios').update({ ...registro, dia: form.dias[0] }).eq('id', editandoId)
      : await supabase.from('horarios').insert([...form.dias].sort().map((dia) => ({ ...registro, dia })))
    setSalvando(false)
    if (error) {
      setErro(/conta_estudo/.test(error.message) ? 'Rode o arquivo detalhes.sql no Supabase para salvar blocos com essa opção.' : /mes/.test(error.message) ? 'Falta rodar o arquivo horario_meses.sql no Supabase.' : 'Não foi possível salvar: ' + error.message)
      return
    }
    setErro('')
    // Já deixa o próximo bloco pronto, começando onde este terminou
    setForm((f) => ({ ...BLOCO_VAZIO, dias: editandoId ? [f.dias[0]] : f.dias, inicio: f.fim, fim: somarUmaHora(f.fim), materia: f.materia, conta_estudo: f.conta_estudo }))
    setEditandoId(null)
    setRepetindo(false)
    carregar()
  }

  function editar(b) {
    setEditandoId(b.id)
    setRepetindo(false)
    setForm({ dias: [b.dia], inicio: hhmm(b.inicio), fim: hhmm(b.fim), materia: b.materia, conteudo: b.conteudo, conta_estudo: contaEstudo(b) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Abre o formulário com o mesmo bloco, para escolher em quais outros dias ele se repete
  function repetir(b) {
    setEditandoId(null)
    setRepetindo(true)
    setForm({ dias: [], inicio: hhmm(b.inicio), fim: hhmm(b.fim), materia: b.materia, conteudo: b.conteudo, conta_estudo: contaEstudo(b) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setRepetindo(false)
    setForm(BLOCO_VAZIO)
  }

  function alternarDia(i) {
    setForm((f) => ({
      ...f,
      dias: editandoId ? [i] : f.dias.includes(i) ? f.dias.filter((d) => d !== i) : [...f.dias, i],
    }))
  }

  // Mês novo: copia o horário do último mês que tem horário
  async function copiarDe(origem) {
    const lista = todos.filter((b) => b.mes === origem)
    if (!confirm(`Copiar os ${lista.length} blocos de ${nomeDoMes(origem)} para ${nomeDoMes(mes)}? Depois você ajusta o que quiser; ${nomeDoMes(origem)} continua guardado.`)) return
    setCopiando(true)
    const { error } = await supabase.from('horarios').insert(
      lista.map((b) => ({ aluno_id: alunoId, mes, dia: b.dia, inicio: b.inicio, fim: b.fim, materia: b.materia, conteudo: b.conteudo, conta_estudo: b.conta_estudo }))
    )
    setCopiando(false)
    if (error) setErro('Não foi possível copiar: ' + error.message)
    else carregar()
  }

  async function remover(b) {
    if (!confirm(`Remover ${b.materia} de ${DIAS[b.dia]} (${hhmm(b.inicio)}–${hhmm(b.fim)})?`)) return
    const { error } = await supabase.from('horarios').delete().eq('id', b.id)
    if (error) setErro('Não foi possível remover: ' + error.message)
    else carregar()
  }

  const blocos = todos.filter((b) => b.mes === mes)
  const vigenteHoje = horarioVigente(todos, mesAtual).mes
  const origemCopia = horarioVigente(todos, somarMesISO(mes || mesAtual, -1)).mes
  // Meses no seletor: os que têm horário, o atual, o próximo e o que está na tela
  const mesesDaLista = [...new Set([...todos.map((b) => b.mes), mesAtual, somarMesISO(mesAtual, 1), mes].filter(Boolean))].sort().reverse()
  const porDia = DIAS.map((_, i) => blocos.filter((b) => b.dia === i))
  const minutosDoDia = porDia.map((lista) =>
    lista.filter(contaEstudo).reduce((s, b) => s + emMinutos(b.fim) - emMinutos(b.inicio), 0)
  )
  const totalSemana = minutosDoDia.reduce((a, b) => a + b, 0)

  // Trocar de mês cancela a edição que estava aberta
  useEffect(() => {
    setEditandoId(null)
    setRepetindo(false)
  }, [mes])

  if (!mes) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="horario-mes">
        <div className="navegar-mes">
          <button className="botao fantasma" onClick={() => setMes((m) => somarMesISO(m, -1))} aria-label="Mês anterior">‹</button>
          <select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês do horário">
            {mesesDaLista.map((m) => (
              <option key={m} value={m}>
                {nomeDoMes(m)}{m === mesAtual ? ' (atual)' : ''}{todos.some((b) => b.mes === m) ? '' : ' · sem horário'}
              </option>
            ))}
          </select>
          <button className="botao fantasma" onClick={() => setMes((m) => somarMesISO(m, 1))} aria-label="Próximo mês">›</button>
        </div>
        {mes !== mesAtual && (
          <button className="link" onClick={() => setMes(editavel || todos.some((b) => b.mes === mesAtual) ? mesAtual : vigenteHoje ?? mesAtual)}>voltar para o mês atual</button>
        )}
      </div>
      {!editavel && mes === vigenteHoje && mes !== mesAtual && (
        <p className="suave pequeno" style={{ margin: '-6px 0 0' }}>
          O horário de {nomeDoMes(mesAtual).split(' ')[0].toLowerCase()} ainda não foi montado. Siga este por enquanto.
        </p>
      )}

      {editavel && (
        <form className="cartao form-bloco" onSubmit={salvar}>
          <h2>
            {editandoId ? 'Editar bloco' : repetindo ? 'Repetir bloco em outros dias' : 'Adicionar bloco ao horário'}
            <span className="suave pequeno" style={{ fontWeight: 500 }}> · {nomeDoMes(mes)}</span>
          </h2>
          <p className="rotulo-campo">{editandoId ? 'Dia' : 'Dias (escolha um ou vários: o bloco é criado em cada dia marcado)'}</p>
          <div className="dias-escolha" role="group" aria-label="Dias">
            {DIAS_CURTOS.map((d, i) => (
              <button
                type="button"
                key={d}
                className={form.dias.includes(i) ? 'dia-op ativo' : 'dia-op'}
                aria-pressed={form.dias.includes(i)}
                onClick={() => alternarDia(i)}
              >
                {d}
              </button>
            ))}
            {!editandoId && (
              <span className="dias-atalhos">
                {ATALHOS_DIAS.map(([nome, dias]) => (
                  <button type="button" key={nome} className="link" onClick={() => setForm((f) => ({ ...f, dias }))}>{nome}</button>
                ))}
                {form.dias.length > 0 && <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, dias: [] }))}>limpar</button>}
              </span>
            )}
          </div>
          <div className="grade-form">
            <label>
              Início
              <input type="time" value={form.inicio} onChange={mudar('inicio')} required />
            </label>
            <label>
              Fim
              <input type="time" value={form.fim} onChange={mudar('fim')} required />
            </label>
            <label>
              Matéria ou tópico
              <select value={form.materia} onChange={(e) => escolherMateria(e.target.value)}>
                {personalizadas.length > 0 && (
                  <optgroup label="Criadas por você">
                    {personalizadas.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                  </optgroup>
                )}
                <optgroup label="Padrão">
                  {MATERIAS.map((m) => (
                    <option key={m.nome} value={m.nome}>{m.nome}</option>
                  ))}
                </optgroup>
                {!MATERIAS.some((m) => m.nome === form.materia) && !personalizadas.some((m) => m.nome === form.materia) && (
                  <option value={form.materia}>{form.materia}</option>
                )}
                <option value="__nova">➕ Criar nova matéria ou tópico…</option>
              </select>
            </label>
            <label className="largo">
              O que estudar
              <input
                value={form.conteudo}
                onChange={mudar('conteudo')}
                placeholder="Ex.: Estequiometria — teoria + 15 questões"
              />
            </label>
          </div>

          {novaMateria && (
            <div className="nova-materia">
              <strong>Nova matéria ou tópico</strong>
              <div className="linha-campo">
                <input autoFocus value={novaMateria.nome} maxLength={40} onChange={(e) => setNovaMateria({ ...novaMateria, nome: e.target.value })} placeholder="Ex.: FACEX, Anki, Caminhada, Aula do Adilson" />
              </div>
              <div className="cores-op" role="radiogroup" aria-label="Cor">
                {CORES_SUGERIDAS.map((c) => (
                  <button type="button" key={c} role="radio" aria-checked={novaMateria.cor === c} className={novaMateria.cor === c ? 'cor-op ativo' : 'cor-op'} style={{ background: c }} onClick={() => setNovaMateria({ ...novaMateria, cor: c })} aria-label={c} />
                ))}
                <input type="color" value={novaMateria.cor} onChange={(e) => setNovaMateria({ ...novaMateria, cor: e.target.value })} aria-label="Outra cor" />
              </div>
              <label className="caixa-marcar" style={{ marginTop: 0 }}>
                <input type="checkbox" checked={novaMateria.conta_estudo} onChange={(e) => setNovaMateria({ ...novaMateria, conta_estudo: e.target.checked })} />
                <span>Conta como hora de estudo <span className="suave pequeno">(desmarque para almoço, caminhada, lazer…)</span></span>
              </label>
              <div className="linha-botoes" style={{ marginTop: 0 }}>
                <button type="button" className="botao fantasma pequeno" onClick={() => setNovaMateria(null)}>Cancelar</button>
                <button type="button" className="botao primario pequeno" onClick={criarMateria}>Criar e usar</button>
              </div>
            </div>
          )}

          <div className="form-bloco-opcoes">
            <label className="caixa-marcar" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={!!form.conta_estudo} onChange={(e) => setForm({ ...form, conta_estudo: e.target.checked })} />
              <span>Este bloco conta como hora de estudo</span>
            </label>
            {personalizadas.length > 0 && (
              <button type="button" className="link" onClick={() => setGerenciando((g) => !g)}>{gerenciando ? 'fechar' : 'gerenciar matérias criadas'}</button>
            )}
          </div>
          {gerenciando && (
            <div className="gerenciar-materias">
              {personalizadas.map((m) => (
                <span key={m.id} className="chip" style={{ borderColor: m.cor }}>
                  <input type="color" value={m.cor} onChange={(e) => mudarCorMateria(m, e.target.value)} aria-label={`Cor de ${m.nome}`} className="chip-cor" />
                  {m.nome}{m.conta_estudo ? '' : ' · não conta'}
                  <button type="button" onClick={() => apagarMateria(m)} aria-label={`Remover ${m.nome}`}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="linha-botoes">
            {(editandoId || repetindo) && (
              <button type="button" className="botao fantasma" onClick={cancelarEdicao}>Cancelar</button>
            )}
            <button className="botao primario" disabled={salvando}>
              {salvando
                ? 'Salvando…'
                : editandoId
                  ? 'Salvar alterações'
                  : form.dias.length > 1
                    ? `Adicionar em ${form.dias.length} dias`
                    : 'Adicionar'}
            </button>
          </div>
        </form>
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="resumo-semana">
        <h2>Horário da semana · {nomeDoMes(mes).split(' ')[0]}</h2>
        {blocos.length > 0 && (
          <span className="etiqueta">{formatarDuracao(totalSemana)} de estudo por semana</span>
        )}
        {blocos.length > 0 && (
          <button className="botao primario pequeno botao-whats" onClick={() => setExportando(true)} style={{ marginLeft: 'auto' }}>
            Enviar pelo WhatsApp
          </button>
        )}
      </div>
      {exportando && (
        <ExportarHorario nome={aluno?.nome || aluno?.email || 'Aluno'} blocos={blocos} corDe={corDe} contaEstudo={contaEstudo} mesNome={nomeDoMes(mes)} observacoes={observacoes} onFechar={() => setExportando(false)} />
      )}

      {blocos.length > 0 && mes === vigenteHoje && (() => {
        const sem7 = resumoAdesao(blocos, checkins, somarDias(hojeData, -6), hojeData)
        const seq = sequenciaDeDias(blocos, checkins)
        return (
          <div className="cartao adesao">
            <div className="adesao-item">
              <span className="adesao-numero">{sem7.pct === null ? '—' : `${sem7.pct}%`}</span>
              <span className="suave pequeno">do plano cumprido nos últimos 7 dias</span>
              {sem7.pct !== null && <span className="barra larga"><i style={{ width: `${sem7.pct}%` }} className={sem7.pct < 50 ? 'cheia' : ''} /></span>}
            </div>
            <div className="adesao-item">
              <span className="adesao-numero">{seq > 0 ? `🔥 ${seq}` : '0'}</span>
              <span className="suave pequeno">{seq === 1 ? 'dia seguido' : 'dias seguidos'} cumprindo o plano</span>
            </div>
            <p className="suave pequeno adesao-dica">
              {editavel
                ? 'O aluno marca cada bloco como feito, parcial ou não fez. Os dias marcados aparecem aqui.'
                : 'Ao terminar cada bloco, marque ✓ feito, ½ parcial ou ✗ não fiz. Honestidade aqui ajuda seu mentor a ajustar o plano.'}
            </p>
          </div>
        )
      })()}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : blocos.length === 0 ? (
        <div className="cartao vazio">
          <p>
            {editavel
              ? `${nomeDoMes(mes)} ainda não tem horário. Adicione o primeiro bloco acima${origemCopia ? ' ou comece copiando outro mês' : ''}.`
              : mes > mesAtual
                ? `O horário de ${nomeDoMes(mes).split(' ')[0].toLowerCase()} ainda não foi montado.`
                : todos.length
                  ? `Não houve horário em ${nomeDoMes(mes).split(' ')[0].toLowerCase()}.`
                  : 'Seu horário ainda está sendo montado pelo seu mentor. Volte em breve!'}
          </p>
          {editavel && origemCopia && (
            <button className="botao primario" onClick={() => copiarDe(origemCopia)} disabled={copiando}>
              {copiando ? 'Copiando…' : `Copiar o horário de ${nomeDoMes(origemCopia)}`}
            </button>
          )}
        </div>
      ) : (
        (() => {
          // Grade proporcional: a altura de cada bloco é a duração dele.
          // No computador, todos os dias usam a mesma régua de horas (ficam alinhados);
          // no celular, cada dia começa no seu primeiro bloco.
          const ini = (lista) => Math.floor(Math.min(...lista.map((b) => emMinutos(b.inicio))) / 60) * 60
          const fim = (lista) => Math.ceil(Math.max(...lista.map((b) => emMinutos(b.fim))) / 60) * 60
          const iniGeral = ini(blocos)
          const fimGeral = Math.max(fim(blocos), iniGeral + 60)
          const horas = []
          for (let m = iniGeral; m <= fimGeral; m += 60) horas.push(m)
          return (
            <div className={largo ? 'semana grade-horas' : 'semana'}>
              {largo && (
                <div className="regua" aria-hidden="true">
                  <div className="dia-cabecalho regua-topo" />
                  <div className="regua-horas" style={{ height: (fimGeral - iniGeral) * PX_MIN }}>
                    {horas.map((m) => (
                      <span key={m} style={{ top: (m - iniGeral) * PX_MIN }}>{String(Math.floor(m / 60)).padStart(2, '0')}h</span>
                    ))}
                  </div>
                </div>
              )}
              {DIAS.map((dia, i) => {
                const lista = porDia[i]
                const comeco = largo ? iniGeral : lista.length ? ini(lista) : 0
                const termino = largo ? fimGeral : lista.length ? Math.max(fim(lista), comeco + 60) : 0
                return (
                  <div key={dia} className={i === hoje ? 'dia hoje' : 'dia'}>
                    <div className="dia-cabecalho">
                      <span>{dia}</span>
                      {i === hoje && <span className="selo-hoje">hoje</span>}
                      {minutosDoDia[i] > 0 && <span className="suave pequeno">{formatarDuracao(minutosDoDia[i])}</span>}
                    </div>
                    {lista.length === 0 && !largo ? (
                      <p className="suave pequeno dia-livre">Livre</p>
                    ) : (
                      <div className="dia-linha" style={{ height: (termino - comeco) * PX_MIN, '--hora': `${60 * PX_MIN}px` }}>
                        {lista.length === 0 && <p className="suave pequeno dia-livre">Livre</p>}
                        {lista.map((b) => {
                          const dataBloco = datasDaSemana[i]
                          const status = mapaCheckins(checkins)[`${b.id}|${dataBloco}`]
                          const podeMarcar = !editavel && dataBloco <= hojeData && contaEstudo(b) && horarioVigente(todos, mesDe(dataBloco)).mes === mes
                          const dur = Math.max(emMinutos(b.fim) - emMinutos(b.inicio), 15)
                          const altura = dur * PX_MIN
                          const tamanho = altura < 46 ? 'mini' : altura < 84 ? 'curto' : ''
                          const extras = (podeMarcar ? 34 : 0) + (editavel ? 24 : 0) + (status && !podeMarcar ? 20 : 0)
                          const linhas = Math.floor((altura - 52 - extras) / 17)
                          return (
                            <div
                              key={b.id}
                              className={`bloco ${tamanho} ${linhas < 1 ? 'sem-conteudo' : ''} ${status ? 'marcado-' + status : ''}`}
                              style={{ '--cor': corDe(b.materia), '--linhas': Math.max(1, linhas), top: (emMinutos(b.inicio) - comeco) * PX_MIN, height: altura }}
                              tabIndex={0}
                              title={`${hhmm(b.inicio)}–${hhmm(b.fim)} · ${b.materia}${b.conteudo ? ' — ' + b.conteudo : ''}`}
                            >
                              <div className="bloco-caixa">
                                <span className="bloco-topo">
                                  <span className="bloco-hora">{hhmm(b.inicio)}–{hhmm(b.fim)}</span>
                                  <strong className="bloco-materia">{b.materia}</strong>
                                </span>
                                {b.conteudo && <span className="bloco-conteudo">{b.conteudo}</span>}
                                {podeMarcar ? (
                                  <span className="checkin" role="group" aria-label="Como foi este bloco?">
                                    {[['feito', '✓', 'Feito'], ['parcial', '½', 'Parcial'], ['nao', '✗', 'Não fiz']].map(([k, ic, nome]) => (
                                      <button key={k} className={status === k ? `ck ck-${k} ativo` : `ck ck-${k}`} onClick={() => marcar(b, dataBloco, k)} title={nome} aria-pressed={status === k}>
                                        {ic}
                                      </button>
                                    ))}
                                  </span>
                                ) : status ? (
                                  <span className={`ck-status ck-${status}`}>{status === 'feito' ? '✓ feito' : status === 'parcial' ? '½ parcial' : '✗ não fez'}</span>
                                ) : null}
                                {editavel && (
                                  <span className="bloco-acoes">
                                    <button className="link" onClick={() => editar(b)}>editar</button>
                                    <button className="link" onClick={() => repetir(b)} title="Criar este mesmo bloco em outros dias">repetir</button>
                                    <button className="link perigo" onClick={() => remover(b)}>remover</button>
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()
      )}

      {!carregando && <Observacoes key={`${alunoId}|${mes}`} alunoId={alunoId} mes={mes} editavel={editavel} onCarregar={setObservacoes} />}
    </section>
  )
}

// Observações do horário do mês: o mentor escreve, o aluno lê
function Observacoes({ alunoId, mes, editavel, onCarregar }) {
  const [texto, setTexto] = useState('')
  const [salvo, setSalvo] = useState('')
  const [estado, setEstado] = useState('carregando') // carregando | pronto | salvando | ok | erro | faltaSql

  useEffect(() => {
    supabase
      .from('horario_observacoes')
      .select('texto')
      .eq('aluno_id', alunoId)
      .eq('mes', mes)
      .maybeSingle()
      .then(({ data, error }) => {
        const t = data?.texto ?? ''
        setTexto(t)
        setSalvo(t)
        onCarregar(t)
        setEstado(error ? 'faltaSql' : 'pronto')
      })
  }, [alunoId, mes, onCarregar])

  async function salvar() {
    setEstado('salvando')
    const { error } = await supabase
      .from('horario_observacoes')
      .upsert({ aluno_id: alunoId, mes, texto: texto.trim(), atualizado_em: new Date().toISOString() })
    if (error) return setEstado('erro')
    setSalvo(texto.trim())
    onCarregar(texto.trim())
    setEstado('ok')
  }

  if (estado === 'carregando') return null
  if (!editavel && !salvo) return null

  return (
    <div className="cartao observacoes-horario">
      <h2>📝 Observações</h2>
      {editavel ? (
        <>
          <textarea
            rows="4"
            maxLength={4000}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); if (estado === 'ok') setEstado('pronto') }}
            placeholder="Ex.: Nas sextas, revisar o caderno de erros antes do simulado. Academia pode trocar de horário se precisar."
            disabled={estado === 'faltaSql'}
          />
          <div className="linha-botoes" style={{ alignItems: 'center' }}>
            {estado === 'faltaSql' && <span className="erro pequeno">Falta rodar o arquivo horario_meses.sql no Supabase.</span>}
            {estado === 'erro' && <span className="erro pequeno">Não foi possível salvar.</span>}
            {estado === 'ok' && <span className="suave pequeno">✓ salvo · o aluno já vê</span>}
            <button className="botao primario pequeno" onClick={salvar} disabled={estado === 'salvando' || estado === 'faltaSql' || texto.trim() === salvo}>
              {estado === 'salvando' ? 'Salvando…' : 'Salvar observações'}
            </button>
          </div>
        </>
      ) : (
        <p className="post-texto" style={{ margin: 0 }}>{salvo}</p>
      )}
    </div>
  )
}
