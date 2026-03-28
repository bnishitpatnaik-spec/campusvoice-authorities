import { config } from '../config/env'

const ROBOFLOW_BASE = 'https://serverless.roboflow.com'
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'

const CLIP_PASS = 0.75
const CLIP_FAIL = 0.55

export interface VerificationResult {
  passed: boolean
  gate: 'YOLO' | 'CLIP' | 'CLAUDE' | 'FAILED'
  score?: number
  reason?: string
  details?: Record<string, any>
}

export async function runResolutionVerification(
  beforeImageUrl: string,
  afterImageUrl: string
): Promise<VerificationResult> {

  if (!config.ROBOFLOW_WORKSPACE || !config.ROBOFLOW_WORKFLOW_ID ||
      config.ROBOFLOW_WORKSPACE === 'your-workspace') {
    return await claudeFallback(beforeImageUrl, afterImageUrl, 0, null)
  }

  try {
    const response = await fetch(
      `${ROBOFLOW_BASE}/${config.ROBOFLOW_WORKSPACE}/workflows/${config.ROBOFLOW_WORKFLOW_ID}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.ROBOFLOW_API_KEY,
          inputs: {
            image:        { type: 'url', value: afterImageUrl },
            before_image: { type: 'url', value: beforeImageUrl },
          },
          use_cache: true,
        }),
      }
    )

    if (!response.ok) {
      return await claudeFallback(beforeImageUrl, afterImageUrl, 0, null)
    }

    const data = await response.json()
    const output = Array.isArray(data.outputs) ? data.outputs[0] : data
    const yoloPredictions = output?.predictions?.predictions || []

    if (yoloPredictions.length === 0) {
      return await claudeFallback(beforeImageUrl, afterImageUrl, 0, output)
    }

    const similarityScore: number = output?.similarity_score ?? output?.clip_similarity ?? 0

    if (similarityScore >= CLIP_PASS) {
      return {
        passed: true,
        gate: 'CLIP',
        score: similarityScore,
        reason: `Resolution verified. Image similarity: ${(similarityScore * 100).toFixed(1)}%`,
      }
    }

    if (similarityScore < CLIP_FAIL) {
      return {
        passed: false,
        gate: 'CLIP',
        score: similarityScore,
        reason: `Resolution rejected: After photo does not match the original complaint (similarity: ${(similarityScore * 100).toFixed(1)}%).`,
      }
    }

    return await claudeFallback(beforeImageUrl, afterImageUrl, similarityScore, output)

  } catch (err: any) {
    console.error('Roboflow service error:', err.message)
    return await claudeFallback(beforeImageUrl, afterImageUrl, 0, null)
  }
}

async function claudeFallback(
  beforeUrl: string,
  afterUrl: string,
  clipScore: number,
  roboflowOutput: any
): Promise<VerificationResult> {

  if (!config.ANTHROPIC_API_KEY) {
    if (clipScore < CLIP_FAIL) {
      return {
        passed: false,
        gate: 'FAILED',
        score: clipScore,
        reason: 'Resolution rejected: The after photo does not appear to match the original complaint.',
      }
    }
    return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Claude unavailable — passed through' }
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
                text: `You are a campus complaint resolution verifier.

Image 1 (BEFORE): Original complaint photo showing the problem.
Image 2 (AFTER): Resolution photo submitted by the authority.

IMPORTANT: The after photo may be taken from a different angle or distance than the before photo. Focus on whether they show the SAME TYPE of object/issue in a SIMILAR location.

REJECT only if:
- Completely different objects (e.g., before=broken chair, after=water dispenser)
- Clearly different rooms or locations

ACCEPT if:
- Same type of object (even if different angle)
- Same general area/location
- Issue appears addressed

Respond with ONLY valid JSON: {"matched": true/false, "confidence": 0.0-1.0, "reason": "one sentence"}`,
              },
              { type: 'image', source: { type: 'url', url: beforeUrl } },
              { type: 'image', source: { type: 'url', url: afterUrl } },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('Claude API error:', await response.text())
      if (clipScore < 0.4) {
        return {
          passed: false,
          gate: 'CLAUDE',
          score: clipScore,
          reason: 'Resolution rejected: Images appear to show different objects.',
        }
      }
      return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Claude unavailable — passed through' }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const match = text.match(/\{[\s\S]*?\}/)
    const parsed = match ? JSON.parse(match[0]) : {}

    console.log(`Claude: matched=${parsed.matched}, confidence=${parsed.confidence}, reason=${parsed.reason}`)

    // Only reject if Claude is highly confident it's a mismatch
    if (parsed.matched === false && (parsed.confidence || 0) >= 0.80) {
      return {
        passed: false,
        gate: 'CLAUDE',
        score: parsed.confidence,
        reason: `Resolution rejected: ${parsed.reason || 'The after photo does not match the original complaint.'}`,
        details: { clipScore, claudeResult: parsed, roboflowOutput },
      }
    }

    // Accept if Claude says matched OR is uncertain (benefit of doubt for same-object different-angle)
    return {
      passed: true,
      gate: 'CLAUDE',
      score: parsed.confidence || clipScore,
      reason: parsed.reason || 'Claude verified: resolution accepted.',
      details: { clipScore, claudeResult: parsed },
    }

  } catch (err: any) {
    console.error('Claude fallback error:', err.message)
    return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Verification error — passed through' }
  }
}
