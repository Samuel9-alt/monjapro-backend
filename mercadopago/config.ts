// Configuração do Mercado Pago
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

// Validar variáveis de ambiente
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
if (!accessToken) {
  throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis de ambiente')
}

// Inicializar cliente do Mercado Pago
export const mercadopagoClient = new MercadoPagoConfig({
  accessToken: accessToken,
  options: {
    timeout: 5000,
    idempotencyKey: 'your-idempotency-key'
  }
})

// Instanciar serviços
export const preferenceClient = new Preference(mercadopagoClient)
export const paymentClient = new Payment(mercadopagoClient)

// URLs de callback
export const CALLBACK_URLS = {
  success: process.env.MERCADOPAGO_SUCCESS_URL || 'https://seuapp.com/pagamento/sucesso',
  failure: process.env.MERCADOPAGO_FAILURE_URL || 'https://seuapp.com/pagamento/erro',
  pending: process.env.MERCADOPAGO_PENDING_URL || 'https://seuapp.com/pagamento/pendente',
  notification: process.env.MERCADOPAGO_WEBHOOK_URL || 'https://seuapp.com/api/mercadopago/webhook'
}

// Configuração de planos
export const PLANOS = {
  monthly: {
    titulo: 'MonjaPro - Plano Mensal',
    preco: 29.90,
    descricao: 'Acesso premium por 1 mês com renovação automática'
  },
  yearly: {
    titulo: 'MonjaPro - Plano Anual',
    preco: 239.00,
    descricao: 'Acesso premium por 12 meses com renovação automática'
  }
}
