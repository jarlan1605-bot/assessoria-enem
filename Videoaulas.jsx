import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { MATERIAS, NOME_MENTOR, corDaMateria } from './constants'

const TIPOS = {
  aula: { nome: 'Aula', plural: 'Aulas', icone: '🎓', cor: '#1971c2' },
  mentoria: { nome: 'Mentoria', plural: 'Mentorias', icone: '🤝', cor: '#c2255c' },
}

// Descobre como mostrar o vídeo dentro do site a partir do link colado
export function videoDe(link) {
  let u
  try { u = new URL(link) } catch { return null }
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be'
      ? u.pathname.slice(1)
      : u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
    if (!id) return null
    return { tipo: 'iframe', src: `https://www.youtube.com/embed/${id}?rel=0`, capa: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  }
  if (host.endsWith('vimeo.com')) {
    // vimeo.com/123, vimeo.com/123/abc (não listado) ou player.vimeo.com/video/123?h=abc
    const [, id, trecho] = u.pathname.match(/\/(\d+)(?:\/([0-9a-f]+))?/) ?? []
    if (!id) return null
    const hash = u.searchParams.get('h') || trecho
    return { tipo: 'iframe', src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}` }
  }
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || u.searchParams.get('id')
    if (!id) return null
    return { tipo: 'iframe', src: `https://drive.google.com/file/d/${id}/preview` }
  }
  if (host.endsWith('loom.com')) {
    const id = u.pathname.match(/\/(?:share|embed)\/([^/?]+)/)?.[1]
    if (!id) return null
    return { tipo: 'iframe', src: `https://www.loom.com/embed/${id}` }
  }
  if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) return { tipo: 'video', src: link }
  return null
}

const comHttps = (l) => (l && !/^https?:\/\//i.test(l) ? 'https://' + l : l)

export default function Videoaulas({ ehMentor, ehCeo = false, meuId, equipe = [] }) {
  const [aulas, setAulas] = useState([])
  const [vistas, setVistas] = useState([]) // [{aluno_id, aula_id}]
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [materia, setMateria] = useState('')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState(null) // null | 'nova' | aula
  const [assistindo, setAssistindo] = useState(null)

  const carregar = useCallback(async () => {
    const [a, v] = await Promise.all([
      supabase.from('videoaulas').select('*').order('criado_em', { ascending: false }),
      supabase.from('videoaulas_vistas').select('aluno_id, aula_id'),
    ])
    if (a.error) {
      setErro(ehMentor ? 'Não foi possível carregar. Você já rodou o arquivo videoaulas.sql no Supabase?' : 'Não foi possível carregar as aulas.')
    } else {
      setErro('')
      setAulas(a.data ?? [])
      setVistas(v.data ?? [])
    }
    setCarregando(false)
  }, [ehMentor])

  useEffect(() => {
    carregar()
  }, [carregar])

  const jaVi = (a) => vistas.some((v) => v.aula_id === a.id && v.aluno_id === meuId)
  const quantosViram = (a) => vistas.filter((v) => v.aula_id === a.id).length

  async function alternarVista(a) {
    const vista = jaVi(a)
    setVistas((l) => (vista ? l.filter((v) => !(v.aula_id === a.id && v.aluno_id === meuId)) : [...l, { aluno_id: meuId, aula_id: a.id }]))
    const { error } = vista
      ? await supabase.from('videoaulas_vistas').delete().eq('aula_id', a.id).eq('aluno_id', meuId)
      : await supabase.from('videoaulas_vistas').insert({ aula_id: a.id })
    if (error) {
      setErro('Não foi possível salvar: ' + error.message)
      carregar()
    }
  }

  async function apagar(a) {
    if (!confirm(`Apagar “${a.titulo}”?`)) return
    const { error } = await supabase.from('videoaulas').delete().eq('id', a.id)
    if (error) setErro('Não foi possível apagar: ' + error.message)
    else carregar()
  }

  const materias = [...new Set(aulas.map((a) => a.materia).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'))
  const termo = busca.trim().toLowerCase()
  const visiveis = aulas.filter((a) =>
    (filtro === 'todos' || a.tipo === filtro) &&
    (!materia || a.materia === materia) &&
    (!termo || `${a.titulo} ${a.descricao} ${a.materia}`.toLowerCase().includes(termo))
  )
  const publicadas = aulas.filter((a) => a.publicado)
  const assistidas = publicadas.filter(jaVi).length
  const contagem = (t) => aulas.filter((a) => a.tipo === t).length

  return (
    <section className="secao videoaulas">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Aulas e mentorias</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>
            {ehCeo
              ? 'As suas aparecem para todos os alunos. As dos mentores, só para os alunos deles.'
              : ehMentor
                ? 'As suas aparecem para os seus alunos. As do CEO aparecem para todos.'
                : 'Clique numa aula para assistir.'}
          </p>
        </div>
        {ehMentor && !editando && (
          <button className="botao primario" onClick={() => setEditando('nova')}>+ Nova aula ou mentoria</button>
        )}
      </div>

      {ehMentor && editando && (
        <FormVideoaula
          aula={editando === 'nova' ? null : editando}
          materias={materias}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar() }}
        />
      )}

      {!ehMentor && publicadas.length > 0 && (
        <div className="cartao contador-aulas">
          <div>
            <span className="mini-titulo" style={{ color: 'var(--primaria)' }}>Seu progresso</span>
            <div className="contador-linha">
              <strong className="mini-numero">{assistidas}</strong>
              <span className="suave">de {publicadas.length} assistidas</span>
            </div>
            <span className="barra larga" aria-hidden="true">
              <i style={{ width: `${(assistidas / publicadas.length) * 100}%` }} />
            </span>
          </div>
        </div>
      )}

      {aulas.length > 0 && (
        <div className="videoaulas-filtros">
          <div className="filtros" role="tablist" aria-label="Filtrar por tipo">
            <button className={filtro === 'todos' ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro('todos')}>Todas</button>
            {Object.entries(TIPOS).map(([k, t]) =>
              contagem(k) ? (
                <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>
                  {t.icone} {t.plural} <span className="filtro-num">{contagem(k)}</span>
                </button>
              ) : null
            )}
          </div>
          <div className="videoaulas-busca">
            {materias.length > 0 && (
              <select value={materia} onChange={(e) => setMateria(e.target.value)} aria-label="Matéria">
                <option value="">Todas as matérias</option>
                {materias.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" aria-label="Buscar" />
          </div>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>
            {aulas.length
              ? 'Nenhuma aula encontrada com esses filtros.'
              : ehMentor
                ? 'Nenhuma aula ainda. Clique em “Nova aula ou mentoria” e cole o link do vídeo (YouTube, Google Drive, Vimeo ou Loom).'
                : 'Nenhuma aula por enquanto. Quando seu mentor publicar, aparece aqui.'}
          </p>
        </div>
      ) : (
        <div className="grade-videoaulas">
          {visiveis.map((a) => {
            const t = TIPOS[a.tipo] ?? TIPOS.aula
            const v = videoDe(a.link)
            const novo = Date.now() - new Date(a.criado_em).getTime() < 7 * 86400000
            const autor = equipe.find((m) => m.id === a.autor_id)
            const podeEditar = ehCeo || a.autor_id === meuId
            const vista = !ehMentor && jaVi(a)
            return (
              <article key={a.id} className={a.publicado ? 'cartao videoaula' : 'cartao videoaula rascunho'} style={{ '--cor': t.cor }}>
                <button className="videoaula-capa" onClick={() => setAssistindo(a)} aria-label={`Assistir ${a.titulo}`}>
                  {v?.capa ? <img src={v.capa} alt="" loading="lazy" /> : <span className="videoaula-icone" aria-hidden="true">{t.icone}</span>}
                  <span className="videoaula-play" aria-hidden="true">▶</span>
                  {vista && <span className="selo videoaula-vista">✓ Assistida</span>}
                </button>
                <div className="videoaula-corpo">
                  <div className="post-selos" style={{ marginLeft: 0 }}>
                    <span className="selo selo-tipo">{t.icone} {t.nome}</span>
                    {a.materia && <span className="selo selo-tipo" style={{ '--cor': corDaMateria(a.materia) }}>{a.materia}</span>}
                    {!a.publicado && <span className="selo selo-fixado">Rascunho</span>}
                    {a.publicado && novo && <span className="selo selo-novo">Nova</span>}
                  </div>
                  <h3 className="videoaula-titulo">
                    <button className="videoaula-link" onClick={() => setAssistindo(a)}>{a.titulo}</button>
                  </h3>
                  {a.descricao && <p className="suave pequeno videoaula-desc">{a.descricao}</p>}
                  {ehMentor && (
                    <p className="suave pequeno" style={{ margin: 0 }}>
                      {autor ? (autor.id === meuId ? 'Sua' : `De ${(autor.nome || NOME_MENTOR).split(' ')[0]}`) : NOME_MENTOR}
                      {a.publicado && ` · 👁 ${quantosViram(a)} ${quantosViram(a) === 1 ? 'aluno assistiu' : 'alunos assistiram'}`}
                    </p>
                  )}
                  {ehMentor && podeEditar && (
                    <footer className="post-acoes">
                      <button className="link" onClick={() => { setEditando(a); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>editar</button>
                      <button className="link perigo" onClick={() => apagar(a)}>apagar</button>
                    </footer>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {assistindo && (
        <Player
          aula={assistindo}
          vista={!ehMentor && jaVi(assistindo)}
          podeMarcar={!ehMentor && assistindo.publicado}
          onMarcar={() => alternarVista(assistindo)}
          onFechar={() => setAssistindo(null)}
        />
      )}
    </section>
  )
}

function Player({ aula, vista, podeMarcar, onMarcar, onFechar }) {
  const v = videoDe(aula.link)
  const t = TIPOS[aula.tipo] ?? TIPOS.aula

  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  return (
    <div className="fundo-modal" onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="cartao modal modal-video" role="dialog" aria-modal="true" aria-label={aula.titulo}>
        <div className="modal-topo">
          <h2>{t.icone} {aula.titulo}</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {v?.tipo === 'iframe' ? (
          <div className="video-moldura">
            <iframe src={v.src} title={aula.titulo} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        ) : v?.tipo === 'video' ? (
          <div className="video-moldura">
            <video src={v.src} controls playsInline />
          </div>
        ) : aula.link ? (
          <a className="botao primario" href={aula.link} target="_blank" rel="noreferrer">▶ Abrir o vídeo</a>
        ) : (
          <p className="suave">Esta aula ainda não tem vídeo.</p>
        )}

        {aula.descricao && <p className="post-texto" style={{ marginTop: 14 }}>{aula.descricao}</p>}

        <div className="linha-botoes">
          {aula.material && (
            <a className="botao fantasma" href={aula.material} target="_blank" rel="noreferrer">📎 Material de apoio</a>
          )}
          {v && aula.link && (
            <a className="botao fantasma" href={aula.link} target="_blank" rel="noreferrer">Abrir em nova aba</a>
          )}
          {podeMarcar && (
            <button className={vista ? 'botao fantasma' : 'botao primario'} onClick={onMarcar}>
              {vista ? '✓ Assistida (desmarcar)' : 'Marcar como assistida'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FormVideoaula({ aula, materias, onFechar, onSalvo }) {
  const [tipo, setTipo] = useState(aula?.tipo ?? 'aula')
  const [titulo, setTitulo] = useState(aula?.titulo ?? '')
  const [link, setLink] = useState(aula?.link ?? '')
  const [materia, setMateria] = useState(aula?.materia ?? '')
  const [descricao, setDescricao] = useState(aula?.descricao ?? '')
  const [material, setMaterial] = useState(aula?.material ?? '')
  const [publicado, setPublicado] = useState(aula?.publicado ?? true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const linkFinal = comHttps(link.trim())
  const previa = linkFinal ? videoDe(linkFinal) : null
  const sugestoes = [...new Set([...materias, ...MATERIAS.map((m) => m.nome)])]

  async function salvar(e) {
    e.preventDefault()
    if (!titulo.trim()) return setErro('Coloque um título.')
    if (!linkFinal) return setErro('Cole o link do vídeo.')
    setErro('')
    setSalvando(true)
    const registro = {
      tipo,
      titulo: titulo.trim(),
      link: linkFinal,
      materia: materia.trim(),
      descricao: descricao.trim(),
      material: comHttps(material.trim()),
      publicado,
    }
    const { error } = aula
      ? await supabase.from('videoaulas').update({ ...registro, editado_em: new Date().toISOString() }).eq('id', aula.id)
      : await supabase.from('videoaulas').insert(registro)
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    onSalvo()
  }

  return (
    <form className="cartao form-aviso" onSubmit={salvar}>
      <h2>{aula ? 'Editar' : 'Nova aula ou mentoria'}</h2>

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
          <input value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Funções do 1º grau — do zero ao ENEM" required />
        </label>
        <label>
          Link do vídeo
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link do YouTube, Google Drive, Vimeo ou Loom" inputMode="url" required />
          {linkFinal && (
            <span className="suave pequeno" style={{ fontWeight: 400 }}>
              {previa ? '✓ O vídeo vai tocar dentro do site.' : 'Esse link vai abrir numa nova aba.'}
              {/drive\.google/.test(linkFinal) && ' No Drive, deixe o vídeo como “Qualquer pessoa com o link”.'}
              {/youtu/.test(linkFinal) && ' No YouTube, use “Não listado” para só seus alunos acharem.'}
            </span>
          )}
        </label>
        <label>
          Matéria (opcional)
          <input value={materia} list="videoaulas-materias" maxLength={60} onChange={(e) => setMateria(e.target.value)} placeholder="Ex.: Matemática" />
          <datalist id="videoaulas-materias">
            {sugestoes.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        <label>
          Descrição (opcional)
          <textarea rows="4" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que o aluno vai aprender, o que fazer depois de assistir…" />
        </label>
        <label>
          Material de apoio (opcional)
          <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Link do PDF, slides ou lista de exercícios" inputMode="url" />
        </label>
      </div>

      {previa?.tipo === 'iframe' && (
        <div className="video-moldura" style={{ marginTop: 14 }}>
          <iframe src={previa.src} title="Prévia do vídeo" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}

      <label className="caixa-marcar">
        <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
        <span>Visível para os alunos (desmarque para salvar como rascunho)</span>
      </label>

      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : aula ? 'Salvar alterações' : 'Publicar'}</button>
      </div>
    </form>
  )
}
