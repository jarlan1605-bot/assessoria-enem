import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { reduzirImagem } from './foto'
import Avatar from './Avatar'

const PASTA = 'redacoes'
export const COMPETENCIAS = [
  { k: 'c1', nome: 'C1', desc: 'Norma culta da língua escrita' },
  { k: 'c2', nome: 'C2', desc: 'Compreensão do tema e tipo textual' },
  { k: 'c3', nome: 'C3', desc: 'Seleção e organização dos argumentos' },
  { k: 'c4', nome: 'C4', desc: 'Coesão e mecanismos linguísticos' },
  { k: 'c5', nome: 'C5', desc: 'Proposta de intervenção' },
]
const NOTAS = [0, 40, 80, 120, 160, 200]
export const totalRedacao = (r) => COMPETENCIAS.reduce((t, c) => t + (r[c.k] ?? 0), 0)
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const nomeSeguro = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-60)

export default function Redacao({ alunoId, ehMentor, alunos = [] }) {
  const [lista, setLista] = useState([])
  const [fila, setFila] = useState([]) // mentor: redações esperando correção de todos os seus alunos
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [corrigindo, setCorrigindo] = useState(null)
  const [aberta, setAberta] = useState(null)

  const carregar = useCallback(async () => {
    const consultas = [
      supabase.from('redacoes').select('*').eq('aluno_id', alunoId).order('enviada_em', { ascending: false }),
    ]
    if (ehMentor) consultas.push(supabase.from('redacoes').select('*').eq('status', 'enviada').order('enviada_em'))
    const [r1, r2] = await Promise.all(consultas)
    if (r1.error) setErro('Não foi possível carregar as redações. O arquivo extras.sql já foi rodado no Supabase?')
    else {
      setErro('')
      setLista(r1.data ?? [])
    }
    if (r2) setFila(r2.data ?? [])
    setCarregando(false)
  }, [alunoId, ehMentor])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeAluno = (id) => alunos.find((a) => a.id === id)?.nome || 'Aluno'
  const fotoAluno = (id) => alunos.find((a) => a.id === id)?.foto_url

  const corrigidas = lista.filter((r) => r.status === 'corrigida')
  const mediaGeral = corrigidas.length ? Math.round(corrigidas.reduce((t, r) => t + totalRedacao(r), 0) / corrigidas.length) : null
  const mediaComp = COMPETENCIAS.map((c) => ({
    ...c,
    media: corrigidas.length ? corrigidas.reduce((t, r) => t + (r[c.k] ?? 0), 0) / corrigidas.length : null,
  }))
  const piorComp = corrigidas.length ? [...mediaComp].sort((a, b) => a.media - b.media)[0] : null

  async function apagar(r) {
    if (!confirm('Apagar esta redação enviada?')) return
    const { error } = await supabase.from('redacoes').delete().eq('id', r.id)
    if (error) return setErro(error.message)
    const caminhos = (r.arquivos || []).map((a) => a.caminho)
    if (caminhos.length) supabase.storage.from(PASTA).remove(caminhos)
    carregar()
  }

  if (carregando) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Redação</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            {ehMentor ? 'Corrija pelas 5 competências do ENEM. A nota vai direto para a Evolução do aluno.' : 'Envie a foto ou o PDF da sua redação. Seu mentor corrige pelas 5 competências do ENEM.'}
          </p>
        </div>
        {!enviando && !ehMentor && <button className="botao primario" onClick={() => setEnviando(true)}>+ Enviar redação</button>}
        {!enviando && ehMentor && <button className="botao" onClick={() => setEnviando(true)}>+ Enviar pelo aluno</button>}
      </div>

      {erro && <p className="erro">{erro}</p>}

      {enviando && <FormEnvio alunoId={alunoId} onFechar={() => setEnviando(false)} onEnviado={() => { setEnviando(false); carregar() }} />}

      {ehMentor && fila.length > 0 && (
        <div className="cartao fila-correcao">
          <h2>📥 Aguardando correção ({fila.length})</h2>
          {fila.map((r) => (
            <button key={r.id} className="fila-item" onClick={() => setCorrigindo(r)}>
              <Avatar src={fotoAluno(r.aluno_id)} nome={nomeAluno(r.aluno_id)} tamanho={34} />
              <span className="fila-texto">
                <strong>{nomeAluno(r.aluno_id)}</strong>
                <span className="suave pequeno">{r.tema || 'Sem tema'} · enviada em {dataBR(r.enviada_em)}</span>
              </span>
              <span className="botao primario pequeno">Corrigir</span>
            </button>
          ))}
        </div>
      )}

      {corrigindo && (
        <Correcao
          redacao={corrigindo}
          nomeAluno={nomeAluno(corrigindo.aluno_id)}
          onFechar={() => setCorrigindo(null)}
          onSalvo={() => { setCorrigindo(null); carregar() }}
        />
      )}

      {corrigidas.length > 0 && (
        <div className="graficos">
          <div className="cartao">
            <h2>Média por competência</h2>
            <div className="barras-h">
              {mediaComp.map((c) => (
                <div key={c.k} className="barra-h" title={c.desc}>
                  <span className="barra-h-nome">{c.nome} · {c.desc.split(' ')[0]}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${(c.media / 200) * 100}%`, background: '#7048e8' }} /></span>
                  <span className="barra-h-num">{Math.round(c.media)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="cartao mini" style={{ '--cor': '#7048e8' }}>
            <span className="mini-titulo">Média das redações corrigidas</span>
            <strong className="mini-numero">{mediaGeral}</strong>
            <span className="suave pequeno">{corrigidas.length} {corrigidas.length === 1 ? 'redação' : 'redações'} · melhor {Math.max(...corrigidas.map(totalRedacao))}</span>
            {piorComp && <p className="pequeno" style={{ marginTop: 10, marginBottom: 0 }}>🎯 Para subir mais rápido: <b>{piorComp.nome}</b> ({piorComp.desc.toLowerCase()}).</p>}
          </div>
        </div>
      )}

      <div className="cartao">
        <h2>{ehMentor ? 'Redações deste aluno' : 'Suas redações'}</h2>
        {lista.length === 0 ? (
          <p className="suave" style={{ margin: 0 }}>{ehMentor ? 'Este aluno ainda não enviou redações.' : 'Nenhuma redação enviada ainda.'}</p>
        ) : (
          lista.map((r) => (
            <div key={r.id} className="redacao-item">
              <button className="redacao-linha" onClick={() => setAberta(aberta === r.id ? null : r.id)} aria-expanded={aberta === r.id}>
                <span className={r.status === 'corrigida' ? 'redacao-nota' : 'redacao-nota pendente'}>{r.status === 'corrigida' ? totalRedacao(r) : '⏳'}</span>
                <span className="fila-texto">
                  <strong>{r.tema || 'Sem tema'}</strong>
                  <span className="suave pequeno">
                    Enviada em {dataBR(r.enviada_em)} · {r.status === 'corrigida' ? `corrigida em ${dataBR(r.corrigida_em)}` : 'aguardando correção'}
                  </span>
                </span>
                <span className="seta-abrir" aria-hidden="true">{aberta === r.id ? '▴' : '▾'}</span>
              </button>
              {aberta === r.id && (
                <div className="redacao-detalhe">
                  <Arquivos arquivos={r.arquivos} />
                  {r.status === 'corrigida' && (
                    <>
                      <div className="comp-grade">
                        {COMPETENCIAS.map((c) => (
                          <div key={c.k} className="comp-item" title={c.desc}>
                            <span className="comp-nome">{c.nome}</span>
                            <strong>{r[c.k]}</strong>
                            <span className="comp-trilho"><i style={{ width: `${(r[c.k] / 200) * 100}%` }} /></span>
                            <span className="suave pequeno">{c.desc}</span>
                          </div>
                        ))}
                      </div>
                      {r.comentario && <p className="redacao-comentario">💬 {r.comentario}</p>}
                    </>
                  )}
                  <div className="post-acoes">
                    {ehMentor && <button className="link" onClick={() => setCorrigindo(r)}>{r.status === 'corrigida' ? 'editar correção' : 'corrigir'}</button>}
                    {(ehMentor || r.status === 'enviada') && <button className="link perigo" onClick={() => apagar(r)}>apagar</button>}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function Arquivos({ arquivos }) {
  const [urls, setUrls] = useState({})
  useEffect(() => {
    const caminhos = (arquivos || []).map((a) => a.caminho)
    if (!caminhos.length) return
    supabase.storage.from(PASTA).createSignedUrls(caminhos, 3600).then(({ data }) => {
      const m = {}
      ;(data ?? []).forEach((u) => { if (u.signedUrl) m[u.path] = u.signedUrl })
      setUrls(m)
    })
  }, [arquivos])
  if (!arquivos?.length) return null
  return (
    <div className="redacao-arquivos">
      {arquivos.map((a) =>
        /^image\//.test(a.tipo) ? (
          <a key={a.caminho} href={urls[a.caminho]} target="_blank" rel="noreferrer" className="redacao-img">
            {urls[a.caminho] ? <img src={urls[a.caminho]} alt={a.nome} /> : <span className="suave pequeno">carregando…</span>}
          </a>
        ) : (
          <a key={a.caminho} href={urls[a.caminho]} target="_blank" rel="noreferrer" className="anexo" style={{ '--cor': '#c2255c' }}>
            <span className="anexo-icone">PDF</span>
            <span className="anexo-texto"><strong>{a.nome}</strong><span className="suave pequeno">abrir</span></span>
          </a>
        )
      )}
    </div>
  )
}

function FormEnvio({ alunoId, onFechar, onEnviado }) {
  const [tema, setTema] = useState('')
  const [arquivos, setArquivos] = useState([])
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const seletor = useRef(null)

  async function enviar(e) {
    e.preventDefault()
    if (!arquivos.length) return setErro('Anexe a foto ou o PDF da redação.')
    setErro('')
    const pasta = `${alunoId}/${crypto.randomUUID()}`
    const enviados = []
    for (let i = 0; i < arquivos.length; i++) {
      setEstado(`Enviando ${i + 1} de ${arquivos.length}…`)
      let f = arquivos[i]
      try { f = await reduzirImagem(f) } catch { /* envia como está */ }
      const caminho = `${pasta}/${i + 1}-${nomeSeguro(f.name)}`
      const { error } = await supabase.storage.from(PASTA).upload(caminho, f, { contentType: f.type })
      if (error) {
        if (enviados.length) supabase.storage.from(PASTA).remove(enviados.map((x) => x.caminho))
        setEstado('')
        return setErro('Não foi possível enviar: ' + error.message)
      }
      enviados.push({ nome: f.name, caminho, tipo: f.type })
    }
    setEstado('Salvando…')
    const { error } = await supabase.from('redacoes').insert({ aluno_id: alunoId, tema: tema.trim(), arquivos: enviados })
    setEstado('')
    if (error) {
      supabase.storage.from(PASTA).remove(enviados.map((x) => x.caminho))
      return setErro('Não foi possível salvar: ' + error.message)
    }
    onEnviado()
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      <h2>Enviar redação</h2>
      <div className="form-coluna">
        <label>
          Tema
          <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: Desafios para a valorização de comunidades tradicionais" maxLength={200} />
        </label>
      </div>
      <p className="rotulo-campo" style={{ marginTop: 14 }}>Foto(s) da folha ou PDF — até 3 arquivos</p>
      <div className="anexos-edicao">
        {arquivos.map((f, i) => (
          <span key={i} className="chip chip-novo">
            📄 {f.name}
            <button type="button" onClick={() => setArquivos((l) => l.filter((_, k) => k !== i))} aria-label="Remover">✕</button>
          </span>
        ))}
        <input ref={seletor} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { setArquivos((l) => [...l, ...Array.from(e.target.files || [])].slice(0, 3)); e.target.value = '' }} />
        {arquivos.length < 3 && <button type="button" className="botao fantasma pequeno" onClick={() => seletor.current?.click()}>📷 Tirar foto ou escolher arquivo</button>}
      </div>
      <p className="suave pequeno" style={{ marginTop: 8 }}>Dica: foto de cima, com boa luz e a folha inteira aparecendo.</p>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar} disabled={!!estado}>Cancelar</button>
        <button className="botao primario" disabled={!!estado}>{estado || 'Enviar para correção'}</button>
      </div>
    </form>
  )
}

function Correcao({ redacao, nomeAluno, onFechar, onSalvo }) {
  const [notas, setNotas] = useState(() => Object.fromEntries(COMPETENCIAS.map((c) => [c.k, redacao[c.k] ?? 120])))
  const [comentario, setComentario] = useState(redacao.comentario || '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const total = COMPETENCIAS.reduce((t, c) => t + notas[c.k], 0)

  async function salvar() {
    setSalvando(true)
    const { error } = await supabase
      .from('redacoes')
      .update({ ...notas, comentario: comentario.trim(), status: 'corrigida' })
      .eq('id', redacao.id)
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    onSalvo()
  }

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <div className="cartao modal modal-correcao" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>Corrigir — {nomeAluno}</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <p className="suave pequeno">{redacao.tema || 'Sem tema'}</p>
        <div className="correcao-grade">
          <div className="correcao-arquivos"><Arquivos arquivos={redacao.arquivos} /></div>
          <div>
            {COMPETENCIAS.map((c) => (
              <div key={c.k} className="correcao-comp">
                <span><b>{c.nome}</b> <span className="suave pequeno">{c.desc}</span></span>
                <div className="notas-op">
                  {NOTAS.map((n) => (
                    <button key={n} type="button" className={notas[c.k] === n ? 'nota-op ativo' : 'nota-op'} onClick={() => setNotas({ ...notas, [c.k]: n })}>{n}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="correcao-total">Nota final: <strong>{total}</strong></div>
            <label>
              Comentário para o aluno
              <textarea rows="4" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="O que ficou bom e o que melhorar na próxima" />
            </label>
            {erro && <p className="erro">{erro}</p>}
            <div className="linha-botoes">
              <button className="botao fantasma" onClick={onFechar}>Cancelar</button>
              <button className="botao primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar correção'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
