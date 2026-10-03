import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DIAS, MATERIAS, corDaMateria, indiceDeHoje } from '../constants'

const BLOCO_VAZIO = { dia: 0, inicio: '08:00', fim: '09:00', materia: 'Matemática', conteudo: '' }

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
  const hoje = indiceDeHoje()

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
    }
    const { error } = editandoId
      ? await supabase.from('horarios').update(registro).eq('id', editandoId)
      : await supabase.from('horarios').insert(registro)
    setSalvando(false)
    if (error) {
      setErro('Não foi possível salvar: ' + error.message)
      return
    }
    setErro('')
    // Já deixa o próximo bloco pronto, começando onde este terminou
    setForm((f) => ({ ...BLOCO_VAZIO, dia: f.dia, inicio: f.fim, fim: somarUmaHora(f.fim), materia: f.materia }))
    setEditandoId(null)
    carregar()
  }

  function editar(b) {
    setEditandoId(b.id)
    setForm({ dia: b.dia, inicio: hhmm(b.inicio), fim: hhmm(b.fim), materia: b.materia, conteudo: b.conteudo })
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
    lista.filter((b) => b.materia !== 'Descanso').reduce((s, b) => s + emMinutos(b.fim) - emMinutos(b.inicio), 0)
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
              Matéria
              <select value={form.materia} onChange={mudar('materia')}>
                {MATERIAS.map((m) => (
                  <option key={m.nome} value={m.nome}>{m.nome}</option>
                ))}
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
                porDia[i].map((b) => (
                  <div key={b.id} className="bloco" style={{ '--cor': corDaMateria(b.materia) }}>
                    <span className="bloco-hora">{hhmm(b.inicio)}–{hhmm(b.fim)}</span>
                    <strong className="bloco-materia">{b.materia}</strong>
                    {b.conteudo && <span className="bloco-conteudo">{b.conteudo}</span>}
                    {editavel && (
                      <span className="bloco-acoes">
                        <button className="link" onClick={() => editar(b)}>editar</button>
                        <button className="link perigo" onClick={() => remover(b)}>remover</button>
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
