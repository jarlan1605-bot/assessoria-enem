import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

// Biblioteca de simulados e provas: os PDFs ficam no Google Drive e abrem dentro do site.
const TIPOS = {
  prova: { nome: 'Prova', icone: '📝', cor: '#1f5f4a' },
  gabarito: { nome: 'Gabarito', icone: '✅', cor: '#e8590c' },
  resolucao: { nome: 'Resolução', icone: '💡', cor: '#7048e8' },
  redacao: { nome: 'Redação', icone: '✍️', cor: '#c2255c' },
  material: { nome: 'Material', icone: '📘', cor: '#1971c2' },
}
const ORDEM_TIPO = ['prova', 'gabarito', 'resolucao', 'redacao', 'material']
const CORES_EDITORA = { SAS: '#e8590c', Bernoulli: '#1971c2', Poliedro: '#c2255c', Somos: '#2f9e44' }

const previa = (id) => `https://drive.google.com/file/d/${id}/preview`
const abrirNoDrive = (id) => `https://drive.google.com/file/d/${id}/view`
const baixar = (id) => `https://drive.google.com/uc?export=download&id=${id}`

// Aceita o link de compartilhamento do Drive ou só o id do arquivo
export function idDoDrive(texto) {
  const t = (texto || '').trim()
  const m = t.match(/\/d\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/)
  if (m) return m[1]
  return /^[\w-]{10,}$/.test(t) ? t : null
}

export default function Materiais({ ehCeo }) {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [exame, setExame] = useState('ENEM')
  const [editora, setEditora] = useState('')
  const [ano, setAno] = useState('')
  const [busca, setBusca] = useState('')
  const [abrindo, setAbrindo] = useState(null)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    // o Supabase devolve no máximo 1000 linhas por vez
    const todos = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from('materiais').select('*').order('ano', { ascending: false }).order('ordem').order('titulo').range(de, de + 999)
      if (error) {
        setErro(ehCeo ? 'Não foi possível carregar. Você já rodou o arquivo materiais.sql no Supabase?' : 'Não foi possível carregar os simulados.')
        setCarregando(false)
        return
      }
      todos.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    setErro('')
    setItens(todos)
    setCarregando(false)
  }, [ehCeo])

  useEffect(() => {
    carregar()
  }, [carregar])

  const exames = useMemo(() => contar(itens, 'exame'), [itens])
  const doExame = itens.filter((i) => !exame || i.exame === exame)
  const editoras = contar(doExame, 'editora')
  const anos = [...new Set(doExame.map((i) => i.ano).filter(Boolean))].sort((a, b) => b - a)
  const anoEfetivo = ano === '' ? anos[0] ?? 'todos' : ano
  const termo = busca.trim().toLowerCase()

  const visiveis = doExame.filter((i) =>
    (!editora || i.editora === editora) &&
    (termo ? `${i.titulo} ${i.simulado} ${i.editora}`.toLowerCase().includes(termo) : anoEfetivo === 'todos' || i.ano === Number(anoEfetivo))
  )

  // Agrupa por ano > editora + simulado
  const porAno = new Map()
  for (const i of visiveis) {
    const a = i.ano ?? 'Sem ano'
    if (!porAno.has(a)) porAno.set(a, new Map())
    const chave = `${i.editora}|${i.simulado}`
    const g = porAno.get(a)
    if (!g.has(chave)) g.set(chave, { editora: i.editora, simulado: i.simulado, ordem: i.ordem, arquivos: [] })
    g.get(chave).arquivos.push(i)
  }
  const blocos = [...porAno.entries()].sort((x, y) => (y[0] === 'Sem ano' ? -1 : x[0] === 'Sem ano' ? 1 : y[0] - x[0]))

  return (
    <section className="secao materiais">
      <div className="comunidade-topo">
        <p className="suave" style={{ margin: 0 }}>
          {itens.length > 0 ? `${itens.length} arquivos de simulados. Clique para abrir aqui mesmo, sem precisar entrar no Drive.` : 'Simulados, gabaritos e resoluções.'}
        </p>
        {ehCeo && !novo && <button className="botao primario" onClick={() => setNovo(true)}>+ Adicionar arquivo</button>}
      </div>

      {ehCeo && novo && <FormMaterial onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar() }} />}

      {itens.length > 0 && (
        <div className="cartao mat-filtros">
          <div className="filtros" role="tablist" aria-label="Vestibular">
            {exames.map(([e, n]) => (
              <button key={e} className={exame === e ? 'filtro ativo' : 'filtro'} onClick={() => { setExame(e); setEditora(''); setAno('') }}>
                {e} <span className="filtro-num">{n}</span>
              </button>
            ))}
          </div>
          <div className="mat-linha">
            <div className="filtros" aria-label="Editora">
              <button className={!editora ? 'filtro ativo' : 'filtro'} onClick={() => setEditora('')}>Todas as editoras</button>
              {editoras.map(([e]) => (
                <button key={e} className={editora === e ? 'filtro ativo' : 'filtro'} style={{ '--cor': CORES_EDITORA[e] }} onClick={() => setEditora(e)}>
                  <span className="mat-ponto" aria-hidden="true" /> {e}
                </button>
              ))}
            </div>
            <div className="mat-busca">
              <select value={anoEfetivo} onChange={(e) => setAno(e.target.value)} aria-label="Ano" disabled={!!termo}>
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                <option value="todos">Todos os anos</option>
              </select>
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar em todos os anos…" aria-label="Buscar" />
            </div>
          </div>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>{itens.length ? 'Nada encontrado com esses filtros.' : 'Nenhum simulado cadastrado ainda.'}</p>
        </div>
      ) : (
        blocos.map(([a, grupos]) => (
          <div key={a} className="mat-ano">
            <h2 className="mat-ano-titulo">{a}</h2>
            <div className="mat-grade">
              {[...grupos.values()]
                .sort((x, y) => x.editora.localeCompare(y.editora) || x.ordem - y.ordem || x.simulado.localeCompare(y.simulado, 'pt-BR', { numeric: true }))
                .map((g) => (
                  <article key={g.editora + g.simulado} className="cartao mat-simulado" style={{ '--cor': CORES_EDITORA[g.editora] || 'var(--primaria)' }}>
                    <header>
                      <span className="mat-editora">{g.editora}</span>
                      <h3>{g.simulado === 'Geral' ? `${exame || 'Simulados'} ${a}` : g.simulado}</h3>
                    </header>
                    <ul className="mat-arquivos">
                      {ordenar(g.arquivos).map((i) => {
                        const t = TIPOS[i.tipo] ?? TIPOS.prova
                        return (
                          <li key={i.id}>
                            <button className="mat-arquivo" style={{ '--tipo': t.cor }} onClick={() => setAbrindo(i)} title={i.titulo}>
                              <span className="mat-tipo">{t.icone} {t.nome}{i.dia ? ` · ${i.dia}º dia` : ''}</span>
                              <span className="mat-nome">{i.titulo}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                ))}
            </div>
          </div>
        ))
      )}

      {abrindo && <Visualizador item={abrindo} ehCeo={ehCeo} onFechar={() => setAbrindo(null)} onApagado={() => { setAbrindo(null); carregar() }} />}
    </section>
  )
}

function contar(lista, campo) {
  const m = new Map()
  for (const i of lista) if (i[campo]) m.set(i[campo], (m.get(i[campo]) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function ordenar(arquivos) {
  return [...arquivos].sort((a, b) =>
    (a.dia ?? 9) - (b.dia ?? 9) ||
    ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo) ||
    a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true })
  )
}

function Visualizador({ item, ehCeo, onFechar, onApagado }) {
  const t = TIPOS[item.tipo] ?? TIPOS.prova

  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  async function apagar() {
    if (!confirm(`Tirar “${item.titulo}” do site? O arquivo continua no seu Drive.`)) return
    const { error } = await supabase.from('materiais').delete().eq('id', item.id)
    if (error) alert('Não foi possível apagar: ' + error.message)
    else onApagado()
  }

  return (
    <div className="fundo-modal" onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="cartao modal mat-modal" role="dialog" aria-modal="true" aria-label={item.titulo}>
        <div className="modal-topo">
          <div>
            <span className="mat-editora" style={{ '--cor': CORES_EDITORA[item.editora] || 'var(--primaria)' }}>{item.editora} · {item.exame}{item.ano ? ` ${item.ano}` : ''}</span>
            <h2 style={{ margin: '4px 0 0' }}>{t.icone} {item.titulo}</h2>
          </div>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <div className="mat-pdf">
          <iframe src={previa(item.drive_id)} title={item.titulo} allow="autoplay" />
        </div>
        <div className="linha-botoes">
          {ehCeo && <button className="botao fantasma" onClick={apagar}>Tirar do site</button>}
          <a className="botao fantasma" href={abrirNoDrive(item.drive_id)} target="_blank" rel="noreferrer">Abrir em nova aba</a>
          <a className="botao primario" href={baixar(item.drive_id)} target="_blank" rel="noreferrer">⬇ Baixar PDF</a>
        </div>
      </div>
    </div>
  )
}

function FormMaterial({ onFechar, onSalvo }) {
  const [f, setF] = useState({ link: '', titulo: '', editora: '', exame: 'ENEM', ano: new Date().getFullYear(), simulado: '', tipo: 'prova', dia: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const muda = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function salvar(e) {
    e.preventDefault()
    const id = idDoDrive(f.link)
    if (!id) return setErro('Cole o link de compartilhamento do arquivo no Drive.')
    if (!f.titulo.trim()) return setErro('Dê um nome ao arquivo.')
    setSalvando(true)
    const ordem = Number(f.simulado.match(/\d+/)?.[0] ?? 99)
    const { error } = await supabase.from('materiais').insert({
      drive_id: id, titulo: f.titulo.trim(), editora: f.editora.trim(), exame: f.exame.trim() || 'ENEM',
      ano: Number(f.ano) || null, simulado: f.simulado.trim() || 'Geral', ordem: ordem < 100 ? ordem : 99,
      tipo: f.tipo, dia: f.dia ? Number(f.dia) : null,
    })
    setSalvando(false)
    if (error) setErro(error.code === '23505' ? 'Esse arquivo já está no site.' : 'Não foi possível salvar: ' + error.message)
    else onSalvo()
  }

  return (
    <form className="cartao" onSubmit={salvar}>
      <h2>Adicionar arquivo do Drive</h2>
      <p className="suave pequeno">O arquivo precisa estar compartilhado como “qualquer pessoa com o link pode ver”.</p>
      <div className="grade-form">
        <label className="largo">Link do arquivo no Drive<input value={f.link} onChange={muda('link')} placeholder="https://drive.google.com/file/d/…" /></label>
        <label className="largo">Nome<input value={f.titulo} onChange={muda('titulo')} placeholder="Ex.: 1º Simulado SAS 2026 - 1º dia" /></label>
        <label>Editora<input value={f.editora} onChange={muda('editora')} placeholder="SAS, Bernoulli…" /></label>
        <label>Vestibular<input value={f.exame} onChange={muda('exame')} /></label>
        <label>Ano<input type="number" value={f.ano} onChange={muda('ano')} /></label>
        <label>Simulado<input value={f.simulado} onChange={muda('simulado')} placeholder="Ex.: 1º simulado" /></label>
        <label>Tipo
          <select value={f.tipo} onChange={muda('tipo')}>
            {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t.nome}</option>)}
          </select>
        </label>
        <label>Dia
          <select value={f.dia} onChange={muda('dia')}>
            <option value="">—</option><option value="1">1º dia</option><option value="2">2º dia</option>
          </select>
        </label>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}
