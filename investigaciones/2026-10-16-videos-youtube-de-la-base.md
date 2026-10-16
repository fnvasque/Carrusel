# Investigación: los 22 videos de YouTube de la base

*Fecha: 2026-10-16. Corpus: todas las fichas `tipo: video` de `knowledge/fuentes/` (guardadas entre el 2026-10-11 y el 2026-10-14). Leí las 22 transcripciones completas. Los análisis por video, con citas y ubicación, quedaron en el scratchpad de la sesión: grupo-A a grupo-D.*

> **Aviso de método.** Una ficha de `fuentes/` es lo que afirmó otra persona, sin verificar. Por la regla dura 5 del planificador, ningún dato de este informe se publica sin una referencia en `referencias/`. Aquí los datos sirven para elegir ángulos y formatos. La sección 3 dice qué falta verificar.

---

## 0. Resumen en 6 líneas

1. Los 22 videos cuentan la misma historia desde distintos lugares: **la IA pasó de responder a hacer trabajo por su cuenta**. Lo explican OpenAI (Dots), Meta (Muse), Stripe (minions), YC, a16z, Harvard y el MIT.
2. Todos ponen el mismo freno: **la confianza se da de a poco**. Primero tareas chicas y revisadas, y la autonomía después.
3. Los que construyen la IA la usan de forma sorprendentemente simple: **dictan, guardan sus mejores prompts como "empleados", piden segunda opinión a otra IA y dejan tareas programadas.** Todo eso lo puede copiar una persona no técnica desde el celular.
4. Detrás del ruido hay un dato que tranquiliza: **casi todos están empezando** (2 % de las grandes empresas mide su IA y alrededor del 97 % de quienes la usan no paga).
5. **12 de los 22 videos tienen como tema principal algo que `alcance.json` deja fuera o para después**: 8 de Emprendimiento y startups, 2 de Riesgos, 1 de Carrera y 1 de Inversión. Por eso este material casi no llegó al feed.
6. **Ángulo propuesto: «Lo que hacen los que construyen la IA, en tu celular».** Cada pieza toma una práctica real de un CEO o un investigador y la vuelve un paso que haces con ChatGPT, Gemini o Claude en minutos. Así el material de startups entra por temas que sí están dentro (Productividad, Automatización, Aprendizaje, Finanzas y Liderazgo).

---

## 1. El corpus

| # | Fecha pub. | Quién habla | Canal | Tema de la ficha | De qué trata |
|---|---|---|---|---|---|
| 1 | 2026-10-11 | Alexandr Wang (Meta) | David Senra | Avances en IA | Cómo se hizo Muse: prototipo en 2 semanas, 7 meses para que fuera fiable |
| 2 | 2026-10-01 | Alexander Embiricos (OpenAI) | Sources | Avances en IA | Dots: agentes personales con computadora propia que preguntan antes de actuar |
| 3 | 2026-10-04 | Tibo Sottiaux (jefe de ChatGPT) | Lenny's Podcast | Avances en IA | Un asistente único y siempre activo, sin selector de modelos; el valor pasa al gusto |
| 4 | 2026-03-25 | Steve Kaliski (Stripe) | How I AI | Automatización | 1.300 cambios de código por semana lanzados con un emoji; un agente pagó un cumpleaños (US$5) |
| 5 | 2026-10-03 | Atallah (OpenRouter) y Masad (Replit) | a16z | Riesgos y futuro | Muchos modelos especializados en vez de un "modelo dios"; delegar te quita comprensión |
| 6 | 2026-03-29 | Drew (divulga a Tegmark) | AI Species | Riesgos y futuro | Los 12 finales posibles de la IA; lo peor no es la extinción |
| 7 | 2025-03-17 | Sam Altman | David Perell | Productividad | Piensa en un cuaderno de espiral, aprovecha 11 minutos y dicta para que ChatGPT ordene |
| 8 | 2026-09-03 | Levchin (Affirm) y Rampell | a16z | Emprendimiento | El fin de la tarjeta de crédito: la IA debería pagar, no elegir; el "0 %" con asterisco |
| 9 | 2026-09-23 | Masad y Biyani | a16z | Carrera | Qué aprender: curiosidad, proyectos y ser "hereje"; currículo personalizado con IA |
| 10 | 2025-04-16 | Andrew W. Lo (MIT) | MIT OCW | Finanzas con IA | Usar ChatGPT para pensar la jubilación, no para decidirla; tres opiniones; escenarios |
| 11 | 2026-10-09 | Ethan Mollick | HBR | Liderazgo | De conversar a encargar ("conjurador"); 4 capacidades; los jefes usan mejor la IA |
| 12 | 2026-10-06 | Greg Isenberg | Greg Isenberg | Emprendimiento | 13 negocios que resisten a los agentes: servicios al 90 %, audiencia, datos y físico |
| 13 | 2026-09-04 | Dan Schulman (Verizon) | HBR | Liderazgo | "La peor IA que usarás es la de hoy"; fondo de reconversión que "no alcanza" |
| 14 | 2026-08-12 | Garry Tan (YC) | a16z | Emprendimiento | "Un archivo markdown es un empleado"; ser "400 de ti"; la lentitud social como buena noticia |
| 15 | 2026-07-24 | Ryan Carson | Greg Isenberg | Automatización | Fundador solo con 5 a 10 agentes; el perro guardián de las 9:00; costo de tokens |
| 16 | 2026-07-26 | Jensen Huang (NVIDIA) | Y Combinator | Emprendimiento | Aprender rápido (los 3 libros); la IA elimina tareas, no empleos; pensamiento sistémico |
| 17 | 2026-09-03 | Paul Graham | Y Combinator | Emprendimiento | "Casi todo sigue igual"; la IA es un humano chamullero; resuelve matemáticas y falla con horarios |
| 18 | 2026-10-11 | Joseph Choi | Superwall | Emprendimiento | Publicar antes de construir; los comentarios valen más que las vistas; probar 3 a 5 formatos |
| 19 | 2026-09-30 | Socios Growth | a16z | Inversión en IA | 25 gráficos: 2 % mide, 97 % no paga, el usuario top gasta 20 veces la mediana |
| 20 | 2025-10-28 | Jake Heller (Casetext) | Y Combinator | Emprendimiento | De 60 % a 97 % de acierto puliendo un prompt; vender el trabajo hecho |
| 21 | 2026-07-30 | Sandeep Swadia | Sandeep Swadia | Automatización | 4 agentes (las 4 C), prompt de 5 partes, escalera de confianza, microscopio de contratos |
| 22 | 2026-06-03 | Charlie Warren (YC) | Y Combinator | Emprendimiento | Firmas de servicios nativas de IA; "la inconsistencia te despide antes que la lentitud" |

---

## 2. Hallazgos: 8 ideas que atraviesan los videos

### H1. La IA dejó de esperar que le escribas
- **OpenAI (Embiricos, Sottiaux):** los Dots tienen su propia computadora en la nube, siguen un tema por días y proponen cosas. "La mayoría de las acciones en internet las harán agentes." Las capacidades llegarán a ChatGPT (1.200 millones de usuarios semanales), primero a Pro y Business y al final al plan gratis.
- **Meta (Wang):** Muse coordinó un courier para recuperar un carnet olvidado en un jet. Su argumento es "no es trabajo, no es código, es personal".
- **Stripe (Kaliski):** un emoji en Slack lanza un agente. Otro agente pagó navegador, búsqueda e invitación postal para un cumpleaños por unos US$5.
- **a16z:** los socios, que no programan, tienen "un puñado de automatizaciones corriendo cada noche". **Carson:** su "perro guardián" le manda un resumen a las 9:00. **Sandeep:** un agente de correo programado cada mañana.
- **Para la audiencia:** la versión de hoy, al alcance de cualquiera, son las **tareas programadas** de ChatGPT (3 en el plan gratis) y la programación de Claude Cowork (de pago).

### H2. La confianza se da por escalones
- **Wang:** la gente adopta un agente con una "caída de confianza" gradual. Muse no se lanzó hasta pasar una planilla de más de 100 comportamientos. OpenClaw "tuvo su peak y desapareció" por poco fiable.
- **Embiricos:** por defecto los Dots **preguntan antes de actuar** y otro modelo vigila al principal.
- **Sandeep:** "no nos ascienden fácil, tampoco a tu agente". Primero ver, luego hacer eficiente, luego automatizar y al final delegar.
- **Heller:** las demos aciertan entre 60 % y 70 %. Con dos semanas puliendo un prompt se llega al 97 %, y una beta exige 100 pruebas por prompt.
- **Warren:** "los clientes te despiden antes por inconsistencia que por lentitud". **Stripe:** la revisión sigue siendo humana.
- **Para la audiencia:** es una regla de seguridad que se puede enseñar: *no le des tu Gmail a una IA el primer día*.

### H3. Guardar lo que funciona: el prompt como empleado
- **Tan:** "un archivo markdown es un empleado". Una tarea bien hecha una vez se guarda y se repite. Empresas de 2 o 3 personas pasan de 0 a 15 millones de USD con cientos de *skills* [no nombra cuáles].
- **Carson:** playbooks y una agente ("Grace") que se califica sola con una rúbrica y propone 3 arreglos al día.
- **Kaliski:** el prompt de sistema de Stripe tiene 5 palabras; lo que importa es el entorno. Guarda lo repetible como *skill*.
- **Sandeep:** convierte la plantilla de su marca en una *skill*. "Si llegas confundido, la IA multiplica tu confusión."
- **Para la audiencia:** los GPT personalizados, los Gems de Gemini y los Proyectos de Claude son "empleados" que cualquiera arma en 10 minutos.

### H4. El humano decide en el punto clave
- **Mollick:** propone "fábricas en penumbra", donde la IA llama a la persona cuando hace falta su criterio. Si automatizas todo, quedas igual que la competencia.
- **Isenberg:** la IA entrega el 90 % y la persona revisa las excepciones.
- **Lo (MIT):** usar ChatGPT "para pensar, no para decidir". Pedir segunda y tercera opinión, como con un médico. "En última instancia, usted será responsable."
- **Levchin:** la IA debería **pagar** por ti, no **elegir** lo que compras.
- **Masad:** "mientras más le delegas, menos entiendes". **Altman:** escribir sigue siendo la herramienta para pensar y no ha encontrado una IA que la reemplace.

### H5. Quita tareas, no empleos, pero muy rápido
- **Jensen:** "la narrativa de que la IA destruye empleos está al revés". Da como ejemplo más radiólogos y más asistentes legales [cifras por verificar].
- **Tan:** la burocracia es la buena noticia ("white pill"), porque el cambio tardará unos 20 años. **Graham:** "casi todo sigue igual".
- **En contra:** Schulman despidió y después creó un fondo de 20 millones de dólares que, según él, "no alcanza". Lo teme que la velocidad le gane a la reconversión. Mollick dice que los laboratorios buscan explícitamente el "apocalipsis laboral".
- **Miedo de fondo (Sandeep):** el 70 % de los estadounidenses cree que la IA reducirá empleos, y el 81 % en la generación Z [encuesta sin nombre].

### H6. Todos están empezando, incluso los expertos
- **a16z:** el 69 % del S&P 500 despliega IA, el 30 % reporta impacto y apenas el **2 % lo mide en el tiempo**. Alrededor del 2 % de los hogares de EE. UU. paga una suscripción de IA.
- **Mollick:** "todos lo estamos fingiendo; nadie sabe nada". **Embiricos**, que dirige Dots, dice sentirse "no lo bastante avanzado". **Sottiaux:** "necesitas un doctorado en selectores de modelos" y quiere eliminarlos.
- **Para la audiencia:** este es el mensaje de "no vas tarde", y es la base de las piezas compartibles.

### H7. Lo que vale cuando todos tienen el mismo modelo
- **Mollick, 4 capacidades:** conocimiento profundo, conocimiento amplio, gusto y agencia. La experiencia es una ventaja: los mejores usando IA son los jefes, porque especifican bien lo que quieren [estudio de Anthropic por identificar].
- **Sottiaux:** escribir rápido pierde valor y el buen gusto lo gana. **Isenberg:** gana quien tiene audiencia, datos y fans; la estrategia es primero la audiencia, luego la comunidad y después el producto.
- **Heller y Warren:** la IA vende el trabajo hecho y no la herramienta. El mercado pasa de "20 USD al mes por persona" a "lo que hoy se paga en sueldos".

### H8. La voz es la nueva forma de usar la IA
- Altman dicta y le pide a ChatGPT que lo limpie, porque es "más generativo con la boca que con los dedos". Sottiaux no pensaba depender tanto de la voz. Embiricos le habla a su Dot mientras pasea a sus perros. Carson dicta con un botón físico. Sandeep ensaya entrevistas por voz.
- **Para la audiencia:** encaja perfecto con un público "en el celular y distraído".

### Contradicciones que sirven como ganchos de opinión
| Tensión | Un lado | El otro |
|---|---|---|
| ¿Un agente o muchos? | Wang y Embiricos: uno personal basta | Masad: "10 jefes de gabinete", sin matar moscas a cañonazos |
| ¿Hay que configurar el agente? | Sandeep: prompt de 5 partes y escalera | Sottiaux: configurar flujos es una moda pasajera |
| ¿Trabajarás menos? | Acharya (a16z): 3 días intencionales a la semana | Carson: "vas a trabajar mucho más, no menos" |
| ¿Quién gana, jóvenes o expertos? | Masad: los jóvenes "herejes" | Mollick: la IA premia la experiencia |
| ¿Delegar dinero en la IA? | Lo (abr-2025): "aún no" | Mollick (oct-2026): pídele segunda opinión |
| ¿Ambición innata? | Graham: en gran parte sí | Tan: la agencia se practica |

---

## 3. Lo que falta verificar antes de publicar

### 3.0 Verificación web (2026-10-16)
| Dato | Resultado | Fuente |
|---|---|---|
| 117 correos al día y 275 interrupciones (una cada 2 min) | ✅ Confirmado: Microsoft Work Trend Index, informe especial «Breaking down the infinite workday» (17-jun-2025), con más de 30.000 trabajadores. Las 275 interrupciones y el «cada 2 minutos» son el mismo dato contado de dos formas. | unleash.ai, techradar.com, hrexecutive.com |
| 93 % siente ansiedad en entrevistas | ✅ Existe, pero es de **2020**: JDP encuestó a 2.018 personas en EE. UU. El 70 % practica en voz alta, lo que sirve para la pieza n.º 4. | jdp.com, smallbiztrends.com |
| 70 % cree que la IA reducirá empleos (81 % en la generación Z) | ✅ Confirmado: Quinnipiac, 30-mar-2026, con 1.397 adultos. Matiz: solo el 26 % de la generación Z teme por **su propio** empleo. Pew (jun-2026) da un 71 %. | poll.qu.edu, pewresearch.org |
| 2 % de los hogares paga IA y 2 % de las empresas mide | ⚠️ El dato de empresas se confirma (69 % despliega, 29-30 % cuantifica y 2 % sigue una métrica en el tiempo). El de hogares está en disputa: según Pebblous, el 2,2 % sale de **clientes de PNC** y no de todos los hogares de EE. UU. Conviene decir «según a16z, cerca del 2 % de los hogares…» o usar solo el dato de empresas. | theneurondaily.com, blog.pebblous.ai |
| De 45 minutos a 16 horas por instrucción (Mollick) | ⚠️ Es coherente con METR: el mejor modelo (Claude Mythos) llega a ~16-17 h con 50 % de éxito, pero solo a ~3 h con 80 %. El propio METR dice que sus medidas sobre 16 h no son confiables. No sirve como dato duro para una pieza. | en.wikipedia.org/wiki/METR |
| Los jefes usan mejor la IA (estudio de Anthropic) | ❌ No se encontró el estudio original; solo hay un blog secundario (los managers con 95 % de éxito en Claude Code). Lo que sí está documentado: los seniors rinden más y usar IA puede perjudicar el aprendizaje. **No publicar la pieza n.º 14 con ese dato.** | devclass.com, besthub.dev |
| Dots de OpenAI | ✅ Lanzado el 29-sep-2026 en DevDay. **Solo en Pro y Business Premium**; no está en Free, Go ni Plus y no tiene fecha. En Pro excluye la UE, Suiza y el Reino Unido. La pieza n.º 8 debe aclarar que **casi nadie lo puede usar todavía**, y eso también puede ser el gancho. | techcrunch.com, tomsguide.com |
| Cumpleaños pagado por un agente (Stripe) | ❌ No aparece fuera del podcast. Solo se puede citar como «lo contó un ingeniero de Stripe en How I AI», no como dato verificado. | — |

**Datos de alto valor para piezas, todos sin referencia todavía:**
- Las cifras de Microsoft de 117 correos al día y una interrupción cada 2 minutos (275 al día). Probablemente salen del Work Trend Index 2025.
- El 93 % que siente ansiedad antes de una entrevista (encuesta JDP).
- El 70 % y el 81 % que temen perder empleos por la IA (la encuesta no se nombra).
- El 2 % de los hogares de EE. UU. que paga IA y el 2 % del S&P 500 que mide su impacto (presentación State of Markets de a16z).
- El estudio de Anthropic sobre jefes que programan mejor con IA. La cifra de 45 minutos a 16 horas por instrucción (METR o Epoch).
- El crecimiento de radiólogos y asistentes legales que cita Jensen.
- El caso Stripe del cumpleaños por unos US$5,47 (la transcripción dice "$547").

**Referencias que no existen y desbloquean piezas:**
- **Dots de OpenAI.** No hay `referencias/dots*.md`, aunque ya figura en `candidatos.json`. Hay que saber qué es, cuándo llega a Plus y al plan gratis, y en qué países.
- **Modo voz y dictado de ChatGPT en el celular** (también está en candidatos).
- **GPT personalizados, Gems y Proyectos de Claude** como "empleado guardado". Ya existe `agent-skills`, pero apunta a desarrolladores.
- **Revisar un contrato o letra chica con IA:** límites, privacidad y la CAE en Chile.
- **Ensayar entrevistas con IA en modo voz.**

**Referencias que ya existen y se pueden usar** (revisadas entre el 2026-10-09 y el 2026-10-14): `muse`, `gpt-6-astra`, `fable-5-1`, `instinct`, `jev`, `claude-cowork`, `tareas-programadas-de-chatgpt`, `memoria-de-agentes`, `chatgpt-para-finanzas-personales`, `riesgos-de-la-ia-en-finanzas-personales`, `openrouter`, `goose`, `modo-estudio-de-chatgpt`, `notebooklm`, `gemini`.
- Muse solo está en EE. UU.
- GPT-6 Astra no está en el plan gratis (el GPT-6 gratis es Luna).
- Cowork es de pago, desde US$17 al mes.

**Errores en las fichas automáticas** (se pueden anotar en `## Mis notas`, no en `kb:auto`): las fichas de Andrew Lo, Jensen Huang y Sandeep Swadia dicen que la transcripción se corta, pero está completa. La de Isenberg dice que solo detalla 6 de los 13 negocios, pero desarrolla los 13. Hay nombres mal transcritos: "Opus 48", "GPT56", "Craptrack", "Kolabtree" y "Merch One" (probablemente Mercor). Carson afirma que "Cursor es propiedad de Elon", lo que es dudoso.

---

## 4. Ángulo para la cuenta de Instagram

### 4.1 El ángulo: «Lo que hacen los que construyen la IA, en tu celular»

**La idea:** cada pieza toma **una práctica concreta de alguien que construye la IA** (el CEO de OpenAI, un ingeniero de Stripe, un profesor del MIT o de Wharton) y la convierte en **un paso que la audiencia hace hoy con ChatGPT, Gemini o Claude, en minutos y casi siempre gratis**.

**Por qué este ángulo y no otro:**
1. **Cumple las reglas duras 6 y 8 por construcción.** La IA siempre se ve, porque la pieza muestra la herramienta haciendo el paso. El Hook dice el resultado y con qué se logra. El nombre famoso va en el subtítulo como prueba, no como acertijo. Ejemplo: «Ordena tus ideas hablándole a ChatGPT» + «El método de Sam Altman».
2. **Responde por qué seguir a @ia.punto.es.** El aprendizaje del 2026-10-15 dice que quien llega no tiene motivo para seguir. Este ángulo da una promesa repetible: *aquí ves cómo usan la IA los que la hacen, traducido para ti*.
3. **Rescata los 12 videos que el alcance deja fuera.** Las ideas de startups no se publican como startups, sino como Productividad, Automatización, Aprendizaje, Finanzas y Liderazgo (enfoqueIA).
4. **Usa la autoridad sin inventar.** El nombre da contexto y el dato y los pasos salen de una referencia, como pide la regla 5.
5. **Encaja con la retención medida.** El hook de controversia con pregunta retuvo el 38 % a los 3 s, el doble que el resto. Varios hallazgos son contraintuitivos ("el CEO de OpenAI piensa en papel", "nunca le pidas que resuma un contrato") y funcionan como gancho si el subtítulo da la promesa.

**Fórmula de la pieza (reel ≤ 20 s):**
`Hook: [resultado] + [con qué IA]` · `subtítulo: [quién lo hace] o [cuánto tarda] + destinatario ("si buscas trabajo…")` → `Escena 2: confirma la promesa` → `Escenas del medio: la IA haciéndolo en pantalla` → `Cta: guárdalo o envíaselo a…`

### 4.2 Tres series para el mix

| Serie | Qué es | Pilar (`config.json`) | Arquetipos | Peso sugerido |
|---|---|---|---|---|
| **A · «Cópiale al que la construye»** | Una práctica de un experto convertida en un tutorial de 3 pasos | herramienta / prompt | tutorial, demo | ~50 % |
| **B · «La IA ya no espera»** | La era de los agentes explicada sin tecnicismos: qué hacen Dots, Muse y las tareas programadas, y cómo darles permisos de a poco | noticia / herramienta | demo, lista, carrusel | ~25 % |
| **C · «Calma con datos»** | Datos que bajan la ansiedad y se comparten: casi nadie paga, nadie sabe nada, quita tareas y no empleos. Siempre con un paso práctico al final | curiosidad | compartible, atemporal, opinión | ~25 % |

### 4.3 Banco de 20 piezas

Cada pieza indica la referencia que la sostiene: **✓** si ya existe y **+** si hay que crearla antes.

| # | Serie · formato | Hook (título) | Subtítulo | Qué se lleva | Viene de | Ref. |
|---|---|---|---|---|---|---|
| 1 | A · reel tutorial | Ordena tus ideas hablándole a ChatGPT | El método de Sam Altman, 3 min | Dictar en modo voz y el prompt «límpialo sin cambiar mis ideas» | Altman (Perell) | + modo voz |
| 2 | A · reel compartible | Haz que 3 IA discutan antes de decidir | ChatGPT, Gemini y Claude, gratis | Prompt «critica esta respuesta de otra IA» | Sandeep, a16z, Lo | ✓ gemini, + comparar |
| 3 | A · carrusel lista | Nunca le pidas a ChatGPT que «resuma» un contrato | Usa esta tabla de 5 columnas | Prompt microscopio: qué dice, qué significa, por qué importa, riesgo y qué preguntar | Sandeep | + contratos con IA |
| 4 | A · reel demo | Ensaya tu entrevista con una IA que te contradice | Modo voz de ChatGPT · si buscas trabajo | Prompt del entrevistador escéptico, una pregunta a la vez, y feedback al final | Sandeep | + entrevistas con IA |
| 5 | A · reel tutorial | Convierte tu mejor prompt en un «empleado» de ChatGPT | GPT personalizado o Gem, 10 min | Hacer la tarea una vez y pedir «conviértelo en instrucciones reutilizables» | Tan, Kaliski | + GPTs y Gems |
| 6 | B · reel tutorial | Recibe tu resumen del día sin pedirlo, con ChatGPT | Tarea programada, plan gratis | Crear una tarea diaria (máximo 3 en el plan gratis) | Carson, a16z | ✓ tareas-programadas |
| 7 | B · reel atemporal | No le des tu Gmail a una IA el primer día | La escalera de confianza en 4 pasos | Ver, revisar, programar y recién entonces delegar | Sandeep, Wang, Dots | ✓ claude-cowork |
| 8 | B · carrusel opinión | La IA ya no espera que le escribas | Qué son Dots y Muse y qué cambia para ti | Qué hace cada uno, dónde está disponible y qué permisos pide | Embiricos, Wang, Sottiaux | ✓ muse, + dots |
| 9 | B · reel demo | Claude ordena tu correo antes del desayuno | Sin enviar nada sin tu permiso | Prompt de 5 partes: trabajo, herramienta, categorías, salida y límite | Sandeep, Carson | ✓ claude-cowork (pago) |
| 10 | B · reel tutorial | ChatGPT te dice qué reunión de tu semana sobra | Tu auditor de energía, 2 min | Conectar el calendario y el prompt del auditor | Lenny | ✓ gpt-6-astra, + conectores |
| 11 | C · carrusel lista | 5 cosas que ChatGPT hace gratis y casi nadie usa | Casi nadie paga y aún no usa esto | Tareas programadas, modo estudio, voz, memoria y comparar IA | a16z (97 %) | ✓ varias, + dato 2 % |
| 12 | C · reel compartible | Piensa mejor antes de preguntarle a ChatGPT | Lo que hace el CEO de OpenAI | Escribir 5 líneas tuyas y pedir «¿qué me falta? ¿dónde me contradigo?» | Altman, Masad | + modo voz |
| 13 | C · reel atemporal | Separa tu trabajo en 15 tareas: la IA te dice cuáles hace | 1 prompt en ChatGPT | Prompt «cuáles puedes hacer hoy, cuáles a medias y cuáles no» | Jensen, Schulman | + dato de empleos |
| 14 | C · carrusel opinión | Los mejores usando IA son los jefes, no los programadores | Encárgale como un jefe: 5 partes | Plantilla de encargo: objetivo, contexto, entrega, criterio y dudas | Mollick | + estudio Anthropic |
| 15 | A · reel demo | Pregúntale a Claude si tu «0 % de interés» es real | Sube la letra chica, 2 min | Prompt para detectar intereses diferidos y cargos por atraso (en Chile, la CAE) | Levchin | ✓ chatgpt-para-finanzas |
| 16 | A · reel tutorial | Simula una caída de tu ahorro con ChatGPT antes de asustarte | Como recomienda un profesor del MIT | Tabla de «¿qué pasa si…?»: vender, esperar 2 años o esperar 5. Sirve para pensar, no para decidir | Lo | ✓ riesgos-ia-finanzas |
| 17 | A · reel tutorial | Aprende cualquier tema en 5 lecciones con ChatGPT | El truco con el que Jensen salvó NVIDIA | Prompt «temario de los 3 libros clave, 5 lecciones de 10 minutos» | Jensen | ✓ modo-estudio |
| 18 | A · reel tutorial | Aprende Excel con tu pasatiempo, con ChatGPT | Plan de 4 semanas en 1 prompt | Prompt para usar tu pasatiempo como ejemplo en cada ejercicio | Masad, Biyani | ✓ modo-estudio |
| 19 | A · reel demo | Lee 100 comentarios en 1 minuto con ChatGPT | Si vendes algo por redes | Clasificar «tiene el problema / pregunta / solo se ríe» y sacar las 5 frases que más se repiten | Choi (Superwall) | + análisis de comentarios |
| 20 | A · reel compartible | Haz que ChatGPT confiese lo que no puede confirmar | 1 frase antes de confiar | Prompt «revisa cada dato y dime cuáles no puedes confirmar» | Heller, Graham | + verificación |

Quedan **fuera por alcance** (el tema no está en `dentro` ni en `despues`): los 12 finales de Tegmark (*Riesgos y futuro*), la tarjeta de crédito como negocio y los números del boom de inversión. Si quieres usarlos, primero hay que sumar el tema en `alcance.json`. La excepción es la nota «el agente que pagó un cumpleaños», que puede entrar por *Avances en IA* como noticia de la serie B.

### 4.4 Lo que los videos enseñan sobre la propia cuenta

Varios videos tratan de distribución, y sus lecciones calzan con los aprendizajes del 2026-10-14 y el 2026-10-15:
- **Choi (Superwall):** «lee los comentarios, no las vistas». Hay que probar de 3 a 5 formatos distintos en vez de repetir uno, y cuando uno gana, repetirlo con variaciones del gancho. Encaja con la regla 8 y con el experimento `ritmoReel`.
- **Wang (Meta):** «un producto de consumo tiene que funcionar en el screenshot». Aplicado aquí: la Slide 1 o el primer cuadro del reel deben entenderse solos, que es lo que revisa la pregunta 7 del lector frío.
- **Warren (YC):** la inconsistencia aleja más que la lentitud. Una serie fija con la misma fórmula de hook construye expectativa, y eso es lo que da razones para seguir la cuenta.
- **Isenberg:** primero audiencia, luego comunidad y después producto. Si un tema genera preguntas en comentarios («¿cómo se llama la herramienta?»), ahí hay comunidad.
- **Carson:** Sahil Bloom creció publicando «lo que estoy aprendiendo». Un formato sincero del tipo «esta semana probé…» baja la vara del experto y genera confianza.

### 4.5 Próximos pasos sugeridos

1. **Pedir las 6 referencias que faltan:** Dots, modo voz, GPTs y Gems, contratos con IA, entrevistas con IA y verificación cruzada. También verificar los 7 datos de la sección 3. Como `pedidos.md` es tuyo, yo no lo edité; si quieres, te dejo el texto listo para pegar.
2. **Probar el ángulo una semana:** 5 o 6 piezas del banco con referencia ✓ (las n.º 6, 7, 9, 15, 16, 17 y 18) y medir si suben los seguidores por cada 100 de alcance y los envíos.
3. **Corregir en `## Mis notas`** las 4 fichas que dicen estar cortadas sin estarlo.

---

## 5. Contenido que sale de cada video

Leyenda: **✓** hay referencia para hacerla · **+** falta una referencia · **✗** no se recomienda (fuera de alcance o dato sin verificar). El n.º corresponde al banco de la sección 4.3.

| # | Video | Pieza principal (Hook · subtítulo) | Segunda idea | Estado |
|---|---|---|---|---|
| 1 | Alexandr Wang · Muse (Meta) | «Dale tareas a tu IA de menor a mayor» · la «caída de confianza» de Meta | Qué es Muse y por qué aún no llega a Latam | ✓ muse |
| 2 | Embiricos · Dots (OpenAI) | «La IA ya no espera que le escribas» · qué son los Dots (n.º 8) | «Por qué casi nadie puede usar Dots todavía»: solo Pro | ✓ verificado en web, + ref. dots |
| 3 | Tibo Sottiaux · Lenny's | «ChatGPT te dice qué reunión de tu semana sobra» · auditor de energía (n.º 10) | «Deja de elegir modelo: el modo automático basta» | + conectores |
| 4 | Steve Kaliski · Stripe | «Pídele a la IA el primer borrador de lo que te cuesta empezar» · la «energía de activación» | «Qué puede comprar ya una IA por ti» (cumpleaños de US$5) | + / ✗ dato sin verificar |
| 5 | Atallah y Masad · a16z | «Haz que 3 IA discutan antes de decidir» (n.º 2) | «No uses la IA más cara para todo» · los modelos gratis bastan para lo simple | ✓ gemini, openrouter |
| 6 | AI Species · 12 finales | Carrusel «12 finales posibles para la IA, según un profesor del MIT» | — | ✗ «Riesgos» está fuera del alcance (hay que agregarlo a pedidos.md) |
| 7 | Sam Altman · Perell | «Ordena tus ideas hablándole a ChatGPT» · el método de Sam Altman (n.º 1) | «Piensa mejor antes de preguntarle a ChatGPT» (n.º 12) | + modo voz (pedido) |
| 8 | Levchin y Rampell · a16z | «Pregúntale a Claude si tu "0 % de interés" es real» (n.º 15) | «Compara el precio total con despacho antes de comprar», con ChatGPT con búsqueda | ✓ chatgpt-para-finanzas |
| 9 | Masad y Biyani · a16z | «Aprende Excel con tu pasatiempo, con ChatGPT» (n.º 18) | «5 creencias de tu rubro que la IA podría volver falsas» | ✓ modo-estudio |
| 10 | Andrew Lo · MIT | «Simula una caída de tu ahorro con ChatGPT» (n.º 16) | «Las 5 preguntas sobre tu jubilación que le harías a ChatGPT», para pensar, no para decidir | ✓ riesgos-ia-finanzas |
| 11 | Ethan Mollick · HBR | «Encárgale trabajo a la IA como un jefe» · plantilla de 5 partes | «Pide 5 opciones y decide tú» · segunda opinión | ✓ prompt-con-contexto, ✗ dato de los jefes |
| 12 | Greg Isenberg · 13 negocios | «Arma un servicio donde la IA hace el 90 %» · con Claude | «Encuesta a 50 personas y crea un dato que ChatGPT no tiene» | + Monetización |
| 13 | Dan Schulman · HBR | «Pega tu descripción de cargo: la IA te dice qué reforzar» | «La peor IA que vas a usar es la de hoy» · vuelve a probar lo que te falló | + dato de empleos |
| 14 | Garry Tan · a16z | «Convierte tu mejor prompt en un empleado de ChatGPT» (n.º 5) | «Pega tus actas de la semana y detecta los conflictos», con Claude | + GPTs y Gems |
| 15 | Ryan Carson · Isenberg | «Recibe tu resumen del día sin pedirlo» · tarea programada (n.º 6) | «Califica tus chats de WhatsApp Business con una rúbrica», con ChatGPT | ✓ tareas-programadas |
| 16 | Jensen Huang · YC | «Aprende cualquier tema en 5 lecciones» · el truco de Jensen (n.º 17) | «Separa tu trabajo en 15 tareas» (n.º 13) | ✓ modo-estudio |
| 17 | Paul Graham · YC | «Haz que ChatGPT confiese lo que no puede confirmar» (n.º 20) | «Resuelve matemáticas y falla con un horario: por qué» | + verificación |
| 18 | Joseph Choi · Superwall | «Lee 100 comentarios en 1 minuto con ChatGPT» (n.º 19) | Lección interna: probar 3 a 5 formatos y mirar comentarios, no vistas | + análisis de comentarios |
| 19 | a16z · State of Markets | «5 cosas que ChatGPT hace gratis y casi nadie usa» (n.º 11) | «Solo 2 % de las empresas mide si su IA sirve: hazlo tú en 2 semanas» | ✓ dato de empresas verificado; ⚠️ el de hogares, en disputa |
| 20 | Jake Heller · YC | «Prueba tu prompt 10 veces antes de confiar» · de 60 % a 97 % | «Pídele a la IA los pasos de un experto, uno por uno» | + verificación |
| 21 | Sandeep Swadia · 4 C | «Nunca le pidas a ChatGPT que "resuma" un contrato» (n.º 3) | «Ensaya tu entrevista con una IA que te contradice» (n.º 4) · «Claude ordena tu correo» (n.º 9) · escalera de confianza (n.º 7) | ✓ claude-cowork, ✓ datos de Microsoft y JDP verificados |
| 22 | Charlie Warren · YC | «Cobra por entregable, no por hora, si usas IA» | «Pídele la misma tarea 5 veces: si cambia mucho, falta una plantilla» | + Monetización |
