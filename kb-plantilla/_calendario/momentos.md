# Banco de momentos y capacidades

De qué trata cada pieza de `por-donde-partir` (spec
`docs/superpowers/specs/2026-10-31-piezas-que-se-entienden-design.md`, en el repo de código).
Lo versiona el usuario: **el planificador no lo edita**. Propone momentos nuevos en
`aprendizajes.md` (`momento propuesto: <id>: <descripción>`) y pide respaldo para una capacidad
en `candidatos.json`.

El lector es un empleado con IA a mano (ChatGPT gratis, Gemini o Copilot del trabajo) que no paga
y la usa como Google. No se le ocurre en qué tareas usarla (**momentos**) ni sabe qué tipos de
cosas puede hacer (**capacidades**). Cada pieza junta un momento con una capacidad; la
combinación no se repite en 4 semanas.

Formato (lo lee `validar.mjs`): una línea por entrada, `` - `id`: descripción ``. En las
capacidades, al final, `— respaldo:` con las referencias que dicen que se puede hacer gratis
(una de ellas va en `origen.referencias` de la pieza), o `— respaldo: ninguno todavía` (no se usa
hasta que la base tenga una).

## Momentos

- `responder-correo-delicado`: responder un correo largo o delicado (un reclamo, un no, un tema sensible)
- `acta-de-reunion`: sacar en limpio qué se acordó en una reunión, quién hace qué y para cuándo
- `leer-documento-largo`: leer un informe, manual o PDF largo que le mandaron
- `presentacion-para-el-jefe`: armar una presentación para el jefe o el comité
- `formula-de-excel`: una fórmula o una planilla que no le sale
- `conversacion-dificil`: preparar una conversación difícil (pedir un aumento, decir que no, dar feedback)
- `ordenar-la-semana`: ordenar una semana con demasiadas tareas
- `revisar-mi-texto`: revisar si un texto suyo se entiende antes de mandarlo
- `informe-semanal`: escribir el informe semanal o el reporte de avance
- `entender-tema-nuevo`: entender un término o un tema nuevo del trabajo
- `responder-en-ingles`: leer, traducir o responder algo en inglés
- `preparar-evaluacion`: preparar una entrevista, una evaluación de desempeño o una certificación

## Capacidades

- `escribir-y-corregir`: escribir, corregir o cambiarle el tono a un texto — respaldo: `referencias/prompt-con-contexto-ejemplos-e-iteracion.md`
- `leer-documentos`: leer documentos largos y responder sobre ellos — respaldo: `referencias/notebooklm.md`, `referencias/empezar-con-ia-sin-pagar.md`, `referencias/modo-estudio-de-chatgpt.md`
- `leer-fotos`: leer una foto o una captura (una pizarra, un ejercicio, un error en pantalla) — respaldo: `referencias/modo-estudio-de-chatgpt.md`
- `texto-a-audio`: convertir documentos en un resumen en audio para escucharlo — respaldo: `referencias/notebooklm.md`
- `audio-a-texto`: dictar o pasar a texto lo que dices (una nota de voz, lo que se habló) — respaldo: `referencias/dictado-por-voz-en-chatgpt.md`
- `buscar-con-fuentes`: buscar en internet con las fuentes citadas, en vez de Google — respaldo: ninguno todavía
- `hacer-imagenes`: hacer una imagen (un esquema, una portada, una ilustración) — respaldo: ninguno todavía
- `hacer-videos`: hacer un video corto — respaldo: ninguno todavía
