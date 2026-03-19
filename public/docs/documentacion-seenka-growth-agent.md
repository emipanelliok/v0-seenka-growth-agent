# Seenka Growth Agent - Documentacion Completa (Actualizado 2026-03-19)

## 1. Vision General

Seenka Growth Agent es una aplicación web interna de ventas y outreach para el equipo comercial de Seenka (empresa de media intelligence). Permite gestionar contactos clave ("champions"), detectar oportunidades de contacto ("triggers"), generar mensajes personalizados con IA, y automatizar el envío por LinkedIn y Email.

**Propósito de la Aplicación:**
- Automatizar la prospección de decisores en publicidad/marketing/medios
- Personalizar mensajes de outreach usando IA + datos de inversión publicitaria
- Capturar y responder automáticamente a replies de potenciales clientes
- Gestionar pipelines de ventas con estados y secuencias de follow-up
- Integrar datos de Seenka Media Intelligence en el contexto del outreach

**Stack tecnológico:**
- Frontend: Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + RLS)
- IA: Vercel AI SDK 6 con AI Gateway (OpenAI, Anthropic)
- Integraciones: PhantomBuster (LinkedIn), Resend (Email), Proxycurl (enriquecimiento LinkedIn), Make/Integromat (webhooks, IMAP)

---

## 2. Autenticación

- Sistema de auth nativo de Supabase (email + password)
- Páginas: `/auth/login`, `/auth/sign-up`, `/auth/sign-up-success`, `/auth/error`
- Toda la app está protegida con middleware que redirige a login si no hay sesión
- Row Level Security (RLS) en todas las tablas: cada usuario solo ve sus propios datos

---

## 3. Estructura de Navegación

Sidebar con las siguientes secciones:

| Sección | Ruta | Descripción |
|---------|------|-------------|
| Dashboard | `/dashboard` | Métricas generales: champions activos, triggers detectados, mensajes enviados, oportunidades |
| Champions | `/champions` | Lista de contactos clave con filtros por status, nivel, tipo |
| Triggers | `/triggers` | Señales de oportunidad detectadas en champions |
| Secuencias | `/secuencias` | Builder visual de secuencias de follow-up |
| Efemerides | `/efemerides` | Fechas comerciales/marketing por país e industria |
| Interacciones | `/interactions` | Historial de todos los mensajes enviados (agrupados por conversación) |
| Importar | `/importar` | Importación masiva de prospectos desde CSV/Excel |
| Ajustes | `/ajustes` | Configuración de integraciones y prompts de IA |
| Test Conversation | `/test-conversation` | Ambiente de testing para conversar con Gastón (Agente de IA) |

---

## 4. Módulo: Champions

### 4.1 Qué es un Champion
Un champion es un contacto clave en la industria de publicidad/marketing/medios que podría ser cliente de Seenka. Se almacena en la tabla `champions`.

### 4.2 Campos principales
| Campo | Tipo | Descripción |
|-------|------|-------------|
| name | TEXT | Nombre completo |
| linkedin_url | TEXT | URL del perfil de LinkedIn |
| email | TEXT | Email del contacto (para outreach por email) |
| role | TEXT | Cargo actual |
| company | TEXT | Empresa donde trabaja |
| industry | TEXT | Industria de la empresa |
| country | TEXT | País (ej: "Argentina", "México") |
| headline | TEXT | Headline de LinkedIn |
| champion_type | ENUM | creative, media, marketing, sales, strategy, other |
| champion_level | ENUM | high, medium, low |
| status | ENUM | listening, trigger_detected, contacted, responded, opportunity, paused |
| linkedin_data | JSONB | Datos extra de LinkedIn (experiencias, educación, etc.) |
| company_id | UUID | FK a tabla companies (análisis de empresa) |
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
2. Trae: foto, headline, summary, experiencias, educación, idiomas, followers, etc.
3. Los datos se guardan en `linkedin_data` (JSONB) y en campos dedicados
4. La IA genera un resumen del perfil (`ai_profile_summary`)

### 4.6 Análisis de Empresa
- Cuando un champion tiene empresa, se puede analizar desde su perfil
- `/api/ai/analyze-company` analiza la empresa y genera: industry, sector, size, pain_points, seenka_products, sales_angle
- Se guarda en la tabla `companies` y se vincula al champion via `company_id`

### 4.7 Prompt de Seenka AI por Tipo
Cada tipo de champion tiene un prompt especializado (definido en `CHAMPION_TYPE_SEENKA_PROMPTS`) que genera consultas relevantes según su perfil:
- Creativos: campañas destacadas, tendencias creativas, formatos
- Medios: inversión publicitaria, SOV, mix de medios
- Marketing: presencia de marca, estrategias de comunicación
- Sales: datos comerciales, mayores anunciantes
- Strategy: insights estratégicos, tendencias de categoría

### 4.8 Clientes del Champion
Tabla `champion_clients` almacena los clientes que maneja un champion:
| Campo | Descripción |
|-------|-------------|
| client_name | Nombre del cliente (ej: "Shell") |
| matched_sector | Sector matcheado del nomenclador |
| matched_industria | Industria matcheada del nomenclador |

Se usan para matching con efemerides y para generar insights personalizados.

---

## 5. Módulo: Triggers

### 5.1 Qué es un Trigger
Una señal de oportunidad detectada en un champion que indica un buen momento para contactarlo.

### 5.2 Tipos de Trigger
| Tipo | Descripción |
|------|-------------|
| post | Post propio del champion en LinkedIn |
| shared | Post compartido por el champion (con su comentario) |
| data_seenka | Dato de Seenka relevante para el champion |
| market_context | Contexto de mercado (cambio de puesto, evento, etc.) |

### 5.3 Evaluación con IA
`/api/ai/evaluate-trigger` analiza el contenido del trigger y determina:
- `is_worth_contacting`: boolean - si vale la pena contactar
- `severity`: high/medium/low
- `topic`: tema principal
- `reasoning`: por qué sí o por qué no
- `recommended_products`: qué productos de Seenka recomendar
- `mentioned_people`: personas mencionadas en el post

### 5.4 Posts Compartidos
Para posts compartidos se capturan campos adicionales:
- `champion_comment`: Comentario del champion al compartir
- `original_author_name/linkedin/role`: Autor original del post
- `original_content`: Contenido del post original
- `mentions_seenka`: Si se menciona a Seenka

---

## 6. Módulo: Secuencias

### 6.1 Qué es una Secuencia
Un flujo automatizado de follow-up para cuando el champion **NO responde**. Se configura visualmente en `/secuencias`.

**Importante**: Con el nuevo sistema de respuestas automáticas (ver sección 9), cuando un champion **SÍ responde**, el LLM agentivo analiza y genera respuestas personalizadas. Las secuencias ahora solo aplican para el path `no_response`.

### 6.2 Estructura
Una secuencia tiene múltiples pasos (`sequence_steps`), cada uno con:
| Campo | Descripción |
|-------|-------------|
| step_number | Orden del paso |
| path | Camino: no_response (principal), positive, lukewarm, negative (legacy) |
| wait_days | Días de espera antes de enviar |
| message_template | Template/instrucciones para el mensaje |
| message_tone | Tono del mensaje |

### 6.3 Flujo de No Respuesta (principal)
Si el champion no responde al Email 1:
- **Email 2**: En 3 días - follow-up breve con datos de Seenka MCP
- **Email 3**: En 7 días - segundo follow-up con datos de competencia
- **Email 4**: En 14 días - último intento, compartir valor sin pedir nada

### 6.4 Caminos Legacy (manejados por LLM agentivo)
Estos paths ya no usan templates fijos, el LLM genera respuestas personalizadas:
- **positive**: LLM propone llamada + cupón/descuento
- **lukewarm**: LLM envía más datos de Seenka MCP (nurturing)
- **negative**: LLM cierra amablemente + reactivar en 90 días

### 6.5 Tracker
El componente `ChampionSequenceStatus` muestra en el detalle del champion:
- Path actual (positive/negative/lukewarm)
- Intent detectado por el LLM
- Action sugerida
- Status de la secuencia

### 6.6 Cron Job (pendiente)
Para automatizar el envío de follow-ups cuando no responden:
- Endpoint: `/api/cron/process-sequences`
- Busca champions con `next_step_at <= ahora`
- Genera mensaje con IA + datos de Seenka MCP
- Envía via Resend
- Actualiza al siguiente paso

---

## 7. Módulo: Efemerides

### 7.1 Qué es una Efeméride
Una fecha comercial o de marketing relevante (Cyber Monday, Hot Sale, Día de la Madre, etc.) que se puede usar como excusa para contactar champions.

### 7.2 Campos
| Campo | Tipo | Descripción |
|-------|------|-------------|
| name | TEXT | Nombre (ej: "Cyber Monday") |
| description | TEXT | Descripción del evento |
| countries | TEXT[] | Países aplicables (códigos ISO: AR, MX, CO, etc.) |
| industries | TEXT[] | Industrias relevantes (ej: "Retail", "Banca / Finanzas") |
| event_date | DATE | Fecha del evento |
| reminder_days_before | INT | Días de anticipación para recordatorio |
| manual_data | TEXT | Data manual ingresada (documento con información real del evento) |
| seenka_data_hint | TEXT | Hint de dato Seenka para usar en mensajes |
| is_active | BOOLEAN | Si está activa |

### 7.3 Plantillas Predefinidas
El diálogo de crear efeméride incluye plantillas pre-configuradas:
- Cyber Monday, Hot Sale, Día de la Madre, Black Friday, Navidad, Vuelta a Clases, San Valentín, Día del Niño, Mundial de Fútbol
- Cada plantilla auto-completa: países, industrias sugeridas, fecha, descripción, hint de dato Seenka

### 7.4 Criterios de Match Champion-Efeméride
La página de efemerides tiene un panel "Criterios de match" con 4 opciones toggleables:

| Criterio | Descripción | Lógica |
|----------|-------------|--------|
| **Industria** | Match por industria/sector del cliente del champion | Compara `champion_clients.matched_industria` con `efemeride.industries`. También busca en el campo `company` del champion usando keywords de industria |
| **Tipo champion** | Agencias matchean siempre por país | Si `champion_type` es creative, media o strategy, matchea con cualquier efeméride de su país (las agencias manejan múltiples clientes) |
| **Keywords** | Busca en headline/cargo/empresa del champion | Usa un mapa de keywords por industria (ej: "banca" -> banco, bank, finanz, financ, seguro, fintech) |
| **Historial** | Champions con interacciones previas | Incluye champions que ya tuvieron interacciones registradas |

**Regla obligatoria**: El país siempre debe coincidir. No se envía Hot Sale Argentina a alguien de México.

### 7.5 Mapa de Keywords por Industria
Para el matching por keywords y por nombre de empresa, se usa un mapa que normaliza variantes:

```
banca / finanzas -> banco, bank, finanz, financ, seguro, insurance, fintech, crédito, tarjeta
retail -> retail, ecommerce, e-commerce, tienda, store, shop, comercio
tecnología -> tech, tecnolog, software, hardware, digital
moda / indumentaria -> moda, fashion, indumentaria, ropa, apparel, textil
consumo masivo -> consumo masivo, fmcg, cpg, consumer goods, aliment
turismo / hotelería -> turismo, hotel, travel, viaje, tourism, hospitality
automotriz -> auto, car, motor, vehicul, automotive
oil & gas -> oil, gas, petrol, energy, energía, combustible, shell, ypf
(y más...)
```

Esto permite que "Banco Macro" (empresa del champion) matchee con la industria "Banca / Finanzas" de la efeméride.

---

## 8. Módulo: Outreach (Generación y Envío de Mensajes)

### 8.1 Flujo General
1. Desde una efeméride o desde el detalle de un champion, se inicia el outreach
2. Se seleccionan los champions a contactar
3. Se elige el canal (LinkedIn, Email, WhatsApp)
4. Se genera el mensaje con IA (personalizado por champion, trigger/efeméride, y datos de Seenka)
5. Se revisa el mensaje (se puede editar/regenerar)
6. Se envía

### 8.2 Outreach desde Efemerides
Página: `/efemerides/[id]/outreach`

1. **Matching**: Cruza champions con la efeméride usando los criterios configurados (ver 7.4)
2. **Selección**: Checkbox por champion, selección masiva
3. **Canal por champion**: Se elige LinkedIn, Email o WhatsApp para cada uno
4. **Etapa auto-detectada**: cold (0 interacciones), warm (1-2), reengagement (3+)
5. **Dato Seenka**: Se busca usando el contenido del campo `manual_data` (datos reales ingresados)
6. **Generación**: Individual o masiva con botón "Generar mensajes (X)"
7. **Envío**: Individual o masivo con botón "Enviar mensajes (X)"

### 8.3 Datos de Efeméride (Manual vs Hint)
- **manual_data**: Documento con data real del evento (ej: "Hot Sale 2025: Frávega 35257 segundos de aire, OnCity 15600 segundos")
- **seenka_data_hint**: Sugerencia/hint adicional si no hay manual_data
- El sistema prioriza `manual_data` para generar mensajes más precisos y basados en hechos reales

### 8.4 Generación de Mensajes con IA
Ruta: `/api/ai/efemeride-message`

El prompt recibe:
- Nombre y datos del champion (cargo, empresa, tipo)
- Nombre y datos de la efeméride
- Data real de la efeméride (manual_data)
- Instrucciones estrictas para NO inventar números ni interpretaciones
- Instrucciones para usar exactamente los datos del documento

**Reglas del Prompt** (actualizado 19/03/2026):
- Copiar números exactos del documento (no hacer sumas ni promedios)
- NO agregar "últimos 60 días" ni interpretaciones temporales
- NO inventar contexto que no esté en el documento
- Si el documento dice "35257 segundos", decir "35257" - no "105K"
- Usar UN dato específico del documento - marca, segundos, o dato concreto
- Máximo 60 palabras
- Tuteo natural, sin emojis
- Firma: — Gastón

Genera mensajes en español argentino, cortos, directos, sin frases genéricas. **Los datos se usan tal cual del documento, sin interpretaciones**.

### 8.5 Envío por LinkedIn (PhantomBuster)
Ruta: `/api/outreach/send-message` (channel: "linkedin")

1. Lee las credenciales de PhantomBuster desde la tabla `settings`:
   - `phantombuster_api_key`
   - `phantombuster_phantom_id`
   - `linkedin_session_cookie` (cookie li_at)
2. Llama a la API de PhantomBuster (`/api/v2/agents/launch`) con:
   - El session cookie de LinkedIn
   - La URL de LinkedIn del champion
   - El mensaje a enviar
3. PhantomBuster envía el mensaje desde la cuenta de LinkedIn del usuario
4. Se registra la interacción en la tabla `interactions`
5. Se actualiza el status del champion a "contacted"

### 8.6 Envío por Email (Resend)
Ruta: `/api/outreach/send-approved/route.ts` (channel: "email")

**Flujo de Aprobación:**
1. Se genera el mensaje y aparece como sugerencia
2. Se aprueba la sugerencia → se guarda en `outreach_queue` con status "approved"
3. Se registra en `interactions` como conversación
4. Se click "Enviar aprobados" en la bandeja → envía via Resend
5. Se actualiza el status a "sent" con timestamp

**Detalles técnicos:**
1. Lee la `RESEND_API_KEY` de las variables de entorno
2. Usa dominio verificado: `team@aiwknd.com` (dominio aiwknd.com verificado en Resend)
3. Genera un subject line automático basado en el topic/efeméride y la empresa del champion
4. Formatea el HTML correctamente (párrafos, saltos de línea, estilos inline)
5. Llama a la API de Resend (`/emails`) con:
   - from: `team@aiwknd.com` o configurable en settings
   - to: email del champion
   - subject: auto-generado
   - html: el mensaje formateado
6. Se registra la interacción y se actualiza el status

**Fix del 19/03/2026**: Se corrigió el formateo HTML para evitar que falle Resend por HTML malformado.

### 8.7 Webhook (Make/Integromat)
Alternativa a PhantomBuster. Se configura en Ajustes con la URL del webhook de Make. Envía un payload JSON con todos los datos del champion, trigger, mensaje e insight.

---

## 9. Sistema de Respuestas Automáticas (Email Reply Handling)

### 9.1 Flujo General
Cuando un champion responde un email, el sistema:
1. **Captura la respuesta** via Make/Integromat (webhook conectado a IMAP)
2. **Procesa con LLM agentivo** para analizar el intent y generar respuesta
3. **Guarda la respuesta** en la interacción correspondiente
4. **Genera draft de respuesta** que aparece en `/interactions` para aprobar

### 9.2 Webhook de Captura de Respuestas
Ruta: `/api/webhooks/email-reply`

Recibe del webhook de Make (módulo IMAP):
- `from`: Email del remitente
- `from_email`, `from.address`, `sender`: Variantes del email
- `subject`: Asunto del email
- `text`, `body`, `content`: Cuerpo del mensaje

El webhook:
1. Normaliza los datos del email
2. Busca el champion por email (case-insensitive)
3. Llama al LLM agentivo para analizar y generar respuesta
4. Actualiza la interacción con `reply_content` y `reply_sentiment`
5. Actualiza el status del champion a "responded"
6. Crea un draft de respuesta en `outreach_queue` (status: "pending_review")

### 9.3 LLM Agentivo para Respuestas
Función: `analyzeAndGenerateResponse()` en el webhook

El LLM analiza la respuesta y determina:

| Campo | Descripción |
|-------|-------------|
| `intent` | Qué quiere la persona: mas_info, quien_es_seenka, agendar_llamada, no_interesado, no_es_momento, ya_tiene_solucion, pregunta_precio, reenviar_a_otro, out_of_office |
| `sentiment` | positive, negative, neutral |
| `action` | Qué hacer: send_more_info, explain_seenka, schedule_call, send_pricing, close_lost, reactivate_later, forward_contact, wait |
| `reasoning` | Explicación breve del análisis |
| `generatedResponse` | Respuesta sugerida (null si action es close_lost o wait) |
| `suggestedSubject` | Asunto sugerido para la respuesta |

### 9.4 Reglas del LLM para Generar Respuestas
- Si pregunta quién es Seenka: Explica brevemente la plataforma
- Si muestra interés: Propone llamada de 15 min
- Si dice "no es momento": Responde amable, ofrece retomar en el futuro
- Si no está interesado: Cierra amablemente (no genera respuesta)
- Si pide más info: Comparte valor sobre competidores
- Si reenvía a otro: Agradece y pide el contacto correcto

### 9.5 Visualización en Interacciones
En `/interactions`, cada interacción que tiene respuesta muestra:
1. **Conversación agrupada por champion**: Todos los mensajes con un mismo champion aparecen como un thread (nueva feature 19/03/2026)
2. **Timeline vertical**: Cada mensaje enviado y sus respuestas en orden cronológico
3. **Badge de sentimiento**: Positivo/Negativo/Neutral
4. **Box de sugerencia**: Muestra intent, action, reasoning y respuesta generada
5. **Botones**: Editar, Aprobar y enviar, Descartar

**Fix del 19/03/2026**: Las interacciones ahora se agrupan por champion en formato conversacional (thread) en lugar de mostrar cada mensaje por separado.

Endpoint para generar sugerencia: `/api/ai/generate-reply-suggestion`

### 9.6 Flujo de Aprobación
1. Champion responde email
2. Make captura y envía al webhook
3. Webhook procesa y guarda respuesta + genera draft
4. Usuario va a `/interactions`
5. Ve la conversación completa y puede:
   - Click "Sugerir respuesta" para generar con IA
   - Editar la sugerencia
   - Aprobar y enviar (va a outreach_queue como "approved")
   - Descartar

### 9.7 Tabla champion_sequences
Cuando llega una respuesta, se crea/actualiza un registro en `champion_sequences`:

| Campo | Descripción |
|-------|-------------|
| champion_id | FK al champion |
| sequence_id | FK a la secuencia activa |
| metadata | JSONB con: path, intent, action, sentiment, reasoning |
| status | active, stopped, completed |
| current_step | Paso actual en la secuencia |
| next_step_at | Cuándo ejecutar el próximo paso |

### 9.8 Configuración de Make/Integromat
1. Crear escenario en Make con módulo **IMAP** (watch emails)
2. Conectar casilla de email (ej: team@aiwknd.com)
3. Agregar módulo **HTTP** (POST request)
4. URL: `https://tu-dominio.vercel.app/api/webhooks/email-reply`
5. Body: JSON con from, subject, text del email

---

## 10. Módulo: Importación Masiva

Página: `/importar`

### 10.1 Flujo
1. Se sube un CSV o Excel con columna de URLs de LinkedIn
2. Se parsea y muestra preview con la cantidad de perfiles encontrados
3. Se inicia el análisis (botón "Analizar X perfiles"):
   - Para cada perfil: enriquecimiento con Proxycurl + evaluación con IA
4. Se muestra tabla de resultados con score (Alto/Medio/Bajo)
5. Se pueden agregar como champions los de score alto (individual o masivamente)

### 10.2 Evaluación de Prospectos
Ruta: `/api/ai/analyze-prospect`

Usa los criterios configurados en Ajustes (`ai_champion_criteria`) para clasificar:
- **Alto potencial**: Decision makers en marketing/publicidad/medios, empresas medianas/grandes
- **Medio potencial**: Roles relacionados pero no decisores
- **Bajo potencial**: Sin relación con la industria target

---

## 11. Módulo: Interacciones

Página: `/interactions`

Historial completo de todos los mensajes enviados, **agrupados por champion en formato conversacional** (actualizado 19/03/2026):

**Features:**
- Ver todas las conversaciones con cada champion
- Timeline vertical de mensajes enviados y respuestas
- Count de mensajes en cada conversación
- Status badge (Enviado/Respondido/Sin respuesta)
- Sugerencias de IA automáticas para responder
- Integración con el agente Gastón para generar respuestas personalizadas

---

## 12. Módulo: Test Conversation

Página: `/test-conversation`

Ambiente de testing para conversar directamente con **Gastón** (el agente de IA de Seenka):
- Seleccionar un champion de prueba
- Seleccionar una efeméride
- Generar primer mensaje con IA
- Conversar en tiempo real
- Ver las respuestas generadas

**Usado para:** Validar prompts, probar cambios en la generación de mensajes, entrenar al equipo

---

## 13. Ajustes

Página: `/ajustes`

### 13.1 Webhook de Make
- URL del webhook de Make/Integromat
- Botón de test para verificar conectividad

### 13.2 PhantomBuster (LinkedIn)
- API Key de PhantomBuster
- Phantom ID del agente
- LinkedIn Session Cookie (li_at)

### 13.3 Resend (Email)
- API Key de Resend (RESEND_API_KEY)
- Dominio verificado
- Email remitente
- Nombre de remitente

### 13.4 Proxycurl (Enriquecimiento LinkedIn)
- API Key de Proxycurl

### 13.5 Prompts de IA
- Prompt de análisis de company
- Prompt de sugerencias por tipo de champion
- Criterios de evaluación de prospectos

### 13.6 Configuración del Agente Gastón
- Prompt principal del agente conversacional
- Temperatura (creatividad vs precisión)
- Modelo IA a usar

---

## 14. Changes & Fixes (19/03/2026)

### 14.1 Problemas Encontrados y Solucionados

**Problema 1: Datos Hardcodeados en Outreach**
- ❌ La tabla `efemeride_industry_data` tenía data antigua de "Automóviles" hardcodeada
- ❌ Se usaba esta data vieja en lugar de `manual_data` de la efeméride
- ✅ **Solución**: 
  - Eliminé TODA la data de `efemeride_industry_data`
  - Cambié la prioridad en el componente para usar `manual_data` primero
  - Ahora los mensajes se generan con datos reales del documento

**Problema 2: Columnas que No Existen**
- ❌ El código insertaba `metadata` y `priority` en `outreach_queue` pero esas columnas no existían
- ❌ Fallaba al aprobar sugerencias por error RLS (PGRST204, error 42501)
- ✅ **Solución**: Actualicé el endpoint a usar solo columnas válidas + agregar `user_id` para RLS

**Problema 3: HTML Malformado en Emails**
- ❌ El regex `/^/` y `/$/ ` no reemplazaba correctamente el inicio/fin del string
- ❌ Generaba HTML inválido que Resend rechazaba
- ✅ **Solución**: Reescribí la generación de HTML para dividir por párrafos y formatear correctamente

**Problema 4: Mensajes Desaparecen sin Enviar**
- ❌ Los mensajes generados desaparecían cuando se aprobaban sin feedback visual
- ❌ No había confirmación de que se guardaron
- ✅ **Solución**: 
  - Agregué mensajes de confirmación en verde/rojo
  - Se muestra 2 segundos antes de desaparecer
  - Se registra automáticamente en interacciones

**Problema 5: Interacciones Desorganizadas**
- ❌ Cada mensaje aparecía como un item separado en `/interactions`
- ❌ No había forma de ver una conversación completa con un champion
- ✅ **Solución**: Rediseñé el componente para agrupar por champion en formato de thread/timeline

### 14.2 Cambios en Prompts de IA (19/03/2026)

**Prompt `efemeride-message` (Generación de Mensajes)**
- Ahora es MUCHO más restrictivo
- Prohibe inventar números o interpretar datos
- Obliga a usar exactamente lo del documento
- Si dice "35257 segundos", usar "35257" - no "105K"
- Máximo 60 palabras, tuteo natural, firma: — Gastón

**Prompt `conversation-agent` (Test Conversation)**
- Gastón es especialista en data e inversión publicitaria
- No menciona Seenka en el primer mensaje
- Ofrece código de descuento ($500 USD) cuando hay interés
- Responde siempre en JSON con: message, temperatura, acción, razonamiento

---

## 15. Base de Datos - Schema Principal

### Tablas Clave

**champions**
```sql
- id (UUID, PK)
- user_id (UUID, FK -> auth.users)
- name (TEXT)
- email (TEXT)
- linkedin_url (TEXT)
- role (TEXT)
- company (TEXT)
- industry (TEXT)
- country (TEXT)
- champion_type (ENUM: creative, media, marketing, sales, strategy, other)
- champion_level (ENUM: high, medium, low)
- status (ENUM: listening, trigger_detected, contacted, responded, opportunity, paused)
- linkedin_data (JSONB)
- seenka_ai_insight (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- RLS: user_id = auth.uid()
```

**efemerides**
```sql
- id (UUID, PK)
- user_id (UUID, FK -> auth.users)
- name (TEXT)
- description (TEXT)
- countries (TEXT[])
- industries (TEXT[])
- event_date (DATE)
- manual_data (TEXT) -- Data real ingresada por el usuario
- seenka_data_hint (TEXT)
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- RLS: user_id = auth.uid()
```

**interactions**
```sql
- id (UUID, PK)
- user_id (UUID, FK -> auth.users)
- champion_id (UUID, FK -> champions)
- channel (ENUM: email, linkedin, whatsapp)
- message (TEXT)
- response (TEXT) -- Respuesta del champion
- outcome (ENUM: sent, responded, ignored)
- insight (TEXT)
- reply_content (TEXT) -- Reply capturado del webhook
- reply_sentiment (ENUM: positive, negative, neutral)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- RLS: user_id = auth.uid()
```

**outreach_queue**
```sql
- id (UUID, PK)
- user_id (UUID, FK -> auth.users)
- champion_id (UUID, FK -> champions)
- channel (ENUM: email, linkedin, whatsapp)
- message (TEXT)
- subject_line (TEXT)
- status (ENUM: approved, sent, failed, pending_review)
- sent_at (TIMESTAMP)
- error_message (TEXT)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- RLS: user_id = auth.uid()
```

**prompts**
```sql
- id (UUID, PK)
- key (TEXT, UNIQUE)
- name (TEXT)
- category (TEXT)
- prompt_text (TEXT) -- El prompt actual
- default_prompt_text (TEXT) -- Prompt por defecto
- is_active (BOOLEAN)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

---

## 16. Environment Variables Requeridas

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# IA
VERCEL_AI_GATEWAY_URL=
AI_GATEWAY_API_KEY=

# Email (Resend)
RESEND_API_KEY=

# LinkedIn (PhantomBuster)
PHANTOMBUSTER_API_KEY=
PHANTOMBUSTER_PHANTOM_ID=

# Enriquecimiento LinkedIn (Proxycurl)
PROXYCURL_API_KEY=
```

---

## 17. Próximas Mejoras Planeadas

- [ ] Implementar cron job para automatizar secuencias de no-respuesta
- [ ] Dashboard en tiempo real con métricas por efeméride
- [ ] A/B testing de mensajes
- [ ] Integración con CRM externo (Pipedrive, HubSpot)
- [ ] Reportes avanzados por champion/industria
- [ ] Webhooks custom por usuario
- [ ] Soporte para WhatsApp
- [ ] Analytics de tasa de respuesta y conversión

---

**Documentación actualizada:** 19 de Marzo de 2026
**Versión:** 2.0.0 - Production Ready
