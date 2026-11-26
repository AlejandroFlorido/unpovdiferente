# Sistema de diseño · unpovdiferente

Reglas para que todas las pestañas se vean como una sola web. Los valores viven en `css/sistema.css` (se carga último).

## Lo que no cambia (criterios fijados)
- Colores de marca: naranja `#FF6E2B`, azul `#1D58FE`. Sobre naranja, texto negro.
- Títulos (h1–h4) solo en **Unpovdiferente Bold**, +4 pt, interletrado −0.02em. Todo el texto general en **General Sans** (regular 400 y medium 500).
- Viñetas garabato (la oficial, vineta-6, en los lugares impares). La flecha (vineta-1) no se usa.
- Pestañas, modo oscuro, ajustes de lectura (texto, espaciado, sin animaciones), pie en la última pantalla.
- Botones en píldora.

## Superficies
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--paper` / `--bg` | `#FBFAF7` | `#101011` | fondo general (blanco cálido) |
| `--band-gray` | `#F1EEE8` | `#18181A` | banda alternada |
| `--surface` | `#FFFFFF` | `#1F1F22` | tarjetas y campos |
| `--sunken` | `#F4F2ED` | `#161618` | “antes”, filas, vistas previas |
| `--blue-soft` | `#E3EAFF` | `#1A2550` | “después”, banda docentes |
| `--accent-soft` | `#FFE7DA` | `#3A2215` | avisos (`.note`) |
| `--line` / `--line-strong` | negro 12% / 32% | blanco 12% / 34% | bordes |

Las bandas alternan papel y gris cálido; azul y negro quedan para momentos fuertes (portada, “¿Te pasa?”, cierre, pie).

## Forma
- Tarjeta (`.panel`, `.area`, `.myth`, `.drop`, `.person`…): blanca, radio **22px**, borde de 1px muy suave y sombra larga casi invisible. Sobre banda gris, sin borde.
- Resultado (`.tp-card`: consigna desarmada, consigna del docente): hoja blanca con borde de 1.5px, “lo que te llevás”.
- Campos: blancos, borde 1.5px, radio **14px**, alto mínimo **48px** (dedo).
- Botones: píldora, alto mínimo 46px.

## Tipografía
- `--t-display` portadas · `--t-h2` títulos de sección (igual en todas las pestañas) · `--t-h3` tarjetas · `--t-lead` bajadas.
- Etiqueta sobre los títulos (`.eyebrow`, `.band-label`): mayúsculas, 0.78rem, +0.14em, gris, con la viñeta oficial adelante.

## Cabecera
- Una fila: logo · pestañas · (Volver atrás) · **Aa** (menú con los 3 ajustes de lectura) · modo oscuro.
- Hasta 1100px: las pestañas van en un panel que abre **Menú** (botones grandes con su subtítulo). En celular, “Volver atrás” queda como círculo naranja con flecha.
- Pestaña activa: azul lleno. Las demás: solo texto, con fondo suave al pasar el mouse.

## Accesibilidad
- Foco visible igual en todo el sitio: anillo azul de 2.5px separado del elemento.
- Texto azul sobre fondo oscuro usa `#7C9BFF` (contraste ≥ 4.5:1).
- Objetivos táctiles de 42px o más; “Sin animaciones” también apaga el levantado de las tarjetas.
