# SPDD Analysis: ¿Se puede cobrar por el sistema kb?

Conversación del 2026-09-26, después de la iteración 1 y del reel promocional. Estimaciones, no datos validados.

## Conclusión

Sí, pero **no tal como está hoy**. El sistema actual es una herramienta personal: corre en un Mac, usa la API key del dueño y descarga de Instagram con cookies de una cuenta secundaria. Eso funciona para uso propio, pero no escala como servicio.

## Bloqueos para venderlo como servicio

1. **Ingesta de Instagram**: descargar posts con cookies para muchos clientes choca con los términos de Meta (bloqueos de cuentas/IPs, posible reclamo legal). Es el principal obstáculo para un servicio hospedado. (No es asesoría legal.)
2. **Costo por post**: unos centavos de dólar en OpenAI por post (más en reels largos). Un usuario que guarde ~100 posts/mes cuesta del orden de 3–10 USD; con una suscripción de 5 USD el margen es muy delgado. Se mitiga con modelos más baratos y límites de uso.
3. **Alternativas**: "Guardados" de Instagram (gratis), apps de segundo cerebro (Mymind, Readwise, Recall) y bots que resumen videos. El consumidor promedio paga poco por esto.

## Diferenciadores

- **Inteligencia de los comentarios** (tips, alternativas, preguntas de la audiencia): casi nadie la extrae y vale mucho para marketing.
- **Síntesis automática por tema** que crece con cada post.
- **Español primero**, cero fricción (compartir a Telegram) y consulta en lenguaje natural.
- **Datos del usuario** en Markdown/Obsidian, sin depender de una plataforma.
- **Distribución propia**: @ia.punto.es habla de herramientas de IA; el reel de `promo/reel-biblioteca/` sirve de pieza de lanzamiento.

## Modelos de monetización (de menor a mayor riesgo)

| Modelo | Qué se vende | Precio orientativo | Riesgo |
|---|---|---|---|
| 1. Kit / plantilla | El sistema listo para instalar + guía o video. Cada persona usa su propia API key y su cuenta | Pago único 15–50 USD | Bajo: sin costos de IA ni descargas en nombre de terceros |
| 2. Servicio B2B | Instalarlo para creadores, agencias o equipos de marketing como "inteligencia de contenido" (qué publica la competencia y qué pregunta su audiencia) | Setup 200–1.000 USD + mantenimiento mensual opcional | Medio: cada cliente corre su propia instancia |
| 3. SaaS | Aplicación en la nube con suscripción | 5–15 USD/mes | Alto: exige ingesta legítima (capturas o APIs oficiales), web en vez de Obsidian, cobros y soporte |

**Recomendación**: empezar por el 1 y explorar el 2 con 3–5 conversaciones. El SaaS solo cuando haya demanda comprobada.

## Validación antes de construir más

1. Usarlo uno mismo 2–3 semanas; si no se consulta, nadie pagará.
2. Publicar el reel con CTA ("Comenta BIBLIOTECA y te aviso") y medir comentarios y guardados.
3. Preventa a quienes comentaron; si ~10 personas pagan, construir el resto (bot, instalador simple, guía).
4. Hablar con 5 personas de marketing o agencias sobre el ángulo de inteligencia de comentarios.

## Próximo paso ofrecido

Plan de lanzamiento del kit: qué incluye, precio, copy del reel y secuencia de posts.
