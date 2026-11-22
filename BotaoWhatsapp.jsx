import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { primeiroNome } from './estudo'

// Botão verde "Precisa de ajuda?" que abre o WhatsApp do mentor do aluno (ou o número geral da assessoria)
export default function BotaoWhatsapp({ perfil }) {
  const [contato, setContato] = useState(null)
  useEffect(() => {
    supabase.rpc('contato_mentor').then(({ data }) => setContato(data || null), () => {})
  }, [])
  if (!contato?.whatsapp) return null
  let numero = String(contato.whatsapp).replace(/\D/g, '')
  if (numero.length <= 11) numero = '55' + numero
  const mentor = contato.nome || 'mentor'
  const texto = `Oi, ${mentor}! Aqui é ${primeiroNome(perfil.nome)}, preciso de ajuda com…`
  return (
    <a className="botao-whatsapp nao-imprimir" href={`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer" aria-label={`Precisa de ajuda? Chamar ${mentor} no WhatsApp`}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.7c-2 0-3.9-.5-5.6-1.5l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.3 14.3 0 0 0 5.5 4.8c2 .9 2.8 1 3.8.8a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3z" /></svg>
      <span>Precisa de ajuda?</span>
    </a>
  )
}
