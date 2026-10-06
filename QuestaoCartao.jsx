import { useState } from 'react'
import { TIPOS_ERRO } from './constants'
import { LETRAS, DIFICULDADES, nomeArea, corArea, partesDoTexto, imagensCitadas } from './questoes-util'

const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '')

// Texto da questão com as imagens no lugar de {{img:N}}
export function TextoQuestao({ texto, imagens = [], className = 'q-texto' }) {
  return (
    <div className={className}>
      {partesDoTexto(texto).map((p, i) =>
        p.img !== undefined ? (
          imagens[p.img] ? <img key={i} className="q-img" src={imagens[p.img]} alt={`Figura ${p.img + 1}`} loading="lazy" /> : null
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </div>
  )
}

export function Comentario({ q }) {
  return (
    <div className="q-comentario">
      <strong>Gabarito comentado — resposta {q.gabarito}</strong>
      {!q.revisado && <span className="selo selo-tipo">em revisão pelo mentor</span>}
      {q.comentario ? <TextoQuestao texto={q.comentario} imagens={q.imagens} /> : <p className="suave">Ainda sem comentário.</p>}
    </div>
  )
}

/*
  Uma questão do banco.
  - aluno: escolhe a alternativa, confirma, vê se acertou e o gabarito comentado;
    se errou, manda para o caderno com um toque (descuido / conteúdo / lacuna).
  - mentor: vê a resposta, o comentário e quantos alunos acertaram.
*/
export default function QuestaoCartao({
  q, indice, ultima, noCaderno, ehMentor, estat, mostrarCorrecao = true,
  onResponder, onCaderno, onEditar, compacto,
}) {
  const [escolha, setEscolha] = useState(null)
  const [resposta, setResposta] = useState(ultima || null) // { alternativa, correta, criado_em }
  const [refazendo, setRefazendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [verComentario, setVerComentario] = useState(false)
  const [verGabarito, setVerGabarito] = useState(false)
  const [caderno, setCaderno] = useState(noCaderno ? 'ok' : '') // '', 'enviando', 'ok'
  const [erro, setErro] = useState('')

  const anulada = !q.gabarito
  const respondida = resposta && !refazendo
  const corrigida = respondida && mostrarCorrecao
  const revelar = ehMentor ? verGabarito : corrigida
  const citadas = imagensCitadas(q)
  const soltas = (q.imagens || []).filter((_, i) => !citadas.has(i))

  async function confirmar() {
    if (!escolha) return
    setEnviando(true)
    setErro('')
    const r = await onResponder(q, escolha)
    setEnviando(false)
    if (r?.error) return setErro(r.error)
    setResposta(r)
    setRefazendo(false)
    setEscolha(null)
    if (!r.correta && mostrarCorrecao) setVerComentario(true)
  }

  async function mandarCaderno(motivo) {
    setCaderno('enviando')
    const r = await onCaderno(q, motivo)
    if (r?.error) {
      setErro(r.error)
      setCaderno('')
    } else setCaderno('ok')
  }

  function classeAlt(L) {
    const c = ['q-alt']
    if (revelar && L === q.gabarito) c.push('certa')
    if (corrigida && resposta.alternativa === L && !resposta.correta) c.push('errada')
    if (respondida && !mostrarCorrecao && resposta.alternativa === L) c.push('marcada')
    if (!respondida && escolha === L) c.push('escolhida')
    return c.join(' ')
  }

  const podeEscolher = !ehMentor && !anulada && !respondida

  return (
    <article className={compacto ? 'cartao questao compacta' : 'cartao questao'} style={{ '--cor': corArea(q.area) }}>
      <header className="q-topo">
        <div className="q-selos">
          {indice !== undefined && <span className="q-indice">{indice}</span>}
          <span className="selo" style={{ background: corArea(q.area), color: '#fff' }}>{nomeArea(q.area)}</span>
          <strong>{q.prova || q.banca}{q.numero ? ` · Q${q.numero}` : ''}</strong>
          {(q.materia || q.assunto) && <span className="suave pequeno">{[q.materia, q.assunto].filter(Boolean).join(' · ')}</span>}
        </div>
        <div className="q-selos">
          <span className={`selo q-dif q-dif-${q.dificuldade}`}>{DIFICULDADES[q.dificuldade]}</span>
          {ehMentor && !q.revisado && <span className="selo selo-fixado">a revisar</span>}
          {ehMentor && onEditar && <button className="link" onClick={() => onEditar(q)}>editar</button>}
        </div>
      </header>

      <TextoQuestao texto={q.enunciado} imagens={q.imagens} />
      {soltas.map((src) => <img key={src} className="q-img" src={src} alt="Figura da questão" loading="lazy" />)}

      <div className="q-alts" role={podeEscolher ? 'radiogroup' : undefined} aria-label="Alternativas">
        {LETRAS.filter((L) => q.alternativas?.[L] !== undefined && q.alternativas?.[L] !== '').map((L) => (
          <button
            key={L}
            type="button"
            className={classeAlt(L)}
            role={podeEscolher ? 'radio' : undefined}
            aria-checked={podeEscolher ? escolha === L : undefined}
            disabled={!podeEscolher}
            onClick={() => setEscolha(L)}
          >
            <span className="q-letra">{L}</span>
            <TextoQuestao texto={q.alternativas[L]} imagens={q.imagens} className="q-alt-texto" />
            {ehMentor && estat?.marcadas?.[L] > 0 && <span className="q-alt-pct">{Math.round((estat.marcadas[L] / estat.n) * 100)}%</span>}
          </button>
        ))}
      </div>

      {anulada && <p className="aviso-info">Questão anulada pelo Inep: não vale ponto e fica fora do desempenho.</p>}

      {!ehMentor && !anulada && !respondida && (
        <div className="linha-botoes q-acoes">
          {refazendo && <button className="botao fantasma" onClick={() => setRefazendo(false)}>Cancelar</button>}
          <button className="botao primario" onClick={confirmar} disabled={!escolha || enviando}>
            {enviando ? 'Enviando…' : escolha ? `Responder ${escolha}` : 'Escolha uma alternativa'}
          </button>
        </div>
      )}

      {respondida && !mostrarCorrecao && <p className="suave pequeno">Marcada: {resposta.alternativa}. A correção aparece no final.</p>}

      {corrigida && (
        <div className={resposta.correta ? 'q-resultado certo' : 'q-resultado errado'}>
          <span>
            {resposta.correta ? '✓ Você acertou!' : `✗ Você marcou ${resposta.alternativa}. A resposta é ${q.gabarito}.`}
            {ultima && resposta === ultima && <span className="suave pequeno"> · feita em {dataBR(ultima.criado_em)}</span>}
          </span>
          <span className="q-resultado-acoes">
            <button className="link" onClick={() => setVerComentario((v) => !v)}>{verComentario ? 'esconder comentário' : 'ver gabarito comentado'}</button>
            <button className="link" onClick={() => { setRefazendo(true); setVerComentario(false) }}>refazer</button>
          </span>
        </div>
      )}

      {corrigida && !resposta.correta && onCaderno && (
        <div className="q-caderno">
          {caderno === 'ok' ? (
            <span className="suave pequeno">📕 Está no seu caderno de erros (revisão em 1, 7 e 30 dias).</span>
          ) : (
            <>
              <span className="pequeno"><b>Por que errou?</b> Toque e ela vai pro caderno:</span>
              <span className="er-tipos">
                {Object.entries(TIPOS_ERRO).map(([k, t]) => (
                  <button key={k} type="button" className="er-tipo" style={{ '--cor': t.cor }} title={t.desc} disabled={caderno === 'enviando'} onClick={() => mandarCaderno(k)}>
                    {t.nome}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      )}

      {ehMentor && (
        <div className="q-resultado">
          <span className="suave pequeno">
            {estat?.n ? `${estat.n} ${estat.n === 1 ? 'aluno respondeu' : 'alunos responderam'} · ${estat.pct}% acertaram` : 'Nenhum aluno respondeu ainda'}
          </span>
          {!anulada && <button className="link" onClick={() => setVerGabarito((v) => !v)}>{verGabarito ? 'esconder resposta' : 'ver resposta e comentário'}</button>}
        </div>
      )}

      {((corrigida && verComentario) || (ehMentor && verGabarito)) && !anulada && <Comentario q={q} />}
      {erro && <p className="erro">{erro}</p>}
    </article>
  )
}
