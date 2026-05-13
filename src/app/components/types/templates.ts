export type QuestionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Question {
  id: string;
  text: string;
  section: string;
  severity?: QuestionSeverity;
  triggerOn?: 'yes' | 'no';
  description?: string;
  remediation?: string;
}

export interface Template {
  id: string;
  name: string;
  productCode: string;
  color: string;
  icon: string;
  sections: string[];
  questions: Question[];
}
