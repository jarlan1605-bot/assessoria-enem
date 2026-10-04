import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import {
  MESES, inicioDoMes, somarMeses, mesmoMes, faixaHorario, diaPorExtenso, chaveDoDia,
  agruparPorDia, podeCancelar, HORAS_PARA_CANCELAR,
} from './agenda'

export default function Aulas({ perfil }) {
  const [itens, setItens] = useState([])
  const [limite, setLimite] = useState(perfil.limite_mensal ?? 4)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [reservando, setReservando] = useState(null) // id do horário com o formulário aberto
  const [tema, setTema] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    // As regras do banco devolvem só: os atendimentos do aluno + horários livres futuros
    const [{ data, error }, { data: p }] = await Promise.all([
      supabase
        .from('atendimentos')
        .select('*')
        .gte('inicio', inicioDoMes(new Date()).toISOString())
        .order('inicio'),
      supabase.from('perfis').select('limite_mensal').eq('id', perfil.id).single(),
    ])
    if (error) setErro('Não foi possível carregar os horários. Tente de novo em instantes.')
    else {
      setErro('')
      setItens(data ?? [])
    }
    if (p?.limite_mensal !== undefined) setLimite(p.limite_mensal)
    setCarregando(false)
  }, [perfil.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agora = Date.now()
  const meus = itens.filter((a) => a.aluno_id === perfil.id)
  const meusFuturos = meus.filter((a) => new Date(a.inicio).getTime() > agora)
  const livres = itens.filter((a) => !a.aluno_id && new Date(a.inicio).getTime() > agora)

  const usadosNoMes = (d) => meus.filter((a) => mesmoMes(new Date(a.inicio), d)).length
  const hoje = new Date()
  const usadosAgora = usadosNoMes(hoje)
  const proximoMes = somarMeses(hoje, 1)
  const temProximoMes = itens.some((a) => mesmoMes(new Date(a.inicio), proximoMes))

  async function confirmarReserva(a) {
    setOcupado(true)
    const { error } = await supabase.rpc('reservar_atendimento', { p_id: a.id, p_tema: tema.trim() })
    setOcupado(false)
    if (error) {
      setErro(error.message)
      carregar()
      return
    }
    setErro('')
    setAviso(`Reservado: ${diaPorExtenso(new Date(a.inicio))}, ${faixaHorario(a)}.`)
    setReservando(null)
    setTema('')
    carregar()
  }

  async function cancelar(a) {
    if (!confirm(`Cancelar o atendimento de ${diaPorExtenso(new Date(a.inicio))}, ${faixaHorario(a)}?`)) return
    const { error } = await supabase.rpc('cancelar_atendimento', { p_id: a.id })
    if (error) setErro(error.message)
    else {
      setErro('')
      setAviso('Atendimento cancelado. O horário voltou a ficar livre.')
      carregar()
    }
  }

  return (
    <section className="secao">
      <div className="cartao contador-aulas">
        <div>
          <span className="mini-titulo" style={{ color: 'var(--primaria)' }}>Atendimentos em {MESES[hoje.getMonth()].toLowerCase()}</span>
          <div className="contador-linha">
            <strong className="mini-numero">{usadosAgora}</strong>
            <span className="suave">de {limite}</span>
          </div>
          <span className="barra larga" aria-hidden="true">
            <i style={{ width: `${limite ? Math.min(100, (usadosAgora / limite) * 100) : 0}%` }} className={usadosAgora >= limite ? 'cheia' : ''} />
          </span>
        </div>
        <p className="suave pequeno">
          {usadosAgora >= limite
            ? 'Você já usou todos os atendimentos deste mês.'
            : `Você ainda pode marcar ${limite - usadosAgora} ${limite - usadosAgora === 1 ? 'atendimento' : 'atendimentos'} este mês.`}
          {temProximoMes && ` Em ${MESES[proximoMes.getMonth()].toLowerCase()}: ${usadosNoMes(proximoMes)} de ${limite}.`}
          {' '}Cancelamentos com pelo menos {HORAS_PARA_CANCELAR}h de antecedência.
        </p>
      </div>

      {aviso && <p className="aviso-ok" role="status">✓ {aviso}</p>}
      {erro && <p className="erro">{erro}</p>}

      <div className="cartao">
        <h2>Seus próximos atendimentos</h2>
        {carregando ? (
          <p className="suave">Carregando…</p>
        ) : meusFuturos.length === 0 ? (
          <p className="suave" style={{ marginBottom: 0 }}>Nenhum atendimento marcado. Escolha um horário abaixo.</p>
        ) : (
          meusFuturos.map((a) => (
            <div key={a.id} className="atendimento marcado">
              <span className="atendimento-hora">
                <b>{diaPorExtenso(new Date(a.inicio))}</b>
                <br />
                {faixaHorario(a)}
              </span>
              <div className="atendimento-info">
                <strong>Atendimento com o mentor</strong>
                {a.tema && <span className="suave pequeno">{a.tema}</span>}
              </div>
              <div className="atendimento-acoes">
                {podeCancelar(a) ? (
                  <button className="link perigo" onClick={() => cancelar(a)}>cancelar</button>
                ) : (
                  <span className="suave pequeno">fale com o mentor para desmarcar</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cartao">
        <h2>Horários disponíveis</h2>
        {carregando ? (
          <p className="suave">Carregando…</p>
        ) : livres.length === 0 ? (
          <p className="suave" style={{ marginBottom: 0 }}>
            Nenhum horário livre no momento. Seu mentor abre novos horários com frequência.
          </p>
        ) : (
          agruparPorDia(livres).map((g) => {
            const cheio = usadosNoMes(g.dia) >= limite
            return (
              <div key={chaveDoDia(g.dia)} className="grupo-dia">
                <h3 className="grupo-titulo">{diaPorExtenso(g.dia)}</h3>
                <div className="vagas">
                  {g.itens.map((a) =>
                    reservando === a.id ? (
                      <form
                        key={a.id}
                        className="vaga-form"
                        onSubmit={(e) => { e.preventDefault(); confirmarReserva(a) }}
                      >
                        <strong>{faixaHorario(a)}</strong>
                        <input
                          autoFocus
                          value={tema}
                          maxLength={200}
                          onChange={(e) => setTema(e.target.value)}
                          placeholder="O que quer ver? (opcional)"
                        />
                        <div className="linha-botoes" style={{ marginTop: 0 }}>
                          <button type="button" className="botao fantasma pequeno" onClick={() => { setReservando(null); setTema('') }}>Voltar</button>
                          <button className="botao primario pequeno" disabled={ocupado}>{ocupado ? 'Reservando…' : 'Confirmar'}</button>
                        </div>
                      </form>
                    ) : (
                      <button
                        key={a.id}
                        className="vaga"
                        disabled={cheio}
                        title={cheio ? `Limite de ${limite} atendimentos neste mês atingido` : 'Reservar este horário'}
                        onClick={() => { setReservando(a.id); setTema(''); setAviso('') }}
                      >
                        {faixaHorario(a)}
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
