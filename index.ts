// Servidor Express com endpoints do Mercado Pago
import express from 'express'
import cors from 'cors'
import { createPreference } from './mercadopago/create-preference'
import { handleWebhook } from './mercadopago/webhook'

const app = express()
const PORT = process.env.PORT || 3001

// Middlewares
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Log de requisições
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MonjaPro API'
  })
})

// === MERCADO PAGO ROUTES ===

// Criar preferência de pagamento
app.post('/api/mercadopago/create-preference', createPreference)

// Receber webhooks do Mercado Pago
app.post('/api/mercadopago/webhook', handleWebhook)

// Erro 404
app.use((_req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado'
  })
})

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Erro não tratado:', err)
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: err.message
  })
})

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📍 Health check: http://localhost:${PORT}/health`)
  console.log(`💳 Create preference: POST http://localhost:${PORT}/api/mercadopago/create-preference`)
  console.log(`🔔 Webhook: POST http://localhost:${PORT}/api/mercadopago/webhook`)
})

export default app
