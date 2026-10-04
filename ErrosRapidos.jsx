import { useState } from 'react'
import { supabase } from './supabase'
import { AREAS, TIPOS_ERRO, MATERIAS_POR_AREA } from './constants'
import { hojeISO, somarDias } from './agenda'

const linhaVazia = (area) => ({ numero: '', materia: MATERIAS_POR_AREA[area][0], motivo: 'conteudo', assunto: '' })
const dataBR = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

// Registro rápido das questões erradas de um simulado direto no caderno de erros
export default function ErrosRapidos({ alunoId, simulado, areaInicial, jaNoCaderno, onFechar, onSalvo }) {
  const areasComErro = AREAS.filter((a) => simulado[a.chave] !== null && (Number(simulado.detalhes?.[a.chave]?.questoes) || 45) - simulado[a.chave] > 0)
  const [area, setArea] = useState(areaInicial)
  const [linhas, setLinhas] = useState(() =>
    Object.fromEntries(AREAS.map((a) => [a.chave, [linhaVazia(a.chave), linhaVazia(a.chave), linhaVazia(a.chave)]]))
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const info = AREAS.find((a) => a.chave === area)
  const errosArea = (Number(simulado.detalhes?.[area]?.questoes) || 45) - (simulado[area] ?? 0)
  const mudar = (i, campo, valor) =>
    setLinhas((l) => ({ ...l, [area]: l[area].map((x, k) => (k === i ? { ...x, [campo]: valor } : x)) }))
  const preenchida = (x) => x.numero || x.assunto.trim()
  const totalPreenchidas = Object.values(linhas).flat().filter(preenchida).length

  async function salvar() {
    const origemBase = simulado.nome || `Simulado ${dataBR(simulado.data)}`
    const registros = AREAS.flatMap((a) =>
      linhas[a.chave].filter(preenchida).map((x) => ({
        aluno_id: alunoId,
        simulado_id: simulado.id,
        area: a.chave,
        materia: x.materia,
        assunto: x.assunto.trim(),
        motivo: x.motivo,
        numero_questao: x.numero ? Number(x.numero) : null,
        origem: x.numero ? `${origemBase} — Q${x.numero}` : origemBase,
        proxima_revisao: somarDias(hojeISO(), 1),
      }))
    )
    if (!registros.length) return setErro('Preencha pelo menos o número da questão ou o assunto.')
    setSalvando(true)
    const { error } = await supabase.from('erros').insert(registros)
    setSalvando(false)
    if (error) {
      return setErro(/simulado_id|numero_questao|motivo/.test(error.message) ? 'Rode o arquivo detalhes.sql no Supabase para usar esta função.' : 'Não foi possível salvar: ' + error.message)
    }
    onSalvo(registros.length)
  }

  return (
    <div className="fundo-modal" onClick={onFechar}>
      <div className="cartao modal modal-erros" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h2>📕 Questões erradas → caderno</h2>
          <button className="botao fantasma pequeno" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>
        <p className="suave pequeno">{simulado.nome || 'Simulado'} · {dataBR(simulado.data)}. Coloque o número da questão e, se souber, o assunto. Cada linha vira um erro no caderno com revisão em 1, 7 e 30 dias.</p>

        <div className="filtros" style={{ margin: '10px 0' }}>
          {(areasComErro.length ? areasComErro : AREAS).map((a) => (
            <button key={a.chave} className={area === a.chave ? 'filtro ativo' : 'filtro'} onClick={() => setArea(a.chave)}>
              {a.nome} <span className="filtro-num">{linhas[a.chave].filter(preenchida).length + jaNoCaderno(a.chave)}/{(Number(simulado.detalhes?.[a.chave]?.questoes) || 45) - (simulado[a.chave] ?? 0)}</span>
            </button>
          ))}
        </div>

        <div className="erros-rapidos" style={{ '--cor': info.cor }}>
          <div className="er-cab"><span>Questão</span><span>{area === 'matematica' ? 'Tema' : 'Matéria'}</span><span>Tipo</span><span>Assunto (opcional)</span><span></span></div>
          {linhas[area].map((x, i) => (
            <div key={i} className="er-linha">
              <input type="number" inputMode="numeric" min="1" max="180" value={x.numero} onChange={(e) => mudar(i, 'numero', e.target.value)} placeholder="Nº" aria-label="Número da questão" />
              <select value={x.materia} onChange={(e) => mudar(i, 'materia', e.target.value)} aria-label="Matéria">
                {MATERIAS_POR_AREA[area].map((m) => <option key={m}>{m}</option>)}
              </select>
              <span className="er-tipos" role="radiogroup" aria-label="Tipo de erro">
                {Object.entries(TIPOS_ERRO).map(([k, t]) => (
                  <button key={k} type="button" role="radio" aria-checked={x.motivo === k} title={t.desc} className={x.motivo === k ? 'er-tipo ativo' : 'er-tipo'} style={{ '--cor': t.cor }} onClick={() => mudar(i, 'motivo', k)}>
                    {t.nome}
                  </button>
                ))}
              </span>
              <input value={x.assunto} onChange={(e) => mudar(i, 'assunto', e.target.value)} placeholder="Ex.: genética" aria-label="Assunto" />
              <button type="button" className="link perigo" onClick={() => setLinhas((l) => ({ ...l, [area]: l[area].filter((_, k) => k !== i) }))} aria-label="Remover linha">✕</button>
            </div>
          ))}
          <button type="button" className="botao fantasma pequeno" onClick={() => setLinhas((l) => ({ ...l, [area]: [...l[area], linhaVazia(area)] }))}>
            + outra questão
          </button>
          {jaNoCaderno(area) > 0 && <p className="suave pequeno" style={{ margin: '6px 0 0' }}>{jaNoCaderno(area)} {jaNoCaderno(area) === 1 ? 'erro desta área já está' : 'erros desta área já estão'} no caderno.</p>}
          {errosArea <= 0 && <p className="suave pequeno">Nenhum erro nesta área. 🎉</p>}
        </div>

        {erro && <p className="erro">{erro}</p>}
        <div className="linha-botoes">
          <button className="botao fantasma" onClick={onFechar}>Fechar</button>
          <button className="botao primario" onClick={salvar} disabled={salvando || !totalPreenchidas}>
            {salvando ? 'Salvando…' : `Mandar ${totalPreenchidas || ''} para o caderno`}
          </button>
        </div>
      </div>
    </div>
  )
}
