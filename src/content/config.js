import { z, defineCollection } from 'astro:content';

const corpus = defineCollection({
  type: 'data',
  schema: z.object({
    work: z.string(),
    slug: z.string(),
    author: z.string(),
    pair_index: z.number(),
    source_text: z.string(),
    translation: z.string(),
    source_lang: z.string(),
    score: z.number().optional(),
    page_slug: z.string().optional(),
    alignment: z
      .array(
        z.object({
          ar: z.string(),
          en: z.string(),
        }),
      )
      .optional(),
    terms: z
      .array(
        z.object({
          term: z.string(),
          transliteration: z.string().optional(),
          literal: z.string().optional(),
          se_rendering: z.string().optional(),
          note: z.string().optional(),
          cross_refs: z
            .array(
              z.object({
                work: z.string(),
                para: z.union([z.string(), z.number()]),
                snippet: z.string().optional(),
              }),
            )
            .optional(),
        }),
      )
      .optional(),
  }),
});

const works = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    title_original: z.string().nullable().optional(),
    author: z.string(),
    author_slug: z.string(),
    language: z.string(),
    source_url: z.string().nullable().optional(),
    ocean_id: z.string().nullable().optional(),
    has_english_translation: z.boolean().optional(),
    english_url: z.string().nullable().optional(),
    se_translation: z.boolean().optional(),
    doc_id: z.string(),
    translation_status: z.enum(['untranslated', 'in_progress', 'complete']).optional().default('untranslated'),
    estimated_cost_usd: z.number().optional(),
    source_preview: z.string().optional(),
    word_count: z.number().optional(),
  }),
});

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string().optional(),
    author: z.string().optional(),
    excerpt: z.string().optional(),
  }),
});

export const collections = { corpus, works, articles };
