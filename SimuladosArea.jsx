import { TIPOS_ERRO, MATERIAS_POR_AREA } from './constants'

const dataBR = (iso) => iso.split('-').reverse().slice(0, 2).join('/')
const fmt = (v, casas = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(casas).replace('.', ','))
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(2).replace('.', ',')}%`)

// Soma, média, moda, máximo e mínimo de uma lista (ignora vazios)
function resumo(valores) {
  const v = valores.filter((x) => x !== null && x !== undefined && !Number.isNaN(x))
  if (!v.length) return { soma: null, media: null, moda: null, max: null, min: null }
  const soma = v.reduce((a, b) => a + b, 0)
  const freq = {}
  v.forEach((x) => { const k = Math.round(x * 10000) / 10000; freq[k] = (freq[k] || 0) + 1 })
  const maiorFreq = Math.max(...Object.values(freq))
  const moda = maiorFreq > 1 ? Math.max(...Object.keys(freq).filter((k) => freq[k] === maiorFreq).map(Number)) : null
  return { soma, media: soma / v.length, moda, max: Math.max(...v), min: Math.min(...v) }
}

export default function SimuladosArea({ area, simulados, noCaderno, onEditar, onRegistrar }) {
  const k = area.chave
  const materias = MATERIAS_POR_AREA[k]
  const linhas = simulados
    .filter((s) => s[k] !== null)
    .map((s) => {
      const d = s.detalhes?.[k]
      const questoes = Number(d?.questoes) || 45
      const erros = questoes - s[k]
      return {
        s,
        acertos: s[k],
        erros,
        questoes,
        taxa: s[k] / questoes,
        d,
        tipos: Object.fromEntries(Object.keys(TIPOS_ERRO).map((t) => [t, d ? Number(d[t]) || 0 : null])),
        mats: Object.fromEntries(materias.map((m) => [m, d ? Number(d.materias?.[m]) || 0 : null])),
        caderno: noCaderno[`${s.id}|${k}`] || 0,
      }
    })

  if (!linhas.length) {
    return <div className="cartao vazio"><p style={{ margin: 0 }}>Nenhum simulado de {area.nome} lançado ainda.</p></div>
  }

  const colunas = [
    ['Total acertos', (l) => l.acertos, 0],
    ['Total erros', (l) => l.erros, 0],
    ...Object.entries(TIPOS_ERRO).map(([t, info]) => [`Erros ${info.nome.toLowerCase()}`, (l) => l.tipos[t], 0, info.cor]),
    ...materias.map((m) => [`Erros ${m}`, (l) => l.mats[m], 0, area.cor]),
    ['Total questões', (l) => l.questoes, 0],
  ]
  const resumos = colunas.map(([, f]) => resumo(linhas.map(f)))
  const resumoTaxa = resumo(linhas.map((l) => l.taxa))
  const somaAcertos = linhas.reduce((t, l) => t + l.acertos, 0)
  const somaQuestoes = linhas.reduce((t, l) => t + l.questoes, 0)

  // Gráficos: tipos de erro por simulado (últimos 12, do mais antigo ao mais novo) e peso de cada matéria
  const comDetalhe = linhas.filter((l) => l.d).slice(0, 12).reverse()
  const maxErros = Math.max(1, ...comDetalhe.map((l) => l.erros))
  const totalTipos = Object.fromEntries(Object.keys(TIPOS_ERRO).map((t) => [t, linhas.reduce((s, l) => s + (l.tipos[t] || 0), 0)]))
  const totalMats = materias.map((m) => [m, linhas.reduce((s, l) => s + (l.mats[m] || 0), 0)]).sort((a, b) => b[1] - a[1])
  const somaMats = totalMats.reduce((t, [, n]) => t + n, 0)
  const somaTipos = Object.values(totalTipos).reduce((a, b) => a + b, 0)
  const tipoTop = Object.entries(totalTipos).sort((a, b) => b[1] - a[1])[0]
  const errosTotais = linhas.reduce((t, l) => t + l.erros, 0)
  const noCadernoTotal = linhas.reduce((t, l) => t + Math.min(l.caderno, l.erros), 0)

  return (
    <>
      <div className="resumo-cartoes resumo-agenda">
        <div className="cartao mini" style={{ '--cor': area.cor }}>
          <span className="mini-titulo">Simulados de {area.nome}</span>
          <strong className="mini-numero">{linhas.length}</strong>
          <span className="suave pequeno">{pct(somaAcertos / somaQuestoes)} de acerto no total</span>
        </div>
        <div className="cartao mini" style={{ '--cor': tipoTop?.[1] ? TIPOS_ERRO[tipoTop[0]].cor : '#868e96' }}>
          <span className="mini-titulo">Tipo de erro mais comum</span>
          <strong className="mini-numero" style={{ fontSize: 22, marginTop: 4 }}>{tipoTop?.[1] ? TIPOS_ERRO[tipoTop[0]].nome : '—'}</strong>
          <span className="suave pequeno">{tipoTop?.[1] ? `${Math.round((tipoTop[1] / somaTipos) * 100)}% dos erros classificados` : 'detalhe os erros ao lançar'}</span>
        </div>
        <div className="cartao mini" style={{ '--cor': area.cor }}>
          <span className="mini-titulo">{k === 'matematica' ? 'Tema' : 'Matéria'} que mais erra</span>
          <strong className="mini-numero" style={{ fontSize: 22, marginTop: 4 }}>{somaMats ? totalMats[0][0] : '—'}</strong>
          <span className="suave pequeno">{somaMats ? `${Math.round((totalMats[0][1] / somaMats) * 100)}% dos erros` : 'detalhe os erros ao lançar'}</span>
        </div>
        <div className="cartao mini" style={{ '--cor': '#e8590c' }}>
          <span className="mini-titulo">No caderno de erros</span>
          <strong className="mini-numero">{noCadernoTotal}<small className="de">/{errosTotais}</small></strong>
          <span className="suave pequeno">erros registrados para revisar</span>
        </div>
      </div>

      <div className="cartao">
        <h2>{area.nome}</h2>
        <div className="tabela-rolagem">
          <table className="tabela tabela-planilha" style={{ '--cor': area.cor }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Simulado</th>
                {colunas.map(([nome, , , cor]) => <th key={nome} className="num" style={cor ? { color: cor } : undefined}>{nome}</th>)}
                <th className="num">% de acertos</th>
                <th className="num">Caderno</th>
                <th>Observação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[['Soma', 'soma'], ['Média', 'media'], ['Moda', 'moda'], ['Máx', 'max'], ['Mín', 'min']].map(([rot, chave]) => (
                <tr key={chave} className="linha-resumo">
                  <td colSpan={2}><b>{rot.toUpperCase()}</b></td>
                  {resumos.map((r, i) => <td key={i} className="num">{fmt(r[chave], chave === 'media' ? 1 : 0)}</td>)}
                  <td className="num">{chave === 'soma' ? pct(somaAcertos / somaQuestoes) : pct(resumoTaxa[chave])}</td>
                  <td></td><td></td><td></td>
                </tr>
              ))}
              {linhas.map((l) => (
                <tr key={l.s.id}>
                  <td>{dataBR(l.s.data)}</td>
                  <td>{l.s.nome || '—'}</td>
                  {colunas.map(([nome, f], i) => (
                    <td key={nome} className={i === 1 ? 'num celula-erros' : 'num'}>{f(l) ?? <span className="suave">·</span>}</td>
                  ))}
                  <td className="num"><b>{pct(l.taxa)}</b></td>
                  <td className="num">
                    {l.erros > 0 ? (
                      <button className={l.caderno >= l.erros ? 'selo selo-novo' : 'selo selo-fixado'} onClick={() => onRegistrar(l.s)} title="Registrar questões erradas no caderno">
                        {Math.min(l.caderno, l.erros)}/{l.erros}
                      </button>
                    ) : '✓'}
                  </td>
                  <td className="pequeno">{l.s.observacoes}</td>
                  <td className="acoes-tabela">
                    {!l.d && <button className="link" onClick={() => onEditar(l.s)}>detalhar</button>}
                    {l.d && <button className="link" onClick={() => onEditar(l.s)}>editar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="suave pequeno" style={{ margin: '8px 0 0' }}>“·” = simulado sem erros detalhados. Clique em “detalhar” para completar.</p>
      </div>

      <div className="graficos">
        <div className="cartao">
          <h2>Tipos de erro por simulado</h2>
          {comDetalhe.length === 0 ? (
            <p className="suave pequeno">Aparece quando você detalhar os erros de algum simulado.</p>
          ) : (
            <>
              <div className="barras-empilhadas">
                {comDetalhe.map((l) => (
                  <div key={l.s.id} className="coluna-empilhada" title={`${l.s.nome || dataBR(l.s.data)}: ${l.erros} erros`}>
                    <div className="coluna-pilha" style={{ height: `${(l.erros / maxErros) * 100}%` }}>
                      {Object.entries(TIPOS_ERRO).map(([t, info]) =>
                        l.tipos[t] ? <i key={t} style={{ flex: l.tipos[t], background: info.cor }} /> : null
                      )}
                      {l.erros - Object.values(l.tipos).reduce((a, b) => a + (b || 0), 0) > 0 && (
                        <i style={{ flex: l.erros - Object.values(l.tipos).reduce((a, b) => a + (b || 0), 0), background: 'var(--borda)' }} />
                      )}
                    </div>
                    <span className="coluna-num">{l.erros}</span>
                    <small>{dataBR(l.s.data)}</small>
                  </div>
                ))}
              </div>
              <div className="legenda">
                {Object.values(TIPOS_ERRO).map((t) => <span key={t.nome}><i style={{ background: t.cor }} /> {t.nome}</span>)}
                <span><i style={{ background: 'var(--borda)' }} /> não classificado</span>
              </div>
            </>
          )}
        </div>
        <div className="cartao">
          <h2>Onde estão seus erros</h2>
          {somaMats === 0 ? (
            <p className="suave pequeno">Aparece quando você detalhar os erros por {k === 'matematica' ? 'tema' : 'matéria'}.</p>
          ) : (
            <div className="barras-h">
              {totalMats.map(([m, n]) => (
                <div key={m} className="barra-h">
                  <span className="barra-h-nome">{m}</span>
                  <span className="barra-h-trilho"><i style={{ width: `${(n / somaMats) * 100}%`, background: area.cor }} /></span>
                  <span className="barra-h-num">{Math.round((n / somaMats) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          {tipoTop?.[1] > 0 && (
            <p className="suave pequeno" style={{ marginTop: 12, marginBottom: 0 }}>
              {tipoTop[0] === 'descuido' && 'Mais erros por descuido: treine conferir o comando e as contas antes de marcar.'}
              {tipoTop[0] === 'conteudo' && 'Mais erros de conteúdo: revise a teoria dos assuntos do caderno de erros antes do próximo simulado.'}
              {tipoTop[0] === 'lacuna' && 'Mais erros por lacuna: vale encaixar esses assuntos no horário de estudos.'}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
