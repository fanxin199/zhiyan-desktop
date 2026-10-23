import { z } from 'zod'
import type { AppSettingsV1 } from '../../shared/app-settings'
import {
  INTENT_FIELD_DEFINITIONS,
  intentExtractInputSchema,
  mergeIntentBrief,
  type IntentBrief,
  type IntentExtractInput,
  type IntentLayers
} from '../../shared/intent-brief'
import { UNTRUSTED_MATERIAL_INSTRUCTION_ZH, wrapUntrustedPromptMaterial } from '../../shared/prompt-boundary'
import { requestStructuredJson, type StructuredGenerationOptions } from './structured-generation'

/** Enough of each material to recognise topic and audience; the tools read the rest later. */
const MATERIAL_EXCERPT_CHARS = 6_000

const extractionSchema = z.object({
  values: z.array(z.object({
    key: z.string(),
    value: z.string(),
    from: z.enum(['teacher', 'material'])
  })).default([]),
  question: z.string().optional()
})

export type IntentBriefOutcome =
  | { ok: true; brief: IntentBrief }
  | { ok: false; code: 'MISSING_API_KEY' | 'PROVIDER_ERROR' | 'INVALID_MODEL_OUTPUT'; message: string }

type IntentBriefServiceOptions = {
  loadSettings: () => Promise<AppSettingsV1>
  generation?: StructuredGenerationOptions
}

/**
 * Reads a tool's key points from the teacher's sentence and materials (§6.3) on the structured
 * generation channel, then fills the rest from project, profile, preferences and defaults. The
 * model is not called when there is nothing to read.
 */
export class IntentBriefService {
  constructor(private readonly options: IntentBriefServiceOptions) {}

  async extract(input: IntentExtractInput): Promise<IntentBriefOutcome> {
    const request = intentExtractInputSchema.parse(input)
    const definitions = INTENT_FIELD_DEFINITIONS[request.toolId]
    const layers: IntentLayers = { ...request.context, teacher: {}, material: {} }
    let question: string | undefined

    if (request.text.trim() || request.materials.length > 0) {
      const known = new Set(definitions.map((definition) => definition.key))
      const generated = await requestStructuredJson(await this.options.loadSettings(), extractionSchema, [
        {
          role: 'system',
          content: [
            '你在帮高校教师准备一项工作。请从老师的话和材料中找出下列要点的值。',
            ...definitions.map((definition) => `- ${definition.key}（${definition.label}）：${definition.hint}`),
            '只填能从老师的话或材料中直接得到的值，不要猜测，也不要填默认值；找不到就不要列出。',
            'from 写 teacher（来自老师的话）或 material（来自材料）。',
            '如果必填要点（课程、章节、主题、文献等）仍然缺失，可以给出一个简短的澄清问题，否则不要提问。',
            UNTRUSTED_MATERIAL_INSTRUCTION_ZH,
            '只返回 JSON：{"values": [{"key": "...", "value": "...", "from": "teacher"}], "question": "可省略"}。'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `老师的话：${request.text.trim() || '（没有说明，只提供了材料）'}`,
            ...request.materials.map((material) =>
              `\n${wrapUntrustedPromptMaterial(material.text.slice(0, MATERIAL_EXCERPT_CHARS), material.name)}`)
          ].join('\n')
        }
      ], { maxTokens: 1_500, timeoutMs: 60_000, timeoutMessage: '读取要点超过 1 分钟，请稍后重试。', ...this.options.generation })
      if (!generated.ok) return generated
      for (const item of generated.value.values) {
        const value = item.value.trim().slice(0, 2_000)
        if (!known.has(item.key) || !value) continue
        const layer = item.from === 'material' && request.materials.length > 0 ? layers.material! : layers.teacher!
        layer[item.key] ??= value
      }
      question = generated.value.question
    }

    // The attached file is the textbook or paper itself when the request does not name one.
    const materialNames = request.materials.map((material) => material.name).join('、')
    for (const definition of definitions) {
      if (definition.fromMaterialNames && materialNames) layers.material![definition.key] ??= materialNames
    }
    return { ok: true, brief: mergeIntentBrief(request.toolId, layers, question) }
  }
}
