import { useState } from 'react'
import { supabase } from './supabase'
import { AREAS, MATERIAS_POR_AREA } from './constants'
import { LETRAS, DIFICULDADES, slug } from './questoes-util'
import QuestaoCartao from './QuestaoCartao'

const VAZIA = {
  banca: 'ENEM/Inep', prova: '', ano: '', numero: '', area: 'natureza', materia: '', assunto: '', dificuldade: 'media',
  enunciado: '', imagens: [], alternativas: { A: '', B: '', C: '', D: '', E: '' }, gabarito: 'A', comentario: '', revisado: true, fonte_url: '',
}

export async function enviarImagemQuestao(arquivo, pasta) {
  const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase()
  const caminho = `${slug(pasta)}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await supabase.storage.from('questoes').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false })
  if (error) throw error
  return supabase.storage.from('questoes').getPublicUrl(caminho).data.publicUrl
}

// Cadastro e edição de questão (qualquer mentor)
export default function QuestaoForm({ questao, indice, onFechar, onSalvo }) {
  const nova = !questao.id
  const [f, setF] = useState(() => ({
    ...VAZIA,
    ...questao,
    ano: questao.ano ?? '',
    numero: questao.numero ?? '',
    gabarito: questao.id ? questao.gabarito ?? '' : 'A',
    alternativas: { ...VAZIA.alternativas, ...(questao.alternativas || {}) },
    imagens: questao.imagens || [],
  }))
  const [salvando, setSalvando] = useState(false)
  const [enviandoImg, setEnviandoImg] = useState(false)
  const [erro, setErro] = useState('')
  const [previa, setPrevia] = useState(false)

  const mudar = (campo, valor) => setF((x) => ({ ...x, [campo]: valor }))
  const provasConhecidas = [...new Set(indice.map((q) => q.prova).filter(Boolean))]
  const materias = [...new Set([...(MATERIAS_POR_AREA[f.area] || []), ...indice.filter((q) => q.area === f.area).map((q) => q.materia).filter(Boolean)])]
  const assuntos = [...new Set(indice.filter((q) => q.area === f.area && (!f.materia || q.materia === f.materia)).map((q) => q.assunto).filter(Boolean))]

  async function adicionarImagens(e) {
    const arquivos = [...e.target.files]
    e.target.value = ''
    if (!arquivos.length) return
    setEnviandoImg(true)
    setErro('')
    try {
      const urls = []
      for (const a of arquivos) urls.push(await enviarImagemQuestao(a, f.prova || 'avulsas'))
      setF((x) => ({ ...x, imagens: [...x.imagens, ...urls] }))
    } catch (err) {
      setErro('Não foi possível enviar a imagem: ' + err.message)
    }
    setEnviandoImg(false)
  }

  function inserirMarcador(i) {
    setF((x) => ({ ...x, enunciado: `${x.enunciado}${x.enunciado && !x.enunciado.endsWith('\n') ? '\n' : ''}{{img:${i + 1}}}\n` }))
  }

  function tirarImagem(i) {
    // Ajusta os marcadores {{img:N}} das imagens seguintes
    const renumerar = (t) =>
      (t || '').replace(/\{\{img:(\d+)\}\}/g, (m, n) => {
        n = Number(n)
        if (n === i + 1) return ''
        return n > i + 1 ? `{{img:${n - 1}}}` : m
      })
    setF((x) => ({
      ...x,
      imagens: x.imagens.filter((_, k) => k !== i),
      enunciado: renumerar(x.enunciado),
      comentario: renumerar(x.comentario),
      alternativas: Object.fromEntries(Object.entries(x.alternativas).map(([L, t]) => [L, renumerar(t)])),
    }))
  }

  const registro = () => ({
    banca: f.banca.trim() || 'ENEM/Inep',
    prova: f.prova.trim(),
    ano: f.ano ? Number(f.ano) : null,
    numero: f.numero ? Number(f.numero) : null,
    area: f.area,
    materia: f.materia.trim(),
    assunto: f.assunto.trim(),
    dificuldade: f.dificuldade,
    enunciado: f.enunciado.trim(),
    imagens: f.imagens,
    alternativas: Object.fromEntries(LETRAS.map((L) => [L, (f.alternativas[L] || '').trim()]).filter(([, t]) => t)),
    gabarito: f.gabarito || null,
    comentario: f.comentario.trim(),
    revisado: f.revisado,
    fonte_url: f.fonte_url.trim(),
  })

  async function salvar(ev) {
    ev.preventDefault()
    const r = registro()
    if (!r.enunciado && !r.imagens.length) return setErro('Escreva o enunciado (ou envie a imagem da questão).')
    if (Object.keys(r.alternativas).length < 2) return setErro('Preencha as alternativas.')
    if (r.gabarito && !r.alternativas[r.gabarito]) return setErro(`O gabarito é ${r.gabarito}, mas essa alternativa está vazia.`)
    setSalvando(true)
    const { error } = nova ? await supabase.from('questoes').insert(r) : await supabase.from('questoes').update(r).eq('id', questao.id)
    setSalvando(false)
    if (error) {
      if (/questoes_prova_numero/.test(error.message)) return setErro(`Já existe a questão ${r.numero} da prova “${r.prova}”.`)
      return setErro('Não foi possível salvar: ' + error.message)
    }
    onSalvo()
  }

  async function apagar() {
    if (!confirm('Apagar esta questão do banco? As respostas dos alunos nela também somem.')) return
    const { error } = await supabase.from('questoes').delete().eq('id', questao.id)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <form className="cartao modal modal-questao" onClick={(e) => e.stopPropagation()} onSubmit={salvar} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>{nova ? 'Cadastrar questão' : 'Editar questão'}</h2>
          <button type="button" className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {previa ? (
          <QuestaoCartao q={{ ...registro(), id: 'previa' }} onResponder={async (q, L) => ({ alternativa: L, correta: L === q.gabarito, criado_em: new Date().toISOString() })} />
        ) : (
          <>
            <div className="grade-form">
              <label>
                Banca
                <input value={f.banca} onChange={(e) => mudar('banca', e.target.value)} placeholder="ENEM/Inep" />
              </label>
              <label className="largo-2">
                Prova / simulado
                <input list="lista-provas" value={f.prova} onChange={(e) => mudar('prova', e.target.value)} placeholder="Ex.: ENEM 2023 — 2º dia — Caderno Azul" />
                <datalist id="lista-provas">{provasConhecidas.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
              <label>
                Ano
                <input type="number" min="1998" max="2100" value={f.ano} onChange={(e) => mudar('ano', e.target.value)} placeholder="2023" />
              </label>
              <label>
                Nº da questão
                <input type="number" min="1" max="999" value={f.numero} onChange={(e) => mudar('numero', e.target.value)} placeholder="91" />
              </label>
            </div>

            <p className="rotulo-campo">Área</p>
            <div className="tipos-escolha">
              {AREAS.map((a) => (
                <button type="button" key={a.chave} className={f.area === a.chave ? 'tipo-op ativo' : 'tipo-op'} style={{ '--cor': a.cor }} onClick={() => mudar('area', a.chave)}>
                  {a.nome}
                </button>
              ))}
            </div>
            <div className="grade-form">
              <label>
                Matéria
                <input list="lista-mat-q" value={f.materia} onChange={(e) => mudar('materia', e.target.value)} placeholder="Ex.: Biologia" />
                <datalist id="lista-mat-q">{materias.map((m) => <option key={m} value={m} />)}</datalist>
              </label>
              <label className="largo-2">
                Assunto
                <input list="lista-ass-q" value={f.assunto} onChange={(e) => mudar('assunto', e.target.value)} placeholder="Ex.: Genética — 1ª Lei de Mendel" />
                <datalist id="lista-ass-q">{assuntos.map((m) => <option key={m} value={m} />)}</datalist>
              </label>
              <label>
                Dificuldade
                <select value={f.dificuldade} onChange={(e) => mudar('dificuldade', e.target.value)}>
                  {Object.entries(DIFICULDADES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              </label>
            </div>

            <label>
              Enunciado
              <textarea rows="7" value={f.enunciado} onChange={(e) => mudar('enunciado', e.target.value)} placeholder="Cole aqui o texto da questão. Para colocar uma figura no meio do texto, envie a imagem abaixo e toque em “pôr no texto”." />
            </label>

            <div className="q-imagens-edicao">
              {f.imagens.map((src, i) => (
                <figure key={src}>
                  <img src={src} alt={`Imagem ${i + 1}`} />
                  <figcaption>
                    <b>Imagem {i + 1}</b>
                    <button type="button" className="link" onClick={() => inserirMarcador(i)}>pôr no texto</button>
                    <button type="button" className="link perigo" onClick={() => tirarImagem(i)}>tirar</button>
                  </figcaption>
                </figure>
              ))}
              <label className="botao fantasma pequeno q-enviar-img">
                {enviandoImg ? 'Enviando…' : '🖼️ Adicionar imagem'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden onChange={adicionarImagens} disabled={enviandoImg} />
              </label>
            </div>
            <p className="suave pequeno" style={{ marginTop: 0 }}>Dica: <code>{'{{img:1}}'}</code> mostra a imagem 1 naquele ponto (vale também nas alternativas e no comentário).</p>

            <p className="rotulo-campo">Alternativas: toque na letra certa para marcar o gabarito</p>
            <div className="q-alts-edicao">
              {LETRAS.map((L) => (
                <div key={L} className={f.gabarito === L ? 'q-alt-edicao certa' : 'q-alt-edicao'}>
                  <button type="button" className="q-letra" onClick={() => mudar('gabarito', L)} aria-pressed={f.gabarito === L} title="Marcar como resposta certa">{L}</button>
                  <textarea rows="1" value={f.alternativas[L]} onChange={(e) => mudar('alternativas', { ...f.alternativas, [L]: e.target.value })} placeholder={`Alternativa ${L}`} />
                </div>
              ))}
              <label className="caixa-marcar">
                <input type="checkbox" checked={!f.gabarito} onChange={(e) => mudar('gabarito', e.target.checked ? '' : 'A')} />
                Questão anulada (sem gabarito)
              </label>
            </div>

            <label>
              Gabarito comentado
              <textarea rows="6" value={f.comentario} onChange={(e) => mudar('comentario', e.target.value)} placeholder="Explique o raciocínio passo a passo e por que as outras alternativas estão erradas." />
            </label>
            <div className="grade-form">
              <label className="largo-2">
                Link da fonte (opcional)
                <input value={f.fonte_url} onChange={(e) => mudar('fonte_url', e.target.value)} placeholder="https://www.gov.br/inep/…" />
              </label>
              <label className="caixa-marcar" style={{ alignSelf: 'end' }}>
                <input type="checkbox" checked={f.revisado} onChange={(e) => mudar('revisado', e.target.checked)} />
                Comentário revisado por mentor
              </label>
            </div>
          </>
        )}

        {erro && <p className="erro">{erro}</p>}
        <div className="linha-botoes">
          {!nova && <button type="button" className="botao fantasma perigo" onClick={apagar} style={{ marginRight: 'auto' }}>Apagar</button>}
          <button type="button" className="botao fantasma" onClick={() => setPrevia((p) => !p)}>{previa ? '← Voltar a editar' : '👁 Ver como o aluno vê'}</button>
          <button className="botao primario" disabled={salvando || enviandoImg}>{salvando ? 'Salvando…' : nova ? 'Cadastrar' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
