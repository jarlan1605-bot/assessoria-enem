import { Component } from 'react'

// Se uma aba der erro, mostra um aviso em vez de derrubar o site inteiro em tela branca.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro) {
    console.error('Erro na tela:', erro)
  }

  componentDidUpdate(anterior) {
    // trocou de aba: tenta de novo
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null })
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="cartao vazio" role="alert">
        <h2>Algo deu errado nesta tela</h2>
        <p>Seus dados estão salvos. Tente recarregar a página; se continuar, avise seu mentor.</p>
        <button className="botao primario" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    )
  }
}
