import { useMemo, useState } from 'react'
import { AREAS } from './constants'
import Avatar from './Avatar'
import { primeirasRespostas, minSeg, corArea } from './questoes-util'
import { hojeISO, somarDias } from './agenda'

const pct = (a, n) => (n ? Math.round((a / n) * 100) : null)
const corPct = (p) => (p === null ? '#868e96' : p >= 70 ? '#2f9e44' : p >= 50 ? '#e67700' : '#e03131')

// Resume as respostas de UM aluno (vale a 1ª tentativa de cada questão)
function resumir(respostas, porId) {
  const primeiras = [...primeirasRespostas(respostas).values()].filter((r) => porId.get(r.questao_id)?.gabarito)
  const total = primeiras.length
  const acertos = primeiras.filter((r) => r.correta).length
  const area = {}
  const materia = {}
  const assunto = {}
  let tempo = 0
  let comTempo = 0
  for (const r of primeiras) {
    const q = porId.get(r.questao_id)
    const add = (obj, k, extra) => {
      obj[k] ??= { n: 0, a: 0, ...extra }
      obj[k].n++
      if (r.correta) obj[k].a++
    }
    add(area, q.area)
    if (q.materia) add(materia, `${q.area}|${q.materia}`, { area: q.area, nome: q.materia })
    if (q.assunto) add(assunto, `${q.area}|${q.assunto}`, { area: q.area, nome: q.assunto, materia: q.materia })
    if (r.tempo_seg) { tempo += r.tempo_seg; comTempo++ }
  }
  const semana = somarDias(hojeISO(), -6)
  return {
    total, acertos, area,
    materias: Object.values(materia).sort((x, y) => y.n - x.n),
    fracos: Object.values(assunto).filter((x) => x.n >= 2).sort((x, y) => x.a / x.n - y.a / y.n || y.n - x.n).slice(0, 8),
    tempoMedio: comTempo ? tempo / comTempo : null,
    semana: respostas.filter((r) => r.criado_em.slice(0, 10) >= semana).length,
    ultima: respostas.length ? respostas[respostas.length - 1].criado_em : null,
  }
}

function Painel({ r, ehMentor }) {
  if (!r.total) {
    return (
      <div className="cartao vazio">
        <h2>Nenhuma questão resolvida ainda</h2>
        <p>{ehMentor ? 'Quando o aluno resolver questões, o desempenho aparece aqui.' : 'Resolva questões na aba Resolver ou faça um Treino. Seu desempenho aparece aqui.'}</p>
      </div>
    )
  }
  return (
    <>
      <div className="resumo-cartoes">
        <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}>
          <span className="mini-titulo">Questões feitas</span>
          <strong className="mini-numero">{r.total}</strong>
          <span className="suave pequeno">{r.semana} respostas nos últimos 7 dias</span>
        </div>
        <div className="cartao mini" style={{ '--cor': corPct(pct(r.acertos, r.total)) }}>
          <span className="mini-titulo">Acertos</span>
          <strong className="mini-numero">{pct(r.acertos, r.total)}%</strong>
          <span className="suave pequeno">{r.acertos} de {r.total} na 1ª tentativa</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#e67700' }}>
          <span className="mini-titulo">Tempo médio</span>
          <strong className="mini-numero">{r.tempoMedio ? minSeg(r.tempoMedio) : '—'}</strong>
          <span className="suave pequeno">{r.tempoMedio ? (r.tempoMedio > 180 ? 'acima dos 3 min do ENEM' : 'dentro dos 3 min do ENEM') : 'medido nos treinos'}</span>
        </div>
      </div>

      <div className="graficos">
        <div className="cartao">
          <h2>Acertos por área</h2>
          <div className="barras-h">
            {AREAS.map((a) => {
              const x = r.area[a.chave]
              return (
                <div key={a.chave} className="barra-h">
                  <span className="barra-h-nome">{a.nome}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${x ? pct(x.a, x.n) : 0}%`, background: a.cor }} /></span>
                  <span className="barra-h-num">{x ? `${pct(x.a, x.n)}%` : '—'}</span>
                </div>
              )
            })}
          </div>
          <p className="suave pequeno" style={{ marginBottom: 0 }}>
            {AREAS.map((a) => r.area[a.chave] && `${a.curto}: ${r.area[a.chave].a}/${r.area[a.chave].n}`).filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="cartao">
          <h2>Assuntos para reforçar</h2>
          {r.fracos.length ? (
            <div className="barras-h">
              {r.fracos.map((x) => (
                <div key={x.area + x.nome} className="barra-h">
                  <span className="barra-h-nome" title={`${x.materia ? x.materia + ' · ' : ''}${x.nome}`}>{x.nome}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${pct(x.a, x.n)}%`, background: corPct(pct(x.a, x.n)) }} /></span>
                  <span className="barra-h-num">{x.a}/{x.n}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="suave pequeno">Aparece quando houver pelo menos 2 questões do mesmo assunto.</p>
          )}
        </div>
      </div>

      {r.materias.length > 0 && (
        <div className="cartao">
          <h2>Por matéria</h2>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Matéria</th><th>Feitas</th><th>Acertos</th><th>%</th></tr></thead>
              <tbody>
                {r.materias.map((m) => (
                  <tr key={m.area + m.nome}>
                    <td><span className="rel-bolinha" style={{ background: corArea(m.area) }} /> {m.nome}</td>
                    <td>{m.n}</td>
                    <td>{m.a}</td>
                    <td style={{ color: corPct(pct(m.a, m.n)), fontWeight: 700 }}>{pct(m.a, m.n)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export default function DesempenhoQuestoes({ indice, respostas, ehMentor, alunos, perfil }) {
  const porId = useMemo(() => new Map(indice.map((q) => [q.id, q])), [indice])
  const [aberto, setAberto] = useState(null)

  const porAluno = useMemo(() => {
    const m = new Map()
    for (const r of respostas) {
      if (!m.has(r.aluno_id)) m.set(r.aluno_id, [])
      m.get(r.aluno_id).push(r)
    }
    return m
  }, [respostas])

  if (!ehMentor) return <Painel r={resumir(respostas, porId)} />

  const linhas = alunos
    .map((a) => ({ a, r: resumir(porAluno.get(a.id) || [], porId) }))
    .sort((x, y) => y.r.total - x.r.total || (x.a.nome || '').localeCompare(y.a.nome || ''))

  if (aberto) {
    const l = linhas.find((x) => x.a.id === aberto)
    return (
      <>
        <div className="cartao seletor">
          <Avatar src={l.a.foto_url} nome={l.a.nome || l.a.email} tamanho={40} />
          <strong>{l.a.nome || l.a.email}</strong>
          <button className="botao fantasma pequeno" onClick={() => setAberto(null)} style={{ marginLeft: 'auto' }}>← Todos os alunos</button>
        </div>
        <Painel r={l.r} ehMentor />
      </>
    )
  }

  return (
    <div className="cartao">
      <h2>Seus alunos no banco de questões</h2>
      <p className="suave pequeno">Conta a 1ª tentativa de cada questão. Toque no aluno para ver os assuntos que ele precisa reforçar.</p>
      {!alunos.length ? (
        <p className="suave">Nenhum aluno ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela q-tabela-alunos">
            <thead>
              <tr>
                <th>Aluno</th><th>Feitas</th><th>7 dias</th><th>Acertos</th>
                {AREAS.map((a) => <th key={a.chave} title={a.nome}>{a.curto}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ a, r }) => (
                <tr key={a.id} onClick={() => setAberto(a.id)} className="linha-clicavel">
                  <td>
                    <span className="q-aluno"><Avatar src={a.foto_url} nome={a.nome || a.email} tamanho={26} /> {a.nome || a.email}</span>
                  </td>
                  <td>{r.total}</td>
                  <td>{r.semana || '—'}</td>
                  <td style={{ color: corPct(pct(r.acertos, r.total)), fontWeight: 700 }}>{r.total ? `${pct(r.acertos, r.total)}%` : '—'}</td>
                  {AREAS.map((ar) => {
                    const x = r.area[ar.chave]
                    return <td key={ar.chave} style={{ color: corPct(x ? pct(x.a, x.n) : null) }}>{x ? `${pct(x.a, x.n)}%` : '—'}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
