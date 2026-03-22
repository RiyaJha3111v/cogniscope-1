export interface RealityCheck {
  breakdown: string;
  evidence: string;
  alternative: string;
}

export interface Thought {
  text: string;
  type: 'logical' | 'emotional' | 'irrational' | 'catastrophic';
  bias?: string;
  biasExplanation?: string;
  betterThought?: string;
  actionStep?: string;
  realityCheck?: string; // Legacy field for simple display
  detailedRealityCheck?: RealityCheck; // Enhanced field
}

export interface TimeSimulation {
  oneMonth: string;
  oneYear: string;
  fiveYears: string;
  whatIfImpact?: string;
}

export interface ComparisonScenario {
  title: string;
  description: string;
  thoughts: string[];
  outcome: string;
  primaryEmotionOrBias: string;
}

export interface UserProfile {
  uid: string;
  commonBiases: string[];
  averageOverthinkingScore: number;
  lastAnalyzedAt?: any;
  clarityWins: number;
  totalAnalyses: number;
  biasCorrectionStrategies?: string[];
}

export interface AnalysisResponse {
  decision: string;
  thoughts: Thought[];
  balancedPerspectives: string[];
  overthinkingScore: number;
  overthinkingLevel: string;
  advice: string;
  whatIfQuestion?: string;
  recurringBiases?: string[];
  biasCorrectionStrategies?: string[];
  timeSimulation?: TimeSimulation;
  comparisonMode?: {
    logical: ComparisonScenario;
    emotional: ComparisonScenario;
    highOverthinking: ComparisonScenario;
    balanced: ComparisonScenario;
  };
}
