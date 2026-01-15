// Endpoint: POST /api/mercadopago/webhook
// Recebe notificações do Mercado Pago sobre mudanças de status de pagamento

import { Request, Response } from 'express'
import { paymentClient } from './config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function handleWebhook(req: Request, res: Response) {
  try {
    const { type, data, action } = req.body

    console.log('Webhook recebido:', { type, action, data })

    // 1. Salvar webhook no banco (para auditoria)
    const { data: webhookLog } = await supabase
      .from('webhooks_mercadopago')
      .insert({
        tipo: type,
        acao: action,
        payment_id: data?.id || null,
        dados_completos: req.body,
        processado: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    // 2. Processar apenas notificações de pagamento
    if (type === 'payment' && data?.id) {
      await processarPagamento(data.id, webhookLog?.id)
    }

    res.status(200).json({ success: true })

  } catch (error) {
    console.error('Erro ao processar webhook:', error)
    res.status(200).json({ error: 'Erro ao processar' })
  }
}

async function processarPagamento(paymentId: string, webhookId?: string) {
  try {
    // 1. Buscar detalhes do pagamento no Mercado Pago
    const payment = await paymentClient.get({ id: paymentId })

    if (!payment) {
      console.error('Pagamento não encontrado:', paymentId)
      return
    }

    console.log('Processando pagamento:', {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference
    })

    const assinaturaId = payment.external_reference

    // 2. Registrar pagamento no histórico
    await supabase
      .from('pagamentos')
      .insert({
        assinatura_id: assinaturaId,
        mercadopago_payment_id: payment.id?.toString(),
        status: payment.status,
        status_detail: payment.status_detail,
        valor: payment.transaction_amount,
        metodo_pagamento: payment.payment_method_id,
        tipo_pagamento: payment.payment_type_id,
        parcelas: payment.installments,
        email_pagador: payment.payer?.email,
        nome_pagador: payment.payer?.first_name,
        cpf_pagador: payment.payer?.identification?.number,
        data_aprovacao: payment.date_approved,
        webhook_data: payment,
        created_at: new Date().toISOString()
      })

    // 3. Atualizar status da assinatura
    if (payment.status === 'approved') {
      const dataInicio = new Date()
      let dataFim: Date
      let dataProximaCobranca: Date

      const { data: assinatura } = await supabase
        .from('assinaturas')
        .select('plano')
        .eq('id', assinaturaId)
        .single()

      if (assinatura?.plano === 'monthly') {
        dataFim = new Date(dataInicio)
        dataFim.setMonth(dataFim.getMonth() + 1)
        dataProximaCobranca = dataFim
      } else {
        dataFim = new Date(dataInicio)
        dataFim.setFullYear(dataFim.getFullYear() + 1)
        dataProximaCobranca = dataFim
      }

      await supabase
        .from('assinaturas')
        .update({
          status: 'active',
          data_inicio: dataInicio.toISOString(),
          data_fim: dataFim.toISOString(),
          data_proxima_cobranca: dataProximaCobranca.toISOString(),
          mercadopago_subscription_id: payment.id?.toString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', assinaturaId)

      const { data: assinaturaAtual } = await supabase
        .from('assinaturas')
        .select('usuario_id')
        .eq('id', assinaturaId)
        .single()

      if (assinaturaAtual?.usuario_id) {
        await supabase
          .from('perfis')
          .update({
            plano: assinatura?.plano || 'monthly',
            premium: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', assinaturaAtual.usuario_id)
      }

      console.log('✅ Assinatura ativada com sucesso:', assinaturaId)

    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      await supabase
        .from('assinaturas')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', assinaturaId)

      console.log('❌ Pagamento rejeitado/cancelado:', assinaturaId)

    } else if (payment.status === 'in_process' || payment.status === 'pending') {
      await supabase
        .from('assinaturas')
        .update({
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', assinaturaId)

      console.log('⏳ Pagamento pendente:', assinaturaId)
    }

    if (webhookId) {
      await supabase
        .from('webhooks_mercadopago')
        .update({
          processado: true,
          processado_em: new Date().toISOString()
        })
        .eq('id', webhookId)
    }

  } catch (error) {
    console.error('Erro ao processar pagamento:', error)

    if (webhookId) {
      await supabase
        .from('webhooks_mercadopago')
        .update({
          erro: error instanceof Error ? error.message : 'Erro desconhecido'
        })
        .eq('id', webhookId)
    }
  }
}
