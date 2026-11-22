import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './styles.css'
import './interativo.js'

const raiz = ReactDOM.createRoot(document.getElementById('root'))
// Só no modo de desenvolvimento: telas de exemplo para conferir o visual (?demo=hoje, foco, lista, pdf, cartoes, conquistas)
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
  const Demo = React.lazy(() => import('./demo.jsx'))
  raiz.render(<React.Suspense fallback={null}><Demo /></React.Suspense>)
} else raiz.render(
  <React.StrictMode>
    <ErrorBoundary chave="app"><App /></ErrorBoundary>
  </React.StrictMode>
)
