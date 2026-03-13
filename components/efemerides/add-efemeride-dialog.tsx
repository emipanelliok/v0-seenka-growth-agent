"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Loader2, X, Search } from "lucide-react"
import type { Efemeride } from "@/lib/types"
import { EFEMERIDE_COUNTRIES } from "@/lib/types"
import { extractTextFromDocx } from "@/lib/docx-parser"

interface AddEfemerideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  efemeride?: Efemeride | null
  onSaved: () => void
}

// Sectores reales del nomenclador Seenka
const NOMENCLADOR_SECTORS = [
  "Academias De Idiomas","Aceites & Aditivos","Aderezadores Varios","Aderezos","Adicciones","Aerolíneas","Aeropuertos","Aerosol","Agencia De Modelos","Agencia De Noticias","Agencias De Publicidad","Agencias De Publicidad & Marketing","Agencias De Viajes","Agencias de Viajes Online","Agencias Digitales","Agencias Relaciones Públicas","Agroindustria","Agroquímicos","Aguas","Aguas Saborizadas","Alarmas","Alcohólicas Destiladas","Alfajores","Alimentos Mascotas","Alquiler De Vehículos","Aplicaciones Móviles","Apuestas Online","Arroz","Artículos De Escrit, Dibujo, Librería","Artículos De Limpieza","Artistas, Bandas","Asociaciones Empresarias","Asociaciones Profesionales","Automóviles","Autopartes","Autoservicios","Azúcar","Banca","Bancos","Bares","Básquet","Bebidas Isotónica","Bicicletas","Billeteras Virtuales","Bingos Y Salones De Juego","Boutiques","Bronceadores, Protector Solar","Buscador Online de Seguros","Buscadores de Turismo","Cabañas / Hosterías","Cacao","Café Fraccionado","Café Instantáneo","Café Molido","Caldos","Calzado","Cámaras De Comercio","Camping y Náutica","Caramelos, Chicles","Carga Pesada","Carnes & Pescados","Casas De Computación","Casas De Decoración Y Regalos","Casinos","Catering","Centros De Estética Integral","Centros De Pago","Cereales","Cereales En Barra","Cervezas","Chocolates","Cines","Cirugía Estética","Clínicas Y Sanatorios","Cocina Y Calefacción","Colegios","Comercios Alimentación","Comercios Minoristas","Compra/Venta Autos Online","Concesionarios Autos","Concesionarios Carga Pesada","Concesionarios Motos","Concesionarios Nauticos","Concesiones Viales","Condimentos & Especias","Confiterías, Pubs","Congelados","Consultoras Privadas","Control De Peso","Correos","Cosmética","Cremas","Criptomonedas & Blockchain","Cruceros","Cuidado Capilar","Cultura Y Espectáculos","Delivery","Desarrollistas","Desodorantes","Detergentes","Diarios","Distribución Agua","Distribución Gas","Distribuidores","Distribuidores Agro","Distribuidores Neumáticos","E-Commerce Retailers","Editoriales","Educación Online","Edulcorantes","Electrodomésticos","Electrodomésticos Comercios","Empresa De Logística","Empresas Constructoras","Empresas De Emergencia","Empresas De Limpieza","Empresas Desinfección","Empresas Discográficas","Energía E Hidrocarburos","Energía Solar","Energizantes","Entes De Promoción Del Turismo","Espectáculos, Conciertos, Festivales","Espumantes Y Cocktails","Estudios Jurídicos","Extracción Minera","Farmacéutica","Farmacias","Fast Food","Ferias Y Exposiciones","Ferreterías, Cerrajerías, Vidrierías","Fiambres Y Embutidos","Financieras Y Crédito","Finanzas, Bolsa, Cambio","Frigoríficos Vaca","Frutas","Fundaciones - Ong","Fútbol","Galletas Dulces","Galletas Saladas","Gaming","Gaseosas Light","Gaseosas y Maltas","Gasoil","Gelatinas","Gimnasios","Golf","Granos","Hardware","Harinas","Heladerías","Helados","Herramientas","Higiene Bucal","Higiene Femenina","Hipermercados","Hospitales","Hoteles","Industria Fotográfica","Industria Papelera","Industria Vial","Inmobiliarias","Institucional Automotriz","Institucional Bebidas Sin Alcohol","Institucional Golosinas","Institucional Lácteos","Instituciones Terciarias","Institutos Educativos","Insumos Varios","Internet","Jabón De Tocador","Jabón En Polvo","Jabón Para La Ropa","Jardines Y Guarderías","Jugos","Juguetes, Juegos","Laboratorios","Lácteos Salud","Leche En Polvo","Leche Fluida","Lencerías","Libros","Limpiadores Multiuso","Lotería","Maquillaje","Maquinaria Pesada","Maquinarias","Maquinarias Agrícolas","Marroquinería","Materiales Para La Construcción","Mayonesa","Mayoristas","Medicamentos","Medicamentos Venta Libre","Medios De Comunicación Gráfico","Medios de Pagos","Mensajería","Mermeladas","Metalúrgica","Motos Y Rodados","Mueblería","Muebles De Oficina E Industria","Naftas","Neumáticos","Obras Sociales - Prepagas","Ópticas","Otras Golosinas","Otros Artículos De Higiene","Otros Belleza Y Cosméticos","Otros Comercios Minoristas","Otros Deportes","Otros Dulces Y Postres","Otros Estética & Cuidado","Otros Industria Química","Otros Juegos De Azar","Otros Lácteos","Otros Medicamentos","Otros Medios Gráficos","Otros Servicios De Salud","Pagos Y Cobros","Pan","Pañales","Papel Higiénico","Parques De Diversión","Pastas","Películas","Peluquerías / Salones De Belleza","Perfumerías","Perfumes","Pescado","Pet Shops","Petróleo","Pinturas","Pinturerías","Planes Ahorro Ind. Automotriz","Plantas Generadoras","Portal Digital","Postres","Préstamos","Productora De Eventos","Proveedores De Internet","Proveedores De Software","Quesos Blandos","Quesos Duros","Quesos Procesados","Quesos Semiduros","Quesos Untables","Quitamanchas","Recital - Show Masivo","Red De Beneficios","Relojería Y Joyería","Remises & Taxis","Repelentes","Restaurantes, Parrilla, Pizzería","Retail Construcción","Retail Electro","Retail Indumentaria","Retail Online","Revistas","Ropa De Vestir - Marcas","Ropa Deportiva","Rugby","Salsas","Salud","Sanidad Animal","Sanidad Animal Domésticos","Seguros de Viajes","Seguros Generales","Semillas","Servicios Móviles","Shoppings","Sindicatos","Sitios Web","Snacks","Sodas","Spa","Streaming","Suavizantes","Supermercados","Suplementos Dietarios y Vitamínicos","Tabaco & Cigarrillos","Talleres","Tarjetas","Tarjetas De Crédito","Teatros","Tecnología","Telefonía Fija","Telefonía Móvil","Teléfonos Moviles","Tinturas","Transporte De Carga","Transporte Fluvial y Marítimo","Transporte Interurbano","Transporte Urbano De Pasajeros","TV Online","TV por Suscripción","Universidades","Varios Alimentación","Varios Bebidas Alcohólicas","Varios Carnes","Varios Combustibles","Varios Construcción","Varios Deportes","Varios Electricidad","Varios Energia Solar","Varios Eventos","Varios Farmacias & Perfumería","Varios Fundaciones & Org. Civiles","Varios Gastronomía","Varios Golosinas","Varios Inmuebles","Varios Lácteos","Varios Limpieza Del Hogar","Varios Mueblerías Y Hogar","Varios Panificación","Varios Publicidad Y Marketing","Varios Retail","Varios Servicios De Salud","Varios Telecomunicaciones","Varios Textil, Indumentaria Y Accesorios","Varios Transporte","Varios Turismo Y Hotelería","Venta Por Internet","Veterinaria","Vinos","Yerba Mate","Yogur Diet","Yogur Entero",
]

const PRESET_EFEMERIDES = [
  { name: "Cyber Monday", countries: ["AR"], month: 11, day: 1, description: "Evento de descuentos online masivos en Argentina", suggestedIndustries: ["Retail Online", "Tecnología", "Retail Indumentaria", "Shoppings", "Hoteles"] },
  { name: "Hot Sale", countries: ["AR"], month: 5, day: 12, description: "Evento de ofertas online organizado por CACE", suggestedIndustries: ["Retail Online", "Tecnología", "Retail Indumentaria", "Shoppings", "Agencias de Viajes Online"] },
  { name: "El Buen Fin", countries: ["MX"], month: 11, day: 15, description: "Evento de descuentos masivos en México, equivalente a Black Friday", suggestedIndustries: ["Retail Online", "Tecnología", "Automóviles", "Retail Indumentaria"] },
  { name: "Black Friday", countries: ["AR", "MX", "CO"], month: 11, day: 28, description: "Día de descuentos masivos post-Thanksgiving", suggestedIndustries: ["Retail Online", "Tecnología", "Retail Indumentaria"] },
  { name: "Día de la Madre (AR)", countries: ["AR"], month: 10, day: 19, description: "Tercer domingo de octubre en Argentina", suggestedIndustries: ["Retail Online", "Retail Indumentaria", "Perfumes", "Cosmética", "Farmacéutica"] },
  { name: "Día del Padre", countries: ["AR", "MX", "CO"], month: 6, day: 15, description: "Tercer domingo de junio", suggestedIndustries: ["Retail Online", "Automóviles", "Tecnología", "Cervezas", "Ropa De Vestir - Marcas"] },
  { name: "Día del Niño (AR)", countries: ["AR"], month: 8, day: 17, description: "Tercer domingo de agosto en Argentina", suggestedIndustries: ["Juguetes, Juegos", "Entretenimiento", "Chocolates", "Tecnología"] },
  { name: "Vuelta a clases", countries: ["AR", "MX", "CO"], month: 2, day: 15, description: "Inicio del ciclo escolar", suggestedIndustries: ["Colegios", "Tecnología", "Retail Indumentaria", "Calzado"] },
  { name: "Navidad", countries: ["AR", "MX", "CO"], month: 12, day: 25, description: "Temporada navideña, pico de consumo", suggestedIndustries: ["Retail Online", "Chocolates", "Espumantes Y Cocktails", "Retail Indumentaria", "Tecnología"] },
  { name: "San Valentín", countries: ["AR", "MX", "CO"], month: 2, day: 14, description: "Día de los enamorados", suggestedIndustries: ["Perfumes", "Retail Indumentaria", "Restaurantes, Parrilla, Pizzería", "Hoteles", "Chocolates"] },
]

export function AddEfemerideDialog({ open, onOpenChange, efemeride, onSaved }: AddEfemerideDialogProps) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [reminderDays, setReminderDays] = useState(30)
  const [showPresets, setShowPresets] = useState(false)
  const [industrySearch, setIndustrySearch] = useState("")
  const [manualData, setManualData] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState("")
  const [uploadLoading, setUploadLoading] = useState(false)

  const isEditing = !!efemeride

  const filteredSectors = industrySearch.trim().length > 0
    ? NOMENCLADOR_SECTORS.filter((s) => s.toLowerCase().includes(industrySearch.toLowerCase()))
    : NOMENCLADOR_SECTORS

  useEffect(() => {
    if (efemeride) {
      setName(efemeride.name)
      setDescription(efemeride.description || "")
      setEventDate(efemeride.event_date)
      setSelectedCountries(efemeride.countries)
      setSelectedIndustries(efemeride.industries)
      setReminderDays(efemeride.reminder_days_before)
      setManualData(efemeride.manual_data || "")
      setUploadedFileName(efemeride.manual_data ? "Archivo cargado" : "")
      setShowPresets(false)
    } else {
      setName("")
      setDescription("")
      setEventDate("")
      setSelectedCountries([])
      setSelectedIndustries([])
      setReminderDays(30)
      setManualData("")
      setUploadedFileName("")
      setShowPresets(true)
    }
    setIndustrySearch("")
  }, [efemeride, open])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validTypes = ['text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!validTypes.includes(file.type)) {
      alert("Solo aceptamos .txt, .csv o .docx")
      return
    }

    setUploadLoading(true)
    try {
      let text = ""
      
      if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // Parse DOCX
        text = await extractTextFromDocx(file)
      } else {
        // Parse TXT and CSV
        text = await file.text()
      }
      
      setManualData(text)
      setUploadedFileName(file.name)
    } catch (err) {
      console.error("[v0] Error reading file:", err)
      alert("Error al leer el archivo")
    } finally {
      setUploadLoading(false)
    }
  }

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const toggleIndustry = (ind: string) => {
    setSelectedIndustries((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    )
  }

  const applyPreset = (preset: (typeof PRESET_EFEMERIDES)[0]) => {
    setName(preset.name)
    setDescription(preset.description)
    setSelectedCountries(preset.countries)
    setSelectedIndustries(preset.suggestedIndustries || [])
    const now = new Date()
    let year = now.getFullYear()
    const candidateDate = new Date(year, preset.month - 1, preset.day)
    if (candidateDate < now) year += 1
    setEventDate(`${year}-${String(preset.month).padStart(2, "0")}-${String(preset.day).padStart(2, "0")}`)
    setShowPresets(false)
  }

  const handleSubmit = async () => {
    if (!name || !eventDate || selectedCountries.length === 0) return
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.error("[v0] Auth error:", userError)
        alert("Error de autenticación. Por favor, recarga la página e intenta de nuevo.")
        setLoading(false)
        return
      }

      let seenkaData: string | null = null
      
      // Get Seenka data for this keyword (efemeride name) via API
      // If editing, only fetch if we don't have data yet
      if (!isEditing || !efemeride?.seenka_data_hint) {
        try {
          const country = selectedCountries[0] || "AR"
          const res = await fetch("/api/seenka/keyword", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: name, country })
          })
          if (res.ok) {
            const result = await res.json()
            seenkaData = result.data
          }
        } catch (err) {
          console.error("[v0] Seenka fetch error:", err)
          // Continue even if Seenka fetch fails
        }
      }

      // Sanitize manual_data to remove problematic Unicode characters
      const sanitizedManualData = manualData 
        ? manualData
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\\/g, '\\\\') // Escape backslashes
            .trim()
        : null

      const payload = {
        name,
        description: description || null,
        event_date: eventDate,
        countries: selectedCountries,
        industries: selectedIndustries,
        reminder_days_before: reminderDays,
        is_active: true,
        manual_data: sanitizedManualData,
        seenka_data_hint: seenkaData || efemeride?.seenka_data_hint || null,
      }
      
      let result
      if (isEditing && efemeride) {
        result = await supabase.from("efemerides").update(payload).eq("id", efemeride.id)
      } else {
        result = await supabase.from("efemerides").insert({ ...payload, user_id: user.id })
      }

      if (result.error) {
        console.error("[v0] Database error:", result.error)
        alert("Error al guardar la efeméride: " + result.error.message)
        setLoading(false)
        return
      }

      setLoading(false)
      onSaved()
    } catch (err) {
      console.error("[v0] Unexpected error in handleSubmit:", err)
      alert("Error inesperado. Por favor, intenta de nuevo.")
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Efeméride" : "Nueva Efeméride"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Presets */}
          {!isEditing && showPresets && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Elegir de plantilla</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2">
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_EFEMERIDES.map((preset) => (
                    <Button key={preset.name} variant="outline" size="sm" className="h-auto py-1 text-xs" onClick={() => applyPreset(preset)}>
                      {preset.name}
                      <span className="ml-1 text-muted-foreground">({preset.countries.join(", ")})</span>
                    </Button>
                  ))}
                </div>
              </div>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowPresets(false)}>
                O crear una personalizada
              </Button>
            </div>
          )}
          {!isEditing && !showPresets && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowPresets(true)}>
              Ver plantillas predefinidas
            </Button>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Cyber Monday Argentina" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Evento de descuentos online masivos..." rows={2} />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label htmlFor="eventDate">Fecha del evento</Label>
            <Input id="eventDate" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>

          {/* Countries */}
          <div className="space-y-1.5">
            <Label>Países</Label>
            <div className="flex flex-wrap gap-2">
              {EFEMERIDE_COUNTRIES.map((c) => (
                <Badge key={c.value} variant={selectedCountries.includes(c.value) ? "default" : "outline"} className="cursor-pointer select-none" onClick={() => toggleCountry(c.value)}>
                  {selectedCountries.includes(c.value) && <X className="mr-1 h-3 w-3" />}
                  {c.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Industries */}
          <div className="space-y-1.5">
            <Label>Sectores relevantes (opcional)</Label>
            <p className="text-xs text-muted-foreground">Si no seleccionás ninguno, aplica a todos. Usá el buscador para filtrar.</p>

            {/* Selected chips */}
            {selectedIndustries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                {selectedIndustries.map((ind) => (
                  <Badge key={ind} variant="default" className="cursor-pointer select-none text-xs" onClick={() => toggleIndustry(ind)}>
                    {ind}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar sector... ej: Automóviles"
                value={industrySearch}
                onChange={(e) => setIndustrySearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            {/* Sector list */}
            <div className="max-h-40 overflow-y-auto rounded-md border p-2">
              <div className="flex flex-wrap gap-1.5">
                {filteredSectors.slice(0, 100).map((ind) => (
                  <Badge
                    key={ind}
                    variant={selectedIndustries.includes(ind) ? "default" : "outline"}
                    className="cursor-pointer select-none text-xs"
                    onClick={() => toggleIndustry(ind)}
                  >
                    {ind}
                  </Badge>
                ))}
                {filteredSectors.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">No se encontraron sectores con ese nombre</p>
                )}
              </div>
            </div>
          </div>

          {/* Reminder days */}
          <div className="space-y-1.5">
            <Label htmlFor="reminderDays">Recordatorio (días antes)</Label>
            <Input id="reminderDays" type="number" min={1} max={90} value={reminderDays} onChange={(e) => setReminderDays(parseInt(e.target.value) || 30)} />
            <p className="text-xs text-muted-foreground">Se sugerirá contactar champions cuando falten estos días para el evento</p>
          </div>

          {/* Manual data file upload */}
          <div className="space-y-2">
            <Label>Data personalizada (opcional)</Label>
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition">
                <input
                  type="file"
                  accept=".txt,.csv,.docx"
                  onChange={handleFileUpload}
                  disabled={uploadLoading || loading}
                  className="hidden"
                />
                <span className="text-sm text-muted-foreground">
                  {uploadLoading ? "Cargando..." : uploadedFileName || "Cargá un .txt, .csv o .docx"}
                </span>
              </label>
              {uploadedFileName && (
                <button
                  onClick={() => {
                    setManualData("")
                    setUploadedFileName("")
                  }}
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {manualData.length > 0 
                ? `✓ Cargado: ${uploadedFileName} (${manualData.length} caracteres)` 
                : "Si no cargás nada, se consultará automáticamente al MCP"}
            </p>
          </div>

          {/* Info about automatic Seenka data */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="text-muted-foreground">
              Los datos de Seenka (competencia, segundos de aire, frecuencia, canales) se traerán automaticamente del MCP cuando generes los mensajes, basándose en los sectores seleccionados y los clientes de cada champion.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !name || !eventDate || selectedCountries.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear efeméride"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
