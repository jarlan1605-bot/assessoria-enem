import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DIAS, MATERIAS, corDaMateria, indiceDeHoje } from './constants'
import { hojeISO, somarDias } from './agenda'
import { mapaCheckins, resumoAdesao, sequenciaDeDias } from './adesao'

const BLOCO_VAZIO = { dia: 0, inicio: '08:00', fim: '09:00', materia: 'Matemática', conteudo: '', conta_estudo: true }
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

export default function Horario({ alunoId, editavel }) {
  const [blocos, setBlocos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(BLOCO_VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [checkins, setCheckins] = useState([])
  const [personalizadas, setPersonalizadas] = useState([]) // matérias/tópicos criados pela equipe
  const [novaMateria, setNovaMateria] = useState(null) // { nome, cor, conta_estudo }
  const [gerenciando, setGerenciando] = useState(false)

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
      setBlocos(data ?? [])
    }
    setCarregando(false)
  }, [alunoId])

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
    setSalvando(true)
    const registro = {
      aluno_id: alunoId,
      dia: Number(form.dia),
      inicio: form.inicio,
      fim: form.fim,
      materia: form.materia,
      conteudo: form.conteudo.trim(),
      conta_estudo: !!form.conta_estudo,
    }
    const { error } = editandoId
      ? await supabase.from('horarios').update(registro).eq('id', editandoId)
      : await supabase.from('horarios').insert(registro)
    setSalvando(false)
    if (error) {
      setErro(/conta_estudo/.test(error.message) ? 'Rode o arquivo detalhes.sql no Supabase para salvar blocos com essa opção.' : 'Não foi possível salvar: ' + error.message)
      return
    }
    setErro('')
    // Já deixa o próximo bloco pronto, começando onde este terminou
    setForm((f) => ({ ...BLOCO_VAZIO, dia: f.dia, inicio: f.fim, fim: somarUmaHora(f.fim), materia: f.materia, conta_estudo: f.conta_estudo }))
    setEditandoId(null)
    carregar()
  }

  function editar(b) {
    setEditandoId(b.id)
    setForm({ dia: b.dia, inicio: hhmm(b.inicio), fim: hhmm(b.fim), materia: b.materia, conteudo: b.conteudo, conta_estudo: contaEstudo(b) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setForm(BLOCO_VAZIO)
  }

  async function remover(b) {
    if (!confirm(`Remover ${b.materia} de ${DIAS[b.dia]} (${hhmm(b.inicio)}–${hhmm(b.fim)})?`)) return
    const { error } = await supabase.from('horarios').delete().eq('id', b.id)
    if (error) setErro('Não foi possível remover: ' + error.message)
    else carregar()
  }

  const porDia = DIAS.map((_, i) => blocos.filter((b) => b.dia === i))
  const minutosDoDia = porDia.map((lista) =>
    lista.filter(contaEstudo).reduce((s, b) => s + emMinutos(b.fim) - emMinutos(b.inicio), 0)
  )
  const totalSemana = minutosDoDia.reduce((a, b) => a + b, 0)

  return (
    <section className="secao">
      {editavel && (
        <form className="cartao form-bloco" onSubmit={salvar}>
          <h2>{editandoId ? 'Editar bloco' : 'Adicionar bloco ao horário'}</h2>
          <div className="grade-form">
            <label>
              Dia
              <select value={form.dia} onChange={mudar('dia')}>
                {DIAS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </label>
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
            {editandoId && (
              <button type="button" className="botao fantasma" onClick={cancelarEdicao}>Cancelar</button>
            )}
            <button className="botao primario" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Adicionar'}
            </button>
          </div>
        </form>
      )}

      {erro && <p className="erro">{erro}</p>}

      <div className="resumo-semana">
        <h2>Horário da semana</h2>
        {blocos.length > 0 && (
          <span className="etiqueta">{formatarDuracao(totalSemana)} de estudo por semana</span>
        )}
      </div>

      {blocos.length > 0 && (() => {
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
              ? 'Este aluno ainda não tem horário. Adicione o primeiro bloco acima.'
              : 'Seu horário ainda está sendo montado pelo seu mentor. Volte em breve!'}
          </p>
        </div>
      ) : (
        <div className="semana">
          {DIAS.map((dia, i) => (
            <div key={dia} className={i === hoje ? 'dia hoje' : 'dia'}>
              <div className="dia-cabecalho">
                <span>{dia}</span>
                {i === hoje && <span className="selo-hoje">hoje</span>}
                {minutosDoDia[i] > 0 && <span className="suave pequeno">{formatarDuracao(minutosDoDia[i])}</span>}
              </div>
              {porDia[i].length === 0 ? (
                <p className="suave pequeno dia-livre">Livre</p>
              ) : (
                porDia[i].map((b) => {
                  const dataBloco = datasDaSemana[i]
                  const status = mapaCheckins(checkins)[`${b.id}|${dataBloco}`]
                  const podeMarcar = !editavel && dataBloco <= hojeData && contaEstudo(b)
                  return (
                  <div key={b.id} className={`bloco ${status ? 'marcado-' + status : ''}`} style={{ '--cor': corDe(b.materia) }}>
                    <span className="bloco-hora">{hhmm(b.inicio)}–{hhmm(b.fim)}</span>
                    <strong className="bloco-materia">{b.materia}</strong>
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
                        <button className="link perigo" onClick={() => remover(b)}>remover</button>
                      </span>
                    )}
                  </div>
                  )
                })
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
