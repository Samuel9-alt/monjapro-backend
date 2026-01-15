// Endpoint: POST /api/mercadopago/create-preference
// Cria uma preferência de pagamento no Mercado Pago

import { Request, Response } from 'express'
import { preferenceClient, CALLBACK_URLS, PLANOS } from './config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CreatePreferenceBody {
  plano: 'monthly' | 'yearly'
  usuario_id: string
  nome: string
  email: string
  cpf: string
}

export async function createPreference(req: Request, res: Response) {
  try {
    const { plano, usuario_id, nome, email, cpf } = req.body as CreatePreferenceBody

    // Validações
    if (!plano || !usuario_id || !nome || !email || !cpf) {
      return res.status(400).json({
        error: 'Campos obrigatórios: plano, usuario_id, nome, email, cpf'
      })
    }

    if (!PLANOS[plano]) {
      return res.status(400).json({
        error: 'Plano inválido. Use "monthly" ou "yearly"'
      })
    }

    const planoSelecionado = PLANOS[plano]

    // 1. Criar registro de assinatura no Supabase (status: pending)
    const { data: assinatura, error: assinaturaError } = await supabase
      .from('assinaturas')
      .insert({
        usuario_id,
        plano,
        status: 'pending',
        preco: planoSelecionado.preco,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (assinaturaError || !assinatura) {
      console.error('Erro ao criar assinatura:', assinaturaError)
      return res.status(500).json({
        error: 'Erro ao criar assinatura no banco de dados'
      })
    }

    // 2. Criar preferência no Mercado Pago com Pix habilitado
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: assinatura.id,
            title: planoSelecionado.titulo,
            description: planoSelecionado.descricao,
            quantity: 1,
            unit_price: planoSelecionado.preco,
            currency_id: 'BRL'
          }
        ],
        payer: {
          name: nome,
          email: email,
          identification: {
            type: 'CPF',
            number: cpf.replace(/\D/g, '')
          }
        },
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
          installments: 12,
          default_installments: 1
        },
        back_urls: {
          success: `${CALLBACK_URLS.success}?assinatura_id=${assinatura.id}`,
          failure: `${CALLBACK_URLS.failure}?assinatura_id=${assinatura.id}`,
          pending: `${CALLBACK_URLS.pending}?assinatura_id=${assinatura.id}`
        },
        notification_url: CALLBACK_URLS.notification,
        auto_return: 'approved',
        external_reference: assinatura.id,
        statement_descriptor: 'MONJAPRO',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }
    })

    if (!preference.id || !preference.init_point) {
      return res.status(500).json({
        error: 'Erro ao criar preferência no Mercado Pago'
      })
    }

    // 3. Atualizar assinatura com o preference_id
    await supabase
      .from('assinaturas')
      .update({
        mercadopago_preference_id: preference.id
      })
      .eq('id', assinatura.id)

    // 4. Retornar URL de pagamento
    res.json({
      success: true,
      assinatura_id: assinatura.id,
      preference_id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point
    })

  } catch (error) {
    console.error('Erro ao criar preferência:', error)
    res.status(500).json({
      error: 'Erro interno ao processar pagamento',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}
