import { Injectable, Logger } from '@nestjs/common';
import { ImageAnnotatorClient, protos as visionProtos } from '@google-cloud/vision';
import { PredictionServiceClient } from '@google-cloud/aiplatform';

export type ModerationDecision = 'approve' | 'needs_review' | 'reject';

export interface ModerationResult {
  decision: ModerationDecision;
  reason?: string | null;
  labels?: string[];
}

const LIKELIHOOD_SCORE: Record<string, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);
  private visionClient: ImageAnnotatorClient | null = null;
  private vertexTextClient: PredictionServiceClient | null = null;
  private readonly projectId: string | undefined;

  constructor() {
    this.projectId = process.env.GOOGLE_PROJECT_ID;
    try {
      this.visionClient = new ImageAnnotatorClient();
    } catch (err) {
      this.logger.warn(`Vision client init failed: ${err instanceof Error ? err.message : String(err)}`);
      this.visionClient = null;
    }

    try {
      this.vertexTextClient = new PredictionServiceClient({ projectId: this.projectId });
    } catch (err) {
      this.logger.warn(`Vertex text moderation init failed: ${err instanceof Error ? err.message : String(err)}`);
      this.vertexTextClient = null;
    }
  }

  async moderateText(text: string | null | undefined): Promise<ModerationResult> {
    if (!text || !text.trim()) {
      return { decision: 'approve' };
    }
    if (!this.vertexTextClient) {
      this.logger.warn('Vertex text moderation client unavailable; marking as needs_review');
      return { decision: 'needs_review', reason: 'moderation_unavailable' };
    }
    try {
      const endpoint = `projects/${this.projectId}/locations/global/publishers/google/models/text-moderation-latest`;
      const [res] = (await this.vertexTextClient.predict({
        endpoint,
        // Payload format for text moderation; cast to any to bypass strict Value typing
        instances: [{ text } as any],
      })) as unknown as Array<{ predictions?: Array<{ safetyAttributes?: any[] }> }>;
      const safetyAttributes: any[] = res?.predictions?.[0]?.safetyAttributes ?? [];
      const labels: string[] = [];
      let maxScore = 0;
      for (const attr of safetyAttributes ?? []) {
        const category = attr?.category ?? attr?.name ?? 'unknown';
        const score = Number(attr?.score ?? attr?.probability ?? attr?.severity ?? 0);
        if (score > maxScore) maxScore = score;
        if (score > 0.1) labels.push(`${category}:${score.toFixed(2)}`);
      }
      if (maxScore >= 0.8) {
        return { decision: 'reject', reason: 'text_high_risk', labels };
      }
      if (maxScore >= 0.5) {
        return { decision: 'needs_review', reason: 'text_needs_review', labels };
      }
      return { decision: 'approve', labels };
    } catch (err) {
      this.logger.warn(`Text moderation failed: ${err instanceof Error ? err.message : String(err)}`);
      return { decision: 'needs_review', reason: 'moderation_failed' };
    }
  }

  async moderateImageFromBuffer(buffer: Buffer, filename?: string): Promise<ModerationResult> {
    if (!buffer || !buffer.length) {
      return { decision: 'approve' };
    }
    if (!this.visionClient) {
      this.logger.warn('Vision client unavailable; marking image as needs_review');
      return { decision: 'needs_review', reason: 'vision_unavailable' };
    }
    try {
      const [result] = await this.visionClient.safeSearchDetection({ image: { content: buffer } });
      const annotation: visionProtos.google.cloud.vision.v1.ISafeSearchAnnotation | undefined =
        result?.safeSearchAnnotation ?? undefined;
      if (!annotation) {
        return { decision: 'needs_review', reason: 'no_annotation' };
      }
      const scores = [
        annotation.adult,
        annotation.violence,
        annotation.racy,
        annotation.medical,
      ]
        .map((v) => LIKELIHOOD_SCORE[String(v)] ?? 0)
        .filter((v) => typeof v === 'number');
      const maxScore = scores.length ? Math.max(...scores) : 0;
      const labels: string[] = [];
      for (const [key, val] of Object.entries(annotation)) {
        const score = LIKELIHOOD_SCORE[String(val)] ?? 0;
        if (score > 0) {
          labels.push(`${key}:${val}`);
        }
      }
      if (maxScore >= LIKELIHOOD_SCORE.LIKELY) {
        return { decision: 'reject', reason: 'image_high_risk', labels };
      }
      if (maxScore >= LIKELIHOOD_SCORE.POSSIBLE) {
        return { decision: 'needs_review', reason: 'image_needs_review', labels };
      }
      return { decision: 'approve', labels };
    } catch (err) {
      this.logger.warn(
        `Image moderation failed for ${filename ?? 'buffer'}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { decision: 'needs_review', reason: 'moderation_failed' };
    }
  }
}
