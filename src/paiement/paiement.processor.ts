import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaiementService, PAYMENT_QUEUE, PAYMENT_CONFIRM_JOB } from './paiement.service';
import { JsonLogger } from '../common/json.logger';

/**
 * Worker BullMQ : consomme les confirmations de paiement.
 * Retry exponentiel + dead-letter gérés par BullMQ (attempts/backoff
 * configurés à l'enregistrement de la queue).
 */
@Processor(PAYMENT_QUEUE)
export class PaiementProcessor extends WorkerHost {
  private readonly logger = new Logger('PaiementProcessor');

  constructor(
    private readonly paiement: PaiementService,
    private readonly jsonLogger: JsonLogger,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== PAYMENT_CONFIRM_JOB) return null;
    const { transactionId, statut } = job.data as { transactionId: string; statut: string };
    try {
      const result = await this.paiement.confirmTransaction(transactionId, statut);
      this.jsonLogger.log('payment.job.done', 'payment.worker', {
        job_id: job.id, transaction_id: transactionId, result,
      });
      return result;
    } catch (e) {
      this.logger.error(`Job ${job.id} échoué: ${e}`);
      throw e; // BullMQ retry selon backoff configuré
    }
  }
}
