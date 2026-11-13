# Intermediario del traductor con IA

`worker.js` es un Cloudflare Worker (gratis) que está entre la página y la IA:

- Guarda la clave de la IA como **secreto**: nunca llega al navegador ni al repo.
- Solo atiende pedidos que vienen de la página (`alejandroflorido.github.io`) o de `localhost:8000` para pruebas.
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
