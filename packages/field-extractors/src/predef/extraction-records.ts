/**
 * Logs and Records generated during field extraction and Url scraping
 */

export interface ExtractionEvidence {
  evidence: string;
}

export interface FieldRecord {
  name: string;
  value: string;
  evidence: string[];
}

export interface FieldCandidate {
  text: string;
  evidence: string[];
}

export interface CanonicalFieldRecords {
  noteId?: string;
  url?: string;
  finalUrl?: string;
  fields: FieldRecord[];
}


export interface ExtractionErrors {
  url?: string;
  finalUrl?: string;
  errors: string[];
}

export const ExtractionErrors = (error: string, args: Partial<ExtractionErrors>): ExtractionErrors => ({
  ...args,
  errors: [error]
});
