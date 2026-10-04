import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { prepararFoto } from './foto'
import Avatar from './Avatar'

const paraInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function SiteEditor() {
  const [cfg, setCfg] = useState(null)
  const [depoimentos, setDepoimentos] = useState([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [novoDep, setNovoDep] = useState(null)

  const carregar = useCallback(async () => {
    const [c, d] = await Promise.all([
      supabase.from('site_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('depoimentos').select('*').order('ordem').order('criado_em'),
    ])
    if (c.error) return setErro('Não foi possível carregar. O arquivo extras.sql já foi rodado no Supabase?')
    setCfg({
      ...c.data,
      data_enem_1: paraInput(c.data?.data_enem_1),
      data_enem_2: paraInput(c.data?.data_enem_2),
      planos: c.data?.planos ?? [],
      numeros: c.data?.numeros ?? [],
    })
    setDepoimentos(d.data ?? [])
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar(e) {
    e.preventDefault()
    setSalvando(true)
    const { error } = await supabase
      .from('site_config')
      .update({
        titulo: cfg.titulo.trim(),
        subtitulo: cfg.subtitulo.trim(),
        whatsapp: cfg.whatsapp.trim(),
        instagram: cfg.instagram.replace('@', '').trim(),
        data_enem_1: cfg.data_enem_1 ? new Date(cfg.data_enem_1).toISOString() : null,
        data_enem_2: cfg.data_enem_2 ? new Date(cfg.data_enem_2).toISOString() : null,
        planos: cfg.planos.filter((p) => p.nome.trim()).map((p) => ({ ...p, itens: p.itens.filter((i) => i.trim()) })),
        numeros: cfg.numeros.filter((n) => n.valor.trim() && n.rotulo.trim()),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', 1)
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    setErro('')
    setAviso('Página atualizada!')
  }

  const mudarPlano = (i, campo, valor) => setCfg({ ...cfg, planos: cfg.planos.map((p, k) => (k === i ? { ...p, [campo]: valor } : p)) })
  const mudarNumero = (i, campo, valor) => setCfg({ ...cfg, numeros: cfg.numeros.map((n, k) => (k === i ? { ...n, [campo]: valor } : n)) })

  async function alternarPublicado(d) {
    await supabase.from('depoimentos').update({ publicado: !d.publicado }).eq('id', d.id)
    carregar()
  }
  async function apagarDep(d) {
    if (!confirm(`Apagar o depoimento de ${d.nome}?`)) return
    await supabase.from('depoimentos').delete().eq('id', d.id)
    carregar()
  }

  if (erro && !cfg) return <p className="erro">{erro}</p>
  if (!cfg) return <p className="suave">Carregando…</p>

  return (
    <section className="secao">
      <div className="comunidade-topo">
        <div>
          <h2 style={{ margin: 0 }}>Página de vendas</h2>
          <p className="suave pequeno" style={{ margin: '2px 0 0' }}>É a primeira página que aparece para quem abre o site sem estar logado.</p>
        </div>
        <a className="botao" href="/?site" target="_blank" rel="noreferrer">Ver a página ↗</a>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {aviso && !erro && <p className="aviso-ok" role="status">✓ {aviso}</p>}

      <form className="cartao" onSubmit={salvar} onChange={() => setAviso('')}>
        <h2>Textos e contato</h2>
        <div className="form-coluna">
          <label>Título principal<input value={cfg.titulo} onChange={(e) => setCfg({ ...cfg, titulo: e.target.value })} maxLength={90} /></label>
          <label>Subtítulo<textarea rows="2" value={cfg.subtitulo} onChange={(e) => setCfg({ ...cfg, subtitulo: e.target.value })} maxLength={240} /></label>
        </div>
        <div className="grade-form" style={{ marginTop: 14 }}>
          <label className="largo-2">WhatsApp (com DDD)<input value={cfg.whatsapp} onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.value })} inputMode="tel" placeholder="(84) 99999-9999 — deixe vazio para usar só o Instagram" /></label>
          <label className="largo-2">Instagram<input value={cfg.instagram} onChange={(e) => setCfg({ ...cfg, instagram: e.target.value })} placeholder="jarlanamed" /></label>
        </div>

        <h2 style={{ marginTop: 18 }}>Data do ENEM (contagem regressiva)</h2>
        <div className="grade-form">
          <label className="largo-2">1º dia<input type="datetime-local" value={cfg.data_enem_1} onChange={(e) => setCfg({ ...cfg, data_enem_1: e.target.value })} /></label>
          <label className="largo-2">2º dia<input type="datetime-local" value={cfg.data_enem_2} onChange={(e) => setCfg({ ...cfg, data_enem_2: e.target.value })} /></label>
        </div>

        <h2 style={{ marginTop: 18 }}>Números de destaque <span className="suave pequeno">(opcional)</span></h2>
        {cfg.numeros.map((n, i) => (
          <div key={i} className="linha-campo" style={{ marginBottom: 8 }}>
            <input value={n.valor} onChange={(e) => mudarNumero(i, 'valor', e.target.value)} placeholder="Ex.: +40" style={{ maxWidth: 120 }} />
            <input value={n.rotulo} onChange={(e) => mudarNumero(i, 'rotulo', e.target.value)} placeholder="Ex.: alunos acompanhados" />
            <button type="button" className="link perigo" onClick={() => setCfg({ ...cfg, numeros: cfg.numeros.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        {cfg.numeros.length < 4 && <button type="button" className="botao fantasma pequeno" onClick={() => setCfg({ ...cfg, numeros: [...cfg.numeros, { valor: '', rotulo: '' }] })}>+ número</button>}
        <p className="suave pequeno">Use só números reais da sua mentoria.</p>

        <h2 style={{ marginTop: 18 }}>Planos</h2>
        <p className="suave pequeno">O preço é opcional. Sem preço, o botão vira “Consultar valores” e leva para o seu contato.</p>
        <div className="planos-edicao">
          {cfg.planos.map((p, i) => (
            <div key={i} className="plano-edicao">
              <div className="linha-campo">
                <input value={p.nome} onChange={(e) => mudarPlano(i, 'nome', e.target.value)} placeholder="Nome do plano" />
                <input value={p.preco || ''} onChange={(e) => mudarPlano(i, 'preco', e.target.value)} placeholder="Preço (opcional)" style={{ maxWidth: 170 }} />
              </div>
              <textarea rows="4" value={(p.itens || []).join('\n')} onChange={(e) => mudarPlano(i, 'itens', e.target.value.split('\n'))} placeholder="Um benefício por linha" />
              <div className="linha-campo">
                <label className="caixa-marcar" style={{ marginTop: 0 }}><input type="checkbox" checked={!!p.destaque} onChange={(e) => mudarPlano(i, 'destaque', e.target.checked)} /> <span>Destacar este plano</span></label>
                <button type="button" className="link perigo" style={{ marginLeft: 'auto' }} onClick={() => setCfg({ ...cfg, planos: cfg.planos.filter((_, k) => k !== i) })}>remover plano</button>
              </div>
            </div>
          ))}
        </div>
        {cfg.planos.length < 4 && <button type="button" className="botao fantasma pequeno" onClick={() => setCfg({ ...cfg, planos: [...cfg.planos, { nome: '', preco: '', destaque: false, itens: [''] }] })}>+ plano</button>}

        <div className="linha-botoes">
          <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar página'}</button>
        </div>
      </form>

      <div className="cartao">
        <div className="lista-dia-topo">
          <h2 style={{ margin: 0 }}>Depoimentos</h2>
          {!novoDep && <button className="botao fantasma pequeno" onClick={() => setNovoDep({ nome: '', resultado: '', texto: '' })}>+ Depoimento</button>}
        </div>
        <p className="suave pequeno">Coloque apenas depoimentos reais, com autorização do aluno. Só aparecem no site os marcados como publicados.</p>
        {novoDep && <FormDepoimento inicial={novoDep} onFechar={() => setNovoDep(null)} onSalvo={() => { setNovoDep(null); carregar() }} />}
        {depoimentos.length === 0 && !novoDep && <p className="suave" style={{ marginBottom: 0 }}>Nenhum depoimento ainda.</p>}
        {depoimentos.map((d) => (
          <div key={d.id} className="dep-item">
            <Avatar src={d.foto_url} nome={d.nome} tamanho={40} />
            <div className="dep-texto">
              <strong>{d.nome}</strong>{d.resultado && <span className="suave pequeno"> · {d.resultado}</span>}
              <p>“{d.texto}”</p>
            </div>
            <div className="erro-acoes">
              <span className={d.publicado ? 'selo selo-novo' : 'selo selo-fixado'}>{d.publicado ? 'publicado' : 'rascunho'}</span>
              <button className="link" onClick={() => alternarPublicado(d)}>{d.publicado ? 'despublicar' : 'publicar'}</button>
              <button className="link perigo" onClick={() => apagarDep(d)}>apagar</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FormDepoimento({ inicial, onFechar, onSalvo }) {
  const [d, setD] = useState(inicial)
  const [foto, setFoto] = useState(null)
  const [autorizado, setAutorizado] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const seletor = useRef(null)

  async function salvar(e) {
    e.preventDefault()
    if (!autorizado) return setErro('Confirme que o aluno autorizou o uso do depoimento.')
    setSalvando(true)
    let foto_url = null
    if (foto) {
      try {
        const blob = await prepararFoto(foto)
        const caminho = `depoimentos/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('site').upload(caminho, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        foto_url = supabase.storage.from('site').getPublicUrl(caminho).data.publicUrl
      } catch (err) {
        setSalvando(false)
        return setErro('Não foi possível enviar a foto: ' + (err.message || err))
      }
    }
    const { error } = await supabase.from('depoimentos').insert({ nome: d.nome.trim(), resultado: d.resultado.trim(), texto: d.texto.trim(), foto_url, publicado: true })
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + error.message)
    onSalvo()
  }

  return (
    <form className="form-coluna form-dep" onSubmit={salvar}>
      <div className="grade-form" style={{ marginBottom: 0 }}>
        <label className="largo-2">Nome<input value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} required /></label>
        <label className="largo-2">Resultado<input value={d.resultado} onChange={(e) => setD({ ...d, resultado: e.target.value })} placeholder="Ex.: Aprovada em Medicina — UFRN" /></label>
      </div>
      <label>Depoimento<textarea rows="3" value={d.texto} onChange={(e) => setD({ ...d, texto: e.target.value })} required /></label>
      <div className="linha-campo">
        <input ref={seletor} type="file" accept="image/*" hidden onChange={(e) => setFoto(e.target.files?.[0] || null)} />
        <button type="button" className="botao fantasma pequeno" onClick={() => seletor.current?.click()}>{foto ? `📷 ${foto.name}` : '📷 Foto (opcional)'}</button>
      </div>
      <label className="caixa-marcar"><input type="checkbox" checked={autorizado} onChange={(e) => setAutorizado(e.target.checked)} /> <span>O aluno autorizou publicar este depoimento (e a foto) no site.</span></label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="botao fantasma" onClick={onFechar}>Cancelar</button>
        <button className="botao primario" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar e publicar'}</button>
      </div>
    </form>
  )
}
