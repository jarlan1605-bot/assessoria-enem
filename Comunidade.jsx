import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { NOME_MENTOR } from './constants'
import Avatar from './Avatar'

const PASTA = 'comunidade'
const TIPOS = {
  aviso: { nome: 'Aviso', plural: 'Avisos', icone: '📢', cor: '#1971c2' },
  simulado: { nome: 'Simulado', plural: 'Simulados', icone: '📝', cor: '#c2255c' },
  material: { nome: 'Material', plural: 'Materiais', icone: '📚', cor: '#2f9e44' },
  evento: { nome: 'Evento', plural: 'Eventos', icone: '📅', cor: '#e67700' },
}
const LIMITE_MB = 25

const ehImagem = (a) => /^image\//.test(a.tipo || '') || /\.(jpe?g|png|webp|gif)$/i.test(a.nome)
const tamanhoLegivel = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const nomeSeguro = (n) =>
  n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-90)

function quandoFoi(iso) {
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h}h`
  const dias = Math.round(h / 24)
  if (dias < 7) return dias === 1 ? 'ontem' : `há ${dias} dias`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

// Transforma endereços (https://...) do texto em links clicáveis
function TextoComLinks({ texto }) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g)
  return partes.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    )
  )
}

export default function Comunidade({ ehMentor, fotoMentor }) {
  const [avisos, setAvisos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [editando, setEditando] = useState(null) // null | 'novo' | aviso
  const [miniaturas, setMiniaturas] = useState({})

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('avisos')
      .select('*')
      .order('fixado', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(100)
    if (error) {
      setErro(ehMentor ? 'Não foi possível carregar. Você já rodou o arquivo comunidade.sql no Supabase?' : 'Não foi possível carregar os avisos.')
    } else {
      setErro('')
      setAvisos(data ?? [])
      // Gera endereços temporários para mostrar as imagens anexadas
      const imagens = (data ?? []).flatMap((a) => (a.anexos || []).filter(ehImagem).map((x) => x.caminho))
      if (imagens.length) {
        const { data: urls } = await supabase.storage.from(PASTA).createSignedUrls(imagens, 3600)
        const mapa = {}
        ;(urls ?? []).forEach((u) => { if (u.signedUrl) mapa[u.path] = u.signedUrl })
        setMiniaturas(mapa)
      }
    }
    setCarregando(false)
  }, [ehMentor])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Abre a aba já no clique (senão o celular bloqueia) e só depois coloca o endereço
  async function abrirArquivo(anexo, paraBaixar) {
    const aba = window.open('about:blank', '_blank')
    const { data, error } = await supabase.storage
      .from(PASTA)
      .createSignedUrl(anexo.caminho, 600, paraBaixar ? { download: anexo.nome } : undefined)
    if (error || !data?.signedUrl) {
      aba?.close()
      return setErro('Não foi possível abrir o arquivo.')
    }
    if (aba) aba.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }
  const baixar = (anexo) => abrirArquivo(anexo, true)
  const abrirImagem = (anexo) => abrirArquivo(anexo, false)

  async function alternarFixado(a) {
    const { error } = await supabase.from('avisos').update({ fixado: !a.fixado }).eq('id', a.id)
    if (error) setErro('Não foi possível alterar: ' + error.message)
    else carregar()
  }

  async function apagar(a) {
    if (!confirm(`Apagar a publicação “${a.titulo}”${a.anexos?.length ? ' e os anexos dela' : ''}?`)) return
    const { error } = await supabase.from('avisos').delete().eq('id', a.id)
    if (error) return setErro('Não foi possível apagar: ' + error.message)
    const caminhos = (a.anexos || []).map((x) => x.caminho)
    if (caminhos.length) supabase.storage.from(PASTA).remove(caminhos)
    carregar()
  }

  const visiveis = filtro === 'todos' ? avisos : avisos.filter((a) => a.tipo === filtro)
  const contagem = (t) => avisos.filter((a) => a.tipo === t).length

  return (
    <section className="secao comunidade">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Comunidade</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            {ehMentor ? 'Avisos, simulados e materiais para todos os alunos.' : `Avisos, simulados e materiais do ${NOME_MENTOR}.`}
          </p>
        </div>
        {ehMentor && !editando && (
          <button className="botao primario" onClick={() => setEditando('novo')}>+ Nova publicação</button>
        )}
      </div>

      {ehMentor && editando && (
        <FormAviso
          aviso={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      {avisos.length > 0 && (
        <div className="filtros" role="tablist" aria-label="Filtrar publicações">
          <button className={filtro === 'todos' ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro('todos')}>Todos</button>
          {Object.entries(TIPOS).map(([k, t]) =>
            contagem(k) ? (
              <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>
                {t.icone} {t.plural} <span className="filtro-num">{contagem(k)}</span>
              </button>
            ) : null
          )}
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>
            {ehMentor
              ? 'Nenhuma publicação ainda. Clique em “Nova publicação” para mandar o primeiro aviso.'
              : 'Nenhum aviso por enquanto. Quando seu mentor publicar algo, aparece aqui.'}
          </p>
        </div>
      ) : (
        <div className="feed">
          {visiveis.map((a) => {
            const t = TIPOS[a.tipo] ?? TIPOS.aviso
            const novo = Date.now() - new Date(a.criado_em).getTime() < 3 * 86400000
            const imagens = (a.anexos || []).filter(ehImagem)
            const arquivos = (a.anexos || []).filter((x) => !ehImagem(x))
            return (
              <article key={a.id} className={a.fixado ? 'cartao post fixado' : 'cartao post'} style={{ '--cor': t.cor }}>
                <header className="post-topo">
                  <Avatar src={fotoMentor} nome={NOME_MENTOR} tamanho={38} />
                  <div className="post-autor">
                    <strong>{NOME_MENTOR}</strong>
                    <span className="suave pequeno">
                      {quandoFoi(a.criado_em)}
                      {a.editado_em && ' · editado'}
                    </span>
                  </div>
                  <div className="post-selos">
                    {a.fixado && <span className="selo selo-fixado">📌 Fixado</span>}
                    {novo && <span className="selo selo-novo">Novo</span>}
                    <span className="selo selo-tipo">{t.icone} {t.nome}</span>
                  </div>
                </header>

                <h3 className="post-titulo">{a.titulo}</h3>
                {a.texto && <p className="post-texto"><TextoComLinks texto={a.texto} /></p>}

                {imagens.length > 0 && (
                  <div className={imagens.length === 1 ? 'post-imagens uma' : 'post-imagens'}>
                    {imagens.map((im) => (
                      <button key={im.caminho} className="post-imagem" onClick={() => abrirImagem(im)} aria-label={`Abrir ${im.nome}`}>
                        {miniaturas[im.caminho] ? <img src={miniaturas[im.caminho]} alt={im.nome} loading="lazy" /> : <span className="suave pequeno">{im.nome}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {(arquivos.length > 0 || a.link) && (
                  <div className="post-anexos">
                    {arquivos.map((x) => (
                      <button key={x.caminho} className="anexo" onClick={() => baixar(x)}>
                        <span className="anexo-icone">{/\.pdf$/i.test(x.nome) ? 'PDF' : (x.nome.split('.').pop() || 'ARQ').slice(0, 4).toUpperCase()}</span>
                        <span className="anexo-texto">
                          <strong>{x.nome}</strong>
                          <span className="suave pequeno">{x.tamanho ? tamanhoLegivel(x.tamanho) + ' · ' : ''}baixar</span>
                        </span>
                      </button>
                    ))}
                    {a.link && (
                      <a className="anexo" href={a.link} target="_blank" rel="noreferrer">
                        <span className="anexo-icone">🔗</span>
                        <span className="anexo-texto">
                          <strong>Abrir link</strong>
                          <span className="suave pequeno">{a.link.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</span>
                        </span>
                      </a>
                    )}
                  </div>
                )}

                {ehMentor && (
                  <footer className="post-acoes">
                    <button className="link" onClick={() => alternarFixado(a)}>{a.fixado ? 'desafixar' : 'fixar no topo'}</button>
                    <button className="link" onClick={() => { setEditando(a); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>editar</button>
                    <button className="link perigo" onClick={() => apagar(a)}>apagar</button>
                  </footer>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function FormAviso({ aviso, onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? '')
  const [texto, setTexto] = useState(aviso?.texto ?? '')
  const [tipo, setTipo] = useState(aviso?.tipo ?? 'aviso')
  const [link, setLink] = useState(aviso?.link ?? '')
  const [fixado, setFixado] = useState(aviso?.fixado ?? false)
  const [anexosAtuais, setAnexosAtuais] = useState(aviso?.anexos ?? [])
  const [removidos, setRemovidos] = useState([])
  const [novos, setNovos] = useState([])
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')
  const seletor = useRef(null)

  function adicionarArquivos(e) {
    const lista = Array.from(e.target.files || [])
    e.target.value = ''
    const grandes = lista.filter((f) => f.size > LIMITE_MB * 1048576)
    if (grandes.length) setErro(`Arquivos acima de ${LIMITE_MB} MB não podem ser enviados: ${grandes.map((f) => f.name).join(', ')}. Para arquivos maiores, use um link do Google Drive.`)
    else setErro('')
    setNovos((n) => [...n, ...lista.filter((f) => f.size <= LIMITE_MB * 1048576)])
  }

  async function salvar(e) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Coloque um título.')
    let linkFinal = link.trim()
    if (linkFinal && !/^https?:\/\//i.test(linkFinal)) linkFinal = 'https://' + linkFinal

    setErro('')
    const pasta = aviso?.id || crypto.randomUUID()
    const enviados = []
    for (let i = 0; i < novos.length; i++) {
      const f = novos[i]
      setSalvando(`Enviando anexo ${i + 1} de ${novos.length}…`)
      const caminho = `${pasta}/${Date.now()}-${nomeSeguro(f.name)}`
      const { error } = await supabase.storage.from(PASTA).upload(caminho, f, { contentType: f.type || undefined, upsert: false })
      if (error) {
        if (enviados.length) supabase.storage.from(PASTA).remove(enviados.map((x) => x.caminho))
        setSalvando('')
        return setErro(`Não foi possível enviar “${f.name}”: ${error.message}`)
      }
      enviados.push({ nome: f.name, caminho, tamanho: f.size, tipo: f.type })
    }

    setSalvando('Publicando…')
    const registro = {
      titulo: titulo.trim(),
      texto: texto.trim(),
      tipo,
      link: linkFinal,
      fixado,
      anexos: [...anexosAtuais, ...enviados],
    }
    const { error } = aviso
      ? await supabase.from('avisos').update({ ...registro, editado_em: new Date().toISOString() }).eq('id', aviso.id)
      : await supabase.from('avisos').insert({ id: pasta, ...registro })
    if (error) {
      if (enviados.length) supabase.storage.from(PASTA).remove(enviados.map((x) => x.caminho))
      setSalvando('')
      return setErro('Não foi possível publicar: ' + error.message)
    }
    if (removidos.length) supabase.storage.from(PASTA).remove(removidos)
    setSalvando('')
    onSalvo()
  }

  return (
    <form className="cartao form-aviso" onSubmit={salvar}>
      <h2>{aviso ? 'Editar publicação' : 'Nova publicação'}</h2>

      <div className="tipos-escolha" role="radiogroup" aria-label="Tipo">
        {Object.entries(TIPOS).map(([k, t]) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={tipo === k}
            className={tipo === k ? 'tipo-op ativo' : 'tipo-op'}
            style={{ '--cor': t.cor }}
            onClick={() => setTipo(k)}
          >
            {t.icone} {t.nome}
          </button>
        ))}
      </div>

      <div className="form-coluna">
        <label>
          Título
          <input value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Simulado SAS de sábado — gabarito e correção" required />
        </label>
        <label>
          Mensagem
          <textarea rows="5" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva o aviso. Links (https://...) viram clicáveis." />
        </label>
        <label>
          Link (opcional)
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Ex.: link do Google Drive, formulário, aula gravada" inputMode="url" />
        </label>
      </div>

      <p className="rotulo-campo" style={{ marginTop: 14 }}>Anexos (PDF, imagens, documentos — até {LIMITE_MB} MB cada)</p>
      <div className="anexos-edicao">
        {anexosAtuais.map((x) => (
          <span key={x.caminho} className="chip">
            📎 {x.nome}
            <button type="button" aria-label={`Remover ${x.nome}`} onClick={() => { setAnexosAtuais((l) => l.filter((y) => y !== x)); setRemovidos((r) => [...r, x.caminho]) }}>✕</button>
          </span>
        ))}
        {novos.map((f, i) => (
          <span key={i} className="chip chip-novo">
            ⬆ {f.name} <span className="suave">({tamanhoLegivel(f.size)})</span>
            <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setNovos((l) => l.filter((_, k) => k !== i))}>✕</button>
          </span>
        ))}
        <input ref={seletor} type="file" multiple hidden onChange={adicionarArquivos} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,image/*" />
        <button type="button" className="botao fantasma pequeno" onClick={() => seletor.current?.click()}>+ Anexar arquivo</button>
      </div>

      <label className="caixa-marcar">
        <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} />
        <span>📌 Fixar no topo da comunidade</span>
      </label>

      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar} disabled={!!salvando}>Cancelar</button>
        <button className="botao primario" disabled={!!salvando}>{salvando || (aviso ? 'Salvar alterações' : 'Publicar')}</button>
      </div>
    </form>
  )
}
