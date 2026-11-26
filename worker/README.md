# Intermediario del traductor con IA

`worker.js` es un Cloudflare Worker (gratis) que está entre la página y la IA:

- Guarda la clave de la IA como **secreto**: nunca llega al navegador ni al repo.
- Solo atiende pedidos que vienen de la página (`alejandroflorido.github.io` y `tdah-unpovdiferente.pages.dev`) o de `localhost:8000` para pruebas.
- Limita a **10 traducciones por persona por día** (cuenta por conexión; la dirección se guarda como un código, no en claro). Las fallidas no cuentan.
- Devuelve siempre el mismo JSON: `pasos`, `como`, `entrega`, `se_evalua`, `fecha_entrega`, `para_cuando`, `primer_paso`, `preguntar`.

Si la IA falla, tarda más de 25 s o se llegó al límite, la página avisa y usa el traductor automático.

## Publicarlo desde la web de Cloudflare (sin instalar nada)

1. **Crear el Worker:** en [dash.cloudflare.com](https://dash.cloudflare.com) → *Compute (Workers)* → *Workers & Pages* → *Create* → *Start with Hello World* → nombre `unpov-traductor` → *Deploy*.
2. **Pegar el código:** *Edit code*, borrar todo lo que hay, pegar el contenido de `worker.js` y tocar *Deploy*.
3. **Base para el límite diario:** *Storage & Databases* → *KV* → *Create* → nombre `unpov-limites`.
4. **Conectarla al Worker:** en el Worker → *Bindings* → *Add binding* → *KV namespace* → nombre de variable `LIMITS`, elegir `unpov-limites` → *Add binding*.
5. **Cargar la clave:** en el Worker → *Settings* → *Variables and Secrets* → *Add* → tipo **Secret**, nombre `GEMINI_API_KEY`, valor: la clave de AI Studio → *Deploy*.
6. **Copiar la dirección** del Worker (algo como `https://unpov-traductor.TU-USUARIO.workers.dev`) y ponerla en `js/app.js`, en `const IA_URL = "";` Subir el `?v=` de `app.js` en `index.html`.

Para probar que está vivo: abrir esa dirección en el navegador tiene que mostrar `{"ok":true,...}`.

## Ajustes opcionales (Settings → Variables and Secrets, tipo Text)

| Variable | Para qué | Por defecto |
|---|---|---|
| `DAILY_LIMIT` | traducciones por persona por día | `10` |
| `MODEL` | modelo de la IA | `gemini-flash-latest` |
| `ALLOWED_ORIGINS` | sitios que pueden usarlo, separados por coma | la página y localhost:8000 |
| `PROVIDER` | `gemini` o `claude` | `gemini` |

## Cambiar a Claude más adelante

Cargar el secreto `ANTHROPIC_API_KEY` (clave de console.anthropic.com, se paga por uso: la suscripción Pro no incluye API) y poner `PROVIDER` = `claude`. La página no se toca.

## Estadísticas de uso (solo para el equipo)

El mismo Worker guarda conteos **anónimos** de uso y los muestra en un panel con clave:

- La página manda, al cerrarse u ocultarse, qué pestañas se vieron, cuántos segundos estuvo cada una a la vista, qué herramientas y botones se usaron, qué imprimibles se bajaron, si el traductor con IA anduvo, tipo de dispositivo y de qué sitio llegaron.
- No se guardan IP, cookies, nombres ni nada de lo que la persona escribe. Cada visita lleva un código al azar que se borra al cerrar la pestaña.
- No se cuenta a quien tenga activado "No rastrear" / Global Privacy Control.
- **Para no contar tus propias visitas:** abrí una vez la página con `?no-contar` al final (por ejemplo `https://tdah-unpovdiferente.pages.dev/?no-contar`) en cada navegador que uses. Con `?contar` se vuelve a contar.

### Activarlo (una sola vez)

1. **Crear la base:** *Storage & Databases* → *D1 SQL Database* → *Create* → nombre `unpov-estadisticas` → *Create*. La tabla se crea sola con la primera visita.
2. **Conectarla al Worker:** en el Worker `unpov-traductor` → *Bindings* → *Add binding* → *D1 database* → nombre de variable `STATS`, elegir `unpov-estadisticas` → *Add binding*.
3. **Clave del panel:** *Settings* → *Variables and Secrets* → *Add* → tipo **Secret**, nombre `STATS_KEY`, valor: una clave larga que elijan → *Deploy*.
4. **Pegar el `worker.js` nuevo** (*Edit code* → borrar todo → pegar → *Deploy*).

### Ver el panel

Abrir la dirección del Worker con `/panel` al final: `https://unpov-traductor.floridosalejandro.workers.dev/panel` y poner la clave. No está enlazado desde la web. Muestra visitas, personas nuevas, duración típica, pestañas (vistas, % de visitas que la abrieron, tiempo promedio y total), herramientas, descargas, traductor con IA, ajustes de lectura, por qué pestaña entran, dispositivo, de dónde llegan y hora del día, para 7, 30, 90 días o todo. El botón **Borrar datos** (arriba, junto al modo diurno/nocturno) borra todas las visitas guardadas: pide escribir BORRAR y no se puede deshacer.

Plan gratis de D1: 100.000 filas escritas por día; cada visita usa entre 5 y 30, así que alcanza de sobra.
