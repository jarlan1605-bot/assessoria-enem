import { useEffect, useState } from 'react'

// Celular: barra fixa embaixo com os 4 atalhos mais usados + "Mais" (abre o menu completo por grupos)
export default function MenuCelular({ grupos, atalhos, abaAtual, onIr, badges = {}, onSair }) {
  const avisos = Object.values(badges).reduce((a, b) => a + (b || 0), 0)
  const [aberto, setAberto] = useState(false)
  const todos = grupos.flatMap((g) => g.itens)
  const itens = atalhos.map((id) => todos.find((i) => i[0] === id)).filter(Boolean)
  const noAtalho = itens.some((i) => i[0] === abaAtual)

  useEffect(() => {
    if (!aberto) return
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', esc)
    document.body.classList.add('sem-rolar')
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('sem-rolar') }
  }, [aberto])

  const ir = (id) => { setAberto(false); onIr(id) }

  return (
    <>
      <nav className="barra-celular nao-imprimir" aria-label="Atalhos">
        {itens.map(([id, icone, nome]) => (
          <button key={id} className={abaAtual === id && !aberto ? 'bc-item ativo' : 'bc-item'} aria-current={abaAtual === id ? 'page' : undefined} onClick={() => ir(id)}>
            <span className="bc-icone" aria-hidden="true">{icone}</span>
            <span className="bc-nome">{curto(nome)}</span>
          </button>
        ))}
        <button className={!noAtalho || aberto ? 'bc-item ativo' : 'bc-item'} aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto((v) => !v)}>
          <span className="bc-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            {avisos > 0 && <i className="bc-bolinha" aria-label={`${avisos} avisos`} />}
          </span>
          <span className="bc-nome">Mais</span>
        </button>
      </nav>

      {aberto && (
        <div className="folha-fundo nao-imprimir" onClick={() => setAberto(false)}>
          <div className="folha" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <span className="folha-alca" aria-hidden="true" />
            {grupos.map((g) => (
              <section key={g.titulo} className="folha-grupo">
                <h3>{g.titulo}</h3>
                <div className="folha-itens">
                  {g.itens.map(([id, icone, nome]) => (
                    <button key={id} className={abaAtual === id ? 'folha-item ativo' : 'folha-item'} onClick={() => ir(id)}>
                      <span aria-hidden="true">{icone}</span>
                      <b>{nome}</b>
                      {badges[id] > 0 && <i className="menu-badge">{badges[id]}</i>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {onSair && <button className="folha-sair" onClick={() => { setAberto(false); onSair() }}>Sair da conta</button>}
          </div>
        </div>
      )}
    </>
  )
}

// Nome curto para caber na barra
function curto(nome) {
  const mapa = { 'Banco de questões': 'Questões', 'Meu progresso': 'Progresso', 'Progresso do aluno': 'Progresso', 'Todos os alunos': 'Alunos', 'Hoje do aluno': 'Hoje' }
  return mapa[nome] || nome
}
