import { useState } from 'react'
import { supabase } from './supabase'
import { AREAS } from './constants'
import { LETRAS } from './questoes-util'
import { enviarImagemQuestao } from './QuestaoForm'

const base = (caminho) => (caminho || '').split(/[\\/]/).pop().toLowerCase()
const AREAS_OK = AREAS.map((a) => a.chave)

function normalizar(q) {
  const alternativas = {}
  for (const L of LETRAS) if (q.alternativas?.[L]) alternativas[L] = String(q.alternativas[L])
  const g = (q.gabarito || '').toString().trim().toUpperCase()
  return {
    banca: q.banca || 'ENEM/Inep',
    prova: q.prova || '',
    ano: q.ano ? Number(q.ano) : null,
    numero: q.numero ? Number(q.numero) : null,
    area: q.area,
    materia: q.materia || '',
    assunto: q.assunto || '',
    dificuldade: ['facil', 'media', 'dificil'].includes(q.dificuldade) ? q.dificuldade : 'media',
    enunciado: q.enunciado || '',
    imagens: Array.isArray(q.imagens) ? q.imagens : [],
    alternativas,
    gabarito: LETRAS.includes(g) ? g : null,
    comentario: q.comentario || '',
    revisado: q.revisado === true,
    fonte_url: q.fonte_url || '',
  }
}

// Importa uma prova inteira: arquivo questoes.json + as imagens (pode escolher a pasta toda)
export default function ImportarQuestoes({ onFechar, onImportado }) {
  const [lidas, setLidas] = useState(null) // { questoes, arquivos: Map, faltando, problemas }
  const [substituir, setSubstituir] = useState(true)
  const [progresso, setProgresso] = useState(null)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')

  async function ler(e) {
    const arquivos = [...e.target.files]
    e.target.value = ''
    setErro('')
    setFeito('')
    const jsons = arquivos.filter((a) => a.name.toLowerCase().endsWith('.json'))
    if (!jsons.length) return setErro('Não achei nenhum arquivo .json. Escolha a pasta da prova (ou o questoes.json junto com as imagens).')
    const mapa = new Map(arquivos.filter((a) => /\.(png|jpe?g|webp|svg)$/i.test(a.name)).map((a) => [base(a.webkitRelativePath || a.name), a]))
    let questoes = []
    try {
      for (const j of jsons) {
        const dado = JSON.parse(await j.text())
        questoes = questoes.concat(Array.isArray(dado) ? dado : dado.questoes || [])
      }
    } catch (err) {
      return setErro('O arquivo .json está com erro: ' + err.message)
    }
    questoes = questoes.map(normalizar)
    const problemas = []
    const faltando = new Set()
    questoes.forEach((q, i) => {
      const nome = q.numero ? `Q${q.numero}` : `item ${i + 1}`
      if (!AREAS_OK.includes(q.area)) problemas.push(`${nome}: área “${q.area}” inválida`)
      if (Object.keys(q.alternativas).length < 2) problemas.push(`${nome}: sem alternativas`)
      for (const img of q.imagens) if (!/^https?:/.test(img) && !mapa.has(base(img))) faltando.add(img)
    })
    setLidas({ questoes, mapa, faltando: [...faltando], problemas })
  }

  async function importar() {
    const { questoes, mapa } = lidas
    const validas = questoes.filter((q) => AREAS_OK.includes(q.area) && Object.keys(q.alternativas).length >= 2)
    const urls = new Map() // nome do arquivo -> link já enviado
    setProgresso({ feitas: 0, total: validas.length })
    let ok = 0
    try {
      for (let i = 0; i < validas.length; i += 15) {
        const lote = []
        for (const q of validas.slice(i, i + 15)) {
          const imagens = []
          for (const img of q.imagens) {
            if (/^https?:/.test(img)) { imagens.push(img); continue }
            const arq = mapa.get(base(img))
            if (!arq) continue
            if (!urls.has(base(img))) urls.set(base(img), await enviarImagemQuestao(arq, q.prova || 'importadas'))
            imagens.push(urls.get(base(img)))
          }
          lote.push({ ...q, imagens })
        }
        const comChave = lote.filter((q) => q.prova && q.numero)
        const semChave = lote.filter((q) => !(q.prova && q.numero))
        if (comChave.length) {
          const { error, data } = await supabase
            .from('questoes')
            .upsert(comChave, { onConflict: 'prova,numero', ignoreDuplicates: !substituir })
            .select('id')
          if (error) throw error
          ok += data?.length ?? 0
        }
        if (semChave.length) {
          const { error } = await supabase.from('questoes').insert(semChave)
          if (error) throw error
          ok += semChave.length
        }
        setProgresso({ feitas: Math.min(i + 15, validas.length), total: validas.length })
      }
      setFeito(`${ok} ${ok === 1 ? 'questão importada' : 'questões importadas'}${!substituir && ok < validas.length ? ` (${validas.length - ok} já existiam e foram mantidas)` : ''}.`)
      setLidas(null)
      onImportado()
    } catch (err) {
      setErro('A importação parou: ' + err.message + (ok ? ` (${ok} já tinham entrado; pode importar de novo que não duplica)` : ''))
    }
    setProgresso(null)
  }

  const porArea = lidas ? AREAS.map((a) => [a, lidas.questoes.filter((q) => q.area === a.chave).length]).filter(([, n]) => n) : []
  const provas = lidas ? [...new Set(lidas.questoes.map((q) => q.prova).filter(Boolean))] : []

  return (
    <div className="fundo-modal" onClick={progresso ? undefined : onFechar}>
      <div className="cartao modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>⬆ Importar questões</h2>
          {!progresso && <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>}
        </div>
        <p className="suave pequeno">
          Use o arquivo que o Claude gera para cada prova: uma pasta com o <code>questoes.json</code> e as imagens.
          Descompacte o .zip e escolha a pasta inteira. Importar a mesma prova de novo não duplica: atualiza.
        </p>

        {!lidas && !progresso && (
          <div className="linha-botoes" style={{ justifyContent: 'flex-start' }}>
            <label className="botao primario">
              📁 Escolher pasta
              <input type="file" hidden webkitdirectory="" directory="" multiple onChange={ler} />
            </label>
            <label className="botao fantasma">
              Escolher arquivos
              <input type="file" hidden multiple accept=".json,image/*" onChange={ler} />
            </label>
          </div>
        )}

        {lidas && !progresso && (
          <div className="cartao q-previa-import">
            <strong>{lidas.questoes.length} questões encontradas</strong>
            {provas.length > 0 && <span className="suave pequeno">{provas.join(' · ')}</span>}
            <div className="q-selos" style={{ margin: '8px 0' }}>
              {porArea.map(([a, n]) => <span key={a.chave} className="selo" style={{ background: a.cor, color: '#fff' }}>{a.nome}: {n}</span>)}
              <span className="selo">{lidas.mapa.size} imagens</span>
              <span className="selo">{lidas.questoes.filter((q) => !q.gabarito).length} anuladas</span>
              <span className="selo selo-fixado">{lidas.questoes.filter((q) => !q.revisado).length} comentários a revisar</span>
            </div>
            {lidas.faltando.length > 0 && <p className="erro pequeno">Faltam {lidas.faltando.length} imagens: {lidas.faltando.slice(0, 5).join(', ')}{lidas.faltando.length > 5 ? '…' : ''}. Escolha a pasta inteira.</p>}
            {lidas.problemas.length > 0 && <p className="erro pequeno">{lidas.problemas.length} com problema (ficam de fora): {lidas.problemas.slice(0, 4).join('; ')}</p>}
            <label className="caixa-marcar">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
              Se a questão já existir (mesma prova e número), atualizar com a versão do arquivo
            </label>
            <div className="linha-botoes">
              <button className="botao fantasma" onClick={() => setLidas(null)}>Trocar arquivo</button>
              <button className="botao primario" onClick={importar}>Importar {lidas.questoes.length - lidas.problemas.length} questões</button>
            </div>
          </div>
        )}

        {progresso && (
          <div>
            <p>Importando… {progresso.feitas} de {progresso.total}</p>
            <div className="meta-trilho"><i style={{ width: `${(progresso.feitas / Math.max(1, progresso.total)) * 100}%` }} /></div>
            <p className="suave pequeno">Não feche esta janela.</p>
          </div>
        )}

        {feito && <p className="aviso-ok">✓ {feito}</p>}
        {erro && <p className="erro">{erro}</p>}
        {feito && <div className="linha-botoes"><button className="botao primario" onClick={onFechar}>Pronto</button></div>}
      </div>
    </div>
  )
}
