import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse, UserProfile } from "../types";

export async function analyzeDecision(
  decision: string, 
  history: AnalysisResponse[] = [],
  whatIf?: string,
  userProfile?: UserProfile
): Promise<AnalysisResponse> {
  // Initialize inside the function to ensure fresh API key access
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = "gemini-3-flash-preview";
  
  // Create a summary of user history for personalization
  const historySummary = history.length > 0 
    ? `User's past overthinking patterns: ${history.map(h => h.decision).join(', ')}. 
       Average score: ${(history.reduce((acc, h) => acc + h.overthinkingScore, 0) / history.length).toFixed(2)}.`
    : "No past history available.";

  const profileContext = userProfile 
    ? `User Profile Context:
       - Common Biases: ${userProfile.commonBiases.join(', ')}
       - Average Overthinking Score: ${userProfile.averageOverthinkingScore.toFixed(2)}
       - Total Analyses: ${userProfile.totalAnalyses}
       - Clarity Wins: ${userProfile.clarityWins}
       - Past Strategies: ${userProfile.biasCorrectionStrategies?.join('; ') || 'None'}`
    : "No user profile context available.";

  const whatIfPrompt = whatIf ? `Additionally, simulate the impact of this specific "what if" question: "${whatIf}".` : "";

  const response = await ai.models.generateContent({
    model,
    contents: `Analyze this decision/thought: "${decision}". 
    ${historySummary}
    ${profileContext}
    ${whatIfPrompt}
    
    1. THOUGHT SIMULATION: Generate logical outcomes, worst-case scenarios, emotional reactions, and irrational thoughts.
    2. COGNITIVE BIAS DETECTION: Identify biases for irrational/catastrophic thoughts.
    3. SOLUTION ENGINE: For problematic thoughts (irrational/catastrophic):
       - Explain why it's flawed (biasExplanation)
       - Provide a "betterThought": a rational, balanced alternative
       - Provide an "actionStep": a practical, simple step to reduce uncertainty
    4. ENHANCED REALITY CHECK: For EACH irrational or catastrophic thought, provide a "detailedRealityCheck" with:
       - breakdown: why it's irrational
       - evidence: evidence-based reasoning to counter it
       - alternative: a more balanced perspective
    5. TIME SIMULATION: Project potential long-term consequences of this overthinking pattern over 1 month, 1 year, and 5 years. If a "what if" question was provided, include its specific impact in "whatIfImpact".
    6. COMPARISON MODE: Provide 4 scenarios: "logical", "emotional", "highOverthinking", and "balanced". Each with thoughts, an outcome, and the "primaryEmotionOrBias" present.
    7. PERSONALIZATION & RECURRING BIASES: 
       - Tailor advice and reality checks based on the user's history and profile.
       - Identify "recurringBiases": a list of cognitive biases the user seems to fall into repeatedly based on the provided history and profile.
       - Provide "biasCorrectionStrategies": specific, actionable advice to counter these recurring patterns.
    
    Calculate an overthinking score (0-1) where higher means more irrational/catastrophic thoughts.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          thoughts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                type: { 
                  type: Type.STRING, 
                  enum: ['logical', 'emotional', 'irrational', 'catastrophic'] 
                },
                bias: { type: Type.STRING },
                biasExplanation: { type: Type.STRING },
                betterThought: { type: Type.STRING, description: "A rational, balanced alternative to the thought" },
                actionStep: { type: Type.STRING, description: "A practical, simple step the user can take" },
                realityCheck: { type: Type.STRING },
                detailedRealityCheck: {
                  type: Type.OBJECT,
                  properties: {
                    breakdown: { type: Type.STRING },
                    evidence: { type: Type.STRING },
                    alternative: { type: Type.STRING }
                  },
                  required: ['breakdown', 'evidence', 'alternative']
                }
              },
              required: ['text', 'type']
            }
          },
          balancedPerspectives: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          overthinkingScore: { type: Type.NUMBER },
          overthinkingLevel: { type: Type.STRING },
          advice: { type: Type.STRING },
          recurringBiases: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of cognitive biases identified as recurring across the user's history"
          },
          biasCorrectionStrategies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Actionable advice to counter recurring biases"
          },
          timeSimulation: {
            type: Type.OBJECT,
            properties: {
              oneMonth: { type: Type.STRING },
              oneYear: { type: Type.STRING },
              fiveYears: { type: Type.STRING },
              whatIfImpact: { type: Type.STRING, description: "Specific impact of the 'what if' question if provided" }
            },
            required: ['oneMonth', 'oneYear', 'fiveYears']
          },
          comparisonMode: {
            type: Type.OBJECT,
            properties: {
              logical: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  thoughts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  outcome: { type: Type.STRING },
                  primaryEmotionOrBias: { type: Type.STRING }
                },
                required: ['title', 'description', 'thoughts', 'outcome', 'primaryEmotionOrBias']
              },
              emotional: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  thoughts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  outcome: { type: Type.STRING },
                  primaryEmotionOrBias: { type: Type.STRING }
                },
                required: ['title', 'description', 'thoughts', 'outcome', 'primaryEmotionOrBias']
              },
              highOverthinking: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  thoughts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  outcome: { type: Type.STRING },
                  primaryEmotionOrBias: { type: Type.STRING }
                },
                required: ['title', 'description', 'thoughts', 'outcome', 'primaryEmotionOrBias']
              },
              balanced: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  thoughts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  outcome: { type: Type.STRING },
                  primaryEmotionOrBias: { type: Type.STRING }
                },
                required: ['title', 'description', 'thoughts', 'outcome', 'primaryEmotionOrBias']
              }
            },
            required: ['logical', 'emotional', 'highOverthinking', 'balanced']
          }
        },
        required: ['decision', 'thoughts', 'balancedPerspectives', 'overthinkingScore', 'overthinkingLevel', 'advice', 'timeSimulation', 'comparisonMode']
      }
    }
  });

  if (!response.text) {
    throw new Error("Empty response from AI");
  }

  const result: AnalysisResponse = JSON.parse(response.text);
  if (whatIf) {
    result.whatIfQuestion = whatIf;
  }
  return result;
}
