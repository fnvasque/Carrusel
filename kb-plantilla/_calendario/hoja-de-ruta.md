# Hoja de ruta del contenido

Del usuario. El hilo conductor de las semanas: **el planificador la lee, no la edita** (propone
cambios en `aprendizajes.md`). La instala `scripts/kb-calendario-install.sh` solo si no existe;
después se edita aquí, en la base.

El hilo son las 4 etapas del coaching (`_investigacion/alcance.json → etapas`), en orden:
**perder el miedo → adoptar → liderar → revalorizarse**, 2 semanas por etapa. El viernes
(`con-tu-equipo`) es siempre la mirada del jefe sobre la etapa de esa semana.

El lunes (`por-donde-partir`) trae entre paréntesis un momento × capacidad de `momentos.md` que calza;
el planificador igual revisa que no se repita en 4 semanas.

Cada línea es una **guía, no un texto obligatorio**: el título y el ángulo de partida y las
referencias que lo respaldan. La pieza igual sigue su serie, su momento × capacidad (lunes), la
puerta y el juez. Si una referencia no está lista o el título no pasa, el planificador elige otra
de la misma etapa y lo anota en `aprendizajes.md`.

Formato (lo lee `validar.mjs`): un `## AAAA-MM-DD · <etapa> · <nombre de la semana>` por lunes, y
debajo una línea por día, `` - lun|mie|vie: <título o ángulo> — `referencias/<slug>.md` ``. En
`lo-que-construi` (miércoles) es un **ángulo**: lo que se cuenta es lo que pasó de verdad en el
sistema que arma la cuenta, nunca una experiencia inventada.

## 2026-11-09 · perder-el-miedo · Empieza gratis y sin miedo

- lun: Empieza con IA sin pagar: tres cosas que hace la cuenta gratis (entender-tema-nuevo × leer-documentos) — `referencias/empezar-con-ia-sin-pagar.md`
- mie: ángulo: lo primero que automaticé no fue un agente, fue una lista de pasos — `referencias/tu-primera-automatizacion-no-necesita-un-agente.md`, `referencias/building-effective-agents.md`
- vie: Si tu equipo no usa la IA, no es por falta de herramientas — `referencias/apoyo-del-jefe-al-uso-de-ia.md`

## 2026-11-16 · adoptar · Pídele como a alguien nuevo en tu equipo

- lun: Pídele a la IA como a alguien nuevo: qué es, para quién y para qué (presentacion-para-el-jefe × escribir-y-corregir) — `referencias/prompt-con-contexto-ejemplos-e-iteracion.md`, `referencias/guia-de-prompts-de-gemini-para-workspace.md`
- mie: ángulo: convertí una tarea de cada semana en un instructivo que la IA sigue sola — `referencias/al-agente-se-le-escribe-un-instructivo.md`, `referencias/agent-skills.md`
- vie: Lo que solo tú sabes hacer, déjalo escrito para tu equipo con IA — `referencias/convertir-una-tarea-en-procedimiento-con-ia.md`

## 2026-11-23 · adoptar · Lo que entrega, lo revisas tú

- lun: ¿La IA inventó una cifra? Pídele la frase exacta del documento (leer-documento-largo × leer-documentos) — `referencias/reducir-alucinaciones.md`, `referencias/notebooklm.md`
- mie: ángulo: cómo reviso lo que me entrega la IA antes de publicar — `referencias/lo-que-entrega-la-ia-se-revisa-afuera-de-la-ia.md`, `referencias/al-agente-se-le-revisa-en-puntos-fijados-antes.md`
- vie: Si la IA se equivoca en tu informe, el error es tuyo — `referencias/informe-de-deloitte-para-el-gobierno-australiano.md`

## 2026-11-30 · liderar · Tu rol cambia cuando ejecutar sale barato

- lun: Antes de un feedback difícil, pídele a ChatGPT tres formas de decirlo (conversacion-dificil × escribir-y-corregir) — `referencias/chatgpt-para-managers.md`, `referencias/prompt-con-contexto-ejemplos-e-iteracion.md`
- mie: ángulo: si diriges personas, ya sabes dirigir la IA; así le encargo trabajo — `referencias/a-la-ia-se-la-dirige-como-a-alguien-del-equipo.md`, `referencias/delegar-en-ia.md`
- vie: Con IA, una persona rinde como una pareja: cómo cambia armar tu equipo — `referencias/cybernetic-teammate.md`

## 2026-12-07 · liderar · El equipo cuando cada uno trabaja con su IA

- lun: ¿Evalúas a tu equipo este mes? ChatGPT ordena tus notas de cada persona (preparar-evaluacion × escribir-y-corregir) — `referencias/chatgpt-para-managers.md`, `referencias/prompt-con-contexto-ejemplos-e-iteracion.md`
- mie: ángulo: antes de decidir, otra IA me lleva la contra — `referencias/abogado-del-diablo-con-ia.md`
- vie: Con IA tu equipo te pregunta menos: júntalo a propósito — `referencias/con-ia-el-equipo-se-junta-a-proposito.md`, `referencias/ia-generativa-y-la-naturaleza-del-trabajo.md`

## 2026-12-14 · revalorizarse · Que la IA no piense por ti

- lun: Primero escribe tú tres ideas; después pásale el texto a la IA (revisar-mi-texto × escribir-y-corregir) — `referencias/primero-piensas-tu-despues-la-ia.md`, `referencias/prompt-con-contexto-ejemplos-e-iteracion.md`
- mie: ángulo: lo que dejé de hacer a mano y lo que no suelto — `referencias/usar-la-ia-sin-soltar-el-oficio.md`, `referencias/desentrenamiento-por-ia.md`
- vie: Si la IA hace el trabajo de los nuevos, ¿cómo aprenden el oficio? — `referencias/la-gente-nueva-se-forma-a-proposito.md`

## 2026-12-21 · revalorizarse · Lo que vale más en 2027

- lun: Dicta tus logros del año y ChatGPT arma tu autoevaluación (preparar-evaluacion × audio-a-texto) — `referencias/autoevaluacion-de-desempeno-con-chatgpt.md`, `referencias/dictado-por-voz-en-chatgpt.md`
- mie: ángulo: qué hago yo y qué le dejo a la IA en 2027 — `referencias/lo-que-sube-de-valor-es-dirigir-la-ia.md`
- vie: Quienes mejor dirigen la IA no son programadores: son quienes saben encargar — `referencias/retornos-a-la-experiencia-en-programacion-agentica.md`

## Reserva

Por si una pieza se cae (no es una semana: el validador no la lee).

- Liderazgo: `referencias/correos-de-jefes-escritos-con-ia.md`, `referencias/dilema-de-la-transparencia-con-ia.md`, `referencias/apoyo-del-jefe-al-uso-de-ia.md`, `referencias/preparar-una-reunion-1-1-con-ia.md`, `referencias/marco-crit.md`, `referencias/ia-aduladora-y-conflictos.md`, `referencias/red-de-campeones-de-ia.md`, `referencias/centauro-cyborg-y-conjurador.md`
- Otras: `referencias/privacidad-de-documentos-en-chatgpt-claude-y-gemini.md`, `referencias/estudio-de-la-frontera-irregular.md`, `referencias/con-ia-rindes-mas-pero-te-sobrestimas.md`, `referencias/modo-estudio-de-chatgpt.md`, `referencias/dictado-por-voz-en-chatgpt.md`
