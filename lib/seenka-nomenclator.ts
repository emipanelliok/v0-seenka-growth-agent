// Nomenclador de Industrias y Sectores de Seenka
// Estructura: Industry > Sector

export interface SeenkaSector {
  id: number
  name: string
  industry: string
}

export interface SeenkaIndustry {
  id: number
  name: string
  sectors: SeenkaSector[]
}

export const SEENKA_INDUSTRIES: SeenkaIndustry[] = [
  { id: 93, name: "Aceites Comestibles", sectors: [{ id: 94, name: "Otros Aceites Comestibles", industry: "Aceites Comestibles" }] },
  { id: 127, name: "Aderezadores", sectors: [
    { id: 128, name: "Aderezadores Varios", industry: "Aderezadores" },
    { id: 378, name: "Aderezos", industry: "Aderezadores" },
    { id: 358, name: "Mayonesa", industry: "Aderezadores" },
    { id: 509, name: "Vinagres", industry: "Aderezadores" }
  ]},
  { id: 11, name: "Administradoras & Seguros", sectors: [
    { id: 452, name: "Art", industry: "Administradoras & Seguros" },
    { id: 792, name: "Buscador Online de Seguros", industry: "Administradoras & Seguros" },
    { id: 12, name: "Seguros Generales", industry: "Administradoras & Seguros" },
    { id: 277, name: "Seguros de Retiro", industry: "Administradoras & Seguros" },
    { id: 793, name: "Seguros de Viajes", industry: "Administradoras & Seguros" }
  ]},
  { id: 54, name: "Agropecuario", sectors: [
    { id: 741, name: "Ganado En Pie", industry: "Agropecuario" },
    { id: 114, name: "Agroindustria", industry: "Agropecuario" },
    { id: 55, name: "Agroquímicos", industry: "Agropecuario" },
    { id: 181, name: "Distribuidores Agro", industry: "Agropecuario" },
    { id: 506, name: "Ferias Agrícolas", industry: "Agropecuario" },
    { id: 350, name: "Granos", industry: "Agropecuario" },
    { id: 225, name: "Institucional Agropecuario", industry: "Agropecuario" },
    { id: 129, name: "Maquinarias Agrícolas", industry: "Agropecuario" },
    { id: 507, name: "Sanidad Vegetal", industry: "Agropecuario" },
    { id: 508, name: "Semillas", industry: "Agropecuario" }
  ]},
  { id: 161, name: "Bancos & Tarjetas", sectors: [
    { id: 216, name: "Bancos", industry: "Bancos & Tarjetas" },
    { id: 162, name: "Tarjetas De Crédito", industry: "Bancos & Tarjetas" },
    { id: 559, name: "Tarjetas De Débito", industry: "Bancos & Tarjetas" }
  ]},
  { id: 86, name: "Bebidas Alcohólicas", sectors: [
    { id: 441, name: "Alcohólicas Destiladas", industry: "Bebidas Alcohólicas" },
    { id: 317, name: "Aperitivos", industry: "Bebidas Alcohólicas" },
    { id: 166, name: "Cervezas", industry: "Bebidas Alcohólicas" },
    { id: 308, name: "Espumantes Y Cocktails", industry: "Bebidas Alcohólicas" },
    { id: 146, name: "Vinos", industry: "Bebidas Alcohólicas" }
  ]},
  { id: 103, name: "Bebidas Sin Alcohol", sectors: [
    { id: 119, name: "Aguas", industry: "Bebidas Sin Alcohol" },
    { id: 448, name: "Aguas Saborizadas", industry: "Bebidas Sin Alcohol" },
    { id: 368, name: "Bebidas Isotónica", industry: "Bebidas Sin Alcohol" },
    { id: 454, name: "Energizantes", industry: "Bebidas Sin Alcohol" },
    { id: 324, name: "Gaseosas Light", industry: "Bebidas Sin Alcohol" },
    { id: 239, name: "Gaseosas y Maltas", industry: "Bebidas Sin Alcohol" },
    { id: 104, name: "Jugos", industry: "Bebidas Sin Alcohol" }
  ]},
  { id: 187, name: "Belleza Y Cosméticos", sectors: [
    { id: 218, name: "Cremas", industry: "Belleza Y Cosméticos" },
    { id: 190, name: "Maquillaje", industry: "Belleza Y Cosméticos" },
    { id: 215, name: "Perfumes", industry: "Belleza Y Cosméticos" },
    { id: 373, name: "Tinturas", industry: "Belleza Y Cosméticos" },
    { id: 252, name: "Tratamiento Capilar", industry: "Belleza Y Cosméticos" }
  ]},
  { id: 56, name: "Construcción", sectors: [
    { id: 57, name: "Empresas Constructoras", industry: "Construcción" },
    { id: 165, name: "Ferreterías, Cerrajerías, Vidrierías", industry: "Construcción" },
    { id: 108, name: "Herramientas", industry: "Construcción" },
    { id: 95, name: "Materiales Para La Construcción", industry: "Construcción" },
    { id: 99, name: "Pinturas", industry: "Construcción" }
  ]},
  { id: 39, name: "Consultoras Para Empresas", sectors: [
    { id: 411, name: "Consultoras Privadas", industry: "Consultoras Para Empresas" },
    { id: 40, name: "Servicios", industry: "Consultoras Para Empresas" }
  ]},
  { id: 159, name: "Comercio Electronico", sectors: [
    { id: 380, name: "Red De Beneficios", industry: "Comercio Electronico" },
    { id: 160, name: "Venta Por Internet", industry: "Comercio Electronico" }
  ]},
  { id: 493, name: "Educación Y Enseñanza", sectors: [
    { id: 360, name: "Academias De Idiomas", industry: "Educación Y Enseñanza" },
    { id: 550, name: "Colegios", industry: "Educación Y Enseñanza" },
    { id: 795, name: "Educación Online", industry: "Educación Y Enseñanza" },
    { id: 608, name: "Universidades", industry: "Educación Y Enseñanza" }
  ]},
  { id: 229, name: "Electricidad", sectors: [
    { id: 352, name: "Distribuidores", industry: "Electricidad" },
    { id: 362, name: "Energía E Hidrocarburos", industry: "Electricidad" },
    { id: 649, name: "Energía Solar", industry: "Electricidad" },
    { id: 395, name: "Plantas Generadoras", industry: "Electricidad" }
  ]},
  { id: 492, name: "Electrodomésticos", sectors: [
    { id: 709, name: "Electrodomésticos", industry: "Electrodomésticos" },
    { id: 541, name: "Línea Blanca", industry: "Electrodomésticos" },
    { id: 542, name: "Línea Gris", industry: "Electrodomésticos" },
    { id: 543, name: "Línea Marrón", industry: "Electrodomésticos" }
  ]},
  { id: 236, name: "Entretenimiento", sectors: [
    { id: 204, name: "Cines", industry: "Entretenimiento" },
    { id: 802, name: "Gaming", industry: "Entretenimiento" },
    { id: 4, name: "Películas", industry: "Entretenimiento" },
    { id: 775, name: "Streaming", industry: "Entretenimiento" }
  ]},
  { id: 13, name: "Eventos", sectors: [
    { id: 182, name: "Complejos Y Estadios", industry: "Eventos" },
    { id: 176, name: "Cultura Y Espectáculos", industry: "Eventos" },
    { id: 331, name: "Ferias Y Exposiciones", industry: "Eventos" },
    { id: 175, name: "Parques De Diversión", industry: "Eventos" },
    { id: 14, name: "Productora De Eventos", industry: "Eventos" }
  ]},
  { id: 135, name: "Fábricas Automotrices", sectors: [
    { id: 136, name: "Automóviles", industry: "Fábricas Automotrices" },
    { id: 525, name: "Autopartes", industry: "Fábricas Automotrices" },
    { id: 279, name: "Carga Pesada", industry: "Fábricas Automotrices" },
    { id: 304, name: "Motos Y Rodados", industry: "Fábricas Automotrices" }
  ]},
  { id: 110, name: "Farmacias & Perfumería", sectors: [
    { id: 226, name: "Farmacias", industry: "Farmacias & Perfumería" },
    { id: 365, name: "Perfumerías", industry: "Farmacias & Perfumería" }
  ]},
  { id: 496, name: "Fintech", sectors: [
    { id: 564, name: "Banca Online", industry: "Fintech" },
    { id: 566, name: "Billeteras Virtuales", industry: "Fintech" },
    { id: 565, name: "Criptomonedas & Blockchain", industry: "Fintech" },
    { id: 567, name: "Pagos Y Cobros", industry: "Fintech" },
    { id: 560, name: "Préstamos", industry: "Fintech" }
  ]},
  { id: 63, name: "Fundaciones & Org. Civiles", sectors: [
    { id: 338, name: "Agrupaciones Civiles", industry: "Fundaciones & Org. Civiles" },
    { id: 70, name: "Entidades De Bien Público", industry: "Fundaciones & Org. Civiles" },
    { id: 64, name: "Fundaciones - Ong", industry: "Fundaciones & Org. Civiles" }
  ]},
  { id: 147, name: "Gastronomía", sectors: [
    { id: 419, name: "Bares", industry: "Gastronomía" },
    { id: 223, name: "Confiterías, Pubs", industry: "Gastronomía" },
    { id: 796, name: "Fast Food", industry: "Gastronomía" },
    { id: 272, name: "Heladerías", industry: "Gastronomía" },
    { id: 148, name: "Restaurantes, Parrilla, Pizzería", industry: "Gastronomía" }
  ]},
  { id: 137, name: "Golosinas", sectors: [
    { id: 138, name: "Alfajores", industry: "Golosinas" },
    { id: 321, name: "Caramelos, Chicles", industry: "Golosinas" },
    { id: 379, name: "Chocolates", industry: "Golosinas" },
    { id: 280, name: "Galletas Dulces", industry: "Golosinas" }
  ]},
  { id: 47, name: "Inmuebles", sectors: [
    { id: 405, name: "Countries Y Barrios Cerrados", industry: "Inmuebles" },
    { id: 48, name: "Desarrollistas", industry: "Inmuebles" },
    { id: 71, name: "Inmobiliarias", industry: "Inmuebles" }
  ]},
  { id: 9, name: "Industria Química", sectors: [
    { id: 15, name: "Cosmética", industry: "Industria Química" },
    { id: 759, name: "Farmacéutica", industry: "Industria Química" },
    { id: 145, name: "Laboratorios", industry: "Industria Química" },
    { id: 660, name: "Medicamentos", industry: "Industria Química" },
    { id: 10, name: "Suplementos Dietarios y Vitamínicos", industry: "Industria Química" }
  ]},
  { id: 315, name: "Informática", sectors: [
    { id: 434, name: "Casas De Computación", industry: "Informática" },
    { id: 418, name: "Hardware", industry: "Informática" },
    { id: 316, name: "Proveedores De Software", industry: "Informática" },
    { id: 372, name: "Service E Insumos", industry: "Informática" }
  ]},
  { id: 83, name: "Lácteos", sectors: [
    { id: 84, name: "Lácteos Salud", industry: "Lácteos" },
    { id: 151, name: "Leche Fluida", industry: "Lácteos" },
    { id: 340, name: "Quesos Blandos", industry: "Lácteos" },
    { id: 455, name: "Quesos Duros", industry: "Lácteos" },
    { id: 311, name: "Yogur Entero", industry: "Lácteos" }
  ]},
  { id: 28, name: "Medios Audiovisuales", sectors: [
    { id: 620, name: "Agencia De Noticias", industry: "Medios Audiovisuales" },
    { id: 101, name: "Medios Y Comunicación", industry: "Medios Audiovisuales" },
    { id: 29, name: "Radios", industry: "Medios Audiovisuales" },
    { id: 794, name: "TV por Suscripción", industry: "Medios Audiovisuales" },
    { id: 62, name: "Televisión", industry: "Medios Audiovisuales" },
    { id: 30, name: "Tv Paga", industry: "Medios Audiovisuales" }
  ]},
  { id: 25, name: "Medios Gráficos", sectors: [
    { id: 26, name: "Diarios", industry: "Medios Gráficos" },
    { id: 219, name: "Editoriales", industry: "Medios Gráficos" },
    { id: 27, name: "Revistas", industry: "Medios Gráficos" }
  ]},
  { id: 498, name: "Medios Digitales", sectors: [
    { id: 554, name: "Medios Digitales", industry: "Medios Digitales" },
    { id: 556, name: "Portales De Noticias", industry: "Medios Digitales" },
    { id: 557, name: "Redes Sociales", industry: "Medios Digitales" }
  ]},
  { id: 303, name: "Panadería", sectors: [
    { id: 319, name: "Galletas Saladas", industry: "Panadería" },
    { id: 292, name: "Panificados", industry: "Panadería" },
    { id: 415, name: "Premezclas", industry: "Panadería" },
    { id: 310, name: "Tostadas", industry: "Panadería" }
  ]},
  { id: 22, name: "Partidos Políticos", sectors: [
    { id: 23, name: "Campañas Políticas", industry: "Partidos Políticos" },
    { id: 24, name: "Candidatos", industry: "Partidos Políticos" }
  ]},
  { id: 76, name: "Productos Para Bebés", sectors: [
    { id: 134, name: "Accesorios Para Bebés", industry: "Productos Para Bebés" },
    { id: 242, name: "Alimentos Para Bebés", industry: "Productos Para Bebés" },
    { id: 263, name: "Cuidado Bebés", industry: "Productos Para Bebés" }
  ]},
  { id: 1000, name: "Publicidad & Marketing", sectors: [
    { id: 1001, name: "Agencias De Publicidad", industry: "Publicidad & Marketing" },
    { id: 1002, name: "Agencias De Medios", industry: "Publicidad & Marketing" },
    { id: 1003, name: "Agencias Digitales", industry: "Publicidad & Marketing" },
    { id: 1004, name: "Productoras Audiovisuales", industry: "Publicidad & Marketing" },
    { id: 1005, name: "Consultoras De Comunicación", industry: "Publicidad & Marketing" }
  ]},
  { id: 37, name: "Retail", sectors: [
    { id: 644, name: "E-Commerce Retailers", industry: "Retail" },
    { id: 286, name: "Hipermercados", industry: "Retail" },
    { id: 167, name: "Mayoristas", industry: "Retail" },
    { id: 540, name: "Retail Electro", industry: "Retail" },
    { id: 801, name: "Retail Indumentaria", industry: "Retail" },
    { id: 38, name: "Shoppings", industry: "Retail" },
    { id: 150, name: "Supermercados", industry: "Retail" }
  ]},
  { id: 2, name: "Servicios Financieros", sectors: [
    { id: 535, name: "Administradoras De Fondos", industry: "Servicios Financieros" },
    { id: 534, name: "Bolsa Y Mercado De Valores", industry: "Servicios Financieros" },
    { id: 3, name: "Casas De Cambio", industry: "Servicios Financieros" },
    { id: 178, name: "Préstamos", industry: "Servicios Financieros" }
  ]},
  { id: 36, name: "Tecnología", sectors: [
    { id: 789, name: "Aplicaciones", industry: "Tecnología" },
    { id: 790, name: "Inteligencia Artificial", industry: "Tecnología" },
    { id: 621, name: "Servicios Cloud", industry: "Tecnología" },
    { id: 788, name: "Soluciones Empresariales", industry: "Tecnología" },
    { id: 531, name: "Startups", industry: "Tecnología" }
  ]},
  { id: 490, name: "Telecomunicaciones", sectors: [
    { id: 398, name: "Internet", industry: "Telecomunicaciones" },
    { id: 333, name: "Telefonía Celular", industry: "Telecomunicaciones" },
    { id: 396, name: "Telefonía Fija", industry: "Telecomunicaciones" }
  ]},
  { id: 88, name: "Transporte", sectors: [
    { id: 89, name: "Aeronavegación", industry: "Transporte" },
    { id: 191, name: "Ferrocarriles", industry: "Transporte" },
    { id: 192, name: "Fluvial Y Marítimo", industry: "Transporte" },
    { id: 90, name: "Ómnibus", industry: "Transporte" },
    { id: 337, name: "Transporte Aéreo", industry: "Transporte" }
  ]},
  { id: 16, name: "Turismo & Hotelería", sectors: [
    { id: 17, name: "Agencias De Viajes", industry: "Turismo & Hotelería" },
    { id: 179, name: "Alquileres Temporarios", industry: "Turismo & Hotelería" },
    { id: 232, name: "Hoteles", industry: "Turismo & Hotelería" },
    { id: 326, name: "Turismo Rural", industry: "Turismo & Hotelería" }
  ]},
  { id: 107, name: "Textil & Indumentaria", sectors: [
    { id: 209, name: "Calzados", industry: "Textil & Indumentaria" },
    { id: 105, name: "Indumentaria", industry: "Textil & Indumentaria" },
    { id: 270, name: "Joyería Y Relojería", industry: "Textil & Indumentaria" },
    { id: 106, name: "Marroquinería", industry: "Textil & Indumentaria" },
    { id: 228, name: "Moda Deportiva", industry: "Textil & Indumentaria" }
  ]}
]

// Función para obtener lista plana de industries
export function getIndustryNames(): string[] {
  return SEENKA_INDUSTRIES.map(i => i.name)
}

// Función para obtener sectores de una industry
export function getSectorsForIndustry(industryName: string): string[] {
  const industry = SEENKA_INDUSTRIES.find(i => i.name === industryName)
  return industry ? industry.sectors.map(s => s.name) : []
}

// Función para generar texto del nomenclador para GPT
export function getNomenclatorText(): string {
  let text = "NOMENCLADOR DE INDUSTRIAS Y SECTORES DE SEENKA:\n\n"
  
  for (const industry of SEENKA_INDUSTRIES) {
    text += `INDUSTRY: ${industry.name}\n`
    text += `  Sectores: ${industry.sectors.map(s => s.name).join(", ")}\n\n`
  }
  
  return text
}
