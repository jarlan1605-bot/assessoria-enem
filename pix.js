// Pix "copia e cola" (BR Code estático do Banco Central), feito no próprio site.
// O aluno cola no app do banco e o valor já vem preenchido.

const semAcento = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`

function crc16(texto) {
  let crc = 0xffff
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Formato da chave conforme o tipo escolhido
export function normalizarChave(chave, tipo) {
  const c = (chave || '').trim()
  const dig = c.replace(/\D/g, '')
  if (tipo === 'telefone') return '+55' + dig.replace(/^55(?=\d{10,11}$)/, '')
  if (tipo === 'cpf' || tipo === 'cnpj') return dig
  if (tipo === 'email') return c.toLowerCase()
  return c
}

export function pixCopiaECola({ chave, tipo, nome, cidade, valor, txid = '***', descricao = '' }) {
  const k = normalizarChave(chave, tipo)
  if (!k) return ''
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k) + (descricao ? campo('02', semAcento(descricao).slice(0, 40)) : '')
  const v = Number(valor) > 0 ? campo('54', Number(valor).toFixed(2)) : ''
  const id = semAcento(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'
  const base =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    v +
    campo('58', 'BR') +
    campo('59', semAcento(nome || 'Mentoria').toUpperCase().slice(0, 25)) +
    campo('60', semAcento(cidade || 'Brasil').toUpperCase().slice(0, 15)) +
    campo('62', campo('05', id)) +
    '6304'
  return base + crc16(base)
}

export const crc16Pix = crc16
