import { Fragment, useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { FONTE, QUADRANTES, CAI_MUITO, ERRA_MUITO, analisarErros, porProvaLegivel } from './incidencia'

const nomeArea = (k) => AREAS.find((a) => a.chave === k)?.nome ?? k
const PERGUNTAS_PRONTAS = ['O que eu estudo hoje?', 'Monte meu plano desta semana', 'Tenho só 1 hora hoje. O que faço?']
const quando = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Pontos({ alunoId, aluno, ehMentor, onIrCaderno }) {
  const [erros, setErros] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [verTodosSemErro, setVerTodosSemErro] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('erros').select('area, materia, assunto, dominado').eq('aluno_id', alunoId)
    if (error) setErro('Não foi possível carregar o caderno de erros.')
    else {
      setErro('')
      setErros(data ?? [])
    }
    setCarregando(false)
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const { itens, semErro } = analisarErros(erros)
  const maxPrioridade = Math.max(0.01, ...itens.map((i) => i.prioridade))
  const doQuadrante = (q) => itens.filter((i) => i.quadrante === q)
  const primeiroNome = (aluno?.nome || '').split(' ')[0]

  return (
    <section className="secao pontos">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>🎯 Onde estão {ehMentor ? `os pontos de ${primeiroNome || 'seu aluno'}` : 'seus pontos'}</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            Cruza o caderno de erros com o quanto cada assunto cai no ENEM. Primeiro o que cai muito e {ehMentor ? 'ele erra' : 'você erra'} muito.
          </p>
        </div>
      </div>

      <PergunteAoClaude alunoId={alunoId} ehMentor={ehMentor} temErros={erros.length > 0} />

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : erros.length === 0 ? (
        <div className="cartao vazio">
          <h2>O caderno de erros ainda está vazio</h2>
          <p>
            Cada erro registrado no caderno entra aqui, cruzado com a incidência no ENEM. Quanto mais {ehMentor ? 'o aluno registra' : 'você registra'}, mais certeira fica a lista.
          </p>
          {onIrCaderno && <button className="botao primario" onClick={onIrCaderno}>Abrir o caderno de erros</button>}
        </div>
      ) : (
        <>
          <div className="matriz-pontos" aria-label="Resumo">
            <span />
            <b className="matriz-rotulo">Erra muito</b>
            <b className="matriz-rotulo">Erra pouco</b>
            <b className="matriz-rotulo lateral">Cai muito</b>
            <Celula q="maxima" n={doQuadrante('maxima').length} />
            <Celula q="atencao" n={doQuadrante('atencao').length} />
            <b className="matriz-rotulo lateral">Cai pouco</b>
            <Celula q="depois" n={doQuadrante('depois').length} span />
          </div>
          <p className="suave pequeno" style={{ margin: '-6px 0 0' }}>
            “Cai muito” = {String(CAI_MUITO).replace('.', ',')} questão por prova ou mais, em média. “Erra muito” = {ERRA_MUITO} erros ou mais ainda não dominados (erros já dominados pesam menos). Fonte da incidência: {FONTE}.
          </p>

          {['maxima', 'atencao', 'depois', 'fora'].map((q) => {
            const lista = doQuadrante(q)
            if (!lista.length) return null
            const info = QUADRANTES[q]
            return (
              <div key={q} className="cartao grupo-pontos" style={{ '--cor': info.cor }}>
                <h2>{info.icone} {info.nome} <span className="suave pequeno" style={{ fontWeight: 500 }}>· {info.desc}</span></h2>
                {q === 'depois' && <p className="suave pequeno">Esses você erra, mas o ENEM cobra pouco. Não ignore, mas não deixe tomar o lugar dos de cima.</p>}
                {q === 'fora' && <p className="suave pequeno">Não estão entre os mais cobrados do Raio X, ou o nome escrito no caderno não foi reconhecido. Usar os nomes sugeridos no caderno de erros ajuda.</p>}
                <ul className="lista-pontos">
                  {lista.map((i) => (
                    <li key={i.id}>
                      <div className="ponto-topo">
                        <strong>{i.nome}</strong>
                        <span className="suave pequeno">{i.materia || nomeArea(i.area)}</span>
                      </div>
                      <div className="ponto-numeros pequeno">
                        <span>📊 {porProvaLegivel(i.porProva)}</span>
                        <span>❌ {i.abertos} {i.abertos === 1 ? 'erro aberto' : 'erros abertos'}{i.dominados ? ` · ✓ ${i.dominados} dominado${i.dominados > 1 ? 's' : ''}` : ''}</span>
                      </div>
                      {q !== 'fora' && (
                        <span className="barra" aria-hidden="true"><i style={{ width: `${(i.prioridade / maxPrioridade) * 100}%`, background: 'var(--cor)' }} /></span>
                      )}
                      {i.exemplos.length > 0 && i.exemplos.some((x) => x !== i.nome) && (
                        <span className="suave pequeno">No caderno: {i.exemplos.join(' · ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {semErro.length > 0 && (
            <div className="cartao">
              <h2>📌 Caem muito e não têm erro registrado</h2>
              <p className="suave pequeno">Pode ser que {ehMentor ? 'ele já domine' : 'você já domine'}, ou que ainda não tenha treinado. Vale fazer algumas questões para conferir.</p>
              <div className="chips-pontos">
                {(verTodosSemErro ? semErro : semErro.slice(0, 8)).map((a) => (
                  <span key={a.id} className="chip">{a.nome} <span className="suave">· {porProvaLegivel(a.porProva)}</span></span>
                ))}
              </div>
              {semErro.length > 8 && (
                <button className="link" style={{ marginTop: 10 }} onClick={() => setVerTodosSemErro((v) => !v)}>
                  {verTodosSemErro ? 'mostrar menos' : `ver todos (${semErro.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Celula({ q, n, span }) {
  const info = QUADRANTES[q]
  return (
    <div className="matriz-celula" style={{ '--cor': info.cor, gridColumn: span ? 'span 2' : undefined }}>
      <strong>{info.icone} {n}</strong>
      <span>{info.nome}</span>
    </div>
  )
}

function PergunteAoClaude({ alunoId, ehMentor, temErros }) {
  const [pergunta, setPergunta] = useState('')
  const [respostas, setRespostas] = useState([])
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(null) // id da resposta antiga aberta

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('sugestoes_estudo')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('criado_em', { ascending: false })
      .limit(10)
    setRespostas(data ?? [])
  }, [alunoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function perguntar(texto) {
    const p = (texto ?? pergunta).trim() || PERGUNTAS_PRONTAS[0]
    setErro('')
    setPensando(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const r = await fetch('/api/o-que-estudar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token}` },
        body: JSON.stringify({ aluno_id: alunoId, pergunta: p }),
      })
      const corpo = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(corpo.erro || 'Não foi possível falar com o Claude agora.')
      setPergunta('')
      setAberta(null)
      await carregar()
    } catch (e) {
      setErro(e.message)
    }
    setPensando(false)
  }

  const [ultima, ...antigas] = respostas

  return (
    <div className="cartao pergunte-claude">
      <h2>🤖 Pergunte ao Claude: o que estudar?</h2>
      <p className="suave pequeno">
        O Claude olha {ehMentor ? 'o caderno de erros do aluno' : 'seu caderno de erros'}, a incidência de cada assunto no ENEM, o horário de estudos e os simulados, e monta a resposta.
        {!temErros && ' Com o caderno de erros vazio, a resposta fica bem genérica.'}
      </p>
      <div className="chips-pontos">
        {PERGUNTAS_PRONTAS.map((p) => (
          <button key={p} className="filtro" disabled={pensando} onClick={() => perguntar(p)}>{p}</button>
        ))}
      </div>
      <form className="pergunta-linha" onSubmit={(e) => { e.preventDefault(); perguntar() }}>
        <input value={pergunta} maxLength={500} onChange={(e) => setPergunta(e.target.value)} placeholder="Ou escreva sua pergunta. Ex.: vale a pena estudar óptica agora?" disabled={pensando} />
        <button className="botao primario" disabled={pensando}>{pensando ? 'Pensando…' : 'Perguntar'}</button>
      </form>
      {pensando && <p className="suave pequeno">O Claude está analisando os dados… pode levar até 1 minuto.</p>}
      {erro && <p className="erro">{erro}</p>}

      {ultima && (
        <div className="resposta-claude">
          <p className="suave pequeno" style={{ margin: 0 }}>“{ultima.pergunta}” · {quando(ultima.criado_em)}</p>
          <TextoFormatado texto={ultima.resposta} />
        </div>
      )}

      {antigas.length > 0 && (
        <details className="respostas-antigas">
          <summary className="suave pequeno">Perguntas anteriores ({antigas.length})</summary>
          {antigas.map((r) => (
            <div key={r.id} className="resposta-antiga">
              <button className="link" onClick={() => setAberta(aberta === r.id ? null : r.id)}>
                {quando(r.criado_em)} · “{r.pergunta}”
              </button>
              {aberta === r.id && <div className="resposta-claude"><TextoFormatado texto={r.resposta} /></div>}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}

// Mostra o texto do Claude: títulos (##), listas (- ou 1.) e **negrito**
function TextoFormatado({ texto }) {
  const negrito = (linha) =>
    linha.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (/^\*\*[^*]+\*\*$/.test(p) ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>))
  const blocos = []
  let lista = null
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim()
    const item = linha.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) {
      if (!lista) blocos.push((lista = { tipo: 'lista', itens: [] }))
      lista.itens.push(item[1])
      continue
    }
    lista = null
    if (!linha) continue
    const titulo = linha.match(/^#{1,4}\s+(.*)$/)
    blocos.push(titulo ? { tipo: 'titulo', texto: titulo[1] } : { tipo: 'p', texto: linha })
  }
  return blocos.map((b, i) =>
    b.tipo === 'lista' ? (
      <ul key={i}>{b.itens.map((t, k) => <li key={k}>{negrito(t)}</li>)}</ul>
    ) : b.tipo === 'titulo' ? (
      <h3 key={i}>{negrito(b.texto)}</h3>
    ) : (
      <p key={i}>{negrito(b.texto)}</p>
    )
  )
}
