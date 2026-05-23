import {
  pgTable,
  uuid,
  text,
  integer,
  decimal,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    website: text('website'),
    hq: text('hq'),
    foundedYear: integer('founded_year'),
    description: text('description'),
    sectors: text('sectors').array(),
    totalRaisedUsd: decimal('total_raised_usd', { precision: 20, scale: 2 }),
    lastValuationUsd: decimal('last_valuation_usd', { precision: 20, scale: 2 }),
    aifundingUrl: text('aifunding_url'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow(),
  },
  (table) => ({
    slugIdx: index('slug_idx').on(table.slug),
  })
);

export const fundingRounds = pgTable(
  'funding_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    roundType: text('round_type').notNull(),
    amountUsd: decimal('amount_usd', { precision: 20, scale: 2 }),
    valuationUsd: decimal('valuation_usd', { precision: 20, scale: 2 }),
    announcedDate: text('announced_date'),
    sourceUrl: text('source_url'),
    rawData: jsonb('raw_data'),
    createdAt: timestamp('created_at').defaultNow(),
    ingestedAt: timestamp('ingested_at').defaultNow(),
  },
  (table) => ({
    companyIdx: index('company_idx').on(table.companyId),
    announcedIdx: index('announced_idx').on(table.announcedDate),
  })
);

export const ingestionRuns = pgTable('ingestion_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  dealsFound: integer('deals_found').default(0),
  newRounds: integer('new_rounds').default(0),
  errors: text('errors'),
  source: text('source').default('aifunding.me'),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type FundingRound = typeof fundingRounds.$inferSelect;
export type NewFundingRound = typeof fundingRounds.$inferInsert;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
