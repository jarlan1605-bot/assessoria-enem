import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { dataBR, reais } from './cobranca'

const STATUS = {
  novo: { nome: 'Novo', cor: '#e8590c' },
  contatado: { nome: 'Contatado', cor: '#1971c2' },
  matriculado: { nome: 'Matriculado', cor: '#2f9e44' },
  desistiu: { nome: 'Desistiu', cor: '#868e96' },
}

const zap = (n, nome) => {
  const d = String(n || '').replace(/\D/g, '')
  const texto = `Olá, ${(nome || '').split(' ')[0]}! Aqui é da Assessoria J&C. Vi que você entrou na lista de interesse para 2027 😊`
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}?text=${encodeURIComponent(texto)}`
}
const telefone = (n) => {
  const d = String(n || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : n
}

// CEO: quem preencheu o formulário de interesse da página de apresentação
export default function Interessados({ equipe = [] }) {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('interessados').select('*').order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar. Você já rodou o arquivo interessados.sql no Supabase?')
    else { setErro(''); setLista(data ?? []) }
    setCarregando(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function mudar(item, campos) {
    setLista((l) => l.map((x) => (x.id === item.id ? { ...x, ...campos } : x)))
    const { error } = await supabase.from('interessados').update(campos).eq('id', item.id)
    if (error) { setErro('Não foi possível salvar: ' + error.message); carregar() }
  }

  async function apagar(item) {
    if (!confirm(`Apagar o cadastro de ${item.nome}?`)) return
    const { error } = await supabase.from('interessados').delete().eq('id', item.id)
    if (error) setErro('Não foi possível apagar: ' + error.message)
    else { setAberto(null); carregar() }
  }

  function exportar() {
    const campos = ['criado_em', 'nome', 'whatsapp', 'email', 'idade', 'cidade', 'situacao', 'curso', 'dificuldade', 'como_conheceu', 'responsavel', 'mensagem', 'status', 'anotacao']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [campos.join(';'), ...lista.map((i) => campos.map((c) => esc(c === 'criado_em' ? dataBR(i[c]) : i[c])).join(';'))].join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'interessados-2027.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const contagem = (s) => lista.filter((i) => i.status === s).length
  const termo = busca.trim().toLowerCase()
  const visiveis = lista.filter((i) =>
    (filtro === 'todos' || i.status === filtro) &&
    (!termo || `${i.nome} ${i.cidade} ${i.curso} ${i.whatsapp} ${i.email}`.toLowerCase().includes(termo))
  )
  const semana = lista.filter((i) => Date.now() - new Date(i.criado_em).getTime() < 7 * 86400000).length

  return (
    <section className="secao interessados">
      <div className="resumo-cartoes int-resumo">
        <div className="cartao mini" style={{ '--cor': 'var(--primaria)' }}><span className="mini-titulo">Total na lista</span><strong className="mini-numero">{lista.length}</strong></div>
        <div className="cartao mini" style={{ '--cor': '#e8590c' }}><span className="mini-titulo">Novos (sem contato)</span><strong className="mini-numero">{contagem('novo')}</strong></div>
        <div className="cartao mini" style={{ '--cor': '#7048e8' }}><span className="mini-titulo">Nos últimos 7 dias</span><strong className="mini-numero">{semana}</strong></div>
        <div className="cartao mini" style={{ '--cor': '#2f9e44' }}><span className="mini-titulo">Matriculados</span><strong className="mini-numero">{contagem('matriculado')}</strong></div>
      </div>

      <div className="cartao int-filtros">
        <div className="filtros">
          <button className={filtro === 'todos' ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro('todos')}>Todos <span className="filtro-num">{lista.length}</span></button>
          {Object.entries(STATUS).map(([k, s]) => (
            <button key={k} className={filtro === k ? 'filtro ativo' : 'filtro'} onClick={() => setFiltro(k)}>{s.nome} <span className="filtro-num">{contagem(k)}</span></button>
          ))}
        </div>
        <div className="int-busca">
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, cidade, curso…" aria-label="Buscar" />
          <button className="botao" onClick={exportar} disabled={!lista.length}>⬇ Planilha</button>
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {carregando ? (
        <p className="suave">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <p style={{ margin: 0 }}>{lista.length ? 'Ninguém com esses filtros.' : 'Ninguém se cadastrou ainda. O formulário fica na página de apresentação, na seção "Vagas 2027".'}</p>
        </div>
      ) : (
        <div className="int-grade">
          {visiveis.map((i) => {
            const s = STATUS[i.status] ?? STATUS.novo
            return (
              <article key={i.id} className="cartao int-cartao" style={{ '--cor': s.cor }}>
                <header>
                  <div>
                    <h3>{i.nome}</h3>
                    <span className="suave pequeno">{[i.idade && `${i.idade} anos`, i.cidade].filter(Boolean).join(' · ') || 'Sem idade e cidade'} · {dataBR(i.criado_em)}</span>
                  </div>
                  <select className="int-status" value={i.status} onChange={(e) => mudar(i, { status: e.target.value })} aria-label="Andamento">
                    {Object.entries(STATUS).map(([k, st]) => <option key={k} value={k}>{st.nome}</option>)}
                  </select>
                </header>
                {i.pago !== undefined && (
                  <div className="int-pagamento">
                    {i.pago
                      ? <span className="int-pago">✓ Pago {i.valor ? reais(i.valor) : ''}{i.pago_em ? ` · ${dataBR(i.pago_em)}` : ''}</span>
                      : i.link_pagamento ? <span className="int-aguardando">⏳ Aguardando pagamento</span> : null}
                    {i.mentor_id && <span className="int-assessor">Assessor: {(equipe.find((m) => m.id === i.mentor_id)?.nome || '—').split(' ')[0]}</span>}
                    {i.aluno_id && <span className="int-assessor">Conta criada ✓</span>}
                  </div>
                )}
                <div className="int-tags">
                  {i.situacao && <span>{i.situacao}</span>}
                  {i.curso && <span>🎯 {i.curso}</span>}
                  {i.como_conheceu && <span>via {i.como_conheceu}</span>}
                </div>
                {i.dificuldade && <p className="pequeno" style={{ margin: 0 }}><b>Precisa de ajuda em:</b> {i.dificuldade}</p>}
                {i.mensagem && <p className="int-msg">“{i.mensagem}”</p>}
                {aberto === i.id && (
                  <div className="int-detalhes">
                    {i.responsavel && <p className="pequeno"><b>Responsável:</b> {i.responsavel}</p>}
                    {i.email && <p className="pequeno"><b>E-mail:</b> <a href={`mailto:${i.email}`}>{i.email}</a></p>}
                    <label>Anotação (só você vê)
                      <textarea rows={2} defaultValue={i.anotacao} maxLength={600} onBlur={(e) => e.target.value !== i.anotacao && mudar(i, { anotacao: e.target.value })} placeholder="Ex.: ligar em janeiro, quer plano mensal…" />
                    </label>
                    <button className="link perigo" onClick={() => apagar(i)}>Apagar cadastro</button>
                  </div>
                )}
                <div className="int-acoes">
                  <a className="botao primario pequeno" href={zap(i.whatsapp, i.nome)} target="_blank" rel="noreferrer" onClick={() => i.status === 'novo' && mudar(i, { status: 'contatado' })}>💬 {telefone(i.whatsapp)}</a>
                  <button className="botao fantasma pequeno" onClick={() => setAberto(aberto === i.id ? null : i.id)}>{aberto === i.id ? 'Fechar' : 'Mais'}</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
