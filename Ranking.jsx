import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import Avatar from './Avatar'
import { COMO_GANHAR, conquistas, progressoNivel, sequenciaAtual, nivelDe } from './xp'

function inicioDaSemana() {
  const d = new Date()
  const dia = (d.getDay() + 6) % 7 // segunda = 0
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - dia)
  return d
}
function inicioDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function inicioDoSemestre() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1)
}
function inicioDoAno() {
  return new Date(new Date().getFullYear(), 0, 1)
}
const PERIODOS = [['semana', 'Semana'], ['mes', 'Mês'], ['semestre', 'Semestre'], ['ano', 'Ano'], ['geral', 'Geral']]
const DESDE = { semana: inicioDaSemana, mes: inicioDoMes, semestre: inicioDoSemestre, ano: inicioDoAno }
const nomeMes = (iso) => {
  const t = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function Ranking({ perfil, ehMentor }) {
  const [periodo, setPeriodo] = useState('semana')
  const [lista, setLista] = useState(null)
  const [eventos, setEventos] = useState([])
  const [erro, setErro] = useState('')
  const [campeoes, setCampeoes] = useState([])

  useEffect(() => {
    supabase.rpc('alunos_do_mes', { p_meses: 12 }).then(({ data }) => setCampeoes(data ?? []))
  }, [])

  useEffect(() => {
    const desde = DESDE[periodo] ? DESDE[periodo]() : null
    setLista(null)
    supabase.rpc('ranking_xp', { p_desde: desde ? desde.toISOString() : null }).then(({ data, error }) => {
      if (error) setErro('O ranking ainda não foi ativado no banco (arquivo xp.sql).')
      setLista(data ?? [])
    })
  }, [periodo])

  useEffect(() => {
    if (ehMentor) return
    ;(async () => {
      let tudo = []
      for (let de = 0; ; de += 1000) {
        const { data } = await supabase.from('xp_eventos').select('tipo, chave, descricao, xp, criado_em').eq('aluno_id', perfil.id).order('criado_em', { ascending: false }).range(de, de + 999)
        tudo = tudo.concat(data ?? [])
        if (!data || data.length < 1000) break
      }
      setEventos(tudo)
    })()
  }, [perfil.id, ehMentor])

  const total = useMemo(() => eventos.reduce((s, e) => s + e.xp, 0), [eventos])
  const prog = progressoNivel(total)
  const seq = useMemo(() => sequenciaAtual(eventos), [eventos])
  const hojeXp = useMemo(() => {
    const h = new Date().toDateString()
    return eventos.filter((e) => new Date(e.criado_em).toDateString() === h).reduce((s, e) => s + e.xp, 0)
  }, [eventos])
  const posicao = lista ? lista.findIndex((l) => l.aluno_id === perfil.id) + 1 : 0
  const medalhas = conquistas(eventos, total)
  const top = (lista ?? []).slice(0, 3)
  const ordemPodio = [top[1], top[0], top[2]]

  return (
    <section className="secao rk">
      {erro && <p className="erro">{erro}</p>}

      {!ehMentor && (
        <div className="cartao rk-eu">
          <div className="rk-nivel">
            <span className="rk-nivel-num">{prog.nivel}</span>
            <span className="suave pequeno">nível</span>
          </div>
          <div className="rk-eu-info">
            <strong>{prog.titulo}</strong>
            <div className="rk-barra"><span style={{ width: `${prog.pct}%` }} /></div>
            <span className="suave pequeno">{total.toLocaleString('pt-BR')} XP · faltam {prog.falta.toLocaleString('pt-BR')} XP para o nível {prog.nivel + 1}</span>
          </div>
          <div className="rk-stats">
            <div><b>{posicao ? `${posicao}º` : '–'}</b><span>no ranking ({PERIODOS.find((p) => p[0] === periodo)[1].toLowerCase()})</span></div>
            <div><b>🔥 {seq}</b><span>dias seguidos</span></div>
            <div><b>+{hojeXp}</b><span>XP hoje</span></div>
          </div>
        </div>
      )}

      {campeoes.length > 0 && <AlunoDoMes campeoes={campeoes} meuId={perfil.id} />}

      <div className="cartao rk-bloco">
        <div className="rk-topo">
          <h3>🏆 Ranking da Assessoria J&C</h3>
          <div className="rk-periodos">
            {PERIODOS.map(([k, n]) => (
              <button key={k} className={periodo === k ? 'botao pequeno primario' : 'botao pequeno'} onClick={() => setPeriodo(k)}>{n}</button>
            ))}
          </div>
        </div>
        {!lista ? <p className="suave">Carregando…</p> : !lista.length ? <p className="suave">Ainda não há alunos no ranking.</p> : (
          <>
            <div className="rk-podio">
              {ordemPodio.map((l, i) => l && (
                <div key={l.aluno_id} className={`rk-degrau rk-d${[2, 1, 3][i]} ${l.aluno_id === perfil.id ? 'eu' : ''}`}>
                  <span className="rk-coroa">{['🥈', '🥇', '🥉'][i]}</span>
                  <Avatar src={l.foto_url} nome={l.nome} tamanho={[56, 72, 52][i]} />
                  <strong>{l.nome}</strong>
                  <span className="rk-xp">{Number(l.xp).toLocaleString('pt-BR')} XP</span>
                  <div className="rk-bloco-podio">{[2, 1, 3][i]}º</div>
                </div>
              ))}
            </div>
            <ol className="rk-lista">
              {lista.map((l, i) => (
                <li key={l.aluno_id} className={l.aluno_id === perfil.id ? 'eu' : ''}>
                  <span className="rk-pos">{i + 1}</span>
                  <Avatar src={l.foto_url} nome={l.nome} tamanho={34} />
                  <span className="rk-nome">{l.nome}{l.aluno_id === perfil.id ? ' (você)' : ''}</span>
                  <span className="selo">Nv {nivelDe(Number(l.xp_total))}</span>
                  <b className="rk-xp">{Number(l.xp).toLocaleString('pt-BR')} XP</b>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {!ehMentor && (
        <div className="cartao rk-bloco">
          <h3>🎖️ Conquistas</h3>
          <div className="rk-medalhas">
            {medalhas.map(([e, nome, desc, ok]) => (
              <div key={nome} className={ok ? 'rk-medalha ok' : 'rk-medalha'} title={desc}>
                <span>{ok ? e : '🔒'}</span>
                <strong>{nome}</strong>
                <small>{desc}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cartao rk-bloco">
        <h3>⚡ Como ganhar XP</h3>
        <div className="rk-regras">
          {COMO_GANHAR.map(([e, t, d]) => (
            <div key={t}><span>{e}</span><div><strong>{t}</strong><small>{d}</small></div></div>
          ))}
        </div>
      </div>

      {!ehMentor && eventos.length > 0 && (
        <div className="cartao rk-bloco">
          <h3>Últimos XP</h3>
          <ul className="rk-ultimos">
            {eventos.slice(0, 12).map((e, i) => (
              <li key={i}><span>{e.descricao}</span><span className="suave pequeno">{new Date(e.criado_em).toLocaleDateString('pt-BR')}</span><b>+{e.xp}</b></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// Aluno do mês: o do mês passado em destaque, o líder do mês atual e a galeria do ano
function AlunoDoMes({ campeoes, meuId }) {
  const atual = new Date()
  const chaveAtual = `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}-01`
  const lider = campeoes.find((c) => c.mes === chaveAtual)
  const passados = campeoes.filter((c) => c.mes !== chaveAtual)
  const ultimo = passados[0]
  return (
    <div className="cartao rk-bloco rk-mes">
      <h3>👑 Aluno do mês</h3>
      <div className="rk-mes-destaques">
        {ultimo && (
          <div className={ultimo.aluno_id === meuId ? 'rk-campeao eu' : 'rk-campeao'}>
            <span className="rk-campeao-faixa">Aluno do mês · {nomeMes(ultimo.mes)}</span>
            <Avatar src={ultimo.foto_url} nome={ultimo.nome} tamanho={76} />
            <strong>{ultimo.nome}{ultimo.aluno_id === meuId ? ' (você!)' : ''}</strong>
            <span>{Number(ultimo.xp).toLocaleString('pt-BR')} XP no mês</span>
          </div>
        )}
        {lider && (
          <div className={lider.aluno_id === meuId ? 'rk-lider eu' : 'rk-lider'}>
            <span className="suave pequeno">Liderando {nomeMes(lider.mes).split(' ')[0].toLowerCase()} até agora</span>
            <div className="rk-lider-linha">
              <Avatar src={lider.foto_url} nome={lider.nome} tamanho={44} />
              <div><strong>{lider.nome}</strong><span className="suave pequeno">{Number(lider.xp).toLocaleString('pt-BR')} XP</span></div>
            </div>
            <span className="pequeno">O mês fecha no dia 1º. Ainda dá tempo de passar! 🔥</span>
          </div>
        )}
      </div>
      {passados.length > 1 && (
        <div className="rk-galeria">
          {passados.map((c) => (
            <div key={c.mes} className={c.aluno_id === meuId ? 'rk-galeria-item eu' : 'rk-galeria-item'}>
              <Avatar src={c.foto_url} nome={c.nome} tamanho={34} />
              <div><strong>{c.nome}</strong><span className="suave pequeno">{nomeMes(c.mes)} · {Number(c.xp).toLocaleString('pt-BR')} XP</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
