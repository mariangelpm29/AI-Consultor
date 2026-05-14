import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const MODELS = {
  FLASH: 'gemini-3-flash-preview',
  PRO: 'gemini-3.1-pro-preview',
};

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

IMPORTANTE: El primer mensaje debe ser una breve presentación profesional enfocada en optimización con IA y la primera pregunta sobre el puesto.`;

export async function generateInterviewResponse(messages: { role: 'user' | 'model', text: string }[], modelName: string = MODELS.FLASH) {
  const chat = ai.models.generateContentStream({
    model: modelName,
    contents: messages.map(m => ({ 
      role: m.role === 'user' ? 'user' : 'model', 
      parts: [{ text: m.text }] 
    })),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    }
  });

  return chat;
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
  También incluye el 'sector' y 'rol' detectados.`;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Error parsing AI response for report", e);
    // Fallback or re-try logic if needed
    return null;
  }
}
