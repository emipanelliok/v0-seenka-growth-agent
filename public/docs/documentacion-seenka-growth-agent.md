# Seenka Growth Agent - Documentacion Completa

## 1. Vision General

Seenka Growth Agent es una aplicacion web interna de ventas y outreach para el equipo comercial de Seenka (empresa de media intelligence). Permite gestionar contactos clave ("champions"), detectar oportunidades de contacto ("triggers"), generar mensajes personalizados con IA, y automatizar el envio por LinkedIn y Email.

**Stack tecnologico:**
- Frontend: Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + RLS)
- IA: Vercel AI SDK 6 con AI Gateway (OpenAI, Anthropic)
- Integraciones: PhantomBuster (LinkedIn), Resend (Email), Proxycurl (enriquecimiento LinkedIn), Make/Integromat (webhooks)

---

## 2. Autenticacion

- Sistema de auth nativo de Supabase (email + password)
- Paginas: `/auth/login`, `/auth/sign-up`, `/auth/sign-up-success`, `/auth/error`
- Toda la app esta protegida con middleware que redirige a login si no hay sesion
- Row Level Security (RLS) en todas las tablas: cada usuario solo ve sus propios datos

---

## 3. Estructura de Navegacion

Sidebar con las siguientes secciones:

| Seccion | Ruta | Descripcion |
|---------|------|-------------|
| Dashboard | `/dashboard` | Metricas generales: champions activos, triggers detectados, mensajes enviados, oportunidades |
| Champions | `/champions` | Lista de contactos clave con filtros por status, nivel, tipo |
| Triggers | `/triggers` | Senales de oportunidad detectadas en champions |
| Secuencias | `/secuencias` | Builder visual de secuencias de follow-up |
| Efemerides | `/efemerides` | Fechas comerciales/marketing por pais e industria |
| Interacciones | `/interactions` | Historial de todos los mensajes enviados |
| Importar | `/importar` | Importacion masiva de prospectos desde CSV/Excel |
| Ajustes | `/ajustes` | Configuracion de integraciones y prompts de IA |

---

## 4. Modulo: Champions

### 4.1 Que es un Champion
Un champion es un contacto clave en la industria de publicidad/marketing/medios que podria ser cliente de Seenka. Se almacena en la tabla `champions`.

### 4.2 Campos principales
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| name | TEXT | Nombre completo |
| linkedin_url | TEXT | URL del perfil de LinkedIn |
| email | TEXT | Email del contacto (para outreach por email) |
| role | TEXT | Cargo actual |
| company | TEXT | Empresa donde trabaja |
| industry | TEXT | Industria de la empresa |
| country | TEXT | Pais (ej: "Argentina", "Mexico") |
| headline | TEXT | Headline de LinkedIn |
| champion_type | ENUM | creative, media, marketing, sales, strategy, other |
| champion_level | ENUM | high, medium, low |
| status | ENUM | listening, trigger_detected, contacted, responded, opportunity, paused |
| linkedin_data | JSONB | Datos extra de LinkedIn (experiencias, educacion, etc.) |
| company_id | UUID | FK a tabla companies (analisis de empresa) |
| seenka_ai_insight | TEXT | Insight generado por IA sobre el champion |

### 4.3 Tipos de Champion (champion_type)
Se auto-detecta desde el cargo/headline usando keywords definidos en `CHAMPION_TYPE_KEYWORDS`:

- **creative**: Directores creativos, art directors, copywriters, planners
- **media**: Directores de medios, media planners/buyers, programmatic
- **marketing**: CMOs, brand managers, growth, demand generation
- **sales**: Directores comerciales, account executives, business development
- **strategy**: Strategy directors, insights, research, data analysts
- **other**: No clasificados

### 4.4 Estados del Champion (status)
Pipeline de ventas:
```
listening -> trigger_detected -> contacted -> responded -> opportunity
                                                       -> paused
```

### 4.5 Enriquecimiento de LinkedIn
Desde el detalle del champion (`/champions/[id]`):
1. Se llama a `/api/linkedin/enrich-profile` que usa Proxycurl
2. Trae: foto, headline, summary, experiencias, educacion, idiomas, followers, etc.
3. Los datos se guardan en `linkedin_data` (JSONB) y en campos dedicados
4. La IA genera un resumen del perfil (`ai_profile_summary`)

### 4.6 Analisis de Empresa
- Cuando un champion tiene empresa, se puede analizar desde su perfil
- `/api/ai/analyze-company` analiza la empresa y genera: industry, sector, size, pain_points, seenka_products, sales_angle
- Se guarda en la tabla `companies` y se vincula al champion via `company_id`

### 4.7 Prompt de Seenka AI por Tipo
Cada tipo de champion tiene un prompt especializado (definido en `CHAMPION_TYPE_SEENKA_PROMPTS`) que genera consultas relevantes segun su perfil:
- Creativos: campanas destacadas, tendencias creativas, formatos
- Medios: inversion publicitaria, SOV, mix de medios
- Marketing: presencia de marca, estrategias de comunicacion
- Sales: datos comerciales, mayores anunciantes
- Strategy: insights estrategicos, tendencias de categoria

### 4.8 Clientes del Champion
Tabla `champion_clients` almacena los clientes que maneja un champion:
| Campo | Descripcion |
|-------|-------------|
| client_name | Nombre del cliente (ej: "Shell") |
| matched_sector | Sector matcheado del nomenclador |
| matched_industria | Industria matcheada del nomenclador |

Se usan para matching con efemerides y para generar insights personalizados.

---

## 5. Modulo: Triggers

### 5.1 Que es un Trigger
Una senal de oportunidad detectada en un champion que indica un buen momento para contactarlo.

### 5.2 Tipos de Trigger
| Tipo | Descripcion |
|------|-------------|
| post | Post propio del champion en LinkedIn |
| shared | Post compartido por el champion (con su comentario) |
| data_seenka | Dato de Seenka relevante para el champion |
| market_context | Contexto de mercado (cambio de puesto, evento, etc.) |

### 5.3 Evaluacion con IA
`/api/ai/evaluate-trigger` analiza el contenido del trigger y determina:
- `is_worth_contacting`: boolean - si vale la pena contactar
- `severity`: high/medium/low
- `topic`: tema principal
- `reasoning`: por que si o por que no
- `recommended_products`: que productos de Seenka recomendar
- `mentioned_people`: personas mencionadas en el post

### 5.4 Posts Compartidos
Para posts compartidos se capturan campos adicionales:
- `champion_comment`: Comentario del champion al compartir
- `original_author_name/linkedin/role`: Autor original del post
- `original_content`: Contenido del post original
- `mentions_seenka`: Si se menciona a Seenka

---

## 6. Modulo: Secuencias

### 6.1 Que es una Secuencia
Un flujo automatizado de follow-up para cuando el champion **NO responde**. Se configura visualmente en `/secuencias`.

**Importante**: Con el nuevo sistema de respuestas automaticas (ver seccion 9), cuando un champion **SI responde**, el LLM agentico analiza y genera respuestas personalizadas. Las secuencias ahora solo aplican para el path `no_response`.

### 6.2 Estructura
Una secuencia tiene multiples pasos (`sequence_steps`), cada uno con:
| Campo | Descripcion |
|-------|-------------|
| step_number | Orden del paso |
| path | Camino: no_response (principal), positive, lukewarm, negative (legacy) |
| wait_days | Dias de espera antes de enviar |
| message_template | Template/instrucciones para el mensaje |
| message_tone | Tono del mensaje |

### 6.3 Flujo de No Respuesta (principal)
Si el champion no responde al Email 1:
- **Email 2**: En 3 dias - follow-up breve con datos de Seenka MCP
- **Email 3**: En 7 dias - segundo follow-up con datos de competencia
- **Email 4**: En 14 dias - ultimo intento, compartir valor sin pedir nada

### 6.4 Caminos Legacy (manejados por LLM agentico)
Estos paths ya no usan templates fijos, el LLM genera respuestas personalizadas:
- **positive**: LLM propone llamada + cupon/descuento
- **lukewarm**: LLM envia mas datos de Seenka MCP (nurturing)
- **negative**: LLM cierra amablemente + reactivar en 90 dias

### 6.5 Tracker
El componente `ChampionSequenceStatus` muestra en el detalle del champion:
- Path actual (positive/negative/lukewarm)
- Intent detectado por el LLM
- Action sugerida
- Status de la secuencia

### 6.6 Cron Job (pendiente)
Para automatizar el envio de follow-ups cuando no responden:
- Endpoint: `/api/cron/process-sequences`
- Busca champions con `next_step_at <= ahora`
- Genera mensaje con IA + datos de Seenka MCP
- Envia via Resend
- Actualiza al siguiente paso

---

## 7. Modulo: Efemerides

### 7.1 Que es una Efemeride
Una fecha comercial o de marketing relevante (Cyber Monday, Hot Sale, Dia de la Madre, etc.) que se puede usar como excusa para contactar champions.

### 7.2 Campos
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| name | TEXT | Nombre (ej: "Cyber Monday") |
| description | TEXT | Descripcion del evento |
| countries | TEXT[] | Paises aplicables (codigos ISO: AR, MX, CO, etc.) |
| industries | TEXT[] | Industrias relevantes (ej: "Retail", "Banca / Finanzas") |
| event_date | DATE | Fecha del evento |
| reminder_days_before | INT | Dias de anticipacion para recordatorio |
| seenka_data_hint | TEXT | Hint de dato Seenka para usar en mensajes |
| is_active | BOOLEAN | Si esta activa |

### 7.3 Plantillas Predefinidas
El dialog de crear efemeride incluye plantillas pre-configuradas:
- Cyber Monday, Hot Sale, Dia de la Madre, Black Friday, Navidad, Vuelta a Clases, San Valentin, Dia del Nino, Mundial de Futbol
- Cada plantilla auto-completa: paises, industrias sugeridas, fecha, descripcion, hint de dato Seenka

### 7.4 Criterios de Match Champion-Efemeride
La pagina de efemerides tiene un panel "Criterios de match" con 4 opciones toggleables:

| Criterio | Descripcion | Logica |
|----------|-------------|--------|
| **Industria** | Match por industria/sector del cliente del champion | Compara `champion_clients.matched_industria` con `efemeride.industries`. Tambien busca en el campo `company` del champion usando keywords de industria |
| **Tipo champion** | Agencias matchean siempre por pais | Si `champion_type` es creative, media o strategy, matchea con cualquier efemeride de su pais (las agencias manejan multiples clientes) |
| **Keywords** | Busca en headline/cargo/empresa del champion | Usa un mapa de keywords por industria (ej: "banca" -> banco, bank, finanz, financ, seguro, fintech) |
| **Historial** | Champions con interacciones previas | Incluye champions que ya tuvieron interacciones registradas |

**Regla obligatoria**: El pais siempre debe coincidir. No se envia Hot Sale Argentina a alguien de Mexico.

### 7.5 Mapa de Keywords por Industria
Para el matching por keywords y por nombre de empresa, se usa un mapa que normaliza variantes:

```
banca / finanzas -> banco, bank, finanz, financ, seguro, insurance, fintech, credito, tarjeta
retail -> retail, ecommerce, e-commerce, tienda, store, shop, comercio
tecnologia -> tech, tecnolog, software, hardware, digital
moda / indumentaria -> moda, fashion, indumentaria, ropa, apparel, textil
consumo masivo -> consumo masivo, fmcg, cpg, consumer goods, aliment
turismo / hoteleria -> turismo, hotel, travel, viaje, tourism, hospitality
automotriz -> auto, car, motor, vehicul, automotive
oil & gas -> oil, gas, petrol, energy, energia, combustible, shell, ypf
(y mas...)
```

Esto permite que "Banco Macro" (empresa del champion) matchee con la industria "Banca / Finanzas" de la efemeride.

---

## 8. Modulo: Outreach (Generacion y Envio de Mensajes)

### 8.1 Flujo General
1. Desde una efemeride o desde el detalle de un champion, se inicia el outreach
2. Se seleccionan los champions a contactar
3. Se elige el canal (LinkedIn, Email, WhatsApp)
4. Se genera el mensaje con IA (personalizado por champion, trigger/efemeride, y datos de Seenka)
5. Se revisa el mensaje (se puede editar/regenerar)
6. Se envia

### 8.2 Outreach desde Efemerides
Pagina: `/efemerides/[id]/outreach`

1. **Matching**: Cruza champions con la efemeride usando los criterios configurados (ver 7.4)
2. **Seleccion**: Checkbox por champion, seleccion masiva
3. **Canal por champion**: Se elige LinkedIn, Email o WhatsApp para cada uno
4. **Etapa auto-detectada**: cold (0 interacciones), warm (1-2), reengagement (3+)
5. **Dato Seenka**: Se busca por **keyword de la efemeride** (ej: "Cyber Monday"), no por industria
6. **Generacion**: Individual o masiva con boton "Generar mensajes (X)"
7. **Envio**: Individual o masivo con boton "Enviar mensajes (X)"

### 8.3 Datos de Seenka por Keyword
Al crear/editar una efemeride, el sistema automaticamente busca datos en Seenka MCP usando el **nombre de la efemeride como keyword**:

- Efemeride "Cyber Monday" -> busca keyword "Cyber Monday" en Seenka
- Efemeride "Dia del Padre" -> busca keyword "Dia del Padre" en Seenka

Esto trae datos de:
- Marcas/inversores que participaron en esa campana
- Soportes utilizados (TV, Radio, Digital, etc.)
- Canales/medios principales

Los datos se guardan en `efemeride.seenka_data_hint` y se usan para todos los mensajes de esa efemeride.

**Endpoint**: `/api/seenka/keyword` - busca por keyword y opcionalmente filtra por clientes del champion.

**Funcion**: `getSeenkaInsightForKeyword(keyword, clientNames?, country?)` en `/lib/seenka-mcp.ts`

### 8.4 Generacion de Mensajes con IA
Ruta: `/api/ai/efemeride-message`

El prompt recibe:
- Nombre y datos del champion (cargo, empresa, tipo)
- Nombre y datos de la efemeride
- Dato de Seenka relevante (**por keyword de la efemeride**, no por industria)
- Etapa (frio/tibio/reengagement)
- Canal elegido
- Instrucciones personalizadas del usuario (desde Ajustes)

Genera mensajes en espanol argentino, cortos, directos, sin frases genericas.

### 8.5 Envio por LinkedIn (PhantomBuster)
Ruta: `/api/outreach/send-message` (channel: "linkedin")

1. Lee las credenciales de PhantomBuster desde la tabla `settings`:
   - `phantombuster_api_key`
   - `phantombuster_phantom_id`
   - `linkedin_session_cookie` (cookie li_at)
2. Llama a la API de PhantomBuster (`/api/v2/agents/launch`) con:
   - El session cookie de LinkedIn
   - La URL de LinkedIn del champion
   - El mensaje a enviar
3. PhantomBuster envia el mensaje desde la cuenta de LinkedIn del usuario
4. Se registra la interaccion en la tabla `interactions`
5. Se actualiza el status del champion a "contacted"

### 8.6 Envio por Email (Resend)
Ruta: `/api/outreach/send-message` (channel: "email")

1. Lee la `RESEND_API_KEY` de las variables de entorno
2. Usa dominio verificado: `team@aiwknd.com` (dominio aiwknd.com verificado en Resend)
3. Genera un subject line automatico basado en el topic/efemeride y la empresa del champion
4. Llama a la API de Resend (`/emails`) con:
   - from: `team@aiwknd.com` o configurable en settings
   - to: email del champion
   - subject: auto-generado
   - text: el mensaje generado
4. Se registra la interaccion y se actualiza el status

### 8.7 Webhook (Make/Integromat)
Alternativa a PhantomBuster. Se configura en Ajustes con la URL del webhook de Make. Envia un payload JSON con todos los datos del champion, trigger, mensaje e insight.

---

## 9. Sistema de Respuestas Automaticas (Email Reply Handling)

### 9.1 Flujo General
Cuando un champion responde un email, el sistema:
1. **Captura la respuesta** via Make/Integromat (webhook conectado a IMAP)
2. **Procesa con LLM agentico** para analizar el intent y generar respuesta
3. **Guarda la respuesta** en la interaccion correspondiente
4. **Genera draft de respuesta** que aparece en `/interactions` para aprobar

### 9.2 Webhook de Captura de Respuestas
Ruta: `/api/webhooks/email-reply`

Recibe del webhook de Make (modulo IMAP):
- `from`: Email del remitente
- `from_email`, `from.address`, `sender`: Variantes del email
- `subject`: Asunto del email
- `text`, `body`, `content`: Cuerpo del mensaje

El webhook:
1. Normaliza los datos del email
2. Busca el champion por email (case-insensitive)
3. Llama al LLM agentico para analizar y generar respuesta
4. Actualiza la interaccion con `reply_content` y `reply_sentiment`
5. Actualiza el status del champion a "responded"
6. Crea un draft de respuesta en `outreach_queue` (status: "pending_review")

### 9.3 LLM Agentico para Respuestas
Funcion: `analyzeAndGenerateResponse()` en el webhook

El LLM analiza la respuesta y determina:

| Campo | Descripcion |
|-------|-------------|
| `intent` | Que quiere la persona: mas_info, quien_es_seenka, agendar_llamada, no_interesado, no_es_momento, ya_tiene_solucion, pregunta_precio, reenviar_a_otro, out_of_office |
| `sentiment` | positive, negative, neutral |
| `action` | Que hacer: send_more_info, explain_seenka, schedule_call, send_pricing, close_lost, reactivate_later, forward_contact, wait |
| `reasoning` | Explicacion breve del analisis |
| `generatedResponse` | Respuesta sugerida (null si action es close_lost o wait) |
| `suggestedSubject` | Asunto sugerido para la respuesta |

### 9.4 Reglas del LLM para Generar Respuestas
- Si pregunta quien es Seenka: Explica brevemente la plataforma
- Si muestra interes: Propone llamada de 15 min
- Si dice "no es momento": Responde amable, ofrece retomar en el futuro
- Si no esta interesado: Cierra amablemente (no genera respuesta)
- Si pide mas info: Comparte valor sobre competidores
- Si reenvia a otro: Agradece y pide el contacto correcto

### 9.5 Visualizacion en Interacciones
En `/interactions`, cada interaccion que tiene respuesta muestra:
1. **Respuesta del champion**: El texto que envio
2. **Badge de sentimiento**: Positivo/Negativo/Neutral
3. **Boton "Sugerir respuesta"**: Genera respuesta con IA on-demand
4. **Box de sugerencia**: Muestra intent, action, reasoning y respuesta generada
5. **Botones**: Editar, Aprobar y enviar, Descartar

Endpoint para generar sugerencia: `/api/ai/generate-reply-suggestion`

### 9.6 Flujo de Aprobacion
1. Champion responde email
2. Make captura y envia al webhook
3. Webhook procesa y guarda respuesta + genera draft
4. Usuario va a `/interactions`
5. Ve la respuesta y puede:
   - Click "Sugerir respuesta" para generar con IA
   - Editar la sugerencia
   - Aprobar y enviar (va a outreach_queue como "approved")
   - Descartar

### 9.7 Tabla champion_sequences
Cuando llega una respuesta, se crea/actualiza un registro en `champion_sequences`:

| Campo | Descripcion |
|-------|-------------|
| champion_id | FK al champion |
| sequence_id | FK a la secuencia activa |
| metadata | JSONB con: path, intent, action, sentiment, reasoning |
| status | active, stopped, completed |
| current_step | Paso actual en la secuencia |
| next_step_at | Cuando ejecutar el proximo paso |

### 9.8 Configuracion de Make/Integromat
1. Crear escenario en Make con modulo **IMAP** (watch emails)
2. Conectar casilla de email (ej: team@aiwknd.com)
3. Agregar modulo **HTTP** (POST request)
4. URL: `https://tu-dominio.vercel.app/api/webhooks/email-reply`
5. Body: JSON con from, subject, text del email

---

## 10. Modulo: Importacion Masiva

Pagina: `/importar`

### 9.1 Flujo
1. Se sube un CSV o Excel con columna de URLs de LinkedIn
2. Se parsea y muestra preview con la cantidad de perfiles encontrados
3. Se inicia el analisis (boton "Analizar X perfiles"):
   - Para cada perfil: enriquecimiento con Proxycurl + evaluacion con IA
4. Se muestra tabla de resultados con score (Alto/Medio/Bajo)
5. Se pueden agregar como champions los de score alto (individual o masivamente)

### 9.2 Evaluacion de Prospectos
Ruta: `/api/ai/analyze-prospect`

Usa los criterios configurados en Ajustes (`ai_champion_criteria`) para clasificar:
- **Alto potencial**: Decision makers en marketing/publicidad/medios, empresas medianas/grandes
- **Medio potencial**: Roles relacionados pero no decisores
- **Bajo potencial**: Sin relacion con la industria target

---

## 10. Modulo: Interacciones

Pagina: `/interactions`

Historial completo de todos los mensajes enviados, con:
- Champion destinatario
- Canal (LinkedIn/Email)
- Mensaje enviado
- Insight usado
- Fecha de envio
- Respuesta (si la hubo)
- Outcome: sent, responded, ignored

---

## 11. Ajustes

Pagina: `/ajustes`

### 11.1 Webhook de Make
- URL del webhook de Make/Integromat
- Boton de test para verificar conectividad

### 11.2 PhantomBuster
- API Key
- Phantom ID (del phantom "LinkedIn Message Sender")
- LinkedIn Session Cookie (li_at)

### 11.3 Configuracion de IA
- **Instrucciones para mensajes**: Prompt personalizable que define el tono y estilo de los mensajes generados. Default: espanol argentino, tuteo, informal, directo, maximo 280 caracteres para LinkedIn.
- **Criterios para calificar champions**: Definicion de que hace un buen champion (usado en importacion masiva).

### 11.4 Campos de LinkedIn
Sub-pagina `/ajustes/campos-linkedin`:
- Configuracion de que campos de LinkedIn se muestran en el detalle del champion
- Mapeo de campos de Proxycurl a la base de datos

---

## 12. Productos Seenka

La app referencia 4 productos de Seenka para recomendar segun el perfil del champion:

| Producto | Descripcion | Caso de uso |
|----------|-------------|-------------|
| Content Insight | Monitoreo de noticias y redes sociales | Percepcion de marca, monitoreo de competencia |
| Ad Insight | Monitoreo de publicidad cross-media | Inversion publicitaria, benchmark, mix de medios |
| Creative Sense | Biblioteca de publicidades con IA | Inspiracion creativa, tendencias publicitarias |
| AdSales Radar | Inteligencia comercial de inversion | Equipos comerciales de medios, prospeccion |

---

## 13. Base de Datos

### 13.1 Tablas principales
```
champions          - Contactos clave
champion_clients   - Clientes de cada champion (con sector/industria)
companies          - Empresas analizadas por IA
triggers           - Senales de oportunidad
interactions       - Historial de mensajes enviados
efemerides         - Fechas comerciales/marketing
efemeride_industry_data - Datos de Seenka por industria por efemeride
sequences          - Secuencias de follow-up
sequence_steps     - Pasos de cada secuencia
settings           - Configuracion por usuario (webhook, API keys, prompts)
nomenclador_categories - Nomenclador de industrias/sectores
```

### 13.2 Seguridad
- RLS habilitado en todas las tablas
- Cada tabla filtra por `user_id` (directo o via champion ownership)
- Las API keys se guardan en la tabla `settings` por usuario
- Variables de entorno sensibles (RESEND_API_KEY) en el servidor

---

## 14. APIs

### 14.1 Rutas de IA
| Ruta | Proposito |
|------|-----------|
| `/api/ai/analyze-company` | Analiza empresa del champion |
| `/api/ai/analyze-profile` | Genera resumen del perfil |
| `/api/ai/analyze-prospect` | Evalua prospecto en importacion masiva |
| `/api/ai/efemeride-message` | Genera mensaje de outreach para efemeride |
| `/api/ai/evaluate-trigger` | Evalua si un trigger vale la pena contactar |
| `/api/ai/extract-url` | Extrae URL de LinkedIn de texto |
| `/api/ai/generate-insight` | Genera insight personalizado por champion+trigger |
| `/api/ai/generate-profile` | Genera perfil completo del champion |
| `/api/ai/sequence-message` | Genera mensaje para un paso de secuencia |
| `/api/ai/generate-reply-suggestion` | Genera sugerencia de respuesta con LLM agentico |

### 14.2 Rutas de Outreach
| Ruta | Proposito |
|------|-----------|
| `/api/outreach/send-message` | Envia mensaje por LinkedIn (PhantomBuster) o Email (Resend) |
| `/api/outreach/send` | Envio alternativo via webhook |
| `/api/outreach/test-webhook` | Test de conectividad del webhook de Make |

### 14.3 Rutas de Webhooks
| Ruta | Proposito |
|------|-----------|
| `/api/webhooks/email-reply` | Recibe respuestas de email desde Make/IMAP |
| `/api/test/process-existing-replies` | Procesa respuestas existentes para generar drafts |

### 14.4 Rutas de Seenka MCP
| Ruta | Proposito |
|------|-----------|
| `/api/seenka/keyword` | Busca datos de Seenka por keyword (efemeride) |

### 14.5 Rutas de Enriquecimiento
| Ruta | Proposito |
|------|-----------|
| `/api/champions/enrich` | Enriquecimiento de perfil con Proxycurl |
| `/api/linkedin/enrich-profile` | Enriquecimiento directo de LinkedIn |
| `/api/pdl/company` | Datos de empresa via People Data Labs |
| `/api/pdl/person` | Datos de persona via People Data Labs |
| `/api/nomenclador/match` | Match de empresa con nomenclador de industrias |

---

## 15. Variables de Entorno

| Variable | Servicio | Proposito |
|----------|----------|-----------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase | URL del proyecto |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase | Key anonima |
| SUPABASE_SERVICE_ROLE_KEY | Supabase | Key de servicio (server-side) |
| RESEND_API_KEY | Resend | Envio de emails |
| PROXYCURL_API_KEY | Proxycurl | Enriquecimiento de LinkedIn |

Las credenciales de PhantomBuster y Make se guardan por usuario en la tabla `settings` (no como variables de entorno).

---

## 16. Flujos de Uso Principales

### Flujo 1: Agregar Champion y Contactar
1. Agregar champion manualmente (URL de LinkedIn) o importar desde CSV
2. Enriquecer perfil con datos de LinkedIn (Proxycurl)
3. Analizar empresa con IA
4. Detectar/cargar triggers (posts, datos de Seenka)
5. Generar insight y mensaje personalizado
6. Enviar por LinkedIn o Email
7. Trackear respuesta y avanzar en pipeline

### Flujo 2: Outreach por Efemeride
1. Crear efemeride (ej: Cyber Monday) con paises e industrias
2. Configurar criterios de match (industria, tipo champion, keywords, historial)
3. Click en "Generar Outreach"
4. Revisar champions matcheados
5. Seleccionar champions, elegir canal
6. Generar mensajes (individual o masivo)
7. Revisar y editar mensajes
8. Enviar (individual o masivo)
9. Se registra interaccion y se actualiza status

### Flujo 3: Importacion Masiva
1. Subir CSV con URLs de LinkedIn
2. Analizar perfiles (enriquecimiento + evaluacion IA)
3. Revisar resultados y scores
4. Agregar como champions los de alto potencial
5. Continuar con Flujo 1 o Flujo 2
