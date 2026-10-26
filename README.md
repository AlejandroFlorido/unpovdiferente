# unpovdiferente

Web con herramientas para estudiantes universitarios con TDAH o dificultades de aprendizaje. Proyecto **unpovdiferente**. Colores: naranja `#FF6E2B` (principal) y azul `#1D58FE` (secundario), con letras en negro o blanco.

El proyecto se organiza en tres líneas:

- **Informar:** qué es el TDAH, mitos y realidades, situaciones típicas de la cursada.
- **Orientar:** traductor de consignas, mapa de la cursada, códigos visuales.
- **Acompañar:** primer paso, dividir la entrega, calendario semanal, bloques de estudio.

Incluye además una sección para docentes con una plantilla de consigna clara.

## Cómo verlo

Es un sitio estático, sin pasos de compilación: GitHub Pages publica la carpeta tal cual. Para verlo en tu compu, abrí `index.html` en el navegador (o, mejor, levantá un servidor local con `python3 -m http.server` y entrá a `http://localhost:8000`). Los datos que carga cada estudiante quedan solo en su navegador (localStorage).

## Estructura de carpetas

```
index.html              estructura y textos de todas las pestañas
css/estilos.css         todos los estilos (colores, tipografía, modo oscuro)
js/app.js               todo el comportamiento (pestañas, herramientas, preferencias)
assets/
  fonts/                fuente propia Unpovdiferente Bold (woff2 + ttf)
  icons/                favicon claro/oscuro y apple-touch-icon
  img/                  imágenes del contenido, una carpeta por pestaña
    inicio/ entender/ consignas/ herramientas/ docentes/ apoyo/ equipo/
    comun/              imágenes que se usan en más de una pestaña
```

### Cómo sumar una imagen

1. Guardala en la carpeta de la pestaña donde va, por ejemplo `assets/img/entender/mitos.webp`.
2. Usá nombres en minúscula, sin espacios ni tildes (`foto-equipo-delfina.jpg`).
3. Preferí `.webp` o `.jpg` para fotos, `.png` para gráficos con transparencia y `.svg` para íconos o ilustraciones vectoriales. Apuntá a menos de 300 KB por imagen.
4. En `index.html` se enlaza con la ruta desde la raíz: `<img src="assets/img/entender/mitos.webp" alt="Descripción de la imagen">`. Desde `css/estilos.css` la ruta empieza con `../`: `url("../assets/img/comun/fondo.webp")`.
5. Siempre con `alt` descriptivo (o `alt=""` si es puramente decorativa).

Los archivos `.gitkeep` solo sirven para que Git guarde las carpetas vacías; se pueden borrar cuando la carpeta tenga imágenes.

Nota: `index.html` no tiene `<!doctype>`, `<html>`, `<head>` ni `<body>` porque nació como prototipo publicado; los navegadores lo muestran igual. No se agregaron en esta reorganización para que la página se vea exactamente igual que antes.
