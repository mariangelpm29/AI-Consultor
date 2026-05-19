import { GoogleGenAI } from "@google/genai";

export const getApiKey = () => {
  // Prefer VITE_ prefix for client-side Vite apps
  const key = (import.meta as any).env.VITE_GEMINI_API_KEY || 
              (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
              '';
  return key;
};

const initialKey = getApiKey();
export const isApiKeySet = !!initialKey;
if (!initialKey && typeof window !== 'undefined') {
  console.warn("VITE_GEMINI_API_KEY no encontrada. La IA no responderá hasta que se configure la variable de entorno.");
}

function getGeminiClient() {
  const currentKey = getApiKey();
  if (!currentKey) {
    throw new Error('MISSING_API_KEY');
  }
  return new GoogleGenAI({ 
    apiKey: currentKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

export const MODELS = {
  FLASH: 'gemini-3.5-flash',
  PRO: 'gemini-3.1-pro-preview',
};

const FLASH_FALLBACKS = [
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
];

const PRO_FALLBACKS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
];

const SYSTEM_INSTRUCTION = `Actúa como un Especialista en Implementación de Inteligencia Artificial y Arquitecto de Soluciones Senior. 
Tu objetivo central y EXCLUSIVO es entrevistar al usuario para identificar procesos de negocio donde se puedan aplicar soluciones de Inteligencia Artificial (IA) y Automatización Avanzada.

DURANTE TODA LA INTERACCIÓN:
- Te centrarás ÚNICAMENTE en encontrar oportunidades para aplicar IA (LLMs, Visión Artificial, Procesamiento de Lenguaje, Agentes Autónomos, etc.).
- Aplica rigurosamente un método de consultoría estratégica para detectar ineficiencias tratables con IA.
- NO hagas todas las preguntas a la vez; formula un máximo de UNA O DOS preguntas por turno.
- Debes ser incisivo: si el usuario menciona una tarea, indaga qué partes de esa tarea son repetitivas, basadas en datos o reglas, para evaluar su viabilidad para una solución de IA.

FASES OBLIGATORIAS:
1. Fase 1: Perfil del Puesto. Identificar el cargo y su relación con los flujos de datos de la empresa.
2. Fase 2: Mapeo de Procesos Candidatos. Tareas que consumen mucho tiempo o requieren análisis de información.
3. Fase 3: Evaluación de Viabilidad IA. Indagar sobre la disponibilidad de datos digitales y la complejidad de las decisiones.
4. Fase 4: Definición de la Solución IA. Identificar qué tipo de IA o automatización resolvería el problema.

FINALIZACIÓN:
Tu rol finaliza únicamente cuando consideres que has recopilado información profunda para proponer una estrategia de IA sólida, o cuando el usuario escriba la instrucción exacta "Generar Requerimiento".

En ese instante, genera el informe con esta estructura:
1. Resumen Ejecutivo de la Estrategia IA.
2. Inventario de Procesos Transformables (en formato lista para tabla).
3. Ecosistema de Datos y Herramientas actuales.
4. Soluciones de IA Propuestas y Beneficios.
5. Requerimientos Técnicos y de Datos para la Implementación.

IMPORTANTE: 
- El primer mensaje debe ser una breve presentación profesional enfocada en optimización con IA y la primera pregunta sobre el puesto.
- Respeta SIEMPRE el uso de mayúsculas y minúsculas correctamente.
- Utiliza espacios adecuados para separar párrafos y preguntas, facilitando la legibilidad.
- Separa cada pregunta con un espacio en blanco adicional para que sea claramente visible.`;

export async function* generateInterviewResponse(messages: { role: 'user' | 'model', text: string }[], modelName: string = MODELS.FLASH) {
  const isPro = modelName.toLowerCase().includes('pro');
  const candidates = isPro 
    ? [modelName, ...PRO_FALLBACKS.filter(m => m !== modelName), ...FLASH_FALLBACKS]
    : [modelName, ...FLASH_FALLBACKS.filter(m => m !== modelName), ...PRO_FALLBACKS];

  // Unique elements while preserving search priority order
  const allCandidates = [...new Set(candidates)];

  let lastError: any = null;
  for (const model of allCandidates) {
    let started = false;
    try {
      console.log(`[Gemini Fallback System] Iniciando stream con ${model}...`);
      const stream = await getGeminiClient().models.generateContentStream({
        model,
        contents: messages.map(m => ({ 
          role: m.role === 'user' ? 'user' : 'model', 
          parts: [{ text: m.text }] 
        })),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        }
      });

      for await (const chunk of stream) {
        started = true;
        yield chunk;
      }
      
      // If we finished successfully without errors, we are done
      return;
    } catch (e: any) {
      console.warn(`[Gemini Fallback System] Error llamando a ${model}:`, e);
      lastError = e;
      // If it failed after emitting some chunks, we can't easily resume seamlessly from the middle of a word,
      // but if it failed at the very start (!started), we try the next candidate model!
      if (started) {
        throw e;
      }
    }
  }
  // If we exhaust all models
  throw lastError || new Error("No se pudo establecer conexión con ningún modelo de Gemini disponible.");
}

export async function generateFinalReport(conversationHistory: string, modelName: string = MODELS.PRO) {
  const prompt = `Basado en la siguiente entrevista, genera el informe de requerimientos formal solicitado siguiendo la estructura:
  1. Resumen Ejecutivo del Puesto.
  2. Inventario de Tareas y Frecuencia.
  3. Stack Tecnológico actual (herramientas y software mencionado).
  4. Oportunidades de Automatización/IA identificadas a partir de sus dolores.
  5. Requerimientos Técnicos sugeridos para construir el agente o automatización.

  Entrevista:
  ${conversationHistory}
  
  Responde ÚNICAMENTE con el informe estructurado en formato JSON para que pueda procesarlo. El JSON debe tener estas llaves: resumenEjecutivo, inventarioTareas, stackTecnologico, oportunidadesAutomatizacion, requerimientosTecnicos.
  También incluye el 'sector' and 'rol' detectados.`;

  const isPro = modelName.toLowerCase().includes('pro');
  const candidates = isPro
    ? [modelName, ...PRO_FALLBACKS.filter(m => m !== modelName), ...FLASH_FALLBACKS]
    : [modelName, ...FLASH_FALLBACKS.filter(m => m !== modelName), ...PRO_FALLBACKS];

  const allCandidates = [...new Set(candidates)];

  let lastError: any = null;
  for (const model of allCandidates) {
    try {
      console.log(`[Gemini Fallback System] Iniciando generación de informe con ${model}...`);
      const response = await getGeminiClient().models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      });
      
      return JSON.parse(response.text);
    } catch (e: any) {
      console.warn(`[Gemini Fallback System] Error generando informe con ${model}:`, e);
      lastError = e;
    }
  }

  throw lastError || new Error("No se pudo generar el informe con ningún modelo de Gemini disponible.");
}
