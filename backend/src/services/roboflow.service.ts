import { config } from '../config/env'

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'

export interface VerificationResult {
  passed: boolean
  gate: 'YOLO' | 'CLIP' | 'CLAUDE' | 'FAILED'
  score?: number
  reason?: string
  details?: Record<string, any>
}

/**
 * Resolution verification — uses Claude vision directly.
 * Claude compares before/after images and decides if the resolution is valid.
 * CLIP/YOLO are unreliable for same-object different-angle photos.
 */
export async function runResolutionVerification(
  beforeImageUrl: string,
  afterImageUrl: string
): Promise<VerificationResult> {
  return await claudeVerify(beforeImageUrl, afterImageUrl)
}

async function claudeVerify(
  beforeUrl: string,
  afterUrl: string
): Promise<VerificationResult> {

  if (!config.ANTHROPIC_API_KEY) {
    console.warn('⚠️  No Anthropic key — skipping AI verification')
    return { passed: true, gate: 'CLAUDE', reason: 'AI verification skipped (no API key)' }
  }

  try {
    const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a campus complaint resolution verifier for VIT Chennai.

Image 1 (BEFORE): The original complaint photo showing the problem.
Image 2 (AFTER): The resolution photo submitted by the authority.

The photos may be taken from different angles, distances, or lighting conditions — this is NORMAL.

ACCEPT the resolution if:
- Both images show the same TYPE of object (chair, desk, bin, socket, etc.)
- The after photo shows the same general area or object
- The issue appears to have been addressed

REJECT only if:
- The images clearly show COMPLETELY DIFFERENT objects (e.g., before=chair, after=water dispenser)
- The after photo is obviously from a completely different building/room

Be LENIENT — authorities often take close-up photos for resolution proof.

Respond with ONLY this JSON: {"matched": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}`,
              },
              { type: 'image', source: { type: 'url', url: beforeUrl } },
              { type: 'image', source: { type: 'url', url: afterUrl } },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Claude API error:', errText)
      // If Claude is unavailable, pass through (don't block resolution)
      return { passed: true, gate: 'CLAUDE', reason: 'Claude unavailable — passed through' }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const match = text.match(/\{[\s\S]*?\}/)
    const parsed = match ? JSON.parse(match[0]) : { matched: true, confidence: 0.5 }

    console.log(`Claude verification: matched=${parsed.matched}, confidence=${parsed.confidence}, reason=${parsed.reason}`)

    // Only reject if Claude is very confident (>= 0.85) it's a completely different object
    if (parsed.matched === false && (parsed.confidence || 0) >= 0.85) {
      return {
        passed: false,
        gate: 'CLAUDE',
        score: parsed.confidence,
        reason: `Resolution rejected: ${parsed.reason || 'The after photo shows a different object than the complaint.'}`,
      }
    }

    // Everything else passes — same object, different angle, uncertain = ACCEPT
    return {
      passed: true,
      gate: 'CLAUDE',
      score: parsed.confidence || 0.7,
      reason: parsed.reason || 'Resolution verified by AI.',
    }

  } catch (err: any) {
    console.error('Claude verification error:', err.message)
    // On any error, pass through — don't block the authority
    return { passed: true, gate: 'CLAUDE', reason: 'Verification error — passed through' }
  }
}
