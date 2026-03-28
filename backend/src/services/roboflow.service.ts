import { config } from '../config/env'

const ROBOFLOW_BASE = 'https://serverless.roboflow.com'
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'

// Tightened thresholds — chair vs dispenser must NOT pass
const CLIP_PASS      = 0.75  // must be very similar to pass without Claude
const CLIP_UNCERTAIN = 0.55  // 0.55–0.75 → Claude decides
const CLIP_FAIL      = 0.55  // below this → hard reject

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

  // If workflow not configured → FAIL CLOSED (don't allow unverified resolutions)
  if (!config.ROBOFLOW_WORKSPACE || !config.ROBOFLOW_WORKFLOW_ID ||
      config.ROBOFLOW_WORKSPACE === 'your-workspace') {
    console.warn('⚠️  Roboflow workflow not configured — using Claude-only verification')
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
      const err = await response.text()
      console.error('Roboflow workflow error:', err)
      // FAIL CLOSED — route to Claude instead of passing through
      return await claudeFallback(beforeImageUrl, afterImageUrl, 0, null)
    }

    const data = await response.json()
    const output = Array.isArray(data.outputs) ? data.outputs[0] : data

    // Gate 2: YOLO — object must be detected in after image
    const yoloPredictions = output?.predictions?.predictions || []
    if (yoloPredictions.length === 0) {
      // No YOLO detection — fall back to Claude for final decision
      console.warn('⚠️  YOLO: 0 detections — routing to Claude')
      return await claudeFallback(beforeImageUrl, afterImageUrl, 0, output)
    }

    // Gate 3: CLIP similarity — STRICT thresholds
    // Default to 0 (not 1.0) when score is missing — fail safe
    const similarityScore: number = output?.similarity_score ?? output?.clip_similarity ?? 0

    console.log(`CLIP similarity score: ${similarityScore}`)

    if (similarityScore >= CLIP_PASS) {
      return {
        passed: true,
        gate: 'CLIP',
        score: similarityScore,
        reason: `Resolution verified. Image similarity: ${(similarityScore * 100).toFixed(1)}%`,
        details: output,
      }
    }

    if (similarityScore < CLIP_FAIL) {
      return {
        passed: false,
        gate: 'CLIP',
        score: similarityScore,
        reason: `Resolution rejected: After photo does not match the original complaint location (similarity: ${(similarityScore * 100).toFixed(1)}%). Please upload a photo of the actual resolved issue.`,
        details: output,
      }
    }

    // Uncertain zone (0.55–0.75) — Claude makes the final call
    return await claudeFallback(beforeImageUrl, afterImageUrl, similarityScore, output)

  } catch (err: any) {
    console.error('Roboflow service error:', err.message)
    // FAIL CLOSED — route to Claude
    return await claudeFallback(beforeImageUrl, afterImageUrl, 0, null)
  }
}

/**
 * Claude vision fallback — compares before/after images directly.
 * This is the most reliable gate for catching wrong objects (chair vs dispenser).
 */
async function claudeFallback(
  beforeUrl: string,
  afterUrl: string,
  clipScore: number,
  roboflowOutput: any
): Promise<VerificationResult> {

  if (!config.ANTHROPIC_API_KEY) {
    // No Claude key — reject if CLIP score is low, pass if reasonable
    if (clipScore < CLIP_FAIL) {
      return {
        passed: false,
        gate: 'FAILED',
        score: clipScore,
        reason: 'Resolution rejected: The after photo does not appear to match the original complaint. Please upload a photo showing the actual fix.',
      }
    }
    return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Claude unavailable — CLIP score borderline pass' }
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
                text: `You are a strict campus complaint resolution verifier.

Image 1 (BEFORE): The original complaint photo — shows the problem that was reported.
Image 2 (AFTER): The resolution photo submitted by the authority — should show the same object/area after fixing.

Your job: Determine if the AFTER photo is genuinely showing the resolution of the SAME issue shown in the BEFORE photo.

REJECT if:
- The two images show completely different objects (e.g., before=broken chair, after=water dispenser)
- The after photo is from a different location entirely
- The issue clearly has NOT been fixed

ACCEPT if:
- Both images show the same object/area
- The after photo shows the issue has been resolved or addressed

Respond with ONLY valid JSON: {"matched": true/false, "confidence": 0.0-1.0, "reason": "one sentence explanation"}`,
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
      // If Claude fails and CLIP score is very low → reject
      if (clipScore < 0.4) {
        return {
          passed: false,
          gate: 'CLAUDE',
          score: clipScore,
          reason: 'Resolution rejected: Images appear to be from different locations or show different objects.',
        }
      }
      return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Claude unavailable — borderline pass' }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const match = text.match(/\{[\s\S]*?\}/)
    const parsed = match ? JSON.parse(match[0]) : {}

    console.log(`Claude result: matched=${parsed.matched}, confidence=${parsed.confidence}, reason=${parsed.reason}`)

    // Reject if Claude says not matched with any confidence > 0.5
    if (parsed.matched === false && (parsed.confidence || 0) >= 0.5) {
      return {
        passed: false,
        gate: 'CLAUDE',
        score: parsed.confidence,
        reason: `Resolution rejected: ${parsed.reason || 'The after photo does not match the original complaint.'}`,
        details: { clipScore, claudeResult: parsed, roboflowOutput },
      }
    }

    // Accept only if Claude is confident it matched
    if (parsed.matched === true && (parsed.confidence || 0) >= 0.6) {
      return {
        passed: true,
        gate: 'CLAUDE',
        score: parsed.confidence,
        reason: parsed.reason || 'Claude verified: images match.',
        details: { clipScore, claudeResult: parsed },
      }
    }

    // Low confidence either way → reject (safer)
    return {
      passed: false,
      gate: 'CLAUDE',
      score: parsed.confidence || clipScore,
      reason: `Resolution uncertain: ${parsed.reason || 'Could not verify the resolution photo matches the complaint.'}`,
      details: { clipScore, claudeResult: parsed },
    }

  } catch (err: any) {
    console.error('Claude fallback error:', err.message)
    // Parse error → reject if CLIP was low
    if (clipScore < CLIP_FAIL) {
      return {
        passed: false,
        gate: 'CLAUDE',
        score: clipScore,
        reason: 'Resolution rejected: Could not verify the resolution photo matches the original complaint.',
      }
    }
    return { passed: true, gate: 'CLAUDE', score: clipScore, reason: 'Verification error — borderline pass' }
  }
}
